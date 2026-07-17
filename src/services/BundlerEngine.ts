import { FileSystemService, FileNode } from './FileSystemService';

/**
 * BundlerEngine — Manages real JSX/TSX transpilation via esbuild-wasm
 * running inside an invisible WebView.
 * 
 * This is NOT a simulation. esbuild-wasm is the real esbuild compiler
 * compiled to WebAssembly, running inside the device's browser engine.
 */

// Types for communication with the BundlerWebView
export interface BuildRequest {
  requestId: string;
  files: Record<string, string>;
  entryPoint: string;
  dependencies: Record<string, string>;
}

export interface BuildResult {
  js: string;
  css: string;
  errors: string[];
  warnings: string[];
}

type MessageHandler = (result: BuildResult) => void;

// Pending build requests
const pendingBuilds = new Map<string, {
  resolve: (result: BuildResult) => void;
  reject: (error: Error) => void;
}>();

// Reference to the WebView's postMessage function (set by BundlerWebView)
let sendToBundler: ((message: string) => void) | null = null;

export const BundlerEngine = {
  /**
   * Called by BundlerWebView when it mounts to register the message sender
   */
  registerSender(sender: (message: string) => void) {
    sendToBundler = sender;
  },

  /**
   * Called by BundlerWebView when it unmounts
   */
  unregisterSender() {
    sendToBundler = null;
  },

  /**
   * Called by BundlerWebView when a message comes back from esbuild
   */
  handleMessage(data: any) {
    if (data.type === 'build_result' || data.type === 'build_error') {
      const pending = pendingBuilds.get(data.requestId);
      if (pending) {
        pendingBuilds.delete(data.requestId);
        if (data.type === 'build_error') {
          pending.resolve({
            js: '',
            css: '',
            errors: [data.error || 'Unknown build error'],
            warnings: [],
          });
        } else {
          pending.resolve({
            js: data.js || '',
            css: data.css || '',
            errors: data.errors || [],
            warnings: data.warnings || [],
          });
        }
      }
    } else if (data.type === 'ready') {
      console.log('[BundlerEngine] esbuild-wasm initialized successfully');
    }
  },

  /**
   * Check if the bundler WebView is connected
   */
  isReady(): boolean {
    return sendToBundler !== null;
  },

  /**
   * Build a project: transpile JSX/TSX, resolve local imports, output bundle.
   * 
   * @param projectId - The project to build
   * @returns BuildResult with transpiled JS, CSS, and any errors
   */
  async build(projectId: string): Promise<BuildResult> {
    // 1. Read all project files into a flat map
    const files = await this.collectProjectFiles(projectId);
    
    // 2. Detect entry point
    const entryPoint = this.findEntryPoint(files);
    if (!entryPoint) {
      return {
        js: '',
        css: '',
        errors: ['Could not find entry point. Expected: src/index.tsx, src/index.jsx, src/main.tsx, src/main.jsx, index.tsx, index.jsx, index.js, or src/App.tsx'],
        warnings: [],
      };
    }

    // 3. Parse dependencies from package.json
    const dependencies = this.parseDependencies(files);

    // 4. Check if bundler WebView is connected
    if (!sendToBundler) {
      return {
        js: '',
        css: '',
        errors: ['BundlerEngine not initialized. The bundler WebView is not mounted.'],
        warnings: [],
      };
    }

    // 5. Send build request and wait for result
    const requestId = Math.random().toString(36).substring(2, 10);
    
    return new Promise<BuildResult>((resolve, reject) => {
      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        pendingBuilds.delete(requestId);
        resolve({
          js: '',
          css: '',
          errors: ['Build timed out after 30 seconds. The project may be too large for mobile bundling.'],
          warnings: [],
        });
      }, 30000);

      pendingBuilds.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      const request: BuildRequest = {
        requestId,
        files,
        entryPoint,
        dependencies,
      };

      sendToBundler!(JSON.stringify({ type: 'build', ...request }));
    });
  },

  /**
   * Recursively collect all project files into a flat Record<path, content>
   */
  async collectProjectFiles(projectId: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const tree = await FileSystemService.getProjectFileTree(projectId);

    const readRecursive = async (nodes: FileNode[], prefix: string = '') => {
      for (const node of nodes) {
        const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
        
        if (node.type === 'directory') {
          // Skip node_modules and hidden directories
          if (node.name === 'node_modules' || node.name.startsWith('.')) continue;
          if (node.children) {
            await readRecursive(node.children, fullPath);
          }
        } else {
          // Only read source files (skip images, binaries, etc.)
          const ext = node.name.split('.').pop()?.toLowerCase() || '';
          const sourceExts = ['js', 'jsx', 'ts', 'tsx', 'css', 'json', 'html', 'svg', 'md'];
          if (sourceExts.includes(ext)) {
            try {
              const content = await FileSystemService.readFile(projectId, fullPath);
              files[fullPath] = content;
            } catch (e) {
              // Skip unreadable files
            }
          }
        }
      }
    };

    await readRecursive(tree);
    return files;
  },

  /**
   * Find the entry point for the project
   */
  findEntryPoint(files: Record<string, string>): string | null {
    // Priority order for entry points
    const candidates = [
      'src/index.tsx',
      'src/index.jsx',
      'src/index.ts',
      'src/index.js',
      'src/main.tsx',
      'src/main.jsx',
      'src/main.ts',
      'src/main.js',
      'src/App.tsx',
      'src/App.jsx',
      'index.tsx',
      'index.jsx',
      'index.ts',
      'index.js',
      'App.tsx',
      'App.jsx',
      'main.tsx',
      'main.jsx',
    ];

    for (const candidate of candidates) {
      if (files[candidate]) return candidate;
    }

    // Fallback: first .tsx or .jsx file found
    const jsxFile = Object.keys(files).find(f => 
      f.endsWith('.tsx') || f.endsWith('.jsx')
    );
    if (jsxFile) return jsxFile;

    // Fallback: first .js file
    const jsFile = Object.keys(files).find(f => f.endsWith('.js'));
    return jsFile || null;
  },

  /**
   * Parse dependencies from package.json if it exists
   */
  parseDependencies(files: Record<string, string>): Record<string, string> {
    const pkgJson = files['package.json'];
    if (!pkgJson) return {};

    try {
      const pkg = JSON.parse(pkgJson);
      return {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
    } catch {
      return {};
    }
  },

  /**
   * Generate the import map for esm.sh CDN resolution
   */
  generateImportMap(dependencies: Record<string, string>): string {
    const imports: Record<string, string> = {};

    // Always include React if any JSX file is present
    const coreDeps: Record<string, string> = {
      'react': 'https://esm.sh/react@18?dev',
      'react/': 'https://esm.sh/react@18&dev/',
      'react-dom': 'https://esm.sh/react-dom@18?dev',
      'react-dom/': 'https://esm.sh/react-dom@18&dev/',
      'react/jsx-runtime': 'https://esm.sh/react@18/jsx-runtime?dev',
      'react/jsx-dev-runtime': 'https://esm.sh/react@18/jsx-dev-runtime?dev',
    };

    // Add core deps
    Object.assign(imports, coreDeps);

    // Add user dependencies from package.json
    for (const [name, version] of Object.entries(dependencies)) {
      // Skip deps we already handle
      if (name === 'react' || name === 'react-dom') continue;
      
      // Clean version string (remove ^, ~, etc.)
      const cleanVersion = (version as string).replace(/[\^~>=<]/g, '');
      imports[name] = `https://esm.sh/${name}@${cleanVersion}`;
      imports[`${name}/`] = `https://esm.sh/${name}@${cleanVersion}/`;
    }

    return JSON.stringify({ imports }, null, 2);
  },

  /**
   * Generate the full preview HTML for a React project
   */
  generatePreviewHTML(bundle: BuildResult, dependencies: Record<string, string>): string {
    const importMap = this.generateImportMap(dependencies);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevFlux Preview</title>
  <script type="importmap">${importMap}</script>
  <script>
    // Node.js globals polyfills for AWS/Supabase compatibility
    window.global = window;
    window.process = { env: { NODE_ENV: 'development' } };
  </script>
  <script type="module">
    import { Buffer } from 'https://esm.sh/buffer@6.0.3';
    window.Buffer = Buffer;
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    #root { min-height: 100vh; }
    ${bundle.css}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
${bundle.js}
  </script>
  <script>
    // Error boundary for runtime errors
    window.onerror = function(msg, url, line, col, error) {
      const root = document.getElementById('root');
      if (root && !root.innerHTML.trim()) {
        root.innerHTML = '<div style="padding:20px;color:#ff6b6b;font-family:monospace;background:#1e1e1e;min-height:100vh">' +
          '<h3 style="color:#ff6b6b">Runtime Error</h3>' +
          '<pre style="margin-top:10px;white-space:pre-wrap;color:#ccc">' + msg + '</pre>' +
          '</div>';
      }
    };
  </script>
</body>
</html>`;
  },
};
