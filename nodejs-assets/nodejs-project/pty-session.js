function quote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function terminalSize(cols, rows) {
  return {
    cols: Math.min(500, Math.max(2, Math.floor(Number(cols) || 80))),
    rows: Math.min(300, Math.max(2, Math.floor(Number(rows) || 24))),
  };
}

function scriptArguments({ cols, rows, ttyFile, shellCommand = '/bin/sh -l -i' }) {
  const size = terminalSize(cols, rows);
  const command = [
    'stty cols ' + size.cols + ' rows ' + size.rows,
    'tty > ' + quote(ttyFile),
    'exec ' + shellCommand,
  ].join(' && ');
  return ['-q', '-e', '-f', '-c', command, '/dev/null'];
}

function writePtyInput(process, payload) {
  if (!process?.stdin?.writable || typeof payload !== 'string') return false;
  // The TTY line discipline owns echo, cursor editing, EOF and signal handling.
  process.stdin.write(payload);
  return true;
}

module.exports = { scriptArguments, terminalSize, writePtyInput };
