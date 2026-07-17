const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  net: require.resolve('./src/polyfills/net.js'),
  tls: require.resolve('./src/polyfills/tls.js'),
  stream: require.resolve('stream-browserify'),
  events: require.resolve('events'),
  util: require.resolve('util'),
  'util/types': require.resolve('./src/polyfills/util-types.js'),
  path: require.resolve('./src/polyfills/path.js'),
  fs: require.resolve('./src/polyfills/fs.js'),
  dns: require.resolve('./src/polyfills/dns.js'),
  buffer: require.resolve('buffer'),
  crypto: require.resolve('./src/polyfills/crypto.js'), // Full crypto polyfill for pg
};

module.exports = config;
