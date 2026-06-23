// inject.js - Ejecutado en el contexto principal (MAIN world) para acceder a variables globales
(function() {
  function sendToken() {
    if (typeof userAccessToken !== 'undefined' && userAccessToken) {
      document.dispatchEvent(new CustomEvent('THC_ACCESS_TOKEN_RESPONSE', {
        detail: userAccessToken
      }));
    }
  }

  // Escuchar peticiones del content script
  document.addEventListener('THC_ACCESS_TOKEN_REQUEST', () => {
    sendToken();
  });

  // Intentar enviarlo inmediatamente y también con pequeños retardos
  sendToken();
  setTimeout(sendToken, 500);
  setTimeout(sendToken, 1000);
  setTimeout(sendToken, 2000);
})();
