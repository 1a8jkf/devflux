module.exports = {
  lookup: function(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
    }
    callback(null, hostname, 4);
  }
};
