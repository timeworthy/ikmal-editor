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
  const MIRROR_COPIED_STYLES = [
    'boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'textIndent', 'textAlign', 'textAlignLast', 'whiteSpace', 'wordSpacing',
    'wordBreak', 'overflowWrap', 'tabSize', 'direction', 'unicodeBidi', 'textRendering',
  ];

  const state = new WeakMap();
  const textStats = globalThis.IkmalTextStats || {
    wordCount: (text) => String(text || '').trim().split(/\s+/u).filter(Boolean).length,
    characterCount: (text) => Array.from(String(text || '')).length,
  };
  const editableReplacement = globalThis.IkmalEditableReplacement || {
    // If the shared module did not load, apply the edit straight to the DOM: a
    // suggestion that works everywhere except model-backed editors beats one
    // that throws in all of them.
    applyEditableReplacement: (context) => { context.replaceRange(); context.emitInput(); return 'fallback'; },
  };
  let overlay = null;
  let card = null;
  let focusMenu = null;
  let selectionPopup = null;
  let activeField = null;
  // activeField is cleared on blur, which is correct for marks and the overlay
  // but wrong for the issue workspace: opening it activates another tab, and
  // that blur is the very thing the workspace needs to survive. This keeps the
  // last edited field addressable for getIssues/applyIssue only.
  let workspaceField = null;
  let settings = null;
  let focusMenuGeneration = 0;
  let hoveredMark = null;
  let pointerFrame = null;
  let indicator = null;
  let selectionUpdateTimer = null;
  let selectionGeneration = 0;
  let selectionAnchor = null;
  let selectionCheckInFlight = false;
  let fieldSequence = 0;
  const SELECTION_CHECK_MAX = 20000;
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

  function ensureFocusMenu() {
    if (focusMenu?.isConnected) return focusMenu;
    focusMenu = document.createElement('div');
    focusMenu.className = 'ikmal-focus-menu';
    focusMenu.addEventListener('mousedown', (event) => event.preventDefault());
    document.documentElement.appendChild(focusMenu);
    return focusMenu;
  }

  function closeCard() {
    if (card) card.classList.remove('is-open');
  }

  function closeFocusMenu() {
    if (focusMenu) focusMenu.classList.remove('is-open');
  }

  function ensureSelectionPopup() {
    if (selectionPopup?.isConnected) return selectionPopup;
    selectionPopup = document.createElement('div');
    selectionPopup.className = 'ikmal-selection-popup';
    selectionPopup.setAttribute('role', 'status');
    selectionPopup.setAttribute('aria-live', 'polite');
    // Keep a selection alive while the user reads or moves to this summary.
    selectionPopup.addEventListener('mousedown', (event) => event.preventDefault());
    document.documentElement.appendChild(selectionPopup);
    return selectionPopup;
  }

  function closeSelectionPopup() {
    selectionAnchor = null;
    if (selectionPopup) selectionPopup.classList.remove('is-open');
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
    indicator.addEventListener('click', (event) => {
      event.stopPropagation();
      openFocusMenu();
    });
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
    paused: { text: '‖', title: 'ikmal is paused' },
    zen: { text: '✓', title: 'Zen: only the most confident findings' },
    error: { text: '!', title: 'ikmal could not reach your local server' },
  };

  function setIndicator(field, state, count = 0, title = '') {
    if (activeField !== field) return;
    const element = ensureIndicator();
    const preset = INDICATOR_STATES[state];
    element.textContent = state === 'zen' ? String(count) : (preset ? preset.text : String(count));
    element.title = title || (preset ? preset.title : `ikmal found ${count} suggestion${count === 1 ? '' : 's'}`);
    element.className = `ikmal-indicator is-visible is-${state}`;
    positionIndicator(field);
  }

  async function openFocusMenu() {
    const element = ensureFocusMenu();
    if (!indicator) return;

    // The indicator's click handler stops propagation, so the document-level
    // close handler never runs and a second click re-enters this function. On a
    // cold service-worker start the round trip below takes long enough for two
    // builds to interleave. Read first and touch the DOM only afterwards, and
    // let the newest build win, so the menu is never half-built or doubled.
    const generation = ++focusMenuGeneration;
    const [focusResponse, durationResponse] = await Promise.all([
      send({ type: 'focus' }),
      send({ type: 'focusDurations' }),
    ]);
    if (generation !== focusMenuGeneration) return;
    // The field can blur during that round trip. Blur closes the menu and hides
    // the indicator, so opening now would anchor a menu to a control that is no
    // longer on screen. The indicator can also have moved, hence the late read.
    if (!indicator?.classList.contains('is-visible')) return;
    const box = indicator.getBoundingClientRect();

    closeCard();
    closeSelectionPopup();
    element.textContent = '';

    const source = document.createElement('div');
    source.className = 'ikmal-card-source';
    source.textContent = 'ikmal controls';
    element.appendChild(source);

    const heading = document.createElement('p');
    heading.className = 'ikmal-card-message';
    heading.textContent = 'Choose how much checking you want right now.';
    element.appendChild(heading);

    const modes = document.createElement('div');
    modes.className = 'ikmal-focus-modes';
    const status = document.createElement('div');
    status.className = 'ikmal-focus-status';

    const focus = focusResponse?.ok ? focusResponse.data : { mode: 'active', label: 'Automatic' };
    const durations = durationResponse?.ok && Array.isArray(durationResponse.data) ? durationResponse.data : [];
    const activateMode = async (mode, durationID, event) => {
      event?.stopPropagation();
      const response = await send({ type: 'setFocus', mode, duration: durationID });
      if (!response?.ok) {
        status.textContent = response?.error || 'Could not update checking mode.';
        return;
      }
      settings = await loadSettings();
      if (activeField) {
        if (response.data?.mode === 'paused') {
          clearMarks(activeField);
          setIndicator(activeField, 'paused', 0, response.data.label);
        } else {
          runCheck(activeField);
        }
      }
      closeFocusMenu();
    };

    const checking = document.createElement('button');
    checking.type = 'button';
    checking.className = 'ikmal-focus-button';
    checking.textContent = 'Automatic';
    checking.setAttribute('aria-pressed', String(focus.mode === 'active'));
    if (focus.mode === 'active') checking.classList.add('is-active');
    checking.addEventListener('click', (event) => activateMode('active', null, event));
    modes.appendChild(checking);

    ['paused', 'zen'].forEach((mode) => {
      const name = mode === 'paused' ? 'Pause' : 'Zen';
      const picker = document.createElement('div');
      picker.className = 'ikmal-focus-picker';
      // content.css right-anchors the rightmost panel via
      // .ikmal-focus-picker[data-mode="zen"]; without this the 210px Zen
      // dropdown stays left-anchored and overflows the menu's right edge.
      picker.dataset.mode = mode;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'ikmal-focus-picker-trigger';
      trigger.textContent = name;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', `${name} mode and duration`);
      const panel = document.createElement('div');
      panel.className = 'ikmal-focus-picker-panel';
      const title = document.createElement('strong');
      title.textContent = name;
      const description = document.createElement('small');
      description.textContent = mode === 'paused'
        ? 'Stops checking until the timer ends or you switch back.'
        : 'Keeps checking, but shows only the strongest issues.';
      const options = document.createElement('div');
      options.className = 'ikmal-focus-picker-options';
      durations.forEach((entry) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'ikmal-focus-picker-option';
        option.textContent = entry.label;
        option.addEventListener('click', (event) => activateMode(mode, entry.id, event));
        options.appendChild(option);
      });
      if (!options.children.length) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'ikmal-focus-picker-option';
        option.textContent = 'Until I turn it off';
        option.addEventListener('click', (event) => activateMode(mode, 'until-off', event));
        options.appendChild(option);
      }
      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = picker.classList.toggle('is-open');
        trigger.setAttribute('aria-expanded', String(isOpen));
      });
      picker.append(trigger, panel);
      panel.append(title, description, options);
      if (focus.mode === mode) picker.classList.add('is-active');
      modes.appendChild(picker);
    });

    modes.addEventListener('click', (event) => {
      if (!event.target.closest('.ikmal-focus-picker-trigger')) return;
      const current = event.target.closest('.ikmal-focus-picker');
      modes.querySelectorAll('.ikmal-focus-picker.is-open').forEach((picker) => {
        if (picker === current) return;
        picker.classList.remove('is-open');
        picker.querySelector('.ikmal-focus-picker-trigger')?.setAttribute('aria-expanded', 'false');
      });
    });

    const label = document.createElement('div');
    label.className = 'ikmal-focus-label';
    label.textContent = `Current mode: ${focus.mode === 'active' ? 'Automatic' : (focus.label || 'Checking')}`;
    element.appendChild(label);
    element.appendChild(modes);
    element.appendChild(status);
    const actions = document.createElement('div');
    actions.className = 'ikmal-focus-actions';
    const workspaceButton = document.createElement('button');
    workspaceButton.type = 'button';
    workspaceButton.className = 'ikmal-focus-link';
    workspaceButton.textContent = 'View all issues';
    workspaceButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const response = await send({ type: 'openWorkspace' });
      if (!response?.ok) status.textContent = response?.error || 'Could not open the issue workspace.';
      else closeFocusMenu();
    });
    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.className = 'ikmal-focus-link';
    settingsButton.textContent = 'Settings';
    settingsButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const response = await send({ type: 'openSettings' });
      if (!response?.ok) status.textContent = response?.error || 'Could not open settings.';
      else closeFocusMenu();
    });
    actions.append(workspaceButton, settingsButton);
    element.appendChild(actions);
    element.classList.add('is-open');
    placePopup(element, box, { below: true, preferredLeft: box.left + window.scrollX - 190 });
  }

  function hideIndicator() {
    if (indicator) indicator.classList.remove('is-visible');
  }

  // The workspace addresses a field the user has usually navigated away from,
  // so this reads the last edited field rather than the focused one. A field
  // torn out of the document is reported as gone rather than edited.
  function liveWorkspaceField() {
    if (!workspaceField?.isConnected) {
      workspaceField = null;
      return null;
    }
    return workspaceField;
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

  // Expiry is resolved on read, never by a timer: the rule core/focus_mode.js
  // states, applied to the copy of the settings this tab last loaded. A Zen
  // whose deadline has passed is active again even though nothing has written
  // to storage to say so, so every reader here goes through this rather than
  // reading settings.focusMode directly.
  function resolveFocus() {
    const raw = settings?.focusMode;
    const mode = raw?.mode === 'paused' || raw?.mode === 'zen' ? raw.mode : 'active';
    const until = Number(raw?.until);
    const deadline = mode !== 'active' && Number.isFinite(until) && until > 0 ? until : null;
    if (deadline !== null && Date.now() >= deadline) return { mode: 'active', until: null };
    return { mode, until: deadline };
  }

  function zenActive() {
    return resolveFocus().mode === 'zen';
  }

  function scheduleCheck(field) {
    const record = state.get(field);
    if (!record) return;
    clearTimeout(record.timer);
    record.timer = setTimeout(() => runCheck(field), settings?.checkDelayMs ?? 900);
  }

  // Cancel the debounced check and run one now, for callers that are about to
  // read the result and cannot wait out the delay.
  function recheckNow(field) {
    const record = state.get(field);
    if (record) clearTimeout(record.timer);
    return runCheck(field);
  }

  async function runCheck(field, scope) {
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
    const caret = caretOf(field);
    const response = await send({
      type: 'check',
      text,
      language: settings.language,
      languageHint: navigator.language,
      fieldID: state.get(field)?.id,
      ...(Number.isInteger(caret) && caret >= 0 ? { caret } : {}),
      ...(scope === 'document' ? { scope } : {}),
    });
    if (!response.ok) {
      clearMarks(field);
      setIndicator(field, 'error');
      return;
    }
    if (response.data?.skipped) {
      clearMarks(field);
      // 'too-short' is the service worker agreeing with the check above.
      if (response.data.skipped === 'too-short') hideIndicator();
      else if (response.data.skipped === 'paused') setIndicator(field, 'paused', 0, response.data.focus?.label);
      else setIndicator(field, 'off');
      return;
    }

    const record = state.get(field);
    if (!record) return;
    // Discard a response that lost the race with newer typing.
    if (textOf(field) !== text) return;

    const returnedMatches = Array.isArray(response.data.matches) ? response.data.matches : [];
    record.matches = returnedMatches.filter((match) => !record.ignored.has(issueKey(text, match)));
    record.checkedText = text;
    // The response carries the focus state the worker resolved for this check,
    // which is the same stored value this tab holds. Adopt it so the readers
    // below and the next redraw agree with what was actually filtered.
    if (response.data.focus) settings = { ...settings, focusMode: response.data.focus };
    const zen = zenActive();
    renderMarks(field);
    const focusLabel = response.data.focus && response.data.focus.mode !== 'active'
      ? `${response.data.focus.label || 'Zen'} · ${record.matches.length} shown`
      : '';
    scheduleFullCheck(field, response.data);
    const indicatorState = record.matches.length
      ? zen ? 'zen' : 'flagged'
      : zen ? 'zen' : 'clean';
    // A check that lost an engine returns fewer findings, not fewer problems.
    // Saying which checks are missing keeps a quiet field from reading as a
    // clean one. The service worker names them; this only reports them.
    const missing = Array.isArray(response.data.ikmalDegradedChecks) ? response.data.ikmalDegradedChecks : [];
    const summary = focusLabel || `ikmal found ${record.matches.length} suggestion${record.matches.length === 1 ? '' : 's'}`;
    setIndicator(field, indicatorState, record.matches.length,
      missing.length ? `${summary} · ${missing.join(' and ')} checks did not run` : focusLabel);
  }

  // A chunked check cannot see the findings that span sentences — a repetition
  // whose twin is paragraphs away, a pronoun and its antecedent. One pass over
  // the whole field follows when the typing stops.
  function scheduleFullCheck(field, data) {
    const record = state.get(field);
    if (!record) return;
    clearTimeout(record.fullCheckTimer);
    if (!data?.ikmalFullCheckPending) return;
    record.fullCheckTimer = setTimeout(() => runCheck(field, 'document'), 1500);
  }

  function clearMarks(field) {
    const record = state.get(field);
    if (record) {
      record.matches = [];
      // Nothing is checked any more, so no text is. Leaving the old value here
      // would let a reader believe these (absent) matches describe it.
      record.checkedText = '';
    }
    renderMarks(field);
  }

  function severityOf(match) {
    const source = String(match.ikmalSource || '').toLowerCase();
    const category = String(match.rule?.category?.id || '').toLowerCase();
    if (source.includes('style') || category.includes('style')) return 'is-style';
    if (category.includes('typo') || category.includes('spell')) return 'is-spelling';
    return 'is-grammar';
  }

  function issueKey(text, match) {
    const word = String(text || '').slice(Number(match?.offset), Number(match?.offset) + Number(match?.length));
    return `${Number(match?.offset)}:${Number(match?.length)}:${word}:${String(match?.rule?.id || '')}`;
  }

  // Where the writing is happening. The service worker checks around this
  // rather than re-analysing a long field from the top on every pause.
  function caretOf(field) {
    if (!field.isContentEditable) {
      return Number.isInteger(field.selectionEnd) ? field.selectionEnd : null;
    }
    const selection = window.getSelection?.();
    if (!selection?.focusNode || !field.contains(selection.focusNode)) return null;
    const measure = document.createRange();
    measure.selectNodeContents(field);
    measure.setEnd(selection.focusNode, selection.focusOffset);
    return measure.toString().length;
  }

  function isSpellingMatch(match) {
    const issueType = String(match?.rule?.issueType || '').toLowerCase();
    const category = String(match?.rule?.category?.id || '').toLowerCase();
    const rule = String(match?.rule?.id || '').toLowerCase();
    return issueType.includes('misspell') || category.includes('spell')
      || category.includes('typo') || rule.includes('morfologik');
  }

  function refreshIndicatorForRecord(field) {
    const record = state.get(field);
    if (!record || activeField !== field) return;
    const zen = zenActive();
    const count = record.matches.length;
    const stateName = zen ? 'zen' : count ? 'flagged' : 'clean';
    const title = zen ? `Zen · ${count} shown` : '';
    setIndicator(field, stateName, count, title);
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

  // Walks rendered text rather than raw textContent. innerText inserts line
  // breaks between block elements (which is what we send to the checker), so
  // using textContent offsets here shifts marks after the first paragraph.
  // A text node's raw value is not always present verbatim in innerText:
  // source-formatted markup such as <p>Hello\n<b>world</b></p> yields the node
  // "Hello\n" against the rendered "Hello world". Falling back to a
  // whitespace-collapsed search keeps those nodes mapped; anything still
  // unmatched is left out of the map on purpose, and locate() treats the gap as
  // unmappable rather than guessing.
  function findRenderedRun(rendered, value, searchFrom) {
    const exact = rendered.indexOf(value, searchFrom);
    if (exact >= 0) return { start: exact, end: exact + value.length };
    const words = value.split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const matcher = new RegExp(pattern, 'g');
    matcher.lastIndex = searchFrom;
    const match = matcher.exec(rendered);
    if (!match) return null;
    return { start: match.index, end: match.index + match[0].length };
  }

  function buildEditableTextMap(root) {
    const rendered = root.innerText || '';
    const segments = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let searchFrom = 0;
    let node = walker.nextNode();
    while (node) {
      const value = node.textContent || '';
      if (value) {
        const run = findRenderedRun(rendered, value, searchFrom);
        if (run) {
          segments.push({ node, start: run.start, end: run.end, length: value.length });
          searchFrom = run.end;
        }
      }
      node = walker.nextNode();
    }
    return { rendered, segments };
  }

  // Walks the rendered text map to convert a checker offset into a DOM
  // position. Start offsets prefer the following node at a boundary; end
  // offsets prefer the preceding node so a range does not create a duplicate
  // zero-width client rect.
  function locate(root, offset, textMap = buildEditableTextMap(root), bias = 'start') {
    const target = Math.max(0, Math.min(Number(offset) || 0, textMap.rendered.length));
    let previousEnd = 0;
    for (const segment of textMap.segments) {
      if (target < segment.start) {
        // Two different things put a target in a gap. innerText's synthetic
        // block separators belong to no text node, and snapping to the start of
        // the next one is right. A gap holding non-whitespace means a node went
        // unmapped, and there is no honest answer: the old code clamped to
        // offset 0 of the next node, which drew marks over the wrong word and
        // let applyReplacement edit it. Fail closed instead.
        if (!/^\s*$/.test(textMap.rendered.slice(previousEnd, segment.start))) return null;
        return { node: segment.node, offset: 0 };
      }
      if (target < segment.end || (bias === 'end' && target === segment.end)) {
        const within = Math.min(target - segment.start, segment.node.textContent.length);
        return { node: segment.node, offset: Math.max(0, within) };
      }
      previousEnd = segment.end;
    }
    // Past the last mapped node the same rule applies as for an interior gap:
    // trailing whitespace is innerText's own block separator and snapping to
    // the node end is right, but trailing non-whitespace means a text node went
    // unmapped. Clamping there would collapse a range onto the wrong element —
    // and applyReplacement would insert into it — so fail closed.
    const last = textMap.segments.at(-1);
    if (!last || !/^\s*$/.test(textMap.rendered.slice(previousEnd, target))) return null;
    return { node: last.node, offset: last.node.textContent.length };
  }

  function rectsForEditable(field, start, end) {
    const textMap = buildEditableTextMap(field);
    const from = locate(field, start, textMap);
    const to = locate(field, end, textMap, 'end');
    if (!from || !to) return [];
    const range = document.createRange();
    try {
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
    } catch {
      return [];
    }
    return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => ({
      top: rect.top, left: rect.left, width: rect.width, height: rect.height,
    }));
  }

  // Zen hides the underlines rather than the findings, so whether marks are
  // drawn is a property of the current focus mode and not of the caller. It is
  // read here so that a redraw from any source — a scroll, a resize, an ignore —
  // cannot bring back underlines Zen just took away.
  function renderMarks(field) {
    const layer = ensureOverlay();
    if (activeField !== field) return;
    // The hovered mark is about to be removed from the DOM, so drop the
    // reference before it becomes a handle on a detached node.
    setHoveredMark(null);
    layer.textContent = '';

    const record = state.get(field);
    if (record) record.marks = [];
    if (zenActive() || !record?.matches?.length) return;

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

    closeFocusMenu();
    const element = ensureCard();
    const replacements = (match.replacements || []).slice(0, 4);
    const source = displaySource(match);

    element.textContent = '';
    // The navigator counts marks, not matches. renderMarks drops any match
    // whose rects fall outside the field box, so a scrolled textarea has
    // matches with no mark for the card to open against: counting those showed
    // "2 of 7" next to an enabled "›" that silently did nothing.
    const navigable = [...new Set((record.marks || []).map((mark) => mark.index))].sort((a, b) => a - b);
    const position = navigable.indexOf(index);
    const total = position < 0 ? 1 : navigable.length;
    const navigate = (nextPosition) => {
      const nextIndex = navigable[nextPosition];
      if (nextIndex === undefined) return;
      const nextBox = record.marks.find((mark) => mark.index === nextIndex);
      if (nextBox) openCard(field, nextIndex, nextBox);
    };
    const removeMatch = (addToDictionary = false) => {
      if (addToDictionary) {
        const word = textOf(field).slice(Number(match.offset), Number(match.offset) + Number(match.length)).trim();
        send({ type: 'addDictionary', word }).then((response) => {
          if (!response?.ok) return;
          removeMatch(false);
        });
        return;
      }
      record.ignored.add(issueKey(textOf(field), match));
      record.matches = record.matches.filter((candidate) => candidate !== match);
      renderMarks(field);
      refreshIndicatorForRecord(field);
      closeCard();
    };
    element.appendChild(buildCardBody(match, replacements, source, {
      index: Math.max(0, position),
      total,
      onApply: (replacement) => {
        applyReplacement(field, match, replacement);
        closeCard();
        closeFocusMenu();
      },
      onNavigate: navigate,
      onIgnore: () => removeMatch(false),
      onDictionary: isSpellingMatch(match) ? () => removeMatch(true) : null,
    }));

    element.classList.add('is-open');
    // Mark geometry is stored in page coordinates, while getBoundingClientRect
    // (used by the popup placer) is viewport-relative. Normalize the anchor so
    // the card stays next to the flagged word even after scrolling.
    const viewportAnchor = {
      top: box.top - window.scrollY,
      bottom: box.top + box.height - window.scrollY,
    };
    placePopup(element, viewportAnchor, { below: true, preferredLeft: Math.max(8, box.left) });
  }

  function displaySource(match) {
    const sources = [
      ...(Array.isArray(match?.ikmalSources) ? match.ikmalSources : []),
      match?.ikmalSource,
    ].map((value) => String(value || '').toLowerCase());
    const ruleID = String(match?.rule?.id || '').toLowerCase();
    if (sources.some((value) => value.includes('style')) || ruleID.includes('style')) return 'ikmal style';
    if (sources.some((value) => value.includes('quality')) || ruleID.startsWith('ikmal_')) return 'ikmal quality';
    return 'ikmal editor';
  }

  function placePopup(element, anchor, { below = true, preferredLeft = 8 } = {}) {
    const gap = 10;
    const viewportBottom = window.innerHeight;
    const viewportRight = window.innerWidth;
    const initialTop = anchor.bottom + window.scrollY + gap;
    const initialLeft = preferredLeft;
    element.style.top = `${initialTop}px`;
    element.style.left = `${initialLeft}px`;

    const size = element.getBoundingClientRect();
    let top = initialTop;
    let left = initialLeft;
    if (below && size.bottom > viewportBottom - 8 && anchor.top > size.height + gap) {
      top = anchor.top + window.scrollY - size.height - gap;
    }
    if (size.right > viewportRight - 8) left = window.scrollX + viewportRight - size.width - 8;
    left = Math.max(window.scrollX + 8, left);
    element.style.top = `${top}px`;
    element.style.left = `${left}px`;
  }

  function buildCardBody(match, replacements, source, { index = 0, total = 1, onApply, onNavigate, onIgnore, onDictionary }) {
    const fragment = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'ikmal-card-header';
    const sourceLabel = document.createElement('span');
    sourceLabel.className = 'ikmal-card-source';
    sourceLabel.textContent = source;
    header.appendChild(sourceLabel);
    if (total > 1) {
      const navigator = document.createElement('span');
      navigator.className = 'ikmal-card-navigator';
      const previous = document.createElement('button');
      previous.type = 'button';
      previous.className = 'ikmal-card-nav';
      previous.textContent = '‹';
      previous.title = 'Previous issue';
      previous.disabled = index === 0;
      previous.addEventListener('click', () => onNavigate(index - 1));
      const count = document.createElement('span');
      count.textContent = `${index + 1} of ${total}`;
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'ikmal-card-nav';
      next.textContent = '›';
      next.title = 'Next issue';
      next.disabled = index === total - 1;
      next.addEventListener('click', () => onNavigate(index + 1));
      navigator.append(previous, count, next);
      header.appendChild(navigator);
    }
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

    const secondary = document.createElement('div');
    secondary.className = 'ikmal-card-secondary';
    const ignore = document.createElement('button');
    ignore.type = 'button';
    ignore.className = 'ikmal-card-secondary-button';
    ignore.textContent = 'Ignore';
    ignore.addEventListener('click', onIgnore);
    secondary.appendChild(ignore);
    if (onDictionary) {
      const dictionary = document.createElement('button');
      dictionary.type = 'button';
      dictionary.className = 'ikmal-card-secondary-button';
      dictionary.textContent = 'Add to dictionary';
      dictionary.addEventListener('click', onDictionary);
      secondary.appendChild(dictionary);
    }
    const why = document.createElement('button');
    why.type = 'button';
    why.className = 'ikmal-card-secondary-button';
    why.textContent = 'Why?';
    const explanation = document.createElement('span');
    explanation.className = 'ikmal-card-explanation';
    explanation.textContent = match.rule?.description || 'This suggestion comes from the local writing checks.';
    why.addEventListener('click', () => {
      explanation.classList.toggle('is-open');
    });
    secondary.append(why, explanation);
    fragment.appendChild(secondary);

    return fragment;
  }

  function applyReplacement(field, match, replacement) {
    const start = match.offset;
    const end = match.offset + match.length;

    if (field.isContentEditable) {
      const textMap = buildEditableTextMap(field);
      const from = locate(field, start, textMap);
      const to = locate(field, end, textMap, 'end');
      if (!from || !to) return;
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      field.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      // CKEditor and similar model-backed editors reject direct DOM changes by
      // restoring their model on the next render, so the replacement is routed
      // through the host's native editing path and only falls back to the DOM
      // when that path leaves the text unchanged. The decision itself lives in
      // core/editable_replacement.js, where it is covered by tests.
      editableReplacement.applyEditableReplacement({
        readText: () => textOf(field),
        runCommand: () => document.execCommand('insertText', false, replacement),
        replaceRange: () => {
          range.deleteContents();
          range.insertNode(document.createTextNode(replacement));
        },
        emitInput: () => field.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: replacement,
        })),
      });
    } else {
      const value = field.value;
      field.value = value.slice(0, start) + replacement + value.slice(end);
      field.setSelectionRange(start + replacement.length, start + replacement.length);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    scheduleCheck(field);
  }

  // --- selection summary -------------------------------------------------

  function selectionInsideExtension(selection) {
    const node = selection?.anchorNode;
    return Boolean(node && ((card && card.contains(node)) || (focusMenu && focusMenu.contains(node))
      || (selectionPopup && selectionPopup.contains(node))));
  }

  function readSelection() {
    const field = activeField;
    // Selection summaries belong to the editor the user is currently working
    // in. A page-wide selection watcher would make large note applications
    // like Trilium pay for selections in their navigation and chrome too.
    if (!field) return null;
    if (field && document.activeElement === field && !field.isContentEditable
      && Number.isInteger(field.selectionStart) && Number.isInteger(field.selectionEnd)
      && field.selectionStart !== field.selectionEnd) {
      const start = Math.min(field.selectionStart, field.selectionEnd);
      const end = Math.max(field.selectionStart, field.selectionEnd);
      const text = field.value.slice(start, end);
      if (!text.trim()) return null;
      const rects = rectsForTextarea(field, start, end);
      const fieldBox = field.getBoundingClientRect();
      const rect = rects.at(-1) || {
        top: fieldBox.top,
        left: fieldBox.left,
        width: fieldBox.width,
        height: Math.min(fieldBox.height, 24),
      };
      return { text, rect, signature: `field:${start}:${end}:${text}` };
    }

    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || !selection.toString().trim() || selectionInsideExtension(selection)) return null;
    if (!field.isContentEditable || !field.contains(selection.anchorNode) || !field.contains(selection.focusNode)) return null;
    const range = selection.getRangeAt(0);
    // A selection in a long note can contain thousands of line boxes. The
    // bounding box is enough for placement and avoids materializing every
    // client rect while the host editor is still handling the selection.
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    const text = selection.toString();
    return { text, rect, signature: `page:${text}:${rect.left}:${rect.top}` };
  }

  function renderSelectionSummary(selection, issueText = 'Checking…') {
    const element = ensureSelectionPopup();
    const words = textStats.wordCount(selection.text);
    const characters = textStats.characterCount(selection.text);
    element.textContent = '';

    const source = document.createElement('div');
    source.className = 'ikmal-selection-source';
    source.textContent = 'Selected text';
    element.appendChild(source);

    const stats = document.createElement('div');
    stats.className = 'ikmal-selection-stats';
    [[words, 'word', 'words'], [characters, 'character', 'characters']].forEach(([value, singular, plural]) => {
      const item = document.createElement('span');
      const number = document.createElement('strong');
      number.textContent = String(value);
      const label = document.createElement('small');
      label.textContent = value === 1 ? singular : plural;
      item.append(number, label);
      stats.appendChild(item);
    });
    element.appendChild(stats);

    const issues = document.createElement('div');
    issues.className = 'ikmal-selection-issues';
    const issueLabel = document.createElement('span');
    issueLabel.textContent = 'Issues';
    const issueNumber = document.createElement('strong');
    issueNumber.textContent = issueText;
    issues.append(issueLabel, issueNumber);
    element.appendChild(issues);
  }

  function positionSelectionSummary(rect) {
    if (!selectionPopup) return;
    const bottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
    const left = Number.isFinite(rect.left) ? rect.left : 8;
    selectionPopup.style.top = `${bottom + window.scrollY + 10}px`;
    const preferred = left + window.scrollX;
    const maxLeft = window.scrollX + window.innerWidth - selectionPopup.offsetWidth - 8;
    selectionPopup.style.left = `${Math.max(window.scrollX + 8, Math.min(preferred, maxLeft))}px`;
  }

  async function updateSelectionPopup() {
    const selection = readSelection();
    if (!selection) {
      selectionGeneration += 1;
      closeSelectionPopup();
      return;
    }

    const generation = ++selectionGeneration;
    selectionAnchor = selection;
    renderSelectionSummary(selection);
    selectionPopup.classList.add('is-open');
    positionSelectionSummary(selection.rect);

    if (selection.text.length > SELECTION_CHECK_MAX) {
      renderSelectionSummary(selection, 'Too large');
      positionSelectionSummary(selection.rect);
      return;
    }

    // Selectionchange can fire repeatedly while a user drags across a large
    // editor. Keep at most one checker request in flight; the latest selection
    // will be picked up after it finishes.
    if (selectionCheckInFlight) return;
    selectionCheckInFlight = true;
    const requestedText = selection.text;
    try {
      const response = await send({ type: 'check', text: requestedText, language: settings?.language, languageHint: navigator.language, selection: true });
      if (generation !== selectionGeneration) return;
      let issueText = 'Unavailable';
      if (response?.ok && !response.data?.skipped) issueText = String(response.data.matches?.length || 0);
      else if (response?.ok && response.data?.skipped === 'paused') issueText = 'Paused';
      else if (response?.ok && ['disabled', 'host-disabled'].includes(response.data?.skipped)) issueText = 'Off';
      renderSelectionSummary(selection, issueText);
      positionSelectionSummary(selection.rect);
    } finally {
      selectionCheckInFlight = false;
      if (selectionAnchor && selectionAnchor.text !== requestedText) scheduleSelectionPopup();
    }
  }

  function scheduleSelectionPopup(delay = 180) {
    if (!activeField) return;
    clearTimeout(selectionUpdateTimer);
    selectionUpdateTimer = setTimeout(() => updateSelectionPopup(), delay);
  }

  function eventIsInsideActiveField(event) {
    return Boolean(activeField && (event.target === activeField || activeField.contains(event.target)));
  }

  // --- wiring ------------------------------------------------------------

  function attach(field) {
    if (state.has(field)) return;
    state.set(field, {
      matches: [], marks: [], ignored: new Set(), timer: null, mirror: null, checkedText: '',
      id: `field-${++fieldSequence}`, fullCheckTimer: null,
    });

    field.addEventListener('input', (event) => {
      // Trilium performs programmatic DOM/input updates while switching notes
      // and rebuilding its editor. Treat only a real user edit as a reason to
      // start a check; synthetic input events must not create a feedback loop.
      if (!event.isTrusted) return;
      closeCard();
      closeFocusMenu();
      state.get(field).ignored.clear();
      scheduleCheck(field);
      scheduleSelectionPopup();
    });
    field.addEventListener('focus', (event) => {
      if (!event.isTrusted) return;
      activeField = field;
      workspaceField = field;
      scheduleCheck(field);
    });
    field.addEventListener('blur', () => {
      if (activeField === field) {
        activeField = null;
        ensureOverlay().textContent = '';
        closeSelectionPopup();
      }
      setHoveredMark(null);
      hideIndicator();
      closeCard();
      closeFocusMenu();
    });
    field.addEventListener('scroll', () => { closeCard(); closeFocusMenu(); renderMarks(field); positionIndicator(field); });
  }

  const reposition = () => {
    closeCard();
    closeFocusMenu();
    if (activeField) {
      renderMarks(activeField);
      positionIndicator(activeField);
    }
    if (selectionAnchor) {
      const current = readSelection();
      if (current) {
        selectionAnchor = current;
        positionSelectionSummary(current.rect);
      } else {
        closeSelectionPopup();
      }
    }
  };

  document.addEventListener('focusin', (event) => {
    // Attaching only on focus — rather than scanning the document or watching
    // it with a MutationObserver — is what keeps the extension inert until the
    // user is actually editing. This guard is the narrower companion to that:
    // it drops synthetic focus from dispatchEvent. It does not filter a host
    // application focusing its own editor at startup, because element.focus()
    // dispatches a trusted event.
    if (!event.isTrusted) return;
    if (!isEditable(event.target)) return;
    attach(event.target);
    activeField = event.target;
    workspaceField = event.target;
    scheduleCheck(event.target);
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
    if (card?.contains(event.target) || focusMenu?.contains(event.target) || selectionPopup?.contains(event.target)) return;
    const mark = activeField ? markAt(activeField, event.pageX, event.pageY) : null;
    if (mark) openCard(activeField, mark.index, mark);
    else {
      closeCard();
      closeFocusMenu();
    }
  });

  // Selection summaries are scoped to the editable field that currently owns
  // focus. This keeps the feature useful in text editors without observing or
  // checking selections in the rest of a host application's UI.
  // Do not subscribe to the page-wide selectionchange stream: large editors
  // such as Trilium emit it for their own cursor and layout bookkeeping. The
  // completed mouse/key events are enough to detect a user selection here.
  document.addEventListener('mouseup', (event) => {
    if (eventIsInsideActiveField(event)) scheduleSelectionPopup(40);
  }, { passive: true });
  document.addEventListener('keyup', (event) => {
    if (eventIsInsideActiveField(event)) scheduleSelectionPopup(40);
  }, { passive: true });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'settings-changed') {
      loadSettings().then(() => activeField && runCheck(activeField));
      return false;
    }
    if (message.type === 'getIssues') {
      const field = liveWorkspaceField();
      const record = field ? state.get(field) : null;
      sendResponse({
        ok: true,
        data: {
          // The checked text, not the live one: these matches were computed
          // against it, so it is the only text their offsets index into. The
          // workspace slices it for context, which would land elsewhere in a
          // field that has been typed in since.
          text: record?.checkedText || '',
          matches: record?.matches || [],
          focus: resolveFocus(),
        },
      });
      return false;
    }
    if (message.type === 'applyIssue') {
      const field = liveWorkspaceField();
      const record = field ? state.get(field) : null;
      const match = record?.matches?.[Number(message.index)];
      // Two ways the snapshot can be out of date, and both rewrite the wrong
      // span if they go unnoticed. The index was captured when the workspace
      // took its snapshot: a re-check since — typing, a focus-mode change, a
      // settings change — rebuilt this array, so confirm the span the workspace
      // showed the user is still the span at that index. And these offsets only
      // mean anything in the text they were computed against, so confirm the
      // field still holds it: an earlier apply changes the field without
      // touching the match array it came from.
      if (!match || typeof message.replacement !== 'string'
        || record.checkedText !== textOf(field)
        || Number(message.offset) !== Number(match.offset)
        || Number(message.length) !== Number(match.length)) {
        sendResponse({ ok: false, error: 'That issue is no longer available.' });
        return false;
      }
      applyReplacement(field, match, message.replacement);
      closeCard();
      // The workspace re-reads this tab the moment it hears back. Re-check now
      // rather than on the debounce so it reads the edited text and the matches
      // for it, instead of the pre-edit array every remaining issue would then
      // be rejected against.
      recheckNow(field).catch(() => {}).then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  // Focus-mode changes reach every open tab this way. A content script receives
  // storage events directly, so no tab-enumeration permission is needed.
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!Object.hasOwn(changes, 'focusMode') && !Object.hasOwn(changes, 'enabled')
      && !Object.hasOwn(changes, 'disabledHosts')) return;
    loadSettings().then(() => activeField && runCheck(activeField));
  });

  // Do not attach to whatever Trilium happened to focus during startup. The
  // first trusted focusin above is the explicit opt-in point for a field. If
  // that focus arrives before storage responds, schedule the first check once
  // settings are available instead of silently leaving the field unchecked.
  loadSettings().then(() => activeField && scheduleCheck(activeField));
})();
