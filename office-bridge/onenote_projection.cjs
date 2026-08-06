'use strict';

const htmlProjection = require('./outlook_projection.cjs');

function extractPageHTML(value) {
  if (typeof value !== 'string') return '';
  try {
    const parsed = JSON.parse(value);
    const visit = (node) => {
      if (!node || typeof node !== 'object') return '';
      if (typeof node.content === 'string' && /<[^>]+>/.test(node.content)) return node.content;
      for (const child of Object.values(node)) {
        const found = visit(child);
        if (found) return found;
      }
      return '';
    };
    return visit(parsed);
  } catch (_) {
    return /<[^>]+>/.test(value) ? value : '';
  }
}

module.exports = { extractPageHTML, ...htmlProjection };
