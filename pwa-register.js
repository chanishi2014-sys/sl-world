/* PWA only. Does not read or write player/game storage. */
(() => {
  if (!('serviceWorker' in navigator) || !['https:', 'http:'].includes(location.protocol)) return;
  const base = new URL('./', document.currentScript.src);
  const ready = navigator.serviceWorker.register(new URL('service-worker.js', base), {
    scope: base.href,
    updateViaCache: 'none'
  });
  ready.catch(error => console.warn('SL WORLD PWA registration:', error));
  // Returning to the app checks for updates, without reloading unsaved forms.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      ready.then(registration => registration.update()).catch(() => {});
    }
  });
})();
