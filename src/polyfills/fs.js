module.exports = {
  readFileSync: function() {
    return '';
  },
  readFile: function(file, options, cb) {
    if (typeof options === 'function') cb = options;
    if (cb) cb(new Error('ENOENT: no such file or directory'));
  },
  statSync: function() {
    throw new Error('ENOENT');
  },
  stat: function(file, cb) {
    if (cb) cb(new Error('ENOENT'));
  },
  existsSync: function() {
    return false;
  }
};
