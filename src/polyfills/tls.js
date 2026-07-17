const tcpSocket = require('react-native-tcp-socket');

module.exports = {
  ...tcpSocket,
  connect: function(options, callback) {
    if (options && options.socket) {
      // Intercept PostgreSQL TLS upgrade
      // pg passes { socket: existingSocket, servername: ... }
      if (options.rejectUnauthorized === false) {
        options.tlsCheckValidity = false;
      }
      const TLSSocket = tcpSocket.TLSSocket;
      const tlsSocket = new TLSSocket(options.socket, options);
      
      // Wait for native startTLS to finish handshaking.
      // We patched the native java module to emit 'connect' when startTLS completes.
      tlsSocket.once('connect', () => {
        tlsSocket.emit('secureConnect');
        if (callback) callback();
      });

      return tlsSocket;
    }
    
    // Normal TLS connection
    return tcpSocket.connectTLS(options, callback);
  }
};
