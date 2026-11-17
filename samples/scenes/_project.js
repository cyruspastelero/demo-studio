// RECIPE: project settings, one per demo.
// USE WHEN: always. Copy to <demo>/recordings/scenes/_project.js before the first take.
// mk-scene.sh and rec.mjs inline this file before lib.js in every scene.
// CHANGE: every line marked `// CHANGE:` below.
// VERIFY AFTER THE FIRST TAKE: the cursor style is right, no banner or toast shows, and any
//   secret on screen is blurred (the scene's maskedSummary(p) lists its prefix).
const PROJECT = {
  // 'dot' (default): the quality-bar cursor, a blue disc with a white ring and a click ripple
  // (docs/quality-bar.md K1). 'arrow' and 'hand' do not meet the bar; use them only on request.
  cursor: 'dot',
  // Regex sources for the product's own token shapes. lib.js already masks common ones
  // (sk-..., ghp_..., JWTs, long hex). This example masks keys like wf_test_abc123...
  maskPatterns: ['\\bwf_(live|test)_\\w{16,}'],  // CHANGE: your product's key prefix, or []
  // Field labels whose values are secret, matched whole and case-insensitive.
  maskLabels: ['Ingest key'],  // CHANGE: the labels next to secrets in your product, or []
  // Full wording of banners and toasts to hide. Never a short or empty pattern: it hides real UI.
  clutter: ['Enable desktop notifications', 'Your trial ends in', '^Saved$', '^Copied to clipboard$'],  // CHANGE: the exact text of your product's banners and toasts
};
