const BLOCK_CLOSE = /<\/(?:address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi;
const TAG = /<!--[\s\S]*?-->|<[^>]*>/g;
const ENTITY = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi;

function decodeEntity(entity) {
  const lower = entity.toLowerCase();
  if (lower === '&amp;') return '&';
  if (lower === '&lt;') return '<';
  if (lower === '&gt;') return '>';
  if (lower === '&quot;') return '"';
  if (lower === '&apos;') return "'";
  if (lower === '&nbsp;') return ' ';
  if (lower.startsWith('&#x')) return String.fromCodePoint(parseInt(lower.slice(3, -1), 16));
  if (lower.startsWith('&#')) return String.fromCodePoint(parseInt(lower.slice(2, -1), 10));
  return entity;
}

function buildTextMapping(raw, plainStart) {
  const plain = raw.replace(ENTITY, decodeEntity);
  const starts = [];
  const ends = [];
  let rawOffset = 0;
  let plainOffset = 0;
  for (const match of raw.matchAll(ENTITY)) {
    const before = raw.slice(rawOffset, match.index);
    for (let index = 0; index < before.length; index += 1) {
      starts.push(rawOffset + index);
      ends.push(rawOffset + index + 1);
    }
    const decoded = decodeEntity(match[0]);
    for (let index = 0; index < decoded.length; index += 1) {
      starts.push(match.index);
      ends.push(match.index + match[0].length);
    }
    rawOffset = match.index + match[0].length;
    plainOffset += before.length + decoded.length;
  }
  const tail = raw.slice(rawOffset);
  for (let index = 0; index < tail.length; index += 1) {
    starts.push(rawOffset + index);
    ends.push(rawOffset + index + 1);
  }
  if (plainOffset + tail.length !== plain.length) throw new Error('HTML text mapping length mismatch');
  return { plain, starts, ends, plainStart, plainEnd: plainStart + plain.length };
}

export function projectHTML(html) {
  const source = String(html || '');
  const segments = [];
  let text = '';
  let cursor = 0;
  let offset = 0;
  for (const match of source.matchAll(TAG)) {
    if (match.index > cursor) {
      const raw = source.slice(cursor, match.index);
      const mapping = buildTextMapping(raw, offset);
      segments.push({ ...mapping, htmlStart: cursor, htmlEnd: match.index });
      text += mapping.plain;
      offset += mapping.plain.length;
    }
    const tag = match[0];
    if (BLOCK_CLOSE.test(tag)) {
      text += '\n';
      offset += 1;
      BLOCK_CLOSE.lastIndex = 0;
    }
    if (/^<br\b/i.test(tag)) {
      text += '\n';
      offset += 1;
    }
    cursor = match.index + tag.length;
  }
  if (cursor < source.length) {
    const mapping = buildTextMapping(source.slice(cursor), offset);
    segments.push({ ...mapping, htmlStart: cursor, htmlEnd: source.length });
    text += mapping.plain;
  }
  return { html: source, text, segments };
}

export function segmentForMatch(projection, match) {
  const start = Number(match?.offset);
  const length = Number(match?.length);
  const end = start + length;
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length <= 0) return null;
  return projection.segments.find((segment) => start >= segment.plainStart && end <= segment.plainEnd) || null;
}

function rawBoundsForMatch(segment, match) {
  const start = Number(match.offset) - segment.plainStart;
  const length = Number(match.length);
  if (start < 0 || length <= 0 || start + length > segment.starts.length) return null;
  return { start: segment.htmlStart + segment.starts[start], end: segment.htmlStart + segment.ends[start + length - 1] };
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function applyHTMLMatch(projection, match, replacement) {
  const segment = segmentForMatch(projection, match);
  const bounds = segment && rawBoundsForMatch(segment, match);
  if (!bounds) return null;
  return `${projection.html.slice(0, bounds.start)}${escapeHTML(replacement)}${projection.html.slice(bounds.end)}`;
}

// Mirrors nonOverlappingEdits in office-bridge/outlook_projection.cjs. Two edits
// that share a character would interleave their <span> tags and write broken
// markup back into the user's draft or page, and overlapping findings are
// normal output from the checkers. Keep the first on each region.
function nonOverlappingEdits(edits) {
  const kept = [];
  for (const edit of [...edits].sort((left, right) => left.start - right.start || right.end - left.end)) {
    if (kept.some((existing) => edit.start < existing.end && existing.start < edit.end)) continue;
    kept.push(edit);
  }
  return kept;
}

export function decorateHTMLMatches(projection, matches, style = 'wave') {
  const edits = [];
  for (const match of matches) {
    const segment = segmentForMatch(projection, match);
    const bounds = segment && rawBoundsForMatch(segment, match);
    if (!bounds) continue;
    const raw = projection.html.slice(bounds.start, bounds.end);
    const css = style === 'highlight'
      ? 'background-color:#fff2cc;'
      : style === 'dotted' ? 'text-decoration-line:underline;text-decoration-style:dotted;text-decoration-color:#c43c4a;'
        : 'text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:#c43c4a;';
    edits.push({ start: bounds.start, end: bounds.end, value: `<span data-ikmal-finding="1" style="${css}">${raw}</span>` });
  }
  // Splice from the end so each edit's offsets still refer to the original HTML.
  return nonOverlappingEdits(edits)
    .sort((left, right) => right.start - left.start)
    .reduce((html, edit) => `${html.slice(0, edit.start)}${edit.value}${html.slice(edit.end)}`, projection.html);
}

export function removeHTMLMarks(html) {
  return String(html || '').replace(/<span\b[^>]*data-ikmal-finding=["']1["'][^>]*>([\s\S]*?)<\/span>/gi, '$1');
}
