const fs = require('fs');
const https = require('https');

const fetch = (url) => new Promise((resolve, reject) => {
    https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
    }).on('error', reject);
});

async function run() {
    const css = await fetch('https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css');
    const js = await fetch('https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js');
    const fitJs = await fetch('https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js');

    const escapeString = (str) => str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const content = `export const xtermCSS = \`${escapeString(css)}\`;\n\n` +
                    `export const xtermJS = \`${escapeString(js)}\`;\n\n` +
                    `export const fitAddonJS = \`${escapeString(fitJs)}\`;\n`;

    fs.writeFileSync('src/components/xtermBundle.ts', content);
    console.log('xtermBundle.ts generated successfully');
}
run();
