/* 콘티온 웹 버전 서비스 워커 (tools/publish-web.ps1이 버전을 채워 sw.js로 만듭니다)
 * - 프로그램 파일을 PC에 보관해 인터넷 없이도 실행
 * - 새 버전이 올라오면 백그라운드로 받아 두고, 화면에서 "지금 적용"을 누르면 교체
 * - 멀티스레드 음성 합성을 위해 교차 출처 격리 헤더(COOP/COEP)를 붙여 줌 */
const VERSION = '3.3-ecb3bdef06';
const CORE = 'contion-core-' + VERSION;
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'vendor/ort/ort.wasm.min.js', 'vendor/ort/ort-wasm-simd-threaded.mjs', 'vendor/ort/ort-wasm-simd-threaded.wasm'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting(); // 첫 설치는 바로 사용
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('contion-core-') && k !== CORE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'skipWaiting') self.skipWaiting(); });

function isolate(res) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/access.json')) return; // 항상 최신 정보
  e.respondWith((async () => {
    const c = await caches.open(CORE);
    const key = req.mode === 'navigate' ? new Request('index.html') : req;
    let res = await c.match(key, { ignoreSearch: req.mode === 'navigate' });
    if (!res) { try { res = await fetch(req); } catch (err) { res = await c.match('index.html'); } }
    return isolate(res);
  })());
});
