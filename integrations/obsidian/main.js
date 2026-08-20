const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice, requestUrl } = require('obsidian');
const { DEFAULT_SETTINGS, applyMatch, checkText, normalizeSettings } = require('../common/languagetool.cjs');

const SETTINGS = Object.freeze({
  ...DEFAULT_SETTINGS,
  language: 'auto',
  ignoredRules: [],
});

class IkmalSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'ikmal editor' });
    new Setting(containerEl).setName('Endpoint').setDesc('Loopback LanguageTool-compatible checker URL.')
      .addText((control) => control.setValue(this.plugin.settings.endpoint).onChange(async (value) => {
        try { this.plugin.settings = normalizeSettings({ ...this.plugin.settings, endpoint: value }); await this.plugin.saveData(this.plugin.settings); }
        catch (error) { new Notice(error.message); }
      }));
    new Setting(containerEl).setName('Language').setDesc('LanguageTool language code or auto.')
      .addText((control) => control.setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.settings.language = value || 'auto'; await this.plugin.saveData(this.plugin.settings);
      }));
    new Setting(containerEl).setName('Minimum length').addText((control) => control.setValue(String(this.plugin.settings.minLength)).onChange(async (value) => {
      this.plugin.settings = normalizeSettings({ ...this.plugin.settings, minLength: value }); await this.plugin.saveData(this.plugin.settings);
    }));
    new Setting(containerEl).setName('Maximum length').addText((control) => control.setValue(String(this.plugin.settings.maxLength)).onChange(async (value) => {
      this.plugin.settings = normalizeSettings({ ...this.plugin.settings, maxLength: value }); await this.plugin.saveData(this.plugin.settings);
    }));
    new Setting(containerEl).setName('Check delay (ms)').addText((control) => control.setValue(String(this.plugin.settings.checkDelayMs)).onChange(async (value) => {
      this.plugin.settings = normalizeSettings({ ...this.plugin.settings, checkDelayMs: value }); await this.plugin.saveData(this.plugin.settings);
    }));
    new Setting(containerEl).setName('Dictionary').setDesc('Comma-separated words ignored as spelling findings.')
      .addText((control) => control.setValue(this.plugin.settings.dictionary.join(', ')).onChange(async (value) => {
        this.plugin.settings = normalizeSettings({ ...this.plugin.settings, dictionary: value.split(',') }); await this.plugin.saveData(this.plugin.settings);
      }));
    new Setting(containerEl).setName('Ignored rules').setDesc('Comma-separated LanguageTool rule IDs.')
      .addText((control) => control.setValue(this.plugin.settings.ignoredRules.join(', ')).onChange(async (value) => {
        this.plugin.settings = normalizeSettings({ ...this.plugin.settings, ignoredRules: value.split(',') }); await this.plugin.saveData(this.plugin.settings);
      }));
  }
}

module.exports = class IkmalObsidianPlugin extends Plugin {
  async onload() {
    this.settings = normalizeSettings({ ...SETTINGS, ...(await this.loadData() || {}) });
    this.last = null;
    this.addSettingTab(new IkmalSettingsTab(this.app, this));
    this.addCommand({ id: 'check-document', name: 'Check whole note', editorCallback: (editor) => this.check(editor, false) });
    this.addCommand({ id: 'check-selection', name: 'Check selected text', editorCallback: (editor) => this.check(editor, true) });
    this.addCommand({ id: 'apply-first-suggestion', name: 'Apply first ikmal suggestion', editorCallback: (editor) => this.apply(editor) });
    this.addCommand({ id: 'ignore-first-rule', name: 'Ignore first ikmal rule', editorCallback: () => this.ignoreFirstRule() });
    this.addCommand({ id: 'add-first-word-to-dictionary', name: 'Add first spelling finding to dictionary', editorCallback: () => this.addFirstWord() });
  }

  async check(editor, selectionOnly) {
    const text = selectionOnly ? editor.getSelection() : editor.getValue();
    try {
      const result = await checkText(text, this.settings, async (url, options) => {
        const response = await requestUrl({ url, method: options.method, headers: options.headers, body: options.body });
        return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.json };
      });
      this.last = { text, selectionOnly, result };
      new Notice(result.skipped ? `ikmal skipped this text: ${result.skipped}` : `ikmal found ${result.matches.length} suggestion${result.matches.length === 1 ? '' : 's'}.`);
      return result;
    } catch (error) {
      new Notice(`ikmal: ${error.message}`);
      return null;
    }
  }

  apply(editor) {
    const match = this.last?.result?.matches?.[0];
    if (!match) return new Notice('ikmal has no current suggestion to apply.');
    const replacement = applyMatch(this.last.text, match);
    if (replacement == null) return new Notice('ikmal: that suggestion is stale. Check the note again.');
    if (this.last.selectionOnly) editor.replaceSelection(replacement);
    else editor.setValue(replacement);
    this.last = null;
    new Notice('ikmal applied the first suggestion.');
  }

  async ignoreFirstRule() {
    const rule = this.last?.result?.matches?.[0]?.rule?.id;
    if (!rule) return new Notice('ikmal has no current rule to ignore.');
    this.settings = normalizeSettings({ ...this.settings, ignoredRules: [...this.settings.ignoredRules, rule] });
    await this.saveData(this.settings);
    new Notice(`ikmal will ignore ${rule}.`);
  }

  async addFirstWord() {
    const match = this.last?.result?.matches?.[0];
    if (!match || !/spell|typo|morfologik/i.test(`${match.rule?.issueType} ${match.rule?.category?.id} ${match.rule?.id}`)) {
      return new Notice('ikmal has no current spelling suggestion.');
    }
    const word = this.last.text.slice(match.offset, match.offset + match.length);
    this.settings = normalizeSettings({ ...this.settings, dictionary: [...this.settings.dictionary, word] });
    await this.saveData(this.settings);
    new Notice(`ikmal added “${word}” to the dictionary.`);
  }
};
