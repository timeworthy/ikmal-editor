'use strict';

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

function decodeText(raw) {
  return raw.replace(ENTITY, decodeEntity);
}

function buildTextMapping(raw, plainStart) {
  const plain = decodeText(raw);
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

function projectHTML(html) {
  const source = String(html || '');
  const segments = [];
  let plainText = '';
  let cursor = 0;
  let plainOffset = 0;
  for (const match of source.matchAll(TAG)) {
    if (match.index > cursor) {
      const raw = source.slice(cursor, match.index);
      if (raw) {
        const mapping = buildTextMapping(raw, plainOffset);
        segments.push({ ...mapping, htmlStart: cursor, htmlEnd: match.index });
        plainText += mapping.plain;
        plainOffset += mapping.plain.length;
      }
    }
    const tag = match[0];
    if (BLOCK_CLOSE.test(tag)) {
      plainText += '\n';
      plainOffset += 1;
      BLOCK_CLOSE.lastIndex = 0;
    }
    if (/^<br\b/i.test(tag)) {
      plainText += '\n';
      plainOffset += 1;
    }
    cursor = match.index + tag.length;
  }
  if (cursor < source.length) {
    const raw = source.slice(cursor);
    const mapping = buildTextMapping(raw, plainOffset);
    segments.push({ ...mapping, htmlStart: cursor, htmlEnd: source.length });
    plainText += mapping.plain;
  }
  return { html: source, text: plainText, segments };
}

function segmentForMatch(projection, match) {
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
  return {
    start: segment.htmlStart + segment.starts[start],
    end: segment.htmlStart + segment.ends[start + length - 1],
  };
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function applyHTMLMatch(projection, match, replacement) {
  const segment = segmentForMatch(projection, match);
  if (!segment) return null;
  const bounds = rawBoundsForMatch(segment, match);
  if (!bounds) return null;
  return `${projection.html.slice(0, bounds.start)}${escapeHTML(replacement)}${projection.html.slice(bounds.end)}`;
}

function decorateHTMLMatches(projection, matches, style = 'wave') {
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
  return edits.sort((left, right) => right.start - left.start).reduce((html, edit) => `${html.slice(0, edit.start)}${edit.value}${html.slice(edit.end)}`, projection.html);
}

function removeHTMLMarks(html) {
  return String(html || '').replace(/<span\b[^>]*data-ikmal-finding=["']1["'][^>]*>([\s\S]*?)<\/span>/gi, '$1');
}

module.exports = {
  applyHTMLMatch,
  decorateHTMLMatches,
  escapeHTML,
  projectHTML,
  removeHTMLMarks,
  segmentForMatch,
};
