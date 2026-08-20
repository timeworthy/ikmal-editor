const { checkText, applyMatch, normalizeSettings, DEFAULT_SETTINGS } = require('../common/languagetool.cjs');

const SETTINGS = {
  ...DEFAULT_SETTINGS,
  language: 'auto',
  ignoredRules: [],
};

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function panelHTML(result) {
  if (!result) return '<p>Run an ikmal check to see suggestions.</p>';
  if (result.skipped) return `<p>ikmal skipped this note: ${escapeHTML(result.skipped)}</p>`;
  if (!result.matches.length) return '<p class="ikmal-clean">No suggestions at this checking level.</p>';
  return `<ol>${result.matches.map((match, index) => `<li><strong>${escapeHTML(match.message || 'Review this passage.')}</strong><br><code>${escapeHTML(match.replacements?.[0]?.value || 'Review')}</code> <button data-ikmal-apply="${index}">Apply</button></li>`).join('')}</ol>`;
}

async function selectedNote() {
  const note = await joplin.workspace.selectedNote();
  if (!note?.id) throw new Error('Select a Joplin note first.');
  return joplin.data.get(['notes', note.id], { fields: ['id', 'title', 'body'] });
}

async function selectedText(note) {
  if (typeof joplin.workspace.selectedText === 'function') {
    const selection = await joplin.workspace.selectedText();
    if (selection) return { text: selection, selectionOnly: true };
  }
  return { text: note.body || '', selectionOnly: false };
}

async function registerPlugin() {
  await joplin.settings.registerSettings(Object.fromEntries(Object.entries(SETTINGS).map(([key, value]) => [
    `ikmal.${key}`,
    { value: Array.isArray(value) ? value.join(', ') : value, type: typeof value === 'boolean' ? 2 : typeof value === 'number' ? 1 : 0, public: true, label: `ikmal ${key}` },
  ])));
  const panel = await joplin.views.panels.create('ikmal-editor-panel');
  await joplin.views.panels.setHtml(panel, '<p>Run an ikmal check to see suggestions.</p>');
  await joplin.views.panels.onMessage(panel, async (message) => {
    if (message?.type !== 'apply') return;
    const state = registerPlugin.last;
    const match = state?.result?.matches?.[Number(message.index)];
    if (!state || !match) return;
    const replacement = applyMatch(state.text, match);
    if (replacement == null) return;
    if (state.selectionOnly && typeof joplin.workspace.replaceSelection === 'function') {
      await joplin.workspace.replaceSelection(replacement);
    } else {
      await joplin.data.put(['notes', state.note.id], null, { body: replacement });
    }
    registerPlugin.last = null;
    await joplin.views.panels.setHtml(panel, '<p>ikmal applied the suggestion.</p>');
  });

  async function check() {
    try {
      const note = await selectedNote();
      const selected = await selectedText(note);
      const current = {};
      for (const key of Object.keys(SETTINGS)) current[key] = await joplin.settings.value(`ikmal.${key}`);
      current.dictionary = String(current.dictionary || '').split(',');
      current.ignoredRules = String(current.ignoredRules || '').split(',');
      const settings = normalizeSettings(current);
      const result = await checkText(selected.text, settings, async (url, options) => {
        const response = await joplin.request({ method: options.method, url, headers: options.headers, body: options.body });
        return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.json() };
      });
      registerPlugin.last = { note, text: selected.text, selectionOnly: selected.selectionOnly, result };
      await joplin.views.panels.setHtml(panel, panelHTML(result));
      return result;
    } catch (error) {
      await joplin.views.panels.setHtml(panel, `<p class="ikmal-error">${escapeHTML(error.message)}</p>`);
      return null;
    }
  }

  await joplin.commands.register({ name: 'ikmal.checkNote', label: 'ikmal: Check note', execute: check });
  await joplin.commands.register({ name: 'ikmal.checkSelection', label: 'ikmal: Check selection', execute: check });
  await joplin.views.panels.show(panel);
}

module.exports = { default: { onStart: registerPlugin }, escapeHTML, panelHTML };
