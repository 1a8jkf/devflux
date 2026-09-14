export function terminalKeySequence(meta: { key: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; applicationCursorKeys?: boolean }): string {
  const { key, ctrlKey, altKey, shiftKey, applicationCursorKeys } = meta;
  const arrows: Record<string, string> = { ArrowUp: 'A', ArrowDown: 'B', ArrowRight: 'C', ArrowLeft: 'D', Home: 'H', End: 'F' };
  if (arrows[key]) {
    const modifier = 1 + (shiftKey ? 1 : 0) + (altKey ? 2 : 0) + (ctrlKey ? 4 : 0);
    return modifier > 1 ? '\x1b[1;' + modifier + arrows[key] : '\x1b' + (applicationCursorKeys ? 'O' : '[') + arrows[key];
  }
  const special: Record<string, string> = {
    Enter: '\r', Tab: shiftKey ? '\x1b[Z' : '\t', Escape: '\x1b', Backspace: '\x7f',
    Delete: '\x1b[3~', PageUp: '\x1b[5~', PageDown: '\x1b[6~',
  };
  let value = special[key] || '';
  if (ctrlKey && key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= '@' && upper <= '_') value = String.fromCharCode(upper.charCodeAt(0) - 64);
    else if (key === ' ') value = '\x00';
    else if (key === '?') value = '\x7f';
  } else if (!value && key.length === 1) value = shiftKey ? key.toUpperCase() : key;
  return value && altKey ? '\x1b' + value : value;
}
