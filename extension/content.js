// Content script: find editable fields, check their text against the local
// server, and draw underlines under the reported ranges.
//
// LanguageTool-compatible match offsets are the single source of truth, the
// same convention the ikmal desktop editor uses. Two positioning strategies
// are needed because the DOM offers no single one that works everywhere:
//
//   textarea / input  -> a mirror element that replicates the field's box and
//                        typography, so a span inside it lands where the same
//                        characters land in the real field.
//   contenteditable   -> DOM Ranges, which report real rects directly.

(() => {
  const FIELD_SELECTOR = 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [contenteditable=""]';
  const MIRROR_COPIED_STYLES = [
    'boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'textIndent', 'whiteSpace', 'wordSpacing', 'wordBreak', 'overflowWrap',
  ];

  const state = new WeakMap();
  let overlay = null;
  let card = null;
  let activeField = null;
  let settings = null;

  function ensureOverlay() {
    if (overlay?.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'ikmal-overlay';
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function ensureCard() {
    if (card?.isConnected) return card;
    card = document.createElement('div');
    card.className = 'ikmal-card';
    card.addEventListener('mousedown', (event) => event.preventDefault());
    document.documentElement.appendChild(card);
    return card;
  }

  function closeCard() {
    if (card) card.classList.remove('is-open');
  }

  function isEditable(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (node.isContentEditable) return true;
    if (node instanceof HTMLTextAreaElement) return true;
    if (node instanceof HTMLInputElement) {
      const type = (node.type || 'text').toLowerCase();
      return type === 'text' || type === 'search';
    }
    return false;
  }

  function textOf(field) {
    return field.isContentEditable ? field.innerText : field.value;
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: 'No response' });
        });
      } catch (error) {
        // The worker can be torn down mid-flight; treat that as a soft miss
        // rather than throwing inside the page.
        resolve({ ok: false, error: error.message });
      }
    });
  }

  async function loadSettings() {
    const response = await send({ type: 'settings' });
    if (response.ok) settings = response.data;
    return settings;
  }

  function scheduleCheck(field) {
    const record = state.get(field);
    if (!record) return;
    clearTimeout(record.timer);
    record.timer = setTimeout(() => runCheck(field), settings?.checkDelayMs ?? 900);
  }

  async function runCheck(field) {
    if (!settings?.enabled) return clearMarks(field);
    const text = textOf(field);
    if (!text || text.trim().length < (settings.minLength ?? 12)) return clearMarks(field);

    const response = await send({ type: 'check', text, language: settings.language });
    if (!response.ok || response.data?.skipped) return clearMarks(field);

    const record = state.get(field);
    if (!record) return;
    // Discard a response that lost the race with newer typing.
    if (textOf(field) !== text) return;

    record.matches = Array.isArray(response.data.matches) ? response.data.matches : [];
    record.checkedText = text;
    renderMarks(field);
  }

  function clearMarks(field) {
    const record = state.get(field);
    if (record) record.matches = [];
    renderMarks(field);
  }

  function severityOf(match) {
    const source = String(match.ikmalSource || '').toLowerCase();
    const category = String(match.rule?.category?.id || '').toLowerCase();
    if (source.includes('style') || category.includes('style')) return 'is-style';
    if (category.includes('typo') || category.includes('spell')) return 'is-spelling';
    return 'is-grammar';
  }

  // --- positioning -------------------------------------------------------

  function rectsForTextarea(field, start, end) {
    const record = state.get(field);
    const mirror = record.mirror || (record.mirror = buildMirror());
    const computed = getComputedStyle(field);
    for (const property of MIRROR_COPIED_STYLES) mirror.style[property] = computed[property];

    const box = field.getBoundingClientRect();
    mirror.style.width = `${box.width}px`;
    mirror.style.height = `${box.height}px`;

    const value = field.value ?? '';
    mirror.textContent = value.slice(0, start);
    const marker = document.createElement('span');
    marker.textContent = value.slice(start, end);
    mirror.appendChild(marker);
    mirror.appendChild(document.createTextNode(value.slice(end)));

    const mirrorBox = mirror.getBoundingClientRect();
    return [...marker.getClientRects()].map((rect) => ({
      top: rect.top - mirrorBox.top + box.top - field.scrollTop,
      left: rect.left - mirrorBox.left + box.left - field.scrollLeft,
      width: rect.width,
      height: rect.height,
    }));
  }

  function buildMirror() {
    const mirror = document.createElement('div');
    mirror.className = 'ikmal-mirror';
    document.documentElement.appendChild(mirror);
    return mirror;
  }

  // Walks text nodes to convert a plain-text offset into a DOM position.
  function locate(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let seen = 0;
    let node = walker.nextNode();
    while (node) {
      const length = node.textContent.length;
      if (seen + length >= offset) return { node, offset: offset - seen };
      seen += length;
      node = walker.nextNode();
    }
    return null;
  }

  function rectsForEditable(field, start, end) {
    const from = locate(field, start);
    const to = locate(field, end);
    if (!from || !to) return [];
    const range = document.createRange();
    try {
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
    } catch {
      return [];
    }
    return [...range.getClientRects()].map((rect) => ({
      top: rect.top, left: rect.left, width: rect.width, height: rect.height,
    }));
  }

  function renderMarks(field) {
    const layer = ensureOverlay();
    if (activeField !== field) return;
    layer.textContent = '';

    const record = state.get(field);
    if (!record?.matches?.length) return;

    const fieldBox = field.getBoundingClientRect();
    record.matches.forEach((match, index) => {
      const start = match.offset;
      const end = match.offset + match.length;
      const rects = field.isContentEditable
        ? rectsForEditable(field, start, end)
        : rectsForTextarea(field, start, end);

      rects.forEach((rect) => {
        // Clip to the field so underlines never escape a scrolled box.
        if (rect.top < fieldBox.top - 2 || rect.top + rect.height > fieldBox.bottom + 2) return;
        const mark = document.createElement('span');
        mark.className = `ikmal-mark ${severityOf(match)}`;
        mark.style.top = `${rect.top + window.scrollY + rect.height - 2}px`;
        mark.style.left = `${rect.left + window.scrollX}px`;
        mark.style.width = `${rect.width}px`;
        mark.dataset.index = String(index);
        mark.addEventListener('mousedown', (event) => {
          event.preventDefault();
          openCard(field, index, rect);
        });
        layer.appendChild(mark);
      });
    });
  }

  // --- suggestion card ---------------------------------------------------

  function openCard(field, index, rect) {
    const record = state.get(field);
    const match = record?.matches?.[index];
    if (!match) return;

    const element = ensureCard();
    const replacements = (match.replacements || []).slice(0, 4);
    const source = match.ikmalSource || (match.rule?.id?.startsWith('IKMAL_') ? 'ikmal quality' : 'LanguageTool');

    element.textContent = '';
    element.appendChild(buildCardBody(match, replacements, source, (replacement) => {
      applyReplacement(field, match, replacement);
      closeCard();
    }));

    element.style.top = `${rect.top + window.scrollY + rect.height + 8}px`;
    element.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    element.classList.add('is-open');
  }

  function buildCardBody(match, replacements, source, onApply) {
    const fragment = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'ikmal-card-source';
    header.textContent = source;
    fragment.appendChild(header);

    const message = document.createElement('p');
    message.className = 'ikmal-card-message';
    message.textContent = match.message || 'Suggestion';
    fragment.appendChild(message);

    if (replacements.length) {
      const list = document.createElement('div');
      list.className = 'ikmal-card-actions';
      replacements.forEach((replacement) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ikmal-card-apply';
        button.textContent = replacement.value;
        button.addEventListener('click', () => onApply(replacement.value));
        list.appendChild(button);
      });
      fragment.appendChild(list);
    }

    return fragment;
  }

  function applyReplacement(field, match, replacement) {
    const start = match.offset;
    const end = match.offset + match.length;

    if (field.isContentEditable) {
      const from = locate(field, start);
      const to = locate(field, end);
      if (!from || !to) return;
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      range.deleteContents();
      range.insertNode(document.createTextNode(replacement));
      field.dispatchEvent(new InputEvent('input', { bubbles: true }));
    } else {
      const value = field.value;
      field.value = value.slice(0, start) + replacement + value.slice(end);
      field.setSelectionRange(start + replacement.length, start + replacement.length);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    scheduleCheck(field);
  }

  // --- wiring ------------------------------------------------------------

  function attach(field) {
    if (state.has(field)) return;
    state.set(field, { matches: [], timer: null, mirror: null, checkedText: '' });

    field.addEventListener('input', () => { closeCard(); scheduleCheck(field); });
    field.addEventListener('focus', () => { activeField = field; scheduleCheck(field); });
    field.addEventListener('blur', () => {
      if (activeField === field) {
        activeField = null;
        ensureOverlay().textContent = '';
      }
      closeCard();
    });
    field.addEventListener('scroll', () => { closeCard(); renderMarks(field); });
  }

  function scan(root = document) {
    root.querySelectorAll?.(FIELD_SELECTOR).forEach((field) => {
      if (isEditable(field)) attach(field);
    });
  }

  const reposition = () => {
    closeCard();
    if (activeField) renderMarks(activeField);
  };

  document.addEventListener('focusin', (event) => {
    if (isEditable(event.target)) attach(event.target);
  });
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition);
  document.addEventListener('mousedown', (event) => {
    if (!card?.contains(event.target) && !event.target.classList?.contains('ikmal-mark')) closeCard();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'settings-changed') {
      loadSettings().then(() => activeField && runCheck(activeField));
    }
  });

  new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  loadSettings().then(() => scan());
})();
