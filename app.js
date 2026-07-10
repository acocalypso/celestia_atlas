// Compatibility entry point for older bookmarks and cached HTML.
// The standalone implementation lives only in app-v8.js.
(() => {
  'use strict';
  if (document.querySelector('script[data-celestia-atlas-main]')) return;
  const script = document.createElement('script');
  script.src = new URL('./app-v8.js', document.currentScript?.src || location.href).href;
  script.dataset.celestiaAtlasMain = 'true';
  document.head.appendChild(script);
})();
