// Shared presentation preferences for inline writing indicators.
(function () {
  const palettes = {
    balanced: {
      grammar: '214 117 96',
      style: '107 138 175',
      language: '123 108 217',
      relationship: '111 163 124',
      related: '224 164 88',
    },
    warm: {
      grammar: '211 91 74',
      style: '218 148 90',
      language: '185 111 143',
      relationship: '126 164 106',
      related: '224 164 88',
    },
    cool: {
      grammar: '190 111 133',
      style: '93 145 190',
      language: '116 124 215',
      relationship: '92 169 164',
      related: '115 151 188',
    },
    contrast: {
      grammar: '255 104 84',
      style: '102 190 255',
      language: '180 140 255',
      relationship: '117 218 137',
      related: '255 192 74',
    },
  };
  const defaults = { style: 'squiggle', palette: 'balanced', intensity: 55 };

  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    const style = ['line', 'dash'].includes(source.style) ? source.style : defaults.style;
    const palette = Object.prototype.hasOwnProperty.call(palettes, source.palette) ? source.palette : defaults.palette;
    const rawIntensity = Number(source.intensity);
    const intensity = Number.isFinite(rawIntensity) ? Math.max(0, Math.min(100, Math.round(rawIntensity / 5) * 5)) : defaults.intensity;
    return { style, palette, intensity };
  }

  function applyToDocument(value) {
    const preferences = normalize(value);
    const root = document.documentElement;
    root.dataset.annotationStyle = preferences.style;
    root.dataset.annotationPalette = preferences.palette;
    const colors = palettes[preferences.palette];
    Object.entries(colors).forEach(([name, rgb]) => root.style.setProperty(`--annotation-${name}`, rgb));
    root.style.setProperty('--annotation-alpha', String(0.28 + (preferences.intensity / 100) * 0.62));
    root.style.setProperty('--annotation-fill-alpha', String(0.035 + (preferences.intensity / 100) * 0.18));
    return preferences;
  }

  function bindControls({ style, palette, intensity, output, onChange }) {
    const update = () => {
      const preferences = applyToDocument({ style: style?.value, palette: palette?.value, intensity: intensity?.value });
      if (output) output.textContent = `${preferences.intensity}%`;
      onChange?.(preferences);
      return preferences;
    };
    style?.addEventListener('change', update);
    palette?.addEventListener('change', update);
    intensity?.addEventListener('input', update);
    return { apply: (value) => { const preferences = normalize(value); if (style) style.value = preferences.style; if (palette) palette.value = preferences.palette; if (intensity) intensity.value = String(preferences.intensity); if (output) output.textContent = `${preferences.intensity}%`; return applyToDocument(preferences); }, update };
  }

  window.IkmalAnnotationPreferences = { defaults, normalize, applyToDocument, bindControls, palettes };
})();
