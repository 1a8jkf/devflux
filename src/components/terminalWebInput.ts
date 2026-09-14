// Installed after xterm.open. Keep IME commits and clipboard input on one PTY path.
export const TERMINAL_WEB_INPUT = String.raw`
window.installTerminalInput = function(term, sendMessage) {
  var ta = term.textarea;
  var composing = false;
  var imeKey = false;
  var compositionView = term.element.querySelector('.composition-view');
  function showComposition() {
    var box = term.element.querySelector('.xterm-screen').getBoundingClientRect();
    compositionView.textContent = compositionText;
    compositionView.classList.add('active');
    compositionView.style.left = (term.buffer.active.cursorX * box.width / term.cols) + 'px';
    compositionView.style.top = (term.buffer.active.cursorY * box.height / term.rows) + 'px';
    compositionView.style.fontFamily = term.options.fontFamily;
    compositionView.style.fontSize = term.options.fontSize + 'px';
  }
  var compositionText = '';
  var committed = null;
  var ignoreCompositionEnd = false;
  function commit() {
    if (!composing) return;
    composing = false;
    compositionView.classList.remove('active');
    var text = compositionText;
    compositionText = '';
    ta.value = '';
    committed = text;
    if (text) sendMessage({ type: 'DATA', payload: text });
  }
  window.commitTerminalComposition = function() {
    if (composing) { commit(); ignoreCompositionEnd = true; }
  };
  function capture(type, handler) {
    document.addEventListener(type, function(event) {
      if (event.target === ta) handler(event);
    }, true);
  }
  capture('compositionstart', function(event) {
    composing = true;
    compositionText = '';
    committed = null;
    ignoreCompositionEnd = false;
    event.stopImmediatePropagation();
  });
  capture('compositionupdate', function(event) {
    compositionText = event.data || '';
    showComposition();
    event.stopImmediatePropagation();
  });
  capture('compositionend', function(event) {
    event.stopImmediatePropagation();
    if (ignoreCompositionEnd) { ignoreCompositionEnd = false; ta.value = ''; return; }
    if (composing) {
      compositionText = event.data == null ? compositionText : event.data;
      commit();
    }
  });
  capture('beforeinput', function(event) {
    if (composing || event.isComposing) {
      if (event.data != null) compositionText = event.data;
      event.stopImmediatePropagation();
    }
  });
  capture('input', function(event) {
    if (composing || event.isComposing) {
      event.stopImmediatePropagation();
      return;
    }
    // Android may emit the committed word again as insertText. Consume only that commit.
    if (committed !== null) {
      var duplicate = event.data === committed;
      committed = null;
      ta.value = '';
      if (duplicate) { event.stopImmediatePropagation(); return; }
    }
    if (imeKey && event.inputType === 'insertText' && event.data) {
      event.stopImmediatePropagation();
      imeKey = false;
      ta.value = '';
      sendMessage({ type: 'DATA', payload: event.data });
      return;
    }
    if (event.inputType === 'insertFromComposition') event.stopImmediatePropagation();
    if (event.inputType === 'deleteContentBackward') {
      event.stopImmediatePropagation();
      ta.value = '';
      sendMessage({ type: 'DATA', payload: '\x7f' });
    }
  });
  function clipboard(operation, meta) {
    window.commitTerminalComposition();
    window.devfluxClipboard(operation, term.getSelection(), meta || {}, function(text) {
      if (operation === 'paste') term.paste(text || '');
    });
  }
  window.terminalClipboardKey = function(meta) {
    var key = (meta.key || '').toLowerCase();
    if ((meta.ctrlKey || meta.metaKey) && !meta.altKey) {
      if (key === 'v') { clipboard('paste', meta); return true; }
      if (key === 'c' && (meta.shiftKey || meta.metaKey || term.hasSelection())) {
        clipboard('copy', meta); return true;
      }
    }
    if (meta.shiftKey && meta.key === 'Insert') { clipboard('paste', meta); return true; }
    return false;
  };
  term.attachCustomKeyEventHandler(function(event) {
    if (event.type !== 'keydown') return true;
    committed = null;
    imeKey = event.keyCode === 229;
    if (window.terminalClipboardKey(event)) { event.preventDefault(); return false; }
    // 229 is an IME notification, not another copy of textarea content.
    if (event.keyCode === 229 || event.isComposing) return false;
    window.commitTerminalComposition();
    return true;
  });
  capture('paste', function(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.commitTerminalComposition();
    if (event.clipboardData) term.paste(event.clipboardData.getData('text/plain'));
    else clipboard('paste');
  });
  document.addEventListener('copy', function(event) {
    if (!term.hasSelection()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.clipboardData) event.clipboardData.setData('text/plain', term.getSelection());
    else clipboard('copy');
  }, true);
  var menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;z-index:20;display:none;gap:8px;padding:8px;background:#27272a;border-radius:8px;';
  [['Copy', 'copy'], ['Paste', 'paste'], ['Select all', 'selectAll']].forEach(function(item) {
    var button = document.createElement('button');
    button.textContent = item[0];
    button.style.cssText = 'color:white;background:transparent;border:0;padding:10px;font-size:14px;';
    button.addEventListener('click', function() {
      if (item[1] === 'selectAll') term.selectAll();
      else { clipboard(item[1]); menu.style.display = 'none'; }
    });
    menu.appendChild(button);
  });
  document.body.appendChild(menu);
  function showMenu(x, y) {
    var box = term.element.getBoundingClientRect();
    if (!Number.isFinite(x)) x = box.left;
    if (!Number.isFinite(y)) y = box.top;
    menu.style.display = 'flex';
    menu.style.left = Math.max(0, Math.min(x, innerWidth - menu.offsetWidth)) + 'px';
    menu.style.top = Math.max(0, Math.min(y, innerHeight - menu.offsetHeight)) + 'px';
  }
  term.element.addEventListener('contextmenu', function(event) {
    event.preventDefault();
    showMenu(event.clientX, event.clientY);
  });
  var touchTimer;
  term.element.addEventListener('touchstart', function(event) {
    var touch = event.touches[0];
    if (!touch) return;
    menu.style.display = 'none';
    touchTimer = setTimeout(function() {
      var box = term.element.querySelector('.xterm-screen').getBoundingClientRect();
      var row = term.buffer.active.viewportY + Math.floor((touch.clientY - box.top) / (box.height / term.rows));
      var line = term.buffer.active.getLine(row);
      if (line && !term.hasSelection()) term.select(0, row, line.translateToString(true).length);
      window._terminalLongPress = true;
      showMenu(touch.clientX, touch.clientY);
    }, 500);
  }, { passive: true });
  ['touchmove', 'touchend', 'touchcancel'].forEach(function(type) {
    term.element.addEventListener(type, function() { clearTimeout(touchTimer); }, { passive: true });
  });
};
`;
