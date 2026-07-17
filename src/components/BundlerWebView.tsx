import React, { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { BundlerEngine } from '../services/BundlerEngine';

/**
 * BundlerWebView — An invisible WebView that loads esbuild-wasm.
 * 
 * This is the real engine. esbuild-wasm is the actual esbuild compiler
 * compiled to WebAssembly. It runs inside the device's browser engine
 * (V8 on Android, JavaScriptCore on iOS) and performs REAL transpilation:
 * - JSX/TSX → JavaScript
 * - TypeScript type stripping
 * - Import resolution between project files
 * - CSS bundling
 * 
 * The WebView is 0x0 pixels — completely invisible to the user.
 */

const ESBUILD_VERSION = '0.24.0';

// The HTML that runs inside the invisible WebView
const BUNDLER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/lib/browser.min.js"></script>
</head>
<body>
<script>
  // Polyfill for React Native WebView communication
  if (!window.ReactNativeWebView) {
    window.ReactNativeWebView = {
      postMessage: function(msg) {
        window.parent.postMessage(msg, '*');
      }
    };
  }

  let initialized = false;
  let initPromise = null;

  // Initialize esbuild-wasm (once)
  async function ensureInitialized() {
    if (initialized) return;
    if (initPromise) return initPromise;
    
    initPromise = esbuild.initialize({
      wasmURL: 'https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm',
    });
    
    await initPromise;
    initialized = true;
    
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'ready'
    }));
  }

  // Resolve a relative path from a base directory
  function resolvePath(base, relative) {
    // Remove leading ./ from relative
    relative = relative.replace(/^\\.\\//,  '');
    
    // Get directory of base
    const baseParts = base.split('/');
    baseParts.pop(); // Remove filename
    
    const relParts = relative.split('/');
    const result = [...baseParts];
    
    for (const part of relParts) {
      if (part === '..') {
        result.pop();
      } else if (part !== '.') {
        result.push(part);
      }
    }
    
    return result.join('/');
  }

  // Try to find a file with different extensions
  function resolveWithExtensions(files, path) {
    // Direct match
    if (files[path]) return path;
    
    // Try common extensions
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '.json', '.css'];
    for (const ext of extensions) {
      if (files[path + ext]) return path + ext;
    }
    
    // Try index files in directory
    for (const ext of extensions) {
      const indexPath = path + '/index' + ext;
      if (files[indexPath]) return indexPath;
    }
    
    return null;
  }

  // Get esbuild loader for a file path
  function getLoader(path) {
    if (path.endsWith('.tsx')) return 'tsx';
    if (path.endsWith('.ts')) return 'ts';
    if (path.endsWith('.jsx')) return 'jsx';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.json')) return 'json';
    return 'jsx'; // Default: treat .js as JSX too (common in React projects)
  }

  // Create the virtual filesystem plugin for esbuild
  function createVirtualFSPlugin(files) {
    return {
      name: 'devflux-virtual-fs',
      setup(build) {
        // Handle the entry point
        build.onResolve({ filter: /.*/, namespace: 'file' }, (args) => {
          if (args.kind === 'entry-point') {
            return { path: args.path, namespace: 'virtual' };
          }
          return null;
        });

        // Handle bare imports (npm packages) → mark as external
        // These will be resolved by import maps in the preview HTML
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          return { path: args.path, external: true };
        });

        // Handle relative imports (./App, ../utils/helpers)
        build.onResolve({ filter: /^\\./, namespace: 'virtual' }, (args) => {
          const resolved = resolvePath(args.importer || args.resolveDir || '', args.path);
          const withExt = resolveWithExtensions(files, resolved);
          
          if (withExt) {
            return { path: withExt, namespace: 'virtual' };
          }
          
          return {
            errors: [{ text: 'File not found: ' + resolved + ' (tried .tsx, .ts, .jsx, .js, .json, .css, /index.*)' }]
          };
        });

        // Load file contents from the virtual filesystem
        build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
          const content = files[args.path];
          if (content === undefined) {
            return {
              errors: [{ text: 'File not found in project: ' + args.path }]
            };
          }
          
          return {
            contents: content,
            loader: getLoader(args.path),
            resolveDir: args.path.includes('/') ? args.path.substring(0, args.path.lastIndexOf('/')) : '',
          };
        });
      }
    };
  }

  // Main build function
  async function buildProject(requestId, files, entryPoint, dependencies) {
    try {
      await ensureInitialized();
      
      const result = await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        format: 'esm',
        write: false,
        plugins: [createVirtualFSPlugin(files)],
        jsx: 'automatic',
        jsxImportSource: 'react',
        target: ['es2020'],
        logLevel: 'silent',
        // Mark all npm packages as external (resolved via import maps)
        external: Object.keys(dependencies),
      });

      // Separate JS and CSS outputs
      let jsOutput = '';
      let cssOutput = '';
      
      for (const file of (result.outputFiles || [])) {
        if (file.path.endsWith('.css')) {
          cssOutput += file.text;
        } else {
          jsOutput += file.text;
        }
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'build_result',
        requestId: requestId,
        js: jsOutput,
        css: cssOutput,
        errors: (result.errors || []).map(e => e.text),
        warnings: (result.warnings || []).map(w => w.text),
      }));
      
    } catch (err) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'build_error',
        requestId: requestId,
        error: err.message || String(err),
      }));
    }
  }

  // Listen for messages from React Native
  window.addEventListener('message', function(event) {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.type === 'build') {
        buildProject(data.requestId, data.files, data.entryPoint, data.dependencies);
      }
    } catch (e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'build_error',
        requestId: 'unknown',
        error: 'Failed to parse build request: ' + e.message,
      }));
    }
  });

  // Also handle document-level messages (for iOS WebView)
  document.addEventListener('message', function(event) {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.type === 'build') {
        buildProject(data.requestId, data.files, data.entryPoint, data.dependencies);
      }
    } catch (e) {}
  });

  // Start initializing immediately
  ensureInitialized().catch(function(err) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'build_error',
      requestId: 'init',
      error: 'Failed to initialize esbuild: ' + err.message,
    }));
  });
</script>
</body>
</html>
`;

interface BundlerWebViewProps {
  // No props needed — it's invisible and managed by BundlerEngine
}

export const BundlerWebView: React.FC<BundlerWebViewProps> = () => {
  const webViewRef = useRef<WebView>(null);

  // Register the message sender with BundlerEngine
  useEffect(() => {
    BundlerEngine.registerSender((message: string) => {
      if (Platform.OS === 'web') {
        // Web: use iframe postMessage
        // Not critical for mobile-first app
      } else {
        webViewRef.current?.injectJavaScript(`
          window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(message)} }));
          true;
        `);
      }
    });

    return () => {
      BundlerEngine.unregisterSender();
    };
  }, []);

  // Handle messages coming back from esbuild
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      BundlerEngine.handleMessage(data);
    } catch (e) {
      console.error('[BundlerWebView] Failed to parse message:', e);
    }
  }, []);

  if (Platform.OS === 'web') {
    // On web, we could use an iframe, but this is mobile-first
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ html: BUNDLER_HTML }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
        // Important: allow the WASM to load from CDN
        originWhitelist={['*']}
        // Don't show any loading indicators
        startInLoadingState={false}
        // Allow mixed content for WASM loading
        mixedContentMode="always"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  webview: {
    width: 1,
    height: 1,
  },
});
