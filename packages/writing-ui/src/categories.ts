// What a finding is called, in the writer's language.
//
// Findings carry two provenances and neither belongs on screen. "LanguageTool"
// and "quality-sidecar" name this product's own plumbing: the writer did not
// choose either, cannot change either, and cannot do anything differently
// knowing which one spoke. Printing them beside every finding spent the most
// prominent label in the row on the least useful fact in it.
//
// What the writer wants is what kind of thing this is — a spelling mistake, a
// passive clause — and that is the category. The one provenance worth naming is
// a style guide, because that is a document they chose to apply and can turn
// off, so it is passed separately and shown by name.

export const CATEGORY_LABELS: Record<string, string> = {
  spelling: 'Spelling',
  grammar: 'Grammar',
  structure: 'Structure',
  'missing-word': 'Missing word',
  homophone: 'Homophone',
  style: 'Style',
  clarity: 'Clarity',
  repetition: 'Repetition',
  'word-family': 'Word family',
  'passive-voice': 'Passive voice',
  wordiness: 'Wordiness',
  'plain-english': 'Plain English',
  conciseness: 'Conciseness',
  relationship: 'Pronoun link',
  quality: 'Quality',
  // The core's two catch-alls. "LanguageTool" is what the unclassified bucket
  // is named after internally, and printing that would put the engine's name
  // back in the row by the side door.
  languagetool: 'Suggestion',
  other: 'Suggestion',
};

/**
 * A finding's category as a reader would say it. An unknown category — a rule
 * from a newer server than this build — is title-cased rather than dropped,
 * because an unlabelled finding is worse than an awkwardly labelled one.
 */
export function categoryLabel(category: unknown): string {
  const key = String(category ?? '').trim().toLowerCase();
  if (!key) return 'Suggestion';
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  const words = key.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Whether a finding came from a style guide, which is the one provenance worth
 * naming. Matched on the source rather than the category because the core
 * flattens "style-guide" into "style" — the guide is a fact about where the
 * rule came from, not about what kind of finding it is.
 */
export function isStyleGuideFinding(source: unknown): boolean {
  return String(source ?? '').toLowerCase().includes('style-guide');
}
