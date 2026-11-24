// sw.js — ضعه في نفس مجلد index.html و video.mp4 (مثلاً clixtv/)
const VIDEO_CACHE = 'clix-video-v1';   // نفس الاسم المستخدم في index.html
const PAGE_CACHE  = 'clix-page-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VIDEO_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// خدمة الفيديو من الكاش مع دعم Range (ضروري لمشغّل webOS)
async function serveVideo(req) {
  const cache = await caches.open(VIDEO_CACHE);
  const hit = await cache.match(req.url, { ignoreSearch: true });
  if (!hit) return fetch(req);                      // غير محفوظ بعد: من الإنترنت

  const blob = await hit.blob();                    // بدون نسخ الذاكرة
  const size = blob.size;
  const base = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' };
  const range = req.headers.get('range');

  if (!range) {
    return new Response(blob, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end   = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - end); end = size - 1; }  // bytes=-N
  end = Math.min(end, size - 1);
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  }
  return new Response(blob.slice(start, end + 1, 'video/mp4'), {
    status: 206,
    headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
  });
}

// فتح الصفحة نفسها أوفلاين (الشبكة أولاً ثم آخر نسخة محفوظة)
async function servePage(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'no-store' || req.cache === 'reload') return;   // تنزيلات التحديث من الصفحة تذهب للشبكة مباشرة
  if (req.destination === 'video' || /\.mp4(\?|$)/i.test(req.url)) {
    e.respondWith(serveVideo(req));
  } else if (req.mode === 'navigate') {
    e.respondWith(servePage(req));
  }
});
