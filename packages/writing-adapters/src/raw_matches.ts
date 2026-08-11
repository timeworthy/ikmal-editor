/**
 * Carrying LanguageTool-shaped findings across an edit, and merging a rechecked
 * chunk back into them.
 *
 * The core owns these rules for its normalized issue shape. The shipping
 * desktop editor and browser extension still speak the raw proxy shape —
 * offsets on the match, and more offsets inside ikmalRelated,
 * ikmalRelatedOccurrences, and the antecedent links — so the same rules are
 * expressed here once, for that shape, and imported by both.
 *
 * The rules are the ones core is tested against: a finding before an edit does
 * not move, a finding after it moves by what the edit added or removed, a
 * finding the edit touched is dropped rather than guessed at, and a rechecked
 * chunk replaces only the findings inside it.
 */

export interface RawRange {
  offset: number;
  length: number;
}

export type RawMatch = Record<string, any>;
export type RawAntecedentLink = Record<string, any>;
type Move = (range: RawRange) => RawRange;

// Every position a single match carries, in document coordinates. A match whose
// related occurrence or antecedent was edited is no longer the finding it
// describes, so all of them have to be considered together.
export function matchRanges(match: RawMatch | null | undefined): RawRange[] {
  if (!match || typeof match !== 'object') return [];
  const ranges: RawRange[] = [{ offset: Number(match.offset) || 0, length: Number(match.length) || 0 }];
  for (const occurrence of Array.isArray(match.ikmalRelatedOccurrences) ? match.ikmalRelatedOccurrences : []) {
    ranges.push(occurrenceRange(occurrence));
  }
  for (const related of Array.isArray(match.ikmalRelated) ? match.ikmalRelated : []) {
    ranges.push({ offset: Number(related.offset) || 0, length: Number(related.length) || 0 });
    for (const occurrence of Array.isArray(related.occurrences) ? related.occurrences : []) {
      ranges.push(occurrenceRange(occurrence));
    }
  }
  if (match.ikmalAntecedent) ranges.push(...antecedentRanges(match.ikmalAntecedent));
  return ranges;
}

function occurrenceRange(occurrence: RawMatch): RawRange {
  const offset = Number(occurrence?.start ?? occurrence?.offset) || 0;
  const length = occurrence?.end != null ? Number(occurrence.end) - offset : Number(occurrence?.length) || 0;
  return { offset, length };
}

function antecedentRanges(link: RawAntecedentLink): RawRange[] {
  const pronoun = Number(link.start) || 0;
  const antecedent = Number(link.antecedentStart) || 0;
  return [
    { offset: pronoun, length: (Number(link.end) || pronoun) - pronoun },
    { offset: antecedent, length: (Number(link.antecedentEnd) || antecedent) - antecedent },
  ];
}

// One match can hold positions on both sides of an edit: a repetition with an
// occurrence in the first paragraph and another in the last, or a pronoun after
// the edit whose antecedent sits before it. Each position is therefore decided
// on its own; a single delta applied to the whole match would drag the earlier
// positions off their words.
function carryOccurrence(occurrence: RawMatch, move: Move): RawMatch {
  const range = occurrenceRange(occurrence);
  const delta = move(range).offset - range.offset;
  if (!delta) return occurrence;
  const carried: RawMatch = { ...occurrence };
  if (occurrence.start != null) carried.start = Number(occurrence.start) + delta;
  if (occurrence.end != null) carried.end = Number(occurrence.end) + delta;
  if (occurrence.offset != null) carried.offset = Number(occurrence.offset) + delta;
  return carried;
}

function carryAntecedent(link: RawAntecedentLink, move: Move): RawAntecedentLink {
  const [pronoun, antecedent] = antecedentRanges(link);
  const pronounDelta = move(pronoun).offset - pronoun.offset;
  const antecedentDelta = move(antecedent).offset - antecedent.offset;
  return {
    ...link,
    start: (Number(link.start) || 0) + pronounDelta,
    end: (Number(link.end) || 0) + pronounDelta,
    antecedentStart: (Number(link.antecedentStart) || 0) + antecedentDelta,
    antecedentEnd: (Number(link.antecedentEnd) || 0) + antecedentDelta,
  };
}

function carryMatch(match: RawMatch, move: Move): RawMatch {
  const own = { offset: Number(match.offset) || 0, length: Number(match.length) || 0 };
  const carried: RawMatch = { ...match, offset: move(own).offset };
  if (Array.isArray(match.ikmalRelatedOccurrences)) {
    carried.ikmalRelatedOccurrences = match.ikmalRelatedOccurrences.map((occurrence) => carryOccurrence(occurrence, move));
  }
  if (Array.isArray(match.ikmalRelated)) {
    carried.ikmalRelated = match.ikmalRelated.map((related) => {
      const range = { offset: Number(related.offset) || 0, length: Number(related.length) || 0 };
      return {
        ...related,
        offset: move(range).offset,
        ...(Array.isArray(related.occurrences)
          ? { occurrences: related.occurrences.map((occurrence: RawMatch) => carryOccurrence(occurrence, move)) }
          : {}),
      };
    });
  }
  if (match.ikmalAntecedent) carried.ikmalAntecedent = carryAntecedent(match.ikmalAntecedent, move);
  return carried;
}

// An insertion is a zero-length edit, so "touched" cannot be an overlap test: a
// caret inside a word changes that word without overlapping anything.
function placeRange(range: RawRange, edit: RawRange): 'before' | 'after' | 'touched' {
  const editEnd = edit.offset + edit.length;
  if (range.offset + range.length <= edit.offset) return 'before';
  if (range.offset >= editEnd) return 'after';
  return 'touched';
}

function edited(edit: RawRange, replacementLength: number): Move {
  const delta = replacementLength - edit.length;
  return (range) => (placeRange(range, edit) === 'after' ? { ...range, offset: range.offset + delta } : range);
}

export function rebaseMatchesAfterEdit(matches: RawMatch[], edit: RawRange, replacementLength: number): RawMatch[] {
  const move = edited(edit, replacementLength);
  return (Array.isArray(matches) ? matches : [])
    .filter((match) => matchRanges(match).every((range) => placeRange(range, edit) !== 'touched'))
    .map((match) => carryMatch(match, move));
}

export function rebaseAntecedentsAfterEdit(antecedents: RawAntecedentLink[], edit: RawRange, replacementLength: number): RawAntecedentLink[] {
  const move = edited(edit, replacementLength);
  return (Array.isArray(antecedents) ? antecedents : [])
    .filter((link) => antecedentRanges(link).every((range) => placeRange(range, edit) !== 'touched'))
    .map((link) => carryAntecedent(link, move));
}

// A chunk check answers in the coordinates of the text that was sent, which are
// not the coordinates of anything the user can see.
export function rebaseChunkMatches(matches: RawMatch[], offset: number): RawMatch[] {
  const move: Move = (range) => ({ ...range, offset: range.offset + offset });
  return (Array.isArray(matches) ? matches : []).map((match) => carryMatch(match, move));
}

export function rebaseChunkAntecedents(antecedents: RawAntecedentLink[], offset: number): RawAntecedentLink[] {
  const move: Move = (range) => ({ ...range, offset: range.offset + offset });
  return (Array.isArray(antecedents) ? antecedents : []).map((link) => carryAntecedent(link, move));
}

function outsideChunk(range: RawRange, chunk: RawRange): boolean {
  const chunkEnd = chunk.offset + chunk.length;
  return range.offset + range.length <= chunk.offset || range.offset >= chunkEnd;
}

// Findings kept from the last check, plus the ones the chunk just returned. A
// finding reaching into the chunk from outside is dropped: the chunk check has
// just re-decided that text.
export function mergeChunkMatches(previous: RawMatch[] | null | undefined, chunkMatches: RawMatch[], chunk: RawRange): RawMatch[] {
  const kept = (Array.isArray(previous) ? previous : [])
    .filter((match) => matchRanges(match).every((range) => outsideChunk(range, chunk)));
  return [...kept, ...(Array.isArray(chunkMatches) ? chunkMatches : [])]
    .sort((a: RawMatch, b: RawMatch) => (Number(a.offset) || 0) - (Number(b.offset) || 0)
      || (Number(b.length) || 0) - (Number(a.length) || 0));
}

export function mergeChunkAntecedents(previous: RawAntecedentLink[] | null | undefined, chunkAntecedents: RawAntecedentLink[], chunk: RawRange): RawAntecedentLink[] {
  const kept = (Array.isArray(previous) ? previous : [])
    .filter((link) => antecedentRanges(link).every((range) => outsideChunk(range, chunk)));
  return [...kept, ...(Array.isArray(chunkAntecedents) ? chunkAntecedents : [])];
}
