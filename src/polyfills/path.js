module.exports = {
  join: function(...args) {
    return args.join('/');
  },
  resolve: function(...args) {
    return args.join('/');
  },
  dirname: function(p) {
    return p.split('/').slice(0, -1).join('/');
  },
  basename: function(p) {
    return p.split('/').pop();
  },
  extname: function(p) {
    return '.' + p.split('.').pop();
  }
};
