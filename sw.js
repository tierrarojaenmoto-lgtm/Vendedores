// Service worker de "Vendedores": abre la app desde el celular, sin esperar a la red.
// Cuando subas una versión nueva a GitHub, cambiá el número de VERSION.
const VERSION = "v1";
const CACHE = "vendedores-" + VERSION;
const CORE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const CDN_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cada archivo por separado: si uno falla, los demás igual se guardan.
    await Promise.all(CORE.concat([JSPDF]).map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("vendedores-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Archivos propios: se responde al instante con lo guardado y se actualiza en segundo plano
// (la versión nueva se ve la próxima vez que abras la app).
async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const key = req.mode === "navigate" ? "./index.html" : req;
  const cached = await cache.match(key, { ignoreSearch: true });
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  return res || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// Tipografías y jsPDF: una vez descargados, salen siempre del celular.
async function cacheFirst(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(event));
  }
  // Google Sheets y WhatsApp no se tocan: la app maneja su propio caché del catálogo.
});
