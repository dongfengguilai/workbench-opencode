(() => {
  const saved = document.cookie.match(/(?:^|;\s*)workbench_theme=(light|dark)(?:;|$)/)?.[1];
  const system = matchMedia('(prefers-color-scheme: dark)');
  function apply(mode) { document.documentElement.dataset.colorScheme = mode; }
  apply(saved || (system.matches ? 'dark' : 'light'));
  system.addEventListener('change', e => { if (!document.cookie.match(/(?:^|;\s*)workbench_theme=/)) apply(e.matches ? 'dark' : 'light'); });
  window.workbenchTheme = mode => {
    document.cookie = `workbench_theme=${mode}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    apply(mode);
  };
})();
