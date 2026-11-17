// Project-specific settings, inlined before lib.js in every scene.
const PROJECT = {
  // 'dot' (default): the quality-bar cursor, a soft blue disc with a white ring and a click ripple
  // (docs/quality-bar.md K1). 'arrow' or 'hand' only on request; they do not meet the bar.
  cursor: 'dot',
  // Extra secret patterns (regex sources) and labels whose neighbouring value gets blurred
  maskPatterns: [],
  maskLabels: [],
  // Regex sources for banners, toasts and popups to hide during takes, e.g. 'Enable notifications'
  clutter: [],
  // Frame receiver port (default 8765); set per window when two windows record at once
  // port: 8765,
};
