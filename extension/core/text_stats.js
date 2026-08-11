// Small, host-neutral text statistics used by the browser selection summary.
// Keeping the counting rules here makes a phrase and a long passage behave the
// same way, including when the selected text contains emoji or punctuation.

(function installTextStats(root) {
  function wordCount(text) {
    const value = String(text || '').trim();
    if (!value) return 0;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
      let count = 0;
      for (const part of segmenter.segment(value)) {
        if (part.isWordLike) count += 1;
      }
      return count;
    }
    return value.split(/\s+/u).length;
  }

  function characterCount(text) {
    return Array.from(String(text || '')).length;
  }

  const api = { wordCount, characterCount };
  root.IkmalTextStats = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
