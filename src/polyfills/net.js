const net = require('react-native-tcp-socket');

const originalConnect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function(...args) {
  if (args.length > 0 && typeof args[0] === 'number') {
    // connect(port, host, callback)
    const port = args[0];
    const host = typeof args[1] === 'string' ? args[1] : 'localhost';
    const callback = typeof args[1] === 'function' ? args[1] : (typeof args[2] === 'function' ? args[2] : undefined);
    return originalConnect.call(this, { port, host }, callback);
  } else if (args.length > 0 && typeof args[0] === 'string') {
    // connect(path, callback) - not fully supported but let's parse it
    return originalConnect.apply(this, args);
  }
  return originalConnect.apply(this, args);
};

// Also patch module.exports.connect
const originalModuleConnect = net.connect;
net.connect = function(...args) {
  if (args.length > 0 && typeof args[0] === 'number') {
    const port = args[0];
    const host = typeof args[1] === 'string' ? args[1] : 'localhost';
    const callback = typeof args[1] === 'function' ? args[1] : (typeof args[2] === 'function' ? args[2] : undefined);
    return originalModuleConnect.call(net, { port, host }, callback);
  }
  return originalModuleConnect.apply(net, args);
};

net.createConnection = net.connect;

module.exports = net;
