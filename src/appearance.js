// Fixed application appearance. Rendering only: file operations are unaffected.
(() => {
  const root = document.documentElement;
  // Fixed 70% treatment is defined in CSS; previous preferences no longer apply.
  root.dataset.glass = 'on';
  try { localStorage.removeItem('securecopy-glass-intensity'); } catch { /* Optional storage. */ }
  window.SecureCopyAppearance = {
    setSection: section => { root.dataset.section = ['home', 'copy', 'compare', 'monitor'].includes(section) ? section : 'home'; }
  };
  window.SecureCopyAppearance.setSection('home');
})();
