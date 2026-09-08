import * as vscode from 'vscode';
import { WebSocket } from 'ws';
import * as os from 'os';
import * as cp from 'child_process';

let ws: WebSocket | null = null;
let currentRoomCode: string | null = null;
let statusBarItem: vscode.StatusBarItem;
let fileSystemWatcher: vscode.FileSystemWatcher | null = null;
let saveSubscription: vscode.Disposable | null = null;
let pingInterval: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
let manualStop = false;

const RELAY_URL = 'ws://82.29.61.16:8080';
const EXCLUDE_GLOB = '{**/node_modules/**,**/.git/**,**/.expo/**,**/.vscode/**,**/.next/**,**/.turbo/**,**/.cache/**,**/coverage/**,**/dist/**,**/build/**}';
const MAX_TREE_FILES = 5000;
const TREE_DEBOUNCE_MS = 650;

let treeRefreshTimer: NodeJS.Timeout | null = null;
let treeInFlight = false;
let treeQueued = false;
let lastTreeSignature = '';
const remoteShells = new Map<string, cp.ChildProcessWithoutNullStreams>();

function getWorkspace() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return null;
    const rootUri = workspaceFolders[0].uri;
    const name = workspaceFolders[0].name || rootUri.fsPath.split(/[\\/]/).pop() || 'VS Code Workspace';
    return { rootUri, name, rootPath: rootUri.fsPath };
}

function cleanSegments(value: string): string[] {
    return String(value || '')
        .replace(/\\/g, '/')
        .split('/')
        .map(segment => segment.trim())
        .filter(segment => !!segment && segment !== '.' && segment !== '..');
}

function cleanRelativePath(value: string): string {
    return cleanSegments(value).join('/');
}

function uriFromWorkspace(rootUri: vscode.Uri, relativePath: string) {
    const segments = cleanSegments(relativePath);
    if (segments.length === 0) throw new Error('Invalid path');
    return vscode.Uri.joinPath(rootUri, ...segments);
}

async function ensureParentDirectory(rootUri: vscode.Uri, relativePath: string) {
    const segments = cleanSegments(relativePath);
    if (segments.length <= 1) return;
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, ...segments.slice(0, -1)));
}

function send(payload: Record<string, unknown>) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function sendOperationResult(ok: boolean, message: string, error?: string) {
    send({ type: 'operation_result', ok, message, error });
}

async function sendTree(force = false) {
    if (treeInFlight) {
        treeQueued = true;
        return;
    }

    const workspace = getWorkspace();
    if (!workspace) {
        send({ type: 'tree_data', paths: [], workspaceName: 'VS Code Workspace' });
        vscode.window.showErrorMessage('DevFlux: No workspace folder open.');
        return;
    }

    treeInFlight = true;
    try {
        const files = await vscode.workspace.findFiles('**/*', EXCLUDE_GLOB, MAX_TREE_FILES);
        const paths = files
            .map(file => vscode.workspace.asRelativePath(file, false).replace(/\\/g, '/'))
            .sort((a, b) => a.localeCompare(b));
        const signature = `${workspace.name}:${paths.join('\u0000')}`;
        if (force || signature !== lastTreeSignature) {
            lastTreeSignature = signature;
            send({ type: 'tree_data', paths, workspaceName: workspace.name });
        }
    } catch (err) {
        send({ type: 'tree_data', paths: [], workspaceName: workspace.name });
    } finally {
        treeInFlight = false;
        if (treeQueued) {
            treeQueued = false;
            queueTree();
        }
    }
}

function queueTree(delay = TREE_DEBOUNCE_MS) {
    if (treeRefreshTimer) {
        clearTimeout(treeRefreshTimer);
    }
    treeRefreshTimer = setTimeout(() => {
        treeRefreshTimer = null;
        void sendTree();
    }, delay);
}

async function writeWorkspaceFile(relativePath: string, content: string) {
    const workspace = getWorkspace();
    if (!workspace) return;

    const cleanPath = cleanRelativePath(relativePath);
    if (!cleanPath) return;

    const fileUri = uriFromWorkspace(workspace.rootUri, cleanPath);
    await ensureParentDirectory(workspace.rootUri, cleanPath);

    const openDocument = vscode.workspace.textDocuments.find(document => document.uri.toString() === fileUri.toString());
    if (openDocument) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            fileUri,
            new vscode.Range(openDocument.positionAt(0), openDocument.positionAt(openDocument.getText().length)),
            content
        );
        await vscode.workspace.applyEdit(edit);
    } else {
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
    }
}

async function saveWorkspaceFile(relativePath: string) {
    const workspace = getWorkspace();
    if (!workspace) return;

    const cleanPath = cleanRelativePath(relativePath);
    if (!cleanPath) return;

    const fileUri = uriFromWorkspace(workspace.rootUri, cleanPath);
    await ensureParentDirectory(workspace.rootUri, cleanPath);

    try {
        await vscode.workspace.fs.stat(fileUri);
    } catch (e) {
        await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
    }

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    vscode.window.setStatusBarMessage(`DevFlux: Saved ${cleanPath} to disk`, 3000);
}

function shellConfig() {
    if (process.platform === 'win32') {
        return { command: process.env.ComSpec || 'cmd.exe', args: [] };
    }
    return { command: process.env.SHELL || '/bin/sh', args: ['-i'] };
}

function stopRemoteShell(shellId: string) {
    const child = remoteShells.get(shellId);
    if (!child) return;
    remoteShells.delete(shellId);
    try {
        child.stdin.end();
    } catch (e) {}
    try {
        child.kill();
    } catch (e) {}
}

function stopAllRemoteShells() {
    Array.from(remoteShells.keys()).forEach(stopRemoteShell);
}

function startRemoteShell(shellId: string, cols = 80, rows = 24) {
    const workspace = getWorkspace();
    if (!workspace) {
        send({ type: 'shell_output', shellId, output: 'Error: No workspace folder open in VS Code.\r\n' });
        send({ type: 'shell_exit', shellId, code: 1 });
        return;
    }

    if (remoteShells.has(shellId)) {
        send({ type: 'shell_output', shellId, output: '' });
        return;
    }

    const config = shellConfig();
    const child = cp.spawn(config.command, config.args, {
        cwd: workspace.rootPath,
        env: {
            ...process.env,
            TERM: process.env.TERM || 'xterm-256color',
            COLORTERM: process.env.COLORTERM || 'truecolor',
            COLUMNS: String(cols),
            LINES: String(rows),
        },
        windowsHide: true,
        shell: false,
    });

    remoteShells.set(shellId, child);
    send({ type: 'shell_output', shellId, output: `DevFlux PC shell: ${workspace.rootPath}\r\n` });

    child.stdout.on('data', chunk => send({ type: 'shell_output', shellId, output: chunk.toString() }));
    child.stderr.on('data', chunk => send({ type: 'shell_output', shellId, output: chunk.toString() }));
    child.on('error', err => {
        send({ type: 'shell_output', shellId, output: `Failed to start shell: ${err.message}\r\n` });
    });
    child.on('close', code => {
        remoteShells.delete(shellId);
        send({ type: 'shell_exit', shellId, code });
    });
}

function writeRemoteShell(shellId: string, payload: string) {
    const child = remoteShells.get(shellId);
    if (!child || child.killed) {
        startRemoteShell(shellId);
        setTimeout(() => writeRemoteShell(shellId, payload), 120);
        return;
    }

    try {
        child.stdin.write(payload);
    } catch (err: any) {
        send({ type: 'shell_output', shellId, output: `Shell input failed: ${err.message}\r\n` });
    }
}


function updateStatusBar(connected: boolean) {
    if (!statusBarItem) return;

    if (ws && currentRoomCode) {
        statusBarItem.text = `$(sync) DevFlux: Room ${currentRoomCode}`;
        statusBarItem.backgroundColor = connected ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
        statusBarItem.tooltip = `Connected to Relay: ${RELAY_URL}`;
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

function scheduleServerReconnect(context: vscode.ExtensionContext) {
    if (manualStop || reconnectTimer || !currentRoomCode) return;

    const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttempts));
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startServer(context, true);
    }, delay);
}

function startServer(context: vscode.ExtensionContext, isReconnect = false) {
    if (ws) {
        if (isReconnect) return;
        vscode.window.showInformationMessage(`DevFlux Sync is already running. Room Code: ${currentRoomCode}`);
        return;
    }

    manualStop = false;
    if (!currentRoomCode) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let token = '';
        for (let i = 0; i < 8; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        currentRoomCode = token.slice(0, 4) + '-' + token.slice(4, 8);
    }

    if (!isReconnect) {
        reconnectAttempts = 0;
        vscode.window.setStatusBarMessage('DevFlux: Connecting to Relay...', 3000);
    }

    try {
        ws = new WebSocket(RELAY_URL);

        ws.on('open', () => {
            if (!ws) return;
            reconnectAttempts = 0;
            lastTreeSignature = '';
            send({ type: 'join', role: 'pc', roomId: currentRoomCode });
            updateStatusBar(false);
            if (!isReconnect) {
                vscode.window.showInformationMessage(`DevFlux Sync Started. Enter Code in App: ${currentRoomCode}`, 'Copy Code').then(selection => {
                    if (selection === 'Copy Code' && currentRoomCode) {
                        vscode.env.clipboard.writeText(currentRoomCode);
                    }
                });
            } else {
                vscode.window.setStatusBarMessage('DevFlux: Live Sync reconnected.', 3000);
            }

            pingInterval = setInterval(() => {
                send({ type: 'ping' });
            }, 15000);
        });

        ws.on('close', () => {
            ws = null;
            updateStatusBar(false);
            if (pingInterval) {
                clearInterval(pingInterval);
                pingInterval = null;
            }
            stopAllRemoteShells();
            if (!manualStop) {
                vscode.window.showWarningMessage('DevFlux Sync: Disconnected from Relay Server. Reconnecting...');
                scheduleServerReconnect(context);
            }
        });

        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
            if (!manualStop) {
                vscode.window.setStatusBarMessage('DevFlux: Relay connection error. Retrying...', 3000);
            }
        });

        ws.on('message', async (message: string) => {
            if (!ws) return;
            try {
                const data = JSON.parse(message);
                const workspace = getWorkspace();

                if (data.type === 'relay_app_connected') {
                    updateStatusBar(true);
                    vscode.window.showInformationMessage(`DevFlux App joined Room ${currentRoomCode}.`);
                    void sendTree(true);
                    return;
                }

                if (data.type === 'relay_peer_disconnected') {
                    updateStatusBar(false);
                    vscode.window.showWarningMessage('DevFlux App disconnected from Room.');
                    return;
                }

                if (data.type === 'file_update' && data.path && data.content !== undefined) {
                    await writeWorkspaceFile(data.path, data.content);
                    return;
                }

                if (data.type === 'shell_start' && data.shellId) {
                    startRemoteShell(String(data.shellId), Number(data.cols) || 80, Number(data.rows) || 24);
                    return;
                }

                if (data.type === 'shell_input' && data.shellId) {
                    writeRemoteShell(String(data.shellId), String(data.payload || ''));
                    return;
                }

                if (data.type === 'shell_resize' && data.shellId) {
                    // Pipes do not expose a PTY resize API; keep the message harmless.
                    return;
                }

                if (data.type === 'shell_stop' && data.shellId) {
                    stopRemoteShell(String(data.shellId));
                    return;
                }

                if (data.type === 'save_file' && data.path) {
                    await saveWorkspaceFile(data.path);
                    queueTree(0);
                    return;
                }

                if (data.type === 'request_tree') {
                    await sendTree(true);
                    return;
                }

                if (data.type === 'request_full_sync') {
                    if (!workspace) return;
                    vscode.window.setStatusBarMessage('DevFlux: Syncing full workspace to mobile...', 3000);
                    const files = await vscode.workspace.findFiles('**/*', EXCLUDE_GLOB);
                    for (const file of files) {
                        try {
                            const relPath = vscode.workspace.asRelativePath(file, false).replace(/\\/g, '/');
                            const doc = await vscode.workspace.fs.readFile(file);
                            const content = Buffer.from(doc).toString('utf8');
                            send({ type: 'file_update', path: relPath, content, workspaceName: workspace.name });
                        } catch (err) {}
                    }
                    await sendTree(true);
                    return;
                }

                if (data.type === 'request_file' && data.path) {
                    if (!workspace) return;
                    const cleanPath = cleanRelativePath(data.path);
                    const fileUri = uriFromWorkspace(workspace.rootUri, cleanPath);
                    try {
                        const document = await vscode.workspace.openTextDocument(fileUri);
                        vscode.window.showTextDocument(document, { preserveFocus: true, preview: false });
                        send({ type: 'file_content', path: cleanPath, content: document.getText(), workspaceName: workspace.name });
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`DevFlux: Failed to read ${cleanPath} - ${err.message}`);
                    }
                    return;
                }

                if (data.type === 'delete_path' && data.path) {
                    if (!workspace) return;
                    const cleanPath = cleanRelativePath(data.path);
                    try {
                        await vscode.workspace.fs.delete(uriFromWorkspace(workspace.rootUri, cleanPath), { recursive: true, useTrash: false });
                        sendOperationResult(true, `Deleted ${cleanPath}`);
                        queueTree(0);
                    } catch (err: any) {
                        sendOperationResult(false, `Failed to delete ${cleanPath}`, err.message);
                    }
                    return;
                }

                if (data.type === 'move_path' && data.fromPath && data.toPath) {
                    if (!workspace) return;
                    const cleanFrom = cleanRelativePath(data.fromPath);
                    const cleanTo = cleanRelativePath(data.toPath);
                    try {
                        await ensureParentDirectory(workspace.rootUri, cleanTo);
                        await vscode.workspace.fs.rename(
                            uriFromWorkspace(workspace.rootUri, cleanFrom),
                            uriFromWorkspace(workspace.rootUri, cleanTo),
                            { overwrite: false }
                        );
                        sendOperationResult(true, `Moved ${cleanFrom} to ${cleanTo}`);
                        queueTree(0);
                    } catch (err: any) {
                        sendOperationResult(false, `Failed to move ${cleanFrom}`, err.message);
                    }
                    return;
                }

                if (data.type === 'create_directory' && data.path) {
                    if (!workspace) return;
                    const cleanPath = cleanRelativePath(data.path);
                    try {
                        await vscode.workspace.fs.createDirectory(uriFromWorkspace(workspace.rootUri, cleanPath));
                        sendOperationResult(true, `Created folder ${cleanPath}`);
                        queueTree(0);
                    } catch (err: any) {
                        sendOperationResult(false, `Failed to create folder ${cleanPath}`, err.message);
                    }
                    return;
                }

                if (data.type === 'search_workspace' && data.query) {
                    if (!workspace) return;

                    try {
                        const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/.expo/**,**/.vscode/**,**/*.png,**/*.jpg}');
                        const results: any[] = [];

                        for (const file of files) {
                            const relPath = vscode.workspace.asRelativePath(file, false).replace(/\\/g, '/');
                            try {
                                const document = await vscode.workspace.openTextDocument(file);
                                const text = document.getText();
                                if (text.toLowerCase().includes(data.query.toLowerCase())) {
                                    const lines = text.split('\n');
                                    const matches = [];
                                    for (let i = 0; i < lines.length; i++) {
                                        if (lines[i].toLowerCase().includes(data.query.toLowerCase())) {
                                            matches.push({ line: i + 1, text: lines[i].trim().substring(0, 60) });
                                            if (matches.length >= 5) break;
                                        }
                                    }
                                    results.push({ path: relPath, name: relPath.split('/').pop(), matches });
                                }
                            } catch (e) {}
                        }

                        send({ type: 'search_results', query: data.query, results });
                    } catch (e) {}
                    return;
                }

                if (data.type === 'exec_command' && data.command) {
                    if (!workspace) {
                        send({ type: 'command_output', output: 'Error: No workspace folder open in VS Code.\n' });
                        send({ type: 'command_exit', code: 1 });
                        return;
                    }

                    const cmdId = data.cmdId || Math.random().toString(36).substring(7);
                    try {
                        const child = cp.spawn(data.command, data.args || [], {
                            cwd: workspace.rootPath,
                            shell: true
                        });

                        child.stdout.on('data', (chunk) => {
                            send({ type: 'command_output', cmdId, output: chunk.toString() });
                        });

                        child.stderr.on('data', (chunk) => {
                            send({ type: 'command_output', cmdId, output: chunk.toString() });
                        });

                        child.on('close', (code) => {
                            send({ type: 'command_exit', cmdId, code });
                        });

                        child.on('error', (err) => {
                            send({ type: 'command_output', cmdId, output: `Failed to start process: ${err.message}\n` });
                        });
                    } catch (err: any) {
                        send({ type: 'command_output', cmdId, output: `Error executing command: ${err.message}\n` });
                    }
                }
            } catch (e) {
                // Ignore parsing errors.
            }
        });

        const workspace = getWorkspace();
        if (workspace) {
            fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*');
            context.subscriptions.push(fileSystemWatcher);
            context.subscriptions.push(fileSystemWatcher.onDidCreate(() => queueTree()));
            context.subscriptions.push(fileSystemWatcher.onDidDelete(() => queueTree()));
            context.subscriptions.push(fileSystemWatcher.onDidChange(() => queueTree()));

            const subscription = vscode.workspace.onDidSaveTextDocument((document) => {
                if (!ws || ws.readyState !== WebSocket.OPEN) return;

                const workspace = getWorkspace();
                if (!workspace || !document.uri.fsPath.startsWith(workspace.rootPath)) return;

                const relativePath = vscode.workspace.asRelativePath(document.uri, false).replace(/\\/g, '/');
                send({ type: 'file_update', path: relativePath, content: document.getText(), workspaceName: workspace.name });
            });
            saveSubscription = subscription;
            context.subscriptions.push(subscription);
        }

        updateStatusBar(false);
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to start DevFlux Sync: ${e.message}`);
    }
}

function stopServer() {
    manualStop = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    stopAllRemoteShells();
    if (ws) {
        const activeSocket = ws;
        ws = null;
        activeSocket.close();
    }
    currentRoomCode = null;
    reconnectAttempts = 0;
    if (fileSystemWatcher) {
        fileSystemWatcher.dispose();
        fileSystemWatcher = null;
    }
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
    if (treeRefreshTimer) {
        clearTimeout(treeRefreshTimer);
        treeRefreshTimer = null;
    }
    treeInFlight = false;
    treeQueued = false;
    lastTreeSignature = '';
    if (saveSubscription) {
        saveSubscription.dispose();
        saveSubscription = null;
    }
    updateStatusBar(false);
    vscode.window.showInformationMessage('DevFlux Live Sync stopped.');
}

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'devflux-sync.stopServer';
    context.subscriptions.push(statusBarItem);

    const startCmd = vscode.commands.registerCommand('devflux-sync.startServer', () => startServer(context));
    const stopCmd = vscode.commands.registerCommand('devflux-sync.stopServer', () => stopServer());

    context.subscriptions.push(startCmd, stopCmd);
}

export function deactivate() {
    stopServer();
}
