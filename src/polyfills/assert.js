function assert(value, message) {
  if (!value) {
    throw new Error(message || 'Assertion failed');
  }
}

assert.ok = assert;
assert.equal = function(a, b, msg) { if (a != b) throw new Error(msg || 'Assertion failed'); };
assert.strictEqual = function(a, b, msg) { if (a !== b) throw new Error(msg || 'Assertion failed'); };
assert.deepEqual = assert.equal;

module.exports = assert;
