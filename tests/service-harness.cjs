const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadService(filename, mocks = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
      exports, console, setTimeout, clearTimeout, AbortController, URL, ...globals,
      require(name) {
        if (name in mocks) return mocks[name];
        if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'));
        return require(name);
      },
    }, { filename: file });
    return exports;
  }
  return load(filename);
}
module.exports = { loadService };
