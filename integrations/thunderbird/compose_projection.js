'use strict';

const QUOTED_BLOCK = /<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi;
const EXCLUDED_BLOCK = /<(div|section)[^>]*(?:class\s*=\s*["'][^"']*(?:moz-cite-prefix|gmail_quote|yahoo_quoted|signature)[^"']*["']|id\s*=\s*["']signature["'])[^>]*>[\s\S]*?<\/\1>/gi;
const TAG = /<[^>]*>/g;

function decodeHTML(value) {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

function htmlToText(html) {
  return decodeHTML(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(TAG, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function projectComposeBody(html, { includeQuotedText = false } = {}) {
  const source = String(html || '');
  const editableHTML = includeQuotedText ? source : source.replace(QUOTED_BLOCK, '').replace(EXCLUDED_BLOCK, '');
  return { editableHTML, text: htmlToText(editableHTML) };
}

function applyComposeMatch(html, match, replacement, options = {}) {
  const source = String(html || '');
  const projection = projectComposeBody(html, options);
  const nextText = String(projection.text).slice(0, Number(match?.offset))
    + String(replacement ?? match?.replacements?.[0]?.value ?? '')
    + String(projection.text).slice(Number(match?.offset) + Number(match?.length));
  const oldText = String(projection.text).slice(Number(match?.offset), Number(match?.offset) + Number(match?.length));
  if (!oldText || !Number.isInteger(Number(match?.offset)) || !Number.isInteger(Number(match?.length))) return null;
  const escaped = String(replacement ?? match?.replacements?.[0]?.value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const index = source.indexOf(oldText);
  if (index < 0) return null;
  return {
    html: `${source.slice(0, index)}${escaped}${source.slice(index + oldText.length)}`,
    text: nextText,
  };
}

const ComposeProjectionAPI = { applyComposeMatch, decodeHTML, htmlToText, projectComposeBody };
if (typeof module !== 'undefined' && module.exports) module.exports = ComposeProjectionAPI;
else globalThis.IkmalComposeProjection = ComposeProjectionAPI;
