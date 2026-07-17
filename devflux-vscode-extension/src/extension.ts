import * as vscode from 'vscode';
import { WebSocket } from 'ws';
import * as os from 'os';
import * as cp from 'child_process';

let ws: WebSocket | null = null;
let currentRoomCode: string | null = null;
let statusBarItem: vscode.StatusBarItem;
let fileSystemWatcher: vscode.FileSystemWatcher | null = null;
let pingInterval: NodeJS.Timeout | null = null;

const RELAY_URL = 'ws://82.29.61.16:8080'; // TODO: Change to your VPS URL (e.g., wss://your-vps.com)

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]!) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function updateStatusBar(connected: boolean) {
    if (!statusBarItem) return;
    
    if (ws && currentRoomCode) {
        statusBarItem.text = `$(sync) DevFlex: Room ${currentRoomCode}`;
        statusBarItem.backgroundColor = connected ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
        statusBarItem.tooltip = `Connected to Relay: ${RELAY_URL}`;
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

function startServer(context: vscode.ExtensionContext) {
    if (ws) {
        vscode.window.showInformationMessage(`DevFlex Sync is already running. Room Code: ${currentRoomCode}`);
        return;
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 8; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // format as XXXX-XXXX for readability
    currentRoomCode = token.slice(0, 4) + '-' + token.slice(4, 8);
    
    vscode.window.setStatusBarMessage(`DevFlex: Connecting to Relay...`, 3000);

    try {
        ws = new WebSocket(RELAY_URL);

        ws.on('open', () => {
            if (ws) {
                ws?.send(JSON.stringify({ type: 'join', role: 'pc', roomId: currentRoomCode }));
                updateStatusBar(false);
                vscode.window.showInformationMessage(`DevFlex Sync Started! Enter Code in App: ${currentRoomCode}`, 'Copy Code').then(selection => {
                    if (selection === 'Copy Code' && currentRoomCode) {
                        vscode.env.clipboard.writeText(currentRoomCode);
                    }
                });
                
                pingInterval = setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 15000);
            }
        });

        ws.on('close', () => {
            stopServer();
            vscode.window.showWarningMessage('DevFlex Sync: Disconnected from Relay Server.');
        });
        
        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
            vscode.window.showErrorMessage(`DevFlex Sync Error: Could not connect to relay at ${RELAY_URL}`);
            stopServer();
        });

        ws.on('message', async (message: string) => {
            if (!ws) return;
            try {
                const data = JSON.parse(message);
                
                if (data.type === 'relay_app_connected') {
                    updateStatusBar(true);
                    vscode.window.showInformationMessage(`📱 DevFlex App joined Room ${currentRoomCode}!`);
                    return;
                }
                if (data.type === 'relay_peer_disconnected') {
                    updateStatusBar(false);
                    vscode.window.showWarningMessage(`📱 DevFlex App disconnected from Room.`);
                    return;
                }
                    if (data.type === 'file_update' && data.path && data.content !== undefined) {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) return;
                        
                        const rootUri = workspaceFolders[0].uri;
                        const segments = data.path.split(/[\\/]/);
                        const fileUri = vscode.Uri.joinPath(rootUri, ...segments);
                        
                        try {
                            try {
                                await vscode.workspace.fs.stat(fileUri);
                            } catch (e) {
                                // File doesn't exist, create it
                                await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
                            }
                            const document = await vscode.workspace.openTextDocument(fileUri);
                            const edit = new vscode.WorkspaceEdit();
                            const fullRange = new vscode.Range(
                                document.positionAt(0),
                                document.positionAt(document.getText().length)
                            );
                            edit.replace(fileUri, fullRange, data.content);
                            await vscode.workspace.applyEdit(edit);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                    if (data.type === 'save_file' && data.path) {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) return;
                        
                        const rootUri = workspaceFolders[0].uri;
                        const segments = data.path.split(/[\\/]/);
                        const fileUri = vscode.Uri.joinPath(rootUri, ...segments);
                        
                        try {
                            try {
                                await vscode.workspace.fs.stat(fileUri);
                            } catch (e) {
                                await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
                            }
                            const document = await vscode.workspace.openTextDocument(fileUri);
                            await document.save();
                            vscode.window.setStatusBarMessage(`DevFlex: Saved ${data.path} to disk`, 3000);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                    if (data.type === 'request_tree') {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) {
                            ws?.send(JSON.stringify({ type: 'tree_data', paths: [] }));
                            vscode.window.showErrorMessage('DevFlex: No workspace folder open.');
                            return;
                        }
                        try {
                            vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/.expo/**,**/.vscode/**}')
                                .then(files => {
                                    const paths = files.map(f => vscode.workspace.asRelativePath(f, false).replace(/\\/g, '/'));
                                    ws?.send(JSON.stringify({ type: 'tree_data', paths }));
                                }, err => {
                                    ws?.send(JSON.stringify({ type: 'tree_data', paths: [] }));
                                });
                        } catch (e) {
                            ws?.send(JSON.stringify({ type: 'tree_data', paths: [] }));
                        }
                    }
                    
                    if (data.type === 'request_full_sync') {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) return;
                        vscode.window.setStatusBarMessage('DevFlex: Syncing full workspace to mobile...', 3000);
                        vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/.expo/**,**/.vscode/**}').then(files => {
                            files.forEach(async f => {
                                try {
                                    const relPath = vscode.workspace.asRelativePath(f, false).replace(/\\/g, '/');
                                    const doc = await vscode.workspace.fs.readFile(f);
                                    const content = Buffer.from(doc).toString('utf8');
                                    ws?.send(JSON.stringify({
                                        type: 'file_update',
                                        path: relPath,
                                        content
                                    }));
                                } catch(err) {}
                            });
                        });
                    }
                    
                    if (data.type === 'request_file' && data.path) {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) return;
                        const rootUri = workspaceFolders[0].uri;
                        const segments = data.path.split(/[\\/]/).filter((s: string) => s);
                        const fileUri = vscode.Uri.joinPath(rootUri, ...segments);
                        try {
                            try {
                                await vscode.workspace.fs.stat(fileUri);
                            } catch (e) {
                                await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
                            }
                            // Automatically open the file in VS Code so the user can watch the live coding!
                            const document = await vscode.workspace.openTextDocument(fileUri);
                            vscode.window.showTextDocument(document, { preserveFocus: true, preview: false });
                            
                            const content = document.getText();
                            ws?.send(JSON.stringify({
                                type: 'file_content',
                                path: data.path,
                                content
                            }));
                            vscode.window.showInformationMessage(`DevFlex: Arquivo ${data.path} enviado para o App (${content.length} bytes)`);
                        } catch(err: any) {
                            vscode.window.showErrorMessage(`DevFlex: Falha ao ler arquivo ${data.path} - ${err.message}`);
                        }
                    }

                    if (data.type === 'search_workspace' && data.query) {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) return;
                        
                        try {
                            const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/.expo/**,**/.vscode/**,**/*.png,**/*.jpg}');
                            const results: any[] = [];
                            
                            for (const file of files) {
                                const relPath = vscode.workspace.asRelativePath(file, false).replace(/\\/g, '/');
                                try {
                                    const doc = await vscode.workspace.openTextDocument(file);
                                    const text = doc.getText();
                                    if (text.toLowerCase().includes(data.query.toLowerCase())) {
                                        const lines = text.split('\n');
                                        const matches = [];
                                        for (let i = 0; i < lines.length; i++) {
                                            if (lines[i].toLowerCase().includes(data.query.toLowerCase())) {
                                                matches.push({ line: i + 1, text: lines[i].trim().substring(0, 60) });
                                                if (matches.length >= 5) break;
                                            }
                                        }
                                        results.push({
                                            path: relPath,
                                            name: relPath.split('/').pop(),
                                            matches
                                        });
                                    }
                                } catch(e) {}
                            }
                            
                            ws?.send(JSON.stringify({
                                type: 'search_results',
                                query: data.query,
                                results
                            }));
                        } catch (e) {}
                    }

                    if (data.type === 'exec_command' && data.command) {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) {
                            ws?.send(JSON.stringify({ type: 'command_output', output: 'Error: No workspace folder open in VS Code.\n' }));
                            ws?.send(JSON.stringify({ type: 'command_exit', code: 1 }));
                            return;
                        }
                        
                        const rootPath = workspaceFolders[0].uri.fsPath;
                        const cmdId = data.cmdId || Math.random().toString(36).substring(7);
                        
                        try {
                            const shell = os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash';
                            
                            const child = cp.spawn(data.command, data.args || [], {
                                cwd: rootPath,
                                shell: true
                            });

                            child.stdout.on('data', (chunk) => {
                                ws?.send(JSON.stringify({
                                    type: 'command_output',
                                    cmdId,
                                    output: chunk.toString()
                                }));
                            });

                            child.stderr.on('data', (chunk) => {
                                ws?.send(JSON.stringify({
                                    type: 'command_output',
                                    cmdId,
                                    output: chunk.toString()
                                }));
                            });

                            child.on('close', (code) => {
                                ws?.send(JSON.stringify({
                                    type: 'command_exit',
                                    cmdId,
                                    code
                                }));
                            });

                            child.on('error', (err) => {
                                ws?.send(JSON.stringify({
                                    type: 'command_output',
                                    cmdId,
                                    output: `Failed to start process: ${err.message}\n`
                                }));
                            });
                        } catch (err: any) {
                            ws?.send(JSON.stringify({
                                type: 'command_output',
                                cmdId,
                                output: `Error executing command: ${err.message}\n`
                            }));
                        }
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            });
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            // Watch all files in workspace
            fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*');
            
            // We listen to the vscode.workspace.onDidSaveTextDocument to get the actual text contents
            // It's more reliable for text files than the raw filesystem watcher
            const saveSubscription = vscode.workspace.onDidSaveTextDocument((document) => {
                if (!ws || ws.readyState !== WebSocket.OPEN) return;
                
                const relativePath = vscode.workspace.asRelativePath(document.uri, false).replace(/\\/g, '/');
                
                const payload = JSON.stringify({
                    type: 'file_update',
                    path: relativePath,
                    content: document.getText()
                });

                ws?.send(payload);
            });
            context.subscriptions.push(saveSubscription);
        }

        updateStatusBar(false);
        
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to start DevFlex Sync: ${e.message}`);
    }
}

function stopServer() {
    if (ws) {
        ws.close();
        ws = null;
    }
    currentRoomCode = null;
    if (fileSystemWatcher) {
        fileSystemWatcher.dispose();
        fileSystemWatcher = null;
    }
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
    updateStatusBar(false);
    vscode.window.showInformationMessage('DevFlex Live Sync stopped.');
}

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'devflex-sync.stopServer';
    context.subscriptions.push(statusBarItem);

    const startCmd = vscode.commands.registerCommand('devflex-sync.startServer', () => startServer(context));
    const stopCmd = vscode.commands.registerCommand('devflex-sync.stopServer', () => stopServer());

    context.subscriptions.push(startCmd, stopCmd);
}

export function deactivate() {
    stopServer();
}
