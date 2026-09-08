const rn = require.resolve('react-native/package.json');
console.log('rn', rn);
const plugin = require.resolve('@react-native/gradle-plugin/package.json', { paths: [rn] });
console.log('plugin', plugin);
