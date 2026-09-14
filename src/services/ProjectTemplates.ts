export type TemplateType = 'html' | 'node' | 'react' | 'blank';

const optionalPackages: Record<string, string> = {
  'react-router-dom': '^6.30.1', 'lucide-react': '^0.468.0', axios: '^1.12.0',
  express: '^4.21.2', mongoose: '^8.19.0', cors: '^2.8.5', dotenv: '^16.6.1',
};

export function projectTemplate(id: string, name: string, type: TemplateType, packages: string[] = []): Record<string, string> {
  if (!['html', 'node', 'react', 'blank'].includes(type)) throw new Error('Template desconhecido.');
  const dependencies: Record<string, string> = {};
  for (const pkg of packages) {
    if (!Object.hasOwn(optionalPackages, pkg)) throw new Error('Pacote nao permitido: ' + pkg);
    dependencies[pkg] = optionalPackages[pkg];
  }
  if (type === 'blank') return {};
  const title = name.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const style = 'body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; }\n';
  if (type === 'html') return {
    'index.html': `<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="style.css"></head>
<body><h1>${title}</h1><script src="script.js"></script></body>
</html>\n`,
    'style.css': style, 'script.js': 'console.log(' + JSON.stringify(name) + ');\n',
  };
  const manifest: Record<string, any> = { name: id, version: '1.0.0', private: true, scripts: {}, dependencies };
  const files: Record<string, string> = { '.gitignore': 'node_modules/\ndist/\n.env\n' };
  if (type === 'react') {
    manifest.type = 'module';
    manifest.scripts = { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview --host 0.0.0.0' };
    manifest.dependencies = { react: '^18.3.1', 'react-dom': '^18.3.1', ...dependencies };
    // Vite 5 supports the Node 21 runtime shipped by existing Android installs.
    manifest.devDependencies = { vite: '^5.4.21' };
    files['index.html'] = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>\n`;
    files['src/main.jsx'] = "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './style.css';\n\ncreateRoot(document.getElementById('root')).render(<App />);\n";
    files['src/App.jsx'] = "import React from 'react';\n\nexport default function App() {\n  return <main><h1>{" + JSON.stringify(name) + "}</h1></main>;\n}\n";
    files['src/style.css'] = style;
  } else {
    manifest.scripts = { start: 'node server.js', dev: 'node --watch server.js' };
    files['server.js'] = dependencies.express
      ? "const express = require('express');\nconst app = express();\napp.use(express.json());\napp.get('/', (_req, res) => res.json({ message: 'OK' }));\nconst port = Number(process.env.PORT || 3000);\napp.listen(port, '0.0.0.0', () => console.log('http://localhost:' + port));\n"
      : "const http = require('node:http');\nconst port = Number(process.env.PORT || 3000);\nhttp.createServer((_req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ message: 'OK' }));\n}).listen(port, '0.0.0.0', () => console.log('http://localhost:' + port));\n";
  }
  files['package.json'] = JSON.stringify(manifest, null, 2) + '\n';
  return files;
}
