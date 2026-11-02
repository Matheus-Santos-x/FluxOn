/* Service worker mínimo: só existe para o celular oferecer "Instalar app".
   Não guarda nada em cache, então toda atualização do cardápio aparece na hora. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
