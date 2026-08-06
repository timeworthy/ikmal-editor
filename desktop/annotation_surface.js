// Shared annotated-text surface for the compact tester and full editor.
// The LanguageTool-compatible match offsets are the single source of truth;
// each host supplies its own Apply/Ignore callbacks and card renderer.
(function () {
  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function sourceFor(match) {
    return match.ikmalSource || (match.rule?.id?.startsWith('IKMAL_') ? 'quality sidecar' : 'LanguageTool');
  }

  function sourceClass(match) {
    const source = String(sourceFor(match)).toLowerCase();
    const category = String(match.rule?.category?.id || match.category || '').toLowerCase();
    if (source.includes('style') || category.includes('style')) return 'is-style';
    if (source.includes('quality') || category.includes('grammar') || category.includes('agreement')) return 'is-grammar';
    return 'is-language';
  }

  function attach(options) {
    const { input, highlights, popover, getResponse, displaySource = (source) => source || 'LanguageTool', onApply, onIgnore, onInvalidate } = options;
    let hideTimer;
    let activeGroups = [];
    let relationships = new Map();
    let renderedSourceText = null;

    function close() {
      popover.classList.remove('is-open');
      activeGroups = [];
      highlights.querySelectorAll('.is-related-hover, .is-hover-target').forEach((mark) => mark.classList.remove('is-related-hover', 'is-hover-target'));
    }

    function syncScroll() {
      highlights.scrollTop = input.scrollTop;
      highlights.scrollLeft = input.scrollLeft;
    }

    function clear() {
      renderedSourceText = null;
      relationships = new Map();
      highlights.innerHTML = '';
      close();
    }

    function scheduleClose() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(close, 180);
    }

    function activateGroups(groups, target) {
      activeGroups = groups;
      highlights.querySelectorAll('.writing-underline').forEach((mark) => {
        const markGroups = (mark.dataset.annotationGroups || '').split(' ').filter(Boolean);
        const related = groups.some((group) => markGroups.includes(group));
        mark.classList.toggle('is-related-hover', related);
        mark.classList.toggle('is-hover-target', mark === target);
      });
    }

    function position(mark) {
      const surface = highlights.parentElement;
      const surfaceRect = surface.getBoundingClientRect();
      const markRect = mark.getBoundingClientRect();
      const width = 280;
      const left = Math.max(8, Math.min(markRect.left - surfaceRect.left, surface.clientWidth - width - 8));
      popover.style.left = `${left}px`;
      popover.style.top = `${markRect.bottom - surfaceRect.top + 8}px`;
      popover.classList.add('is-open');
    }

    function openRelationship(relationship, mark) {
      popover.innerHTML = `
        <div class="suggestion-popover-topline"><span>Pronoun link</span><button type="button" class="suggestion-popover-close" aria-label="Close relationship">×</button></div>
        <strong>“${escapeHTML(relationship.pronoun)}” refers to “${escapeHTML(relationship.antecedent)}”</strong>
        <small class="suggestion-popover-note">This connection helps show what the pronoun is pointing to${relationship.agreement ? ` · ${escapeHTML(relationship.agreement)}` : ''}.</small>`;
      position(mark);
      popover.querySelector('.suggestion-popover-close').addEventListener('click', close);
    }

    function open(index, mark) {
      clearTimeout(hideTimer);
      const groups = (mark.dataset.annotationGroups || '').split(' ').filter(Boolean);
      activateGroups(groups, mark);
      const relationship = relationships.get(groups.find((group) => relationships.has(group)));
      if (mark.dataset.annotationType === 'relationship' && relationship) {
        openRelationship(relationship, mark);
        return;
      }
      const response = getResponse() || { matches: [] };
      const match = response.matches?.[index];
      if (!match) return;
      const matchedText = input.value.slice(match.offset || 0, (match.offset || 0) + (match.length || 0));
      const replacement = match.replacements?.[0]?.value || '';
      const relationshipMarkup = relationship ? `<div class="suggestion-popover-relationship"><span>Pronoun link</span><strong>“${escapeHTML(relationship.pronoun)}” → “${escapeHTML(relationship.antecedent)}”</strong></div>` : '';
      popover.innerHTML = `
        <div class="suggestion-popover-topline"><span>${escapeHTML(displaySource(sourceFor(match)))}</span><button type="button" class="suggestion-popover-close" aria-label="Close suggestion">×</button></div>
        <strong>${escapeHTML(match.message || 'Review this passage.')}</strong>
        ${relationshipMarkup}
        ${replacement ? `<div class="suggestion-popover-change"><del>${escapeHTML(matchedText)}</del><span>→</span><ins>${escapeHTML(replacement)}</ins></div>` : '<small class="suggestion-popover-note">There is no automatic replacement for this finding.</small>'}
        <div class="suggestion-popover-actions">
          <button type="button" class="button button-primary" data-popover-action="apply" ${replacement ? '' : 'disabled'}>${replacement ? 'Apply' : 'Review'}</button>
          <button type="button" class="button button-quiet" data-popover-action="ignore">Ignore</button>
        </div>`;
      position(mark);
      popover.querySelector('.suggestion-popover-close').addEventListener('click', close);
      popover.querySelector('[data-popover-action="apply"]')?.addEventListener('click', () => onApply(index));
      popover.querySelector('[data-popover-action="ignore"]').addEventListener('click', () => {
        close();
        onIgnore(index);
      });
    }

    function render(response, sourceText, ignored = new Set()) {
      renderedSourceText = sourceText;
      if (!sourceText) {
        clear();
        renderedSourceText = sourceText;
        return;
      }
      close();
      relationships = new Map();
      const spans = [];
      const matches = Array.isArray(response?.matches) ? response.matches : [];
      const relationByPronoun = new Map();
      const relationInputs = Array.isArray(response?.ikmalAntecedents) ? [...response.ikmalAntecedents] : [];
      matches.forEach((match) => {
        if (match.ikmalAntecedent) relationInputs.push(match.ikmalAntecedent);
      });
      relationInputs.forEach((link, index) => {
        const pronounStart = Number(link.start) || 0;
        const pronounEnd = Number(link.end) || pronounStart;
        const antecedentStart = Number(link.antecedentStart) || 0;
        const antecedentEnd = Number(link.antecedentEnd) || antecedentStart;
        if (pronounEnd <= pronounStart || antecedentEnd <= antecedentStart) return;
        const group = `antecedent-${index}`;
        relationships.set(group, {
          pronoun: link.pronoun || sourceText.slice(pronounStart, pronounEnd),
          antecedent: link.antecedent || sourceText.slice(antecedentStart, antecedentEnd),
          agreement: link.agreement || '',
        });
        relationByPronoun.set(`${pronounStart}:${pronounEnd}`, group);
        spans.push({ offset: pronounStart, length: pronounEnd - pronounStart, groups: [group], kind: 'relationship', role: 'pronoun' });
        spans.push({ offset: antecedentStart, length: antecedentEnd - antecedentStart, groups: [group], kind: 'relationship', role: 'antecedent' });
      });
      matches.forEach((match, index) => {
        if (ignored.has(index)) return;
        const offset = Number(match.offset) || 0;
        const length = Number(match.length) || 0;
        const relationGroup = relationByPronoun.get(`${offset}:${offset + length}`);
        if (length > 0) spans.push({ offset, length, index, match, groups: [`finding-${index}`, ...(relationGroup ? [relationGroup] : [])], kind: 'finding', role: relationGroup ? 'pronoun' : '' });
        (match.ikmalRelatedOccurrences || []).forEach((occurrence) => {
          const occurrenceOffset = Number(occurrence.start ?? occurrence.offset) || 0;
          const occurrenceLength = occurrence.end != null
            ? Number(occurrence.end) - occurrenceOffset
            : Number(occurrence.length) || 0;
          if (occurrenceLength > 0) spans.push({ offset: occurrenceOffset, length: occurrenceLength, index, match, groups: [`finding-${index}`], kind: 'finding', role: 'related' });
        });
      });
      const merged = new Map();
      spans.forEach((span) => {
        const key = `${span.offset}:${span.length}`;
        const existing = merged.get(key);
        if (!existing) merged.set(key, { ...span });
        else {
          existing.groups = [...new Set([...existing.groups, ...span.groups])];
          existing.role = existing.role || span.role;
          existing.kind = existing.kind === 'finding' ? existing.kind : span.kind;
          existing.index = existing.index ?? span.index;
          existing.match = existing.match || span.match;
        }
      });
      spans.length = 0;
      spans.push(...merged.values());
      spans.sort((left, right) => left.offset - right.offset || right.length - left.length);
      let cursor = 0;
      const parts = [];
      spans.forEach((span) => {
        if (span.offset < cursor || span.offset >= sourceText.length) return;
        parts.push(escapeHTML(sourceText.slice(cursor, span.offset)));
        const classes = ['writing-underline'];
        if (span.match) classes.push(sourceClass(span.match));
        if (span.role === 'related') classes.push('is-related');
        if (span.role === 'antecedent') classes.push('is-antecedent');
        if (span.role === 'pronoun') classes.push('is-pronoun');
        const annotationType = span.kind === 'relationship' ? 'relationship' : 'finding';
        parts.push(`<mark class="${classes.join(' ')}" data-match-index="${span.index ?? ''}" data-annotation-type="${annotationType}" data-annotation-groups="${span.groups.join(' ')}" tabindex="0">${escapeHTML(sourceText.slice(span.offset, span.offset + span.length))}</mark>`);
        cursor = span.offset + span.length;
      });
      parts.push(escapeHTML(sourceText.slice(cursor)));
      highlights.innerHTML = parts.join('');
      highlights.querySelectorAll('.writing-underline').forEach((mark) => {
        const index = Number(mark.dataset.matchIndex);
        mark.addEventListener('mouseenter', () => open(index, mark));
        mark.addEventListener('mouseleave', scheduleClose);
        mark.addEventListener('focus', () => open(index, mark));
        mark.addEventListener('click', (event) => { event.preventDefault(); open(index, mark); });
      });
      syncScroll();
    }

    input.addEventListener('input', () => {
      if (renderedSourceText !== null && renderedSourceText !== input.value) {
        clear();
        onInvalidate?.();
      }
    });
    input.addEventListener('scroll', syncScroll);
    popover.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    popover.addEventListener('mouseleave', scheduleClose);
    return { render, clear, close, syncScroll, isCurrent: () => renderedSourceText === input.value };
  }

  window.IkmalAnnotationSurface = { attach };
})();
