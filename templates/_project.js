// Project-specific settings, inlined before lib.js in every scene.
const PROJECT = {
  // 'arrow' (default, the normal macOS arrow), 'hand' (a pointing hand, for consumer apps),
  // or 'dot' (a blue click dot; reads as a screen recorder, so avoid it)
  cursor: 'arrow',
  // Extra secret patterns (regex sources) and labels whose neighbouring value gets blurred
  maskPatterns: [],
  maskLabels: [],
  // Regex sources for banners, toasts and popups to hide during takes, e.g. 'Enable notifications'
  clutter: [],
  // Frame receiver port (default 8765); set per window when two windows record at once
  // port: 8765,
};
