const md5 = require('md5');

module.exports = {
  webcrypto: {
    subtle: {
      digest: async () => new Uint8Array(0),
      importKey: async () => ({}),
      deriveKey: async () => ({}),
      deriveBits: async () => new Uint8Array(0),
      sign: async () => new Uint8Array(0),
    },
    getRandomValues: (arr) => {
      for(let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    }
  },
  createHash: function(algo) {
    let data = '';
    return {
      update: function(str) {
        data += str;
        return this;
      },
      digest: function(enc) {
        if (algo === 'md5') return md5(data);
        return '';
      }
    };
  }
};
