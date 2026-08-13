// The inline mark layer: the underlines a writer sees under their own text.
//
// This is the one composite that has to agree with a host's text rendering
// exactly rather than merely sit beside it, so the geometry is stated once
// here and both the writing field and the overlay read it. A host that styles
// the field's typography separately will see marks drift from the words.
//
// It is built from the core's normalised issues and relationship groups, not
// from raw LanguageTool matches. The legacy surface reconstructed pronoun links
// and repeated occurrences out of `ikmalAntecedents` and
// `ikmalRelatedOccurrences` itself, which put that knowledge in a renderer;
// the core already resolves both, so the mark layer only has to place them.

export type MarkRole = 'grammar' | 'style' | 'language' | 'relationship' | 'related';
export type MarkRelation = 'primary' | 'related' | 'antecedent';
export type AnnotationStyle = 'squiggle' | 'line' | 'dash';
export type AnnotationPalette = 'balanced' | 'warm' | 'cool' | 'contrast';

export const ANNOTATION_STYLES: readonly AnnotationStyle[] = ['squiggle', 'line', 'dash'];
export const ANNOTATION_PALETTES: readonly AnnotationPalette[] = ['balanced', 'warm', 'cool', 'contrast'];

export interface AnnotationPreferences {
  style: AnnotationStyle;
  palette: AnnotationPalette;
  intensity: number;
}

export interface MarkRange {
  offset: number;
  length: number;
}

// The structural subset of the core's Issue this layer needs. Declared rather
// than imported so writing-ui does not depend on writing-core to draw a line.
export interface MarkIssue extends MarkRange {
  id: string;
  category?: string;
  source?: string;
  relationshipId?: string;
  relatedRanges?: MarkRange[];
}

export interface MarkRelationship {
  id: string;
  kind: 'related' | 'antecedent';
  ranges: MarkRange[];
  labels?: string[];
}

export interface MarkSpan extends MarkRange {
  role: MarkRole;
  relation: MarkRelation;
  // Which findings and relationships this span belongs to. Hovering one span
  // lights every span that shares a group, which is how a repeated word shows
  // its other occurrences and a pronoun shows what it refers to.
  groups: string[];
  issueId?: string;
  relationshipId?: string;
}

export interface BuildMarkSpansInput {
  issues?: MarkIssue[];
  relationships?: MarkRelationship[];
  // Findings the writer has dismissed this session. The host holds this,
  // because whether an ignore survives a recheck is its policy, not ours.
  ignored?: Set<string> | string[];
}

const ROLE_BY_CATEGORY: Record<string, MarkRole> = {
  spelling: 'grammar',
  grammar: 'grammar',
  structure: 'grammar',
  'missing-word': 'grammar',
  homophone: 'grammar',
  style: 'style',
  clarity: 'style',
  wordiness: 'style',
  conciseness: 'style',
  'plain-english': 'style',
  'passive-voice': 'style',
  quality: 'style',
  repetition: 'related',
  'word-family': 'related',
  relationship: 'relationship',
  languagetool: 'language',
  other: 'language',
};

export function markRoleFor(issue: Pick<MarkIssue, 'category' | 'source'>): MarkRole {
  const category = String(issue.category || '').toLowerCase();
  if (ROLE_BY_CATEGORY[category]) return ROLE_BY_CATEGORY[category];
  // Falling back on the source keeps a category this build has never heard of
  // — a rule added server-side, a style guide's own label — drawn as something
  // rather than dropped. An unknown finding is still a finding.
  const source = String(issue.source || '').toLowerCase();
  if (source.includes('style')) return 'style';
  if (source.includes('quality')) return 'style';
  return 'language';
}

export const MARKS_CSS = `
/* The field and the overlay are one surface. Every property that decides where
   a glyph lands is set on both in the same rule, because the moment they are
   set apart they drift, and a mark under the wrong word is worse than none. */
.writing-marks-surface { position: relative; }
.writing-marks-surface > .writing-marks,
.writing-marks-surface > .writing-marks-input {
  border: 1px solid transparent;
  border-radius: var(--radius-2);
  box-sizing: border-box;
  font: var(--mark-font, 16px/1.65 var(--font-sans));
  letter-spacing: normal;
  margin: 0;
  overflow-wrap: break-word;
  padding: var(--space-4);
  /* A scrollbar that appears in the field and not the overlay re-wraps one of
     them and not the other. Reserving the gutter in both keeps the measure
     identical whether or not the draft is long enough to scroll. */
  scrollbar-gutter: stable;
  tab-size: 4;
  white-space: pre-wrap;
  width: 100%;
  word-break: normal;
}
.writing-marks-input { background: var(--bg-0); border-color: var(--border-1); color: var(--fg-1); display: block; min-height: var(--mark-min-height, 260px); position: relative; resize: vertical; z-index: 0; }
.writing-marks-input:focus { border-color: var(--accent); box-shadow: var(--shadow-focus); outline: none; }
/* Above the field, not below it. The overlay's own text is transparent, so the
   writer reads the field's real glyphs and the decorations paint on top —
   which is also what lets the field keep an opaque background and its own
   focus ring instead of the surface having to fake both.

   The host marks this layer aria-hidden, because it is a second copy of the
   draft and a reader that announced it would read the whole thing twice. That
   is why nothing inside it is focusable: the legacy surface hid the layer and
   still gave every mark a tabindex, which puts focusable controls inside a
   hidden subtree. Findings are reached through the indicator and the card's
   previous/next, which is a complete keyboard path and an announced one. */
.writing-marks { color: transparent; inset: 0; overflow: hidden; pointer-events: none; position: absolute; z-index: 1; }
.writing-underline {
  background: transparent;
  color: transparent;
  cursor: pointer;
  pointer-events: auto;
  text-decoration-color: color-mix(in srgb, var(--mark-ink) calc(var(--mark-alpha) * 100%), transparent);
  text-decoration-line: underline;
  /* Without this a descender breaks the line it passes through, and a wavy
     rule with gaps in it reads as two marks. */
  text-decoration-skip-ink: none;
  text-decoration-style: wavy;
  text-decoration-thickness: 1.5px;
  transition: background-color var(--dur-fast) var(--ease-default), text-decoration-thickness var(--dur-fast) var(--ease-default);
}
.writing-underline[data-role="grammar"] { --mark-ink: var(--mark-grammar); }
.writing-underline[data-role="style"] { --mark-ink: var(--mark-style); }
.writing-underline[data-role="language"] { --mark-ink: var(--mark-language); }
.writing-underline[data-role="relationship"] { --mark-ink: var(--mark-relationship); }
.writing-underline[data-role="related"] { --mark-ink: var(--mark-related); }
/* What the writer picked in Appearance. Squiggle is the default and needs no
   rule; the other two are the ones asked for by people who find a wavy line
   hard to look at, so they are quieter and thicker rather than merely
   different. */
[data-annotation-style="line"] .writing-underline { text-decoration-style: solid; text-decoration-thickness: 2px; }
[data-annotation-style="dash"] .writing-underline { text-decoration-style: dashed; text-decoration-thickness: 2px; }
/* An antecedent is not a fault, so it is drawn as a link rather than a finding
   — except where the writer has asked for one unbroken style, and then a
   second dotted variant would be the thing they asked to be rid of. */
.writing-underline[data-relation="antecedent"] { text-decoration-style: dotted; }
[data-annotation-style="line"] .writing-underline[data-relation="antecedent"] { text-decoration-style: solid; }
[data-annotation-style="dash"] .writing-underline[data-relation="antecedent"] { text-decoration-style: dashed; }
.writing-underline.is-linked { background: color-mix(in srgb, var(--mark-ink) calc(var(--mark-fill-alpha) * 100%), transparent); border-radius: var(--radius-1); text-decoration-thickness: 2px; }
/* A pronoun link is the one mark with nothing to act on, so it gets a card
   that explains rather than one that offers corrections. The issue card cannot
   stand in: every control it has would be inert here. */
.writing-relationship-card { color: var(--fg-1); display: grid; gap: var(--space-2); grid-template-columns: minmax(0, 1fr); max-width: var(--issue-measure, 360px); min-width: 240px; }
.writing-relationship-meta { align-items: center; color: var(--fg-3); display: flex; flex-wrap: wrap; font: 600 11px/1 var(--font-mono); gap: var(--space-2); text-transform: uppercase; }
.writing-relationship-meta .cnt-icon-btn { margin-inline-start: auto; }
.writing-relationship-link { font: 500 14px/1.45 var(--font-sans); margin: 0; }
.writing-relationship-note { color: var(--fg-3); font: 400 12px/1.4 var(--font-sans); margin: 0; }
.writing-underline.is-active { box-shadow: 0 0 0 2px color-mix(in srgb, var(--mark-ink) calc(var(--mark-fill-alpha) * 200%), transparent); border-radius: var(--radius-1); }
.writing-underline:focus-visible { box-shadow: var(--shadow-focus); outline: 2px solid transparent; }
@media (prefers-reduced-motion: reduce) { .writing-underline { transition: none; } }
`;

function escapeHTML(value: string): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

export function normalizeAnnotationPreferences(value: Partial<AnnotationPreferences> | null | undefined = {}): AnnotationPreferences {
  const source = value && typeof value === 'object' ? value : {};
  const style = ANNOTATION_STYLES.includes(source.style as AnnotationStyle) ? source.style as AnnotationStyle : 'squiggle';
  const palette = ANNOTATION_PALETTES.includes(source.palette as AnnotationPalette) ? source.palette as AnnotationPalette : 'balanced';
  const raw = Number(source.intensity);
  // Stepped to 5 so the slider's readout and the stored value agree, and so a
  // drag cannot write a hundred distinct preferences on its way past.
  const intensity = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw / 5) * 5)) : 55;
  return { style, palette, intensity };
}

// Intensity is a taste control, not a visibility one, so its range starts
// where a mark still clears 3:1 against the writing surface rather than at
// invisible. 55 — the default — lands exactly on that floor, and every step
// above it is more legible, not less.
export function markAlphaFor(intensity: number): { alpha: number; fillAlpha: number } {
  const value = Math.max(0, Math.min(100, Number(intensity) || 0));
  return { alpha: 0.45 + (value / 100) * 0.55, fillAlpha: 0.06 + (value / 100) * 0.2 };
}

export function applyAnnotationPreferences(root: HTMLElement, value: Partial<AnnotationPreferences> = {}): AnnotationPreferences {
  const preferences = normalizeAnnotationPreferences(value);
  const { alpha, fillAlpha } = markAlphaFor(preferences.intensity);
  root.dataset.annotationStyle = preferences.style;
  root.dataset.annotationPalette = preferences.palette;
  root.style.setProperty('--mark-alpha', String(Number(alpha.toFixed(4))));
  root.style.setProperty('--mark-fill-alpha', String(Number(fillAlpha.toFixed(4))));
  return preferences;
}

function clampRange(text: string, range: MarkRange | undefined): MarkRange | null {
  if (!range) return null;
  const offset = Math.max(0, Math.floor(Number(range.offset) || 0));
  const length = Math.floor(Number(range.length) || 0);
  if (length <= 0 || offset >= text.length) return null;
  return { offset, length: Math.min(length, text.length - offset) };
}

/**
 * Where every mark goes, as data. Pure so the placement can be tested without
 * a browser — which matters because the failure this layer is prone to is an
 * offset that is quietly wrong, and that is invisible in a screenshot.
 */
export function buildMarkSpans(text: string, input: BuildMarkSpansInput = {}): MarkSpan[] {
  if (!text) return [];
  const ignored = input.ignored instanceof Set ? input.ignored : new Set(input.ignored || []);
  const issues = (input.issues || []).filter((issue) => issue && !ignored.has(issue.id));
  const spans: MarkSpan[] = [];

  for (const group of input.relationships || []) {
    if (!group?.ranges?.length) continue;
    for (const [index, raw] of group.ranges.entries()) {
      const range = clampRange(text, raw);
      if (!range) continue;
      spans.push({
        ...range,
        role: 'relationship',
        // The first range is the thing being explained — the pronoun — and the
        // rest are what it points at.
        relation: index === 0 ? 'primary' : 'antecedent',
        groups: [`relationship:${group.id}`],
        relationshipId: group.id,
      });
    }
  }

  for (const issue of issues) {
    const range = clampRange(text, issue);
    const role = markRoleFor(issue);
    const groups = [`issue:${issue.id}`, ...(issue.relationshipId ? [`relationship:${issue.relationshipId}`] : [])];
    if (range) {
      spans.push({ ...range, role, relation: 'primary', groups, issueId: issue.id, ...(issue.relationshipId ? { relationshipId: issue.relationshipId } : {}) });
    }
    for (const raw of issue.relatedRanges || []) {
      const related = clampRange(text, raw);
      if (!related) continue;
      spans.push({ ...related, role, relation: 'related', groups, issueId: issue.id });
    }
  }

  // Two findings on the same words are one mark carrying both groups, so
  // hovering it lights everything either of them links to.
  const merged = new Map<string, MarkSpan>();
  for (const span of spans) {
    const key = `${span.offset}:${span.length}`;
    const existing = merged.get(key);
    if (!existing) { merged.set(key, { ...span, groups: [...span.groups] }); continue; }
    existing.groups = [...new Set([...existing.groups, ...span.groups])];
    // A finding outranks a relationship on the same words: the writer can act
    // on the first and only read the second.
    if (existing.relation !== 'primary' && span.relation === 'primary') existing.relation = 'primary';
    if (!existing.issueId && span.issueId) { existing.issueId = span.issueId; existing.role = span.role; }
    if (!existing.relationshipId && span.relationshipId) existing.relationshipId = span.relationshipId;
  }

  // Overlapping marks cannot both be drawn in one flat pass over the text, so
  // the earlier and longer one wins and the other is dropped. It stays in the
  // review list — this drops a decoration, not a finding.
  return [...merged.values()]
    .sort((left, right) => left.offset - right.offset || right.length - left.length)
    .reduce<MarkSpan[]>((kept, span) => {
      const last = kept[kept.length - 1];
      if (last && span.offset < last.offset + last.length) return kept;
      kept.push(span);
      return kept;
    }, []);
}

export function renderMarks(text: string, spans: MarkSpan[]): string {
  let cursor = 0;
  const parts: string[] = [];
  for (const span of spans) {
    if (span.offset < cursor) continue;
    parts.push(escapeHTML(text.slice(cursor, span.offset)));
    const attributes = [
      `class="writing-underline"`,
      `data-role="${span.role}"`,
      `data-relation="${span.relation}"`,
      `data-groups="${escapeHTML(span.groups.join(' '))}"`,
      span.issueId ? `data-issue-id="${escapeHTML(span.issueId)}"` : '',
      span.relationshipId ? `data-relationship-id="${escapeHTML(span.relationshipId)}"` : '',
    ].filter(Boolean).join(' ');
    parts.push(`<mark ${attributes}>${escapeHTML(text.slice(span.offset, span.offset + span.length))}</mark>`);
    cursor = span.offset + span.length;
  }
  // `pre-wrap` drops the last line break, so a draft ending in a newline makes
  // the overlay one line shorter than the field. It scrolls to a smaller
  // maximum, and every mark near the bottom is then drawn high by a line. The
  // zero-width space gives that final line something to be.
  parts.push(escapeHTML(text.slice(cursor)).replace(/\n$/, '\n\u200b'));
  return parts.join('');
}

export interface RelationshipCard {
  pronoun: string;
  antecedent: string;
  note?: string;
}

/**
 * What a pronoun link says when the writer points at it. There is nothing to
 * apply or ignore, so the card explains the connection and closes — the
 * product's reason for drawing these at all is that a writer cannot see what a
 * pronoun refers to without re-reading the paragraph.
 */
export function renderRelationshipCard(card: RelationshipCard): string {
  const note = card.note
    ? `<p class="writing-relationship-note">${escapeHTML(card.note)}</p>`
    : '';
  return `<section class="cnt-popover writing-relationship-card" role="dialog" aria-label="Pronoun link">`
    + `<div class="writing-relationship-meta"><span>Pronoun link</span>`
    + `<button class="cnt-icon-btn" type="button" data-action="close" aria-label="Close">&times;</button></div>`
    + `<p class="writing-relationship-link">&ldquo;${escapeHTML(card.pronoun)}&rdquo; refers to &ldquo;${escapeHTML(card.antecedent)}&rdquo;</p>`
    + `${note}</section>`;
}

export interface MarkActivation {
  mark: HTMLElement;
  issueId?: string;
  relationshipId?: string;
}

export interface MarkSurfaceOptions {
  input: HTMLTextAreaElement;
  layer: HTMLElement;
  /** A mark was pointed at or clicked. The host decides what to show. */
  onActivate?(activation: MarkActivation): void;
  /** The pointer left the marks without landing on whatever the host opened. */
  onDismiss?(): void;
  /** The draft no longer matches what these marks describe. */
  onInvalidate?(): void;
  /** How long the pointer may travel between a mark and the host's card. */
  dismissDelay?: number;
}

export interface MarkSurface {
  render(text: string, input?: BuildMarkSpansInput): MarkSpan[];
  clear(): void;
  syncScroll(): void;
  /** Whether the marks on screen still describe the field's current text. */
  isCurrent(): boolean;
  /** Keeps the host's card open while the pointer is inside it. */
  hold(): void;
  release(): void;
  destroy(): void;
}

export function attachMarkSurface(options: MarkSurfaceOptions): MarkSurface {
  const { input, layer, onActivate, onDismiss, onInvalidate, dismissDelay = 180 } = options;
  let renderedText: string | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const marks = (): HTMLElement[] => Array.from(layer.querySelectorAll<HTMLElement>('.writing-underline'));

  function syncScroll(): void {
    layer.scrollTop = input.scrollTop;
    layer.scrollLeft = input.scrollLeft;
  }

  function highlight(active: HTMLElement | null): void {
    const groups = active ? (active.dataset.groups || '').split(' ').filter(Boolean) : [];
    for (const mark of marks()) {
      const own = (mark.dataset.groups || '').split(' ').filter(Boolean);
      mark.classList.toggle('is-linked', groups.length > 0 && own.some((group) => groups.includes(group)));
      mark.classList.toggle('is-active', mark === active);
    }
  }

  function dismiss(): void {
    highlight(null);
    onDismiss?.();
  }

  function scheduleDismiss(): void {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(dismiss, dismissDelay);
  }

  function activate(mark: HTMLElement): void {
    clearTimeout(hideTimer);
    highlight(mark);
    onActivate?.({ mark, issueId: mark.dataset.issueId, relationshipId: mark.dataset.relationshipId });
  }

  function onLayerOver(event: Event): void {
    const mark = (event.target as HTMLElement | null)?.closest?.('.writing-underline') as HTMLElement | null;
    if (mark) activate(mark);
  }

  function onLayerOut(event: Event): void {
    if ((event.target as HTMLElement | null)?.closest?.('.writing-underline')) scheduleDismiss();
  }

  function onLayerClick(event: Event): void {
    const mark = (event.target as HTMLElement | null)?.closest?.('.writing-underline') as HTMLElement | null;
    if (!mark) return;
    event.preventDefault();
    activate(mark);
  }

  function onInput(): void {
    // Marks describe the text they were built from. Once it changes they are
    // pointing at the wrong words, so they go immediately rather than sitting
    // there being wrong until the next check comes back.
    if (renderedText !== null && renderedText !== input.value) {
      clear();
      onInvalidate?.();
    }
  }

  function clear(): void {
    renderedText = null;
    layer.innerHTML = '';
    dismiss();
  }

  layer.addEventListener('mouseover', onLayerOver);
  layer.addEventListener('mouseout', onLayerOut);
  layer.addEventListener('click', onLayerClick);
  input.addEventListener('input', onInput);
  input.addEventListener('scroll', syncScroll);

  return {
    render(text, spansInput = {}) {
      const spans = buildMarkSpans(text, spansInput);
      renderedText = text;
      layer.innerHTML = renderMarks(text, spans);
      highlight(null);
      syncScroll();
      return spans;
    },
    clear,
    syncScroll,
    isCurrent: () => renderedText === input.value,
    hold: () => clearTimeout(hideTimer),
    release: scheduleDismiss,
    destroy() {
      clearTimeout(hideTimer);
      layer.removeEventListener('mouseover', onLayerOver);
      layer.removeEventListener('mouseout', onLayerOut);
      layer.removeEventListener('click', onLayerClick);
      input.removeEventListener('input', onInput);
      input.removeEventListener('scroll', syncScroll);
    },
  };
}
