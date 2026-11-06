/* Service worker do cardápio: existe para o celular oferecer "Instalar app".
   Sempre busca na internet (nada fica velho); sem internet, mostra a última versão aberta. */
const CACHE = "cardapio-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return; // a API não passa por aqui
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req))
  );
});
