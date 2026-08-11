/*
 * 경원 AX 허브 서비스워커
 *
 * 목적은 하나다 — 매장에서 전파가 약하거나 끊겨도 이미 한 번 본 화면은 열리게 하는 것.
 * 정적 미니앱(public/*.html)이 1MB에 가까워 매번 다시 받으면 지하·엘리베이터에서 체감이 나쁘다.
 *
 * 전략
 *  - 네비게이션(HTML 문서 요청): 네트워크 우선 → 실패 시 캐시. Next 페이지가 배포 직후에도
 *    항상 최신이어야 하므로 캐시를 먼저 쓰지 않는다.
 *  - 정적 미니앱·검색 인덱스: stale-while-revalidate. 캐시가 있으면 즉시 보여주고 뒤에서 갱신한다.
 *    데이터가 하루이틀 늦는 것보다 "안 열리는" 쪽이 영업 현장에서 훨씬 치명적이다.
 *  - 그 외(_next 정적 자산 등): 캐시 우선. 파일명에 해시가 들어 있어 내용이 바뀌면 URL이 바뀐다.
 *
 * 배포할 때마다 CACHE_VERSION을 올려 옛 캐시를 정리한다.
 */
/*
 * v2 (2026-08-09) — `size-reps.json` 의 사이즈 이름이 통째로 바뀌었다(냉장고 용량 → 도어
 * 구성, 에어컨 냉방면적 → 설치 형태). SWR 은 **캐시가 있으면 그걸 먼저 보여주므로**
 * 배포 직후 한 번은 옛 목록이 뜬다 — 사용자가 "아직도 그대로"라고 보게 된다.
 * 데이터 표기를 바꿀 때는 버전을 함께 올릴 것.
 */
// v3 (2026-08-10) — 앱 이름과 아이콘이 바뀌었다(AX 허브 → 세일즈 코파일럿).
// manifest·아이콘이 캐시에 남아 있으면 옛 이름으로 계속 설치된다.
const CACHE_VERSION = 'axhub-v6';
const RUNTIME = `${CACHE_VERSION}-runtime`;

// stale-while-revalidate 대상 — 모듈 미니앱과 검색 인덱스
// `as`·`poster` 가 빠져 있었다(2026-08-11). 미니앱은 전부 같은 규칙을 타야 매장에서
// 전파가 끊겨도 한 번 본 화면이 열린다 — 새 미니앱을 만들면 여기에 함께 넣을 것.
const SWR = /\/(finder|compare|install|care|quiz|test|place|as|poster)-app\.html$|\/(search-(index|detail)|size-reps)\.json$/;

self.addEventListener('install', (e) => {
  // 미리 받아두지 않는다. 첫 방문에 1MB를 강제로 받게 하면 오히려 느려진다.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function swr(req) {
  return caches.open(RUNTIME).then((cache) =>
    cache.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

function cacheFirst(req) {
  return caches.open(RUNTIME).then((cache) =>
    cache.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    )
  );
}

function networkFirst(req) {
  return caches.open(RUNTIME).then((cache) =>
    fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => cache.match(req))
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 외부 도메인은 건드리지 않는다
  if (url.pathname.startsWith('/api/')) return;      // 로그·인증 API는 항상 네트워크

  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
  if (SWR.test(url.pathname))  { e.respondWith(swr(req)); return; }
  if (url.pathname.startsWith('/_next/static/')) { e.respondWith(cacheFirst(req)); return; }
});
