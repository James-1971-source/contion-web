/* 콘티온 웹 버전 서비스 워커 (tools/publish-web.ps1이 버전을 채워 sw.js로 만듭니다)
 * - 프로그램 파일을 PC에 보관해 인터넷 없이도 실행
 * - 새 버전이 올라오면 백그라운드로 받아 두고, 화면에서 "지금 적용"을 누르면 교체
 * - 멀티스레드 음성 합성을 위해 교차 출처 격리 헤더(COOP/COEP)를 붙여 줌 */
const VERSION = '3.3-21c9c290e2';
const CORE = 'contion-core-' + VERSION;
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'vendor/ort/ort.wasm.min.js', 'vendor/ort/ort-wasm-simd-threaded.mjs', 'vendor/ort/ort-wasm-simd-threaded.wasm'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    // 한 파일이 실패해도 설치가 통째로 실패하지 않도록 하나씩 저장(편집기 본문 index.html은 반드시 필요)
    await Promise.all(FILES.map(f => c.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    if (!(await c.match('index.html'))) await c.add(new Request('index.html', { cache: 'reload' }));
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
  if (url.pathname.startsWith('/library')) return; // 자료실은 편집기와 별도 페이지(캐시·격리 헤더 적용 안 함)
  e.respondWith((async () => {
    const nav = req.mode === 'navigate';
    let res;
    try {
      const c = await caches.open(CORE);
      res = await c.match(nav ? new Request('index.html') : req, { ignoreSearch: nav });
      if (!res && nav) res = await caches.match('index.html', { ignoreSearch: true }); // 다른 버전 저장본이라도 사용
    } catch (err) {}
    if (!res) { try { res = await fetch(req); } catch (err) {} }
    if (!res && nav) { try { res = await fetch('index.html', { cache: 'reload' }); } catch (err) {} }
    if (!res) {
      if (!nav) return Response.error();
      // 저장본도 인터넷도 없을 때: 빈 오류 화면 대신 안내와 다시 시도 버튼
      return new Response('<!doctype html><meta charset="utf-8"><title>콘티온</title><body style="font-family:sans-serif;background:#0b1018;color:#dbe5ec;text-align:center;padding-top:22vh"><h2>콘티온을 불러오지 못했습니다</h2><p>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</p><button onclick="location.reload()" style="padding:10px 18px;border:0;border-radius:8px;background:#5fd3b3;font-weight:700">다시 시도</button></body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    try { return isolate(res); } catch (err) { return res; }
  })());
});