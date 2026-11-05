// Runs before first paint so the page never flashes the wrong theme: the visitor's own choice (the header toggle) if
// they made one, otherwise the system's light or dark setting. Blocked storage still gets the system's.
var t = null;
try {
  t = localStorage.getItem('gg-theme');
} catch (e) { /* storage blocked: use the system's */ }
if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.theme = t;
