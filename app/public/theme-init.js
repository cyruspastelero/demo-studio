// Apply the saved theme (src/lib/theme.ts) before first paint so the page never flashes the wrong one.
// A file, not an inline script, so the page's Content-Security-Policy can be script-src 'self'.
(function () {
  var choice = 'system';
  try { choice = localStorage.getItem('demo-studio.theme') || 'system'; } catch (e) { /* storage blocked: follow the device */ }
  document.documentElement.dataset.theme = choice === 'light' || choice === 'dark' ? choice : 'system';
})();
