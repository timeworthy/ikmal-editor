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
  let hoveredMark = null;
  let pointerFrame = null;
  let indicator = null;
  // How far the indicator sits inside the field's bottom-right corner. Enough
  // to clear a textarea's resize grip without floating away from the edge.
  const INDICATOR_INSET = 6;
  // Below this the indicator would cover more of the field than it informs.
  const INDICATOR_MIN_FIELD = 90;

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

  // --- field indicator ---------------------------------------------------

  // A small state readout anchored inside the focused field's bottom-right
  // corner, so the field itself says whether it is being checked rather than
  // the answer living only in the toolbar popup.

  function ensureIndicator() {
    if (indicator?.isConnected) return indicator;
    indicator = document.createElement('div');
    indicator.className = 'ikmal-indicator';
    indicator.setAttribute('role', 'status');
    // Keep focus in the field: losing it would blur the field and tear the
    // overlay down before any click could be acted on.
    indicator.addEventListener('mousedown', (event) => event.preventDefault());
    document.documentElement.appendChild(indicator);
    return indicator;
  }

  function positionIndicator(field) {
    if (!indicator || activeField !== field) return;
    const box = field.getBoundingClientRect();
    // Hide rather than float over a field too small to spare the corner.
    if (box.width < INDICATOR_MIN_FIELD || box.height < 24) {
      indicator.classList.remove('is-visible');
      return;
    }
    indicator.style.top = `${box.bottom + window.scrollY - INDICATOR_INSET - indicator.offsetHeight}px`;
    indicator.style.left = `${box.right + window.scrollX - INDICATOR_INSET - indicator.offsetWidth}px`;
  }

  const INDICATOR_STATES = {
    checking: { text: '···', title: 'ikmal is checking this text' },
    clean: { text: '✓', title: 'ikmal found nothing to flag' },
    off: { text: '‖', title: 'ikmal is off for this site' },
    error: { text: '!', title: 'ikmal could not reach your local server' },
  };

  function setIndicator(field, state, count = 0) {
    if (activeField !== field) return;
    const element = ensureIndicator();
    const preset = INDICATOR_STATES[state];
    element.textContent = preset ? preset.text : String(count);
    element.title = preset ? preset.title : `ikmal found ${count} suggestion${count === 1 ? '' : 's'}`;
    element.className = `ikmal-indicator is-visible is-${state}`;
    positionIndicator(field);
  }

  function hideIndicator() {
    if (indicator) indicator.classList.remove('is-visible');
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
    if (!settings?.enabled) {
      clearMarks(field);
      setIndicator(field, 'off');
      return;
    }
    const text = textOf(field);
    if (!text || text.trim().length < (settings.minLength ?? 12)) {
      clearMarks(field);
      // Too short is not a state worth reporting: the field is simply empty or
      // barely started, and a readout there would be noise.
      hideIndicator();
      return;
    }

    setIndicator(field, 'checking');
    const response = await send({ type: 'check', text, language: settings.language });
    if (!response.ok) {
      clearMarks(field);
      setIndicator(field, 'error');
      return;
    }
    if (response.data?.skipped) {
      clearMarks(field);
      // 'too-short' is the service worker agreeing with the check above.
      if (response.data.skipped === 'too-short') hideIndicator();
      else setIndicator(field, 'off');
      return;
    }

    const record = state.get(field);
    if (!record) return;
    // Discard a response that lost the race with newer typing.
    if (textOf(field) !== text) return;

    record.matches = Array.isArray(response.data.matches) ? response.data.matches : [];
    record.checkedText = text;
    renderMarks(field);
    setIndicator(field, record.matches.length ? 'flagged' : 'clean', record.matches.length);
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
    // The hovered mark is about to be removed from the DOM, so drop the
    // reference before it becomes a handle on a detached node.
    setHoveredMark(null);
    layer.textContent = '';

    const record = state.get(field);
    if (record) record.marks = [];
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
        // The mark spans the whole word rather than a 2px strip on the
        // baseline, so hovering or clicking anywhere on the word finds it. The
        // underline is drawn as this box's bottom border, which lands in the
        // same place the old strip did.
        //
        // It stays pointer-events: none: a box that swallowed clicks over the
        // word would stop the host editor placing its caret there, which is
        // why the strip was 2px to begin with. Hover and activation are
        // resolved by hit-testing the stored geometry in the listeners below,
        // so the click still reaches the page.
        mark.style.top = `${rect.top + window.scrollY}px`;
        mark.style.left = `${rect.left + window.scrollX}px`;
        mark.style.width = `${rect.width}px`;
        mark.style.height = `${rect.height}px`;
        mark.dataset.index = String(index);
        layer.appendChild(mark);
        record.marks.push({
          index,
          element: mark,
          left: rect.left + window.scrollX,
          top: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        });
      });
    });
  }

  // --- pointer hit testing -----------------------------------------------

  // Marks cannot be hit-tested by the browser because they do not take pointer
  // events, so the geometry recorded during render is searched directly. Page
  // coordinates are used throughout: renderMarks re-runs on scroll and resize,
  // so the stored boxes track the text.
  function markAt(field, pageX, pageY) {
    const record = state.get(field);
    if (!record?.marks?.length) return null;
    return record.marks.find((mark) => pageX >= mark.left
      && pageX <= mark.left + mark.width
      && pageY >= mark.top
      && pageY <= mark.top + mark.height) || null;
  }

  function setHoveredMark(mark) {
    if (hoveredMark === mark) return;
    hoveredMark?.element?.classList.remove('is-hover');
    hoveredMark = mark;
    hoveredMark?.element?.classList.add('is-hover');
  }

  // --- suggestion card ---------------------------------------------------

  // box is in page coordinates, matching what renderMarks recorded.
  function openCard(field, index, box) {
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

    element.style.top = `${box.top + box.height + 8}px`;
    element.style.left = `${Math.max(8, box.left)}px`;
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
    state.set(field, { matches: [], marks: [], timer: null, mirror: null, checkedText: '' });

    field.addEventListener('input', () => { closeCard(); scheduleCheck(field); });
    field.addEventListener('focus', () => { activeField = field; scheduleCheck(field); });
    field.addEventListener('blur', () => {
      if (activeField === field) {
        activeField = null;
        ensureOverlay().textContent = '';
      }
      setHoveredMark(null);
      hideIndicator();
      closeCard();
    });
    field.addEventListener('scroll', () => { closeCard(); renderMarks(field); positionIndicator(field); });
  }

  function scan(root = document) {
    root.querySelectorAll?.(FIELD_SELECTOR).forEach((field) => {
      if (isEditable(field)) attach(field);
    });
  }

  const reposition = () => {
    closeCard();
    if (!activeField) return;
    renderMarks(activeField);
    positionIndicator(activeField);
  };

  document.addEventListener('focusin', (event) => {
    if (isEditable(event.target)) attach(event.target);
  });
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition);
  // Hover is applied from script because a pointer-events: none element never
  // matches :hover. One rAF per burst of movement keeps this off the hot path.
  document.addEventListener('mousemove', (event) => {
    if (!activeField) {
      setHoveredMark(null);
      return;
    }
    if (pointerFrame) return;
    const { pageX, pageY } = event;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = null;
      setHoveredMark(activeField ? markAt(activeField, pageX, pageY) : null);
    });
  }, { passive: true });

  // click, not mousedown, and without preventDefault: the host editor must
  // still get the event so clicking a flagged word places the caret there the
  // way clicking any other word does.
  document.addEventListener('click', (event) => {
    if (card?.contains(event.target)) return;
    const mark = activeField ? markAt(activeField, event.pageX, event.pageY) : null;
    if (mark) openCard(activeField, mark.index, mark);
    else closeCard();
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
