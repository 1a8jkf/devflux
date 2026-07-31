const fs = require('fs');
function getNativeLibDir() {
  try {
    const maps = fs.readFileSync('/proc/self/maps', 'utf8');
    const lines = maps.split('\n');
    for (let line of lines) {
      if (line.includes('libnodejs-mobile.so') || line.includes('libreactnativejni.so') || line.includes('libjsc.so')) {
        const parts = line.trim().split(/\s+/);
        const path = parts[parts.length - 1];
        if (path && path.startsWith('/data/app/') && path.endsWith('.so')) {
          return require('path').dirname(path);
        }
      }
    }
  } catch(e) {}
  return null;
}
console.log(getNativeLibDir());
