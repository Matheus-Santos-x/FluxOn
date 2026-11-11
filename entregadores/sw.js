// guarda a casca do app pra abrir rápido mesmo com sinal ruim. Pedidos e localização sempre vêm do servidor.
const CACHE = "fluxon-entregas-v2";
const CASCA = ["/", "/index.html", "/style.css", "/config.js", "/comum.js", "/login.js", "/mapa.js", "/pegar.js", "/troco.js", "/rua.js", "/ganhos.js", "/perfil.js", "/app.js", "/manifest.json", "/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/acompanhar")) return;
  // rede primeiro (versão nova sempre que tiver sinal); sem sinal, usa a guardada
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html"))));
});
