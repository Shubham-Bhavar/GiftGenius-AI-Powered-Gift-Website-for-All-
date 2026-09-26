// Runs before first paint so the page never flashes the wrong theme.
try {
  var t = localStorage.getItem('gg-theme');
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
} catch (e) { /* storage blocked: CSS falls back to the system theme */ }
