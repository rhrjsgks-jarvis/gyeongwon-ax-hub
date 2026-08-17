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
/*
 * v8 (2026-08-12) — **미니앱 동작을 고쳤으면 반드시 여기를 올릴 것.**
 *
 * 공유 버튼이 "지금 화면이 아닌 다른 화면을 공유한다"는 지적을 받아 코드를 고쳐 배포했는데
 * **이미 쓰던 기기에서는 그대로였다.** 껍데기(Next 페이지)는 네트워크 우선이라 새것이
 * 오는데 미니앱은 SWR 이라 **캐시에 있던 옛 파일**이 먼저 나오기 때문이다 —
 * 새 헤더 + 옛 미니앱이 섞여, 고쳐 둔 `openId` 정리가 그 기기에서만 적용되지 않았다.
 * (재현 확인: 옛 finder-app.html 을 물려 주면 화면에 없는 제품이 그대로 공유된다.)
 *
 * 데이터 표기뿐 아니라 **미니앱의 동작을 바꿨을 때도** 같은 일이 난다. 위 v2 주석이
 * 데이터만 이야기하고 있어 이번에 놓쳤다 — 판단 기준은 "public/*-app.html 이 바뀌었는가"다.
 */
/*
 * v13 (2026-08-12) — 통합검색 딥링크를 care·as·place 세 미니앱이 읽게 했다.
 * 셋 다 `*-app.html` 이 바뀌었으므로(SWR 대상) 여기를 올리지 않으면 이미 쓰던 기기에서
 * **캐시에 있던 옛 미니앱이 먼저 나와** 여전히 첫 화면만 열린다 — v8 을 올리게 만든 것과
 * 똑같은 사고다.
 */
/*
 * v15 (2026-08-12) — 카테고리 고르기를 심벌 타일로 통일하고(설치환경·타사비교),
 * 제품 상세검색의 이름·제품 수를 고치고, 도면 전체 인식을 고쳤다.
 * install·compare·finder·place 네 미니앱이 바뀌었다.
 *
 * **번호가 한 번 겹쳤던 것을 여기서 푼다.** 두 갈래가 나란히 작업하며 각자 v12 → v13 으로
 * 올렸다(한쪽은 통합검색 딥링크, 한쪽은 도면 방 이름 붙이기). 합치면서 같은 v13 을 그대로
 * 두면, 먼저 배포된 v13 을 이미 받은 기기는 **캐시 키가 같아 옛 미니앱을 지우지 않는다** —
 * 버전을 올린 뜻이 통째로 사라진다. 그래서 겹친 v13 을 건너뛰고 올린다.
 *
 * (v14 를 찍은 뒤에도 미니앱을 더 고쳐 아래 `test-consistency` 의 캐시 버전 대조가
 *  걸렸다. 그 검사가 보는 것은 "마지막으로 버전이 바뀐 커밋 **이후에** 미니앱이
 *  바뀌었는가"이므로, 덩어리를 다 만든 **맨 마지막에** 한 번 올리는 것이 맞다.)
 */
/*
 * v17 (2026-08-12) — 이번 덩어리에서 미니앱 다섯이 바뀌었다.
 *  · install·compare·care — 한 개 고르기를 **같은 심벌 타일**로 통일(AS 기준)
 *  · finder — 이름을 '제품 상세검색'으로, 제품 수를 데이터에서 세어 넣음
 *  · place — 도면 전체 인식 · 설치 높이(벽걸이 TV·사운드바·에어컨·시스템에어컨·인덕션)
 *
 * **버전은 덩어리를 다 만든 맨 마지막에 한 번 올린다.** 중간에 찍어 두면 그 뒤에 고친
 * 미니앱이 옛 캐시로 남고, 아래 test-consistency 의 대조가 바로 그것을 잡는다.
 */
/*
 * v57 (2026-08-15) — 타사비교(compare-app.html) 가 바뀌었다.
 * 스마트폰에 AP·RAM·저장공간을 넣고, 값을 모르는 항목("미공개"·"비대상")에
 * 단위·우열 배지를 붙이지 않게 고쳤다. 미니앱은 SWR 이라 여기를 안 올리면
 * 이미 쓰던 기기가 옛 파일을 계속 쓴다.
 */
/* v66 (2026-08-15) — 도면을 올리면 집 전체를 먼저 잡는다(place-app.html). */
/*
 * v71 (2026-08-16) — 타사비교(compare-app.html)에서 근거 없는 소음 값 9칸을 지우고
 * 정수기 음성 제어를 채웠다. **v70 을 찍은 뒤에 compare 를 또 고쳐 대조가 걸렸다** —
 * 위 v17 주석이 적어 둔 그대로, 버전은 덩어리를 다 만든 **맨 마지막에** 한 번 올려야 한다.
 */
/*
 * v72 (2026-08-16) — 제품 상세검색(finder-app.html)의 AI 추천 엔진을 넷 고쳤다.
 * 문장 예산 자동 분배 · 품목 명시 시 용도 규칙 끄기 · 같은 가격 같은 티어 ·
 * 후보 종수 밝히기. 버튼은 계속 hidden 이지만 미니앱 파일이 바뀌었으므로 SWR 규칙상
 * 여기를 올리지 않으면 이미 쓰던 기기가 옛 파일을 계속 쓴다.
 */
/*
 * v73 (2026-08-16) — 타사비교(compare-app.html)의 전기요금 환산에 기후환경요금·부가세·
 * 전력산업기반기금을 넣었다. 화면은 여전히 hidden 이지만 미니앱 파일이 바뀌었으므로
 * SWR 규칙상 여기를 올려야 이미 쓰던 기기가 새 계산을 받는다.
 */
/*
 * v74 (2026-08-16) — place-app.html 은 주석만 바뀌었지만(도면 단지 수 139 → 144),
 * 이 검사는 파일이 바뀌었는지만 보므로 함께 올린다. 기능 변화는 없다.
 */
/*
 * v75 (2026-08-16) — 로봇청소기 소음을 바로잡았다(compare-app.html). 삼성 55 → 63(원문),
 * 근거 없는 타사 11칸 제거. 상담 화면의 수치가 바뀌므로 옛 캐시가 남으면 안 된다.
 */
/*
 * v76 (2026-08-16) — 로봇청소기 배터리도 바로잡았다(compare-app.html).
 * 삼성 4종 220 통일(사양표가 4종 동일) · LG 로보킹 180 → 110 · 근거 없는 타사 7칸 제거.
 */
/*
 * v77 (2026-08-16) — AI 추천의 티어 역전과 예산 초과 처리를 고쳤다(finder-app.html).
 * 버튼은 계속 hidden 이지만 미니앱 파일이 바뀌었다.
 */
/*
 * v78 (2026-08-16) — AI 추천이 청소기 형태(로봇/무선/유선)를 지키고, 김치냉장고가
 * 냉장고를 딸고 오지 않게 고쳤다(finder-app.html). 버튼은 계속 hidden.
 */
/*
 * v79 (2026-08-16) — AI 추천이 에어컨 설치 형태와 인덕션 화구 수를 지키고,
 * 예산 초과 시 가장 싼 것을 보여준다(finder-app.html). 버튼은 계속 hidden.
 */
const CACHE_VERSION = 'axhub-v91';
const RUNTIME = `${CACHE_VERSION}-runtime`;

// stale-while-revalidate 대상 — 모듈 미니앱과 검색 인덱스
// `as`·`poster` 가 빠져 있었다(2026-08-11). 미니앱은 전부 같은 규칙을 타야 매장에서
// 전파가 끊겨도 한 번 본 화면이 열린다 — 새 미니앱을 만들면 여기에 함께 넣을 것.
/*
 * **공용 스크립트도 여기 들어가야 한다**(2026-08-13 추가). 예전에는 미니앱 HTML 과 json 만
 * 잡고 있었는데, 인라인이던 코드를 `share-kit.js`·`prod-symbols.js`·`back-kit.js` 로 뽑아낸
 * 뒤로 그것들이 **아무 규칙에도 안 걸려 그냥 네트워크**였다. 전파가 끊기면 미니앱 HTML 은
 * 캐시에서 뜨는데 심벌·공유·뒤로가기가 통째로 죽는다 — 캐시가 반쪽만 듣는 상태였다.
 * 파일 이름에 버전이 없으므로 캐시 우선(vendor)이 아니라 stale-while-revalidate 로 둔다.
 */
/*
 * **공용 벽선 라이브러리도 여기 들어간다**(2026-08-17). `plan-library.json` 은 도면
 * 이미지 없이 방 경계(mm 좌표)만 담아, 전파가 끊겨도 그것만 있으면 **배치를 그대로
 * 할 수 있다** — 도면을 못 받아도 3D 가 서고 가전을 놓을 수 있는 유일한 자료다.
 * 그런데 아무 규칙에도 안 걸려 그냥 네트워크였다(`share-kit.js` 때와 같은 종류).
 *
 * 도면 색인·이미지(`plan-index.json`·`/plans/`)는 아직 규칙이 없다 — 그쪽은 수십 MB 라
 * 따로 판단할 일이다.
 */
const SWR = /\/(finder|compare|install|care|quiz|test|place|as|poster)-app\.html$|\/(search-(index|detail)|size-reps|warranty|plan-library)\.json$|\/(share-kit|prod-symbols|back-kit)\.js$/;

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
  /*
   * 라이브러리(three.js 등)는 캐시 우선. 파일명에 버전이 박혀 있어 내용이 바뀌면
   * 이름이 바뀌므로 굳을 걱정이 없고, 671KB 를 매번 받으면 매장 전파에서 3D 가 안 열린다.
   * **CDN 을 쓰지 않고 여기 두는 이유가 이것이다** — 오프라인에서도 3D 가 떠야 한다.
   */
  if (url.pathname.startsWith('/vendor/')) { e.respondWith(cacheFirst(req)); return; }
  /*
   * 설치환경 규격도도 캐시 우선. 파일 이름이 삼성닷컴 원본 경로에서 오고 그 경로에
   * 개정번호(`_v3`·`_v5`)가 박혀 있어 내용이 바뀌면 이름이 바뀐다 — 굳을 걱정이 없다.
   * **매장에서 전파가 끊겨도 규격도가 떠야 한다** — 설치 상담에서 정작 필요한 그림이다.
   */
  if (url.pathname.startsWith('/install-img/')) { e.respondWith(cacheFirst(req)); return; }
  /*
   * 단지 목록(경기 12개 시 2,969곳)도 캐시를 먼저 보여주고 뒤에서 갱신한다.
   * 상담 시작이 *"어느 단지 사세요"* 라 이게 안 뜨면 그 자리에서 막힌다 —
   * 목록이 하루 늦는 것보다 안 열리는 쪽이 훨씬 치명적이다(미니앱과 같은 판단).
   */
  if (url.pathname.startsWith('/apt/')) { e.respondWith(swr(req)); return; }
});
