const fs = require('fs');
const https = require('https');
const path = require('path');

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function bundle() {
  console.log("Fetching Xterm CSS...");
  const css = await fetchUrl("https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css");
  
  console.log("Fetching Xterm JS...");
  const js = await fetchUrl("https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js");
  
  console.log("Fetching Fit Addon JS...");
  const fitJs = await fetchUrl("https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js");

  const content = `// AUTO-GENERATED - DO NOT EDIT DIRECTLY
export const XTERM_CSS = \`${css.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
export const XTERM_JS = \`${js.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
export const XTERM_FIT_JS = \`${fitJs.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
`;

  fs.writeFileSync(path.join(__dirname, 'src', 'components', 'xtermBundle.ts'), content);
  console.log("Done bundling xterm to src/components/xtermBundle.ts!");
}

bundle().catch(console.error);
