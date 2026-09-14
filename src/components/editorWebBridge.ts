// Installed before external scripts so bootstrap errors reach the native debug service.
export const EDITOR_WEB_BRIDGE = String.raw`
if (!window.ReactNativeWebView) {
  window.ReactNativeWebView = { postMessage: function(data) { window.parent.postMessage(data, '*'); } };
}
window.devfluxPost = function(data) {
  window.ReactNativeWebView.postMessage(JSON.stringify(data));
};
window.addEventListener('error', function(event) {
  window.devfluxPost({ type: 'error', message: event.message || 'Editor resource failed to load.' });
});
window.addEventListener('unhandledrejection', function(event) {
  window.devfluxPost({ type: 'error', message: String(event.reason) });
});
window.devfluxComplete = function(meta, error) {
  window.devfluxPost({ type: 'actionComplete', requestId: meta && meta.requestId, error: error });
};
window.devfluxClipboardPending = null;
window.devfluxClipboard = function(operation, text, meta, apply) {
  var id = (meta && meta.requestId) || 'clipboard-' + Date.now();
  window.devfluxClipboardPending = { id: id, meta: meta, apply: apply };
  window.devfluxPost({ type: 'clipboard', operation: operation, text: text, requestId: id });
};
window.devfluxClipboardResult = function(msg) {
  var pending = window.devfluxClipboardPending;
  if (!pending || pending.id !== msg.requestId) return;
  window.devfluxClipboardPending = null;
  try {
    if (msg.error) throw new Error(msg.error);
    pending.apply(msg.text);
    window.devfluxComplete(pending.meta);
  } catch (error) { window.devfluxComplete(pending.meta, String(error)); }
};
window.devfluxInstallModifiers = function(runKey) {
  var modifiers = {};
  var composition = false;
  var compositionData = '';
  var discardInput = false;
  function armed() { return modifiers.ctrlKey || modifiers.altKey || modifiers.shiftKey; }
  function consume(key) {
    var meta = Object.assign({}, modifiers, { key: key });
    modifiers = {};
    window.devfluxPost({ type: 'modifiersConsumed' });
    runKey(meta);
  }
  window.devfluxSetModifiers = function(meta) {
    modifiers = meta || {};
    composition = false;
    discardInput = false;
  };
  document.addEventListener('keydown', function(event) {
    discardInput = false;
    if (!armed() || !event.key || event.key === 'Unidentified' || event.key === 'Process') return;
    if (event.key.length !== 1 && !/^(Arrow|Enter|Tab|Escape|Backspace|Delete|Home|End)/.test(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    consume(event.key);
  }, true);
  document.addEventListener('compositionstart', function(event) {
    if (!armed()) return;
    composition = true;
    compositionData = '';
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('compositionupdate', function(event) {
    if (!composition) return;
    compositionData = event.data || compositionData;
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('compositionend', function(event) {
    if (!composition) return;
    event.stopImmediatePropagation();
    composition = false;
    var text = event.data || compositionData;
    if (event.target && event.target.tagName === 'TEXTAREA') event.target.value = '';
    if (text) consume(text);
    discardInput = true;
  }, true);
  document.addEventListener('beforeinput', function(event) {
    if (composition) {
      compositionData = event.data || compositionData;
      event.stopImmediatePropagation();
      return;
    }
    if (!armed() || !event.data) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    consume(event.data);
    discardInput = !event.cancelable;
  }, true);
  document.addEventListener('input', function(event) {
    if (!composition && !discardInput) return;
    event.stopImmediatePropagation();
    if (!composition) {
      if (event.target && event.target.tagName === 'TEXTAREA') event.target.value = '';
      discardInput = false;
    }
  }, true);
};
`;
