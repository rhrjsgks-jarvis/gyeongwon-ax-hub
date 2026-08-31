/**
 * 매장 언급 후기 수집 — Google Apps Script 웹앱 (2026-08-31 사장님 요청)
 *
 * *"각종 웹사이트에 우리 경원영업팀 지점들이 언급되는 후기를 스크래핑해서 일간 주간
 *  월간 전체 누적기록을 확인하고싶은데 … 링크도 함께수집하면 좋을것같아"*
 * *"다이렉트웨딩, 매이크마이웨딩, 네이버맘카페, 네이버블로그"*
 *
 * ## 왜 Vercel 이 아니라 여기인가
 * *"vercel 앱은 전산PC에서 보안이슈로열리지않아 구글스크립트와같은 경로로"* (사장님).
 * 그래서 **수집·저장·화면이 전부 이 스크립트 안에서 끝난다.** 세일즈 코파일럿 앱은
 * `?json=1` 로 자료만 받아 간다(시크릿쿠폰이 허브 카드에서 열리는 것과 같은 방식).
 *
 * ## 네 소스가 두 엔드포인트로 다 덮인다
 * 다이렉트웨딩·메이크마이웨딩은 **자체 사이트가 아니라 네이버 카페**에 후기가 쌓인다
 * (메이크마이웨딩 공식 안내가 스스로 그렇게 적는다 — *"카페에 상담 후기 남겨주신 전원
 * 신세계 상품권"*). 실측으로 카페 검색 결과에 `cafe.naver.com/directwedding` 이 그대로
 * 잡히고, 수집분 778건 중 **327건이 다이렉트웨딩**이다.
 *
 * 자체 사이트는 긁지 않는다 — 다이렉트웨딩은 robots 가 `ClaudeBot` 을 명시 허용하지만,
 * ①정작 후기는 카페에 쌓이고 ②사이트마다 스크래퍼를 만들면 구조가 바뀔 때마다 조용히
 * 0건이 된다. 메이크마이웨딩은 robots 가 Allow 인데 **서버가 403** 이라 어차피 못 받는다.
 * `cafe.naver.com` 자체는 `Disallow: /` 에 RAG 금지까지 명시돼 있어 **직접 긁으면 안 되고**,
 * 공식 검색 API 로 받는 것은 네이버가 스스로 내주는 자료라 그와 다른 일이다.
 *
 * ## 설치 (게시판·로그와 같은 절차)
 *  1) 새 Google 스프레드시트 생성 (이름 예: 세일즈코파일럿 매장후기)
 *  2) 확장 프로그램 → Apps Script → 이 파일을 그대로 붙여넣기 → 저장
 *  3) HTML 파일을 하나 더 만들고 이름을 **ReviewsIndex** 로 한다 → ReviewsIndex.html 내용 붙여넣기
 *  4) **프로젝트 설정 → 스크립트 속성**에 네이버 키 두 개를 넣는다
 *       NAVER_CLIENT_ID     = console.ncloud.com/naver-api-hub 에서 발급
 *       NAVER_CLIENT_SECRET =
 *     **코드에 적지 말 것** — 이 파일은 public repo 에 커밋된다.
 *  5) 함수 목록에서 `setupTrigger` 를 한 번 실행 (하루 1회 새벽 3시 트리거가 걸린다)
 *  6) 배포 → 새 배포 → 유형: 웹 앱 → 실행: 나 / 액세스 권한: **전체** → 배포
 *  7) 발급된 /exec 주소를 즐겨찾기에 두고, 앱 연동용으로 `app/page.tsx` 에도 넣는다
 *
 * **이 파일을 고쳤으면 반드시 다시 배포할 것**(배포 관리 → 새 버전). 저장만으로는 안 바뀐다.
 */

/* ── 네이버 검색 API (NAVER API HUB · NCP) ──────────────────────────
 * 옛 `openapi.naver.com` 이 아니다. 2026-06-25 에 HUB 로 이관됐고 developers.naver.com
 * 의 「사용 API」 목록에서 **검색이 통째로 사라졌다**(실측). 옛 주소에 NCP 키를 보내면
 * `Not Exist Client ID` 가 나고, 옛 헤더로 보내면 `NID AUTH Result Invalid` 가 난다 —
 * 주소와 헤더 이름이 둘 다 다르다.
 * 쇼핑·책·전문자료 검색은 2026-07-31 에 완전 종료됐고 **블로그·카페는 이관된 쪽**이다.
 * 한도는 하루 25,000 회, 우리는 88 회 쓴다. 현재 무료(유료 전환 시 별도 공지 예정). */
var API_BASE = 'https://naverapihub.apigw.ntruss.com/search/v1';

var SHEET_ITEMS = '후기';
var SHEET_LOG = '수집기록';

/* 한 번에 받는 수와 몇 쪽까지 넘길지. **실측(2026-08-31)에서 나온 값이다** —
   display 는 100 이 상한이고(200 은 HTTP 400) start 는 201 부터 0건이 온다.
   즉 한 질의로 받을 수 있는 것은 **약 200건**이고 그 이상은 네이버가 안 준다. */
var PAGE_SIZE = 100;
var MAX_PAGES = 2;

/* ── 일일 수집한도 ────────────────────────────────────────────────
 * 2026-08-31 사장님 요청: *"지금 수집 버튼 옆에 일일 수집한도를 설정해주면 좋겠습니다"*.
 *
 * **한 바퀴가 최대 2,096회다** — 65곳 × 블로그·카페 2종 × 꼬리말 8 × 2쪽 = 2,080 에
 * 관심 카페 16을 더한 값이다. 새벽 자동 수집은 하루 한 번이라 평소엔 그 안쪽이지만
 * 「지금 수집」을 여러 번 누르면 그만큼 는다. **한도가 없으면 어느 날 조용히 막히고
 * 그날 수집이 통째로 빈다** — 그런데 화면에는 아무 표시도 안 난다.
 *
 * **기본 20,000 은 「사실상 안 걸리되 네이버보다 먼저 멈추는」 값이다**
 * (2026-08-31 사장님 질문 *"일일 한도를 없애면 어떻습니까?"*).
 *
 * 없애는 것보다 높이는 편이 낫다 — 네이버 실제 한도가 **하루 25,000회**이고 한 바퀴가
 * 약 2,450회(수집 2,096 + 경쟁비교 352)라 **하루 10바퀴면 네이버가 끊는다.**
 * 한도를 없애면 그 순간 그날 수집이 통째로 죽는데 **화면에는 아무 표시도 안 난다** —
 * 이 장치가 막으려던 것이 바로 그 조용한 실패다. 20,000 이면 하루 8바퀴라 실질적으로
 * 안 걸리고, 걸리더라도 **네이버가 끊기 전에 우리가 먼저 멈춰 이유를 화면에 적는다.**
 *
 * 한 바퀴를 못 채우는 값(2,096 미만)을 넣으면 매일 중간에서 끊기므로 화면이 경고한다.
 *
 * **세는 곳은 한 곳뿐이다** — `collectReviews()` 의 `calls` 하나를 쓰고 끝에 한 번만
 * 저장한다. 부르는 자리마다 세면 두 숫자가 갈라진다(이 저장소가 상태줄·허브 카드
 * 개수에서 되풀이해 데인 자리). 속성 읽기가 2,000번 도는 것도 함께 막는다.
 */
var DEFAULT_DAILY_LIMIT = 20000;
var SWEEP_CALLS = 2096;   /* 화면이 "한 바퀴에 모자란다"를 말할 수 있게 상수로 둔다 */

/* **열은 뒤에만 붙인다** — 이 스크립트는 열을 자리로 쓰므로 가운데에 끼우면 그 아래
   모든 줄이 한 칸씩 밀린다(Code.gs 가 지점 열을 더할 때 겪은 것과 같다). */
/* **첫 열이 `date` 다 — 「작성일 우선, 없으면 발견일」.** 화면의 일간·주간·월간이 이
   값을 센다. 마지막 `seenAt` 은 **처음 본 날**이라 「새로 발견」을 세는 데만 쓴다.
   **열은 뒤에만 붙였다**(`seenAt`) — 가운데에 끼우면 그 아래 모든 줄이 한 칸씩 밀린다. */
var HEADER = ['date', 'store', 'storeName', 'src', 'title', 'link', 'cafe', 'postdate', 'seenAt', 'kind'];
var LOG_HEADER = ['at', 'calls', 'got', 'kept', 'added', 'error'];

/* ── 대상 매장 65곳 — 경원영업팀 활성 지점 전부 ────────────────────
 * 2026-08-31 사장님 지시: *"바이럴분석기는 65개매장 모두 적용해주세요"*.
 *
 * 처음에는 44곳이었다 — 캠퍼스·사업장 안 모바일 전용점 21곳이 실측으로 **전부 0건**
 * 이라 뺐었다. 사장님 결정으로 전부 넣는다. 근거가 있다:
 *  - 호출이 88 → 130 회로 늘지만 **한도 25,000 의 0.5%** 다.
 *  - 오늘 0건이라고 내일도 0건인 것은 아니다. **넣어 두면 첫 후기를 놓치지 않는다.**
 *  - *"0건이 21줄 늘어서면 진짜 신호가 묻힌다"* 던 걱정은 **화면에서 푼다** —
 *    대시보드가 0건 매장을 접어 둔다(수집과 표시는 다른 문제였다).
 *
 * **`lib/stores.ts` 에서 생성한 것이다. 손으로 고치지 말 것.**
 * 처음에 손으로 적었다가 **점코드를 넷이나 틀렸다**(안성 Z403→Z383 · 평택고덕
 * Z404→Z398 · 이천증포 Z405→Z399 · 수원 Z422→Z619). 시트에 틀린 코드가 쌓이면
 * 지점별 집계가 통째로 어긋나는데 **화면에는 아무 표시도 안 난다.**
 * 매장이 바뀌면 `node .scratch/_stores65.txt` 를 다시 만들어 이 블록만 갈아 끼운다. */
var STORES = [
  ['ZN01', '스타필드수원'], ['ZHA7', '현대판교모바일'], ['Z279', '오산'], ['Z047', '수지'],
  ['Z150', '강릉옥천'], ['Z205', '단구'], ['Z206', '석사'], ['Z227', '속초'],
  ['Z243', '평택'], ['Z324', '분당'], ['Z343', '북수원'], ['Z378', '광주'],
  ['Z383', '안성'], ['Z398', '평택고덕'], ['Z399', '이천증포'], ['Z405', '평촌'],
  ['Z418', '안양모바일'], ['Z426', '용인구성'], ['Z451', '서수원'], ['Z509', '영통'],
  ['Z539', '디지털시티모바일'], ['Z541', '광명소하'], ['Z557', '성남'], ['Z567', 'AK분당'],
  ['Z579', '원주'], ['Z583', '춘천'], ['Z586', '평택세교'], ['Z607', '용인처인모바일'],
  ['Z608', '권선'], ['Z617', '안양본'], ['Z619', '수원'], ['Z621', '동탄'],
  ['Z624', '강릉'], ['Z640', '단계'], ['Z663', '하남미사'], ['Z666', '용인기흥'],
  ['ZH35', '롯데평촌'], ['ZH36', '롯데수원'], ['ZH57', '현대판교'], ['ZH64', '신세계사우스시티'],
  ['ZH73', 'AK수원'], ['ZH74', 'AK평택'], ['ZH75', 'AK원주'], ['ZH77', '신세계하남'],
  ['ZH96', '갤러리아광교'], ['ZH97', 'AK분당모바일'], ['ZHA1', '롯데동탄'], ['ZHA2', '롯데동탄모바일'],
  ['ZHB4', '타임빌라스수원'], ['ZIN5', '남양모바일'], ['ZMF6', '이마트안양'], ['ZR42', '기흥캠퍼스모바일'],
  ['ZR60', '화성캠퍼스모바일'], ['ZR65', '수원삼성전기모바일'], ['ZR78', '광명기아자동차모바일'], ['ZRA0', '화성DSR모바일'],
  ['ZRD0', '미래기술캠퍼스모바일'], ['ZRD2', '디지털시티2모바일'], ['ZRE0', '용인에버랜드모바일'], ['ZRE4', '평택캠퍼스모바일'],
  ['ZRE6', '기흥삼성SDI모바일'], ['ZRF7', '현대기아차연구소모바일'], ['ZRF8', '판교SDS모바일'], ['ZRF9', '기흥SDR모바일'],
  ['ZRG1', 'KGM평택모바일']
];

/* ── 매장이 속한 시·군 ────────────────────────────────────────────
 * 2026-08-31 사장님 지시: *"매장별 후기현황은 지역별로 모아주시고 전점이 다 나와야 합니다"*.
 *
 * **`lib/stores.ts` 에는 지역 칸이 없어 이름에서 만들었다.** 근거는 CLAUDE.md 의
 * 「매장 → 도시 대응」 표다. 65곳이 **빠짐없이** 16개 시·군으로 갈리는 것을 세어서
 * 확인했다(`.scratch/_region.mjs` — 하나라도 못 갈리면 그 자리에서 멈춘다).
 *
 * **이름이 아니라 점코드를 키로 쓴다** — 매장 이름이 바뀌어도 안 깨진다.
 * 이름으로 유추하기 어려운 넷은 근거가 이렇다: 갤러리아광교·디지털시티·미래기술캠퍼스는
 * **수원 영통구**, 신세계사우스시티는 **용인 기흥**, 현대기아차연구소·남양은
 * **화성 남양읍**, 판교SDS는 **성남 판교**다. */
var REGION = {
  'ZN01': '경기 수원',
  'ZHA7': '경기 성남',
  'Z279': '경기 오산',
  'Z047': '경기 용인',
  'Z150': '강원 강릉',
  'Z205': '강원 원주',
  'Z206': '강원 춘천',
  'Z227': '강원 속초',
  'Z243': '경기 평택',
  'Z324': '경기 성남',
  'Z343': '경기 수원',
  'Z378': '경기 광주',
  'Z383': '경기 안성',
  'Z398': '경기 평택',
  'Z399': '경기 이천',
  'Z405': '경기 안양',
  'Z418': '경기 안양',
  'Z426': '경기 용인',
  'Z451': '경기 수원',
  'Z509': '경기 수원',
  'Z539': '경기 수원',
  'Z541': '경기 광명',
  'Z557': '경기 성남',
  'Z567': '경기 성남',
  'Z579': '강원 원주',
  'Z583': '강원 춘천',
  'Z586': '경기 평택',
  'Z607': '경기 용인',
  'Z608': '경기 수원',
  'Z617': '경기 안양',
  'Z619': '경기 수원',
  'Z621': '경기 화성',
  'Z624': '강원 강릉',
  'Z640': '강원 원주',
  'Z663': '경기 하남',
  'Z666': '경기 용인',
  'ZH35': '경기 안양',
  'ZH36': '경기 수원',
  'ZH57': '경기 성남',
  'ZH64': '경기 용인',
  'ZH73': '경기 수원',
  'ZH74': '경기 평택',
  'ZH75': '강원 원주',
  'ZH77': '경기 하남',
  'ZH96': '경기 수원',
  'ZH97': '경기 성남',
  'ZHA1': '경기 화성',
  'ZHA2': '경기 화성',
  'ZHB4': '경기 수원',
  'ZIN5': '경기 화성',
  'ZMF6': '경기 안양',
  'ZR42': '경기 용인',
  'ZR60': '경기 화성',
  'ZR65': '경기 수원',
  'ZR78': '경기 광명',
  'ZRA0': '경기 화성',
  'ZRD0': '경기 수원',
  'ZRD2': '경기 수원',
  'ZRE0': '경기 용인',
  'ZRE4': '경기 평택',
  'ZRE6': '경기 용인',
  'ZRF7': '경기 화성',
  'ZRF8': '경기 성남',
  'ZRF9': '경기 용인',
  'ZRG1': '경기 평택'
};

/* ── 영업스케치 지역 편성 ──────────────────────────────────────────
 * 2026-08-31 사장님 지시: *"지역을 경원영업팀 기준으로 압축해 주면 됩니다. 참고할 곳은
 * 영업스케치를 참고해 주세요"*.
 *
 * **원문은 구글드라이브 「영업스케치」 스프레드시트의 스키마 셀이다** —
 * `{"regions":["강원","성남","수원","안양","용인","평택"], "stores":[{code,label,region,…}]}`.
 * 시트 id `1o_KRZZriO5ahrKrtpWpSHxTS-P0LsoXDSMwi-ammbCQ`.
 *
 * **짐작으로 묶지 말 것 — 지리가 아니라 영업 편성이다.** 이름으로 추정했더니 8곳 넘게
 * 틀렸다: 광주·이천증포·하남미사·신세계하남이 **성남**이고, 동탄·롯데동탄·남양모바일·
 * 화성캠퍼스·미래기술캠퍼스·현대기아차연구소가 **용인**이다(지도로는 화성·수원 쪽인데도).
 *
 * **롯데분당(ZH32)은 넣지 않는다 — 폐점이다**(2026-08-31 사장님 확인). 영업스케치에는
 * 아직 남아 있어 그 시트를 다시 옮길 때 딸려 오기 쉽다. 여기 적어 두어 눈에 띄게 한다.
 *
 * **롯데동탄모바일(ZHA2)만 영업스케치에 없다** — 같은 건물의 롯데동탄(ZHA1)이 용인이라
 * 그것을 따랐다. 짐작이 아니라 같은 건물이라는 사실에 기댄 것이고, 다르면 이 줄을 고친다.
 *
 * **★ 시트가 틀린 곳이 둘 있어 고쳐 담았다**(2026-08-31 사장님 정정:
 * *"화성DSR모바일 용인이고 미래기술캠퍼스는 수원이 맞습니다"*):
 *
 *   | 매장 | 시·군 | 시트 | **실제** |
 *   |---|---|---|---|
 *   | 화성DSR모바일 `ZRA0` | 화성 | 수원 | **용인** |
 *   | 미래기술캠퍼스모바일 `ZRD0` | 수원 | 용인 | **수원** |
 *
 * **이 둘은 「시·군 ↔ 지역이 1:1인가」 검사에 걸린 바로 그 둘이다.** 어긋난 매장이
 * 정확히 둘이었고 둘 다 시트가 틀린 것이었다 — **어긋남 자체가 신호였다.**
 * 영업스케치 시트를 다시 옮길 때 이 둘이 되살아나기 쉬우니 여기 적어 둔다.
 * 검사는 `.scratch/_sketch2.mjs` 가 다시 돌려 준다(어긋나면 이름을 찍는다).
 *
 * 65곳이 빠짐없이 갈리는 것을 세어서 확인했다(`.scratch/_sketch2.mjs`).
 * 수원 14 · 용인 16 · 성남 11 · 강원 9 · 평택 8 · 안양 7.
 */
var AREA = {
  'ZN01': '수원',     /* 스타필드수원 */
  'ZHA7': '성남',     /* 현대판교모바일 */
  'Z279': '평택',     /* 오산 */
  'Z047': '용인',     /* 수지 */
  'Z150': '강원',     /* 강릉옥천 */
  'Z205': '강원',     /* 단구 */
  'Z206': '강원',     /* 석사 */
  'Z227': '강원',     /* 속초 */
  'Z243': '평택',     /* 평택 */
  'Z324': '성남',     /* 분당 */
  'Z343': '수원',     /* 북수원 */
  'Z378': '성남',     /* 광주 */
  'Z383': '평택',     /* 안성 */
  'Z398': '평택',     /* 평택고덕 */
  'Z399': '성남',     /* 이천증포 */
  'Z405': '안양',     /* 평촌 */
  'Z418': '안양',     /* 안양모바일 */
  'Z426': '용인',     /* 용인구성 */
  'Z451': '수원',     /* 서수원 */
  'Z509': '수원',     /* 영통 */
  'Z539': '수원',     /* 디지털시티모바일 */
  'Z541': '안양',     /* 광명소하 */
  'Z557': '성남',     /* 성남 */
  'Z567': '성남',     /* AK분당 */
  'Z579': '강원',     /* 원주 */
  'Z583': '강원',     /* 춘천 */
  'Z586': '평택',     /* 평택세교 */
  'Z607': '용인',     /* 용인처인모바일 */
  'Z608': '수원',     /* 권선 */
  'Z617': '안양',     /* 안양본 */
  'Z619': '수원',     /* 수원 */
  'Z621': '용인',     /* 동탄 */
  'Z624': '강원',     /* 강릉 */
  'Z640': '강원',     /* 단계 */
  'Z663': '성남',     /* 하남미사 */
  'Z666': '용인',     /* 용인기흥 */
  'ZH35': '안양',     /* 롯데평촌 */
  'ZH36': '수원',     /* 롯데수원 */
  'ZH57': '성남',     /* 현대판교 */
  'ZH64': '용인',     /* 신세계사우스시티 */
  'ZH73': '수원',     /* AK수원 */
  'ZH74': '평택',     /* AK평택 */
  'ZH75': '강원',     /* AK원주 */
  'ZH77': '성남',     /* 신세계하남 */
  'ZH96': '수원',     /* 갤러리아광교 */
  'ZH97': '성남',     /* AK분당모바일 */
  'ZHA1': '용인',     /* 롯데동탄 */
  'ZHA2': '용인',     /* 롯데동탄모바일 — 스케치에 없어 형제 매장을 따름 */
  'ZHB4': '수원',     /* 타임빌라스수원 */
  'ZIN5': '용인',     /* 남양모바일 */
  'ZMF6': '안양',     /* 이마트안양 */
  'ZR42': '용인',     /* 기흥캠퍼스모바일 */
  'ZR60': '용인',     /* 화성캠퍼스모바일 */
  'ZR65': '수원',     /* 수원삼성전기모바일 */
  'ZR78': '안양',     /* 광명기아자동차모바일 */
  'ZRA0': '용인',     /* 화성DSR모바일 */
  'ZRD0': '수원',     /* 미래기술캠퍼스모바일 */
  'ZRD2': '수원',     /* 디지털시티2모바일 */
  'ZRE0': '용인',     /* 용인에버랜드모바일 */
  'ZRE4': '평택',     /* 평택캠퍼스모바일 */
  'ZRE6': '용인',     /* 기흥삼성SDI모바일 */
  'ZRF7': '용인',     /* 현대기아차연구소모바일 */
  'ZRF8': '성남',     /* 판교SDS모바일 */
  'ZRF9': '용인',     /* 기흥SDR모바일 */
  'ZRG1': '평택'     /* KGM평택모바일 */
};

/**
 * **화면 맨 위 묶음 = 영업스케치 지역**(2026-08-31 사장님 확정).
 *
 * 위 `AREA` 가 그 편성이다. 한때 시·도(경기·강원) 둘로 묶었는데, 그것은 편성을
 * 받기 전의 임시였다 — **지금은 사장님이 주신 6개 지역이 기준이다.**
 * 함수 이름은 `sido_` 그대로 둔다(부르는 곳이 여럿이라 이름만 바꾸면 얻는 것 없이
 * 위험만 는다 — `TEST_STORE_CODE` 를 그대로 둔 것과 같은 판단).
 *
 * **2단인 이유** — 지역 6개 아래 시·군을 소제목으로 둔다. 수원지역이 21곳이라
 * 한 줄로 늘어놓으면 못 읽고, 시·군이 있어야 상담사가 자기 매장을 빨리 찾는다.
 * **전점 65곳은 그대로 다 보인다**(앞선 지시).
 */
function sido_(code) {
  return AREA[code] || "기타";
}

/* ── 이름이 전국에 겹치는 매장은 **검색어를 좁힌다** ──
 * 「광주」는 배제어로 못 푼다. 실측 16건이 **전부 광주광역시**였고(신세계광주·풍암·
 * 광천·진월효천·김대중컨벤션센터) 그중 절반은 본문 어디에도 광주광역시 표시가 없다.
 * 반면 `삼성스토어 경기광주` 로 물으면 9건이 전부 진짜다 — **글쓴이들이 스스로
 * 「경기광주」라고 적는다.** 자기도 헷갈릴 걸 알기 때문이다.
 * 규칙을 정교하게 만드는 것보다 **질의를 고치는 쪽**이 원인에 가까웠다. */
var QUERY = { '광주': '삼성스토어 경기광주' };
var MATCH = { '광주': '경기광주' };

/* ── 질의를 쪼개 더 받는다 ────────────────────────────────────────
 * 2026-08-31 사장님 질문: *"후기수집이 1459건외에 더 없나요?"* — **훨씬 더 있다.**
 *
 * 네이버는 **한 질의당 약 200건까지만** 준다(start=201 부터 0건, 실측). 그런데
 * `갤러리아광교` 는 카페 total 이 **1,579건**이다 — 한 질의로는 손도 못 댄다.
 *
 * **꼬리말을 붙여 여러 질의로 물으면 각각 200건씩 받힌다.** 실측(갤러리아광교):
 *   질의 1개 400건 → 10개 **1,340건(3.4배)**. 겹치는 것은 링크로 걸러진다.
 *
 * **꼬리말은 지어내지 않고 실제 1,459건에서 센 유형 낱말이다**(혼수 54% · 구매 32% ·
 * 행사 29% · 입주 15%). 그래서 **유형 분류와 같은 말**을 쓴다 — 어느 질의로 잡혔는지가
 * 곧 유형의 힌트가 된다.
 *
 * **효과가 작은 꼬리말은 넣지 않았다** — `박람회` 는 +6건뿐이었다(실측).
 */
var TAILS = ['', ' 혼수', ' 신혼가전', ' 입주', ' 설치', ' 구매', ' 상담', ' 견적'];

/* ── 관심 카페 ────────────────────────────────────────────────────
 * 2026-08-31 사장님 지시: *"경원영업팀 바이럴분석 에 카페추가해주세요
 * 1.레몬테라스, 2.웨딩북, 3.요즘웨딩"*.
 *
 * **매장별로 돌지 않는다.** 질의에 카페 이름을 넣으면 그 카페 글이 걸린다 —
 * 실측으로 `레몬테라스 삼성` 은 100건 중 **93건**이 그 카페였다. 그래서 카페당
 * 몇 번만 물으면 **65개 매장이 한꺼번에** 잡히고, 어느 매장 글인지는 기존
 * `hasStore_` 가 그대로 가른다(매장 × 카페로 돌면 195회가 더 든다).
 *
 * **`웨딩북` 은 여기 없다 — 네이버 카페가 아니다.** `웨딩북 삼성` 100건에 그 이름이
 * **0건**이었고, 실제로는 별도 플랫폼(weddingbook.com)이다. 목록에 넣어 두면 늘
 * 0건으로 남아 *"글이 없다"* 로 읽히므로 **넣지 않고 화면이 그 사실을 적는다**
 * (「없음」과 「확인 못 함」을 가르는 이 저장소의 규칙과 같다).
 *
 * **다만 「받을 수 없다」는 아니다**(2026-08-31 조사). 리뷰 API 가 열려 있고
 * (`app.wdgbook.com/v4/reviews/partners/{uuid}`) 인증도 없어 `UrlFetchApp` 으로 받힌다
 * — 브라우저가 붙이는 `Origin` 만 없으면 200 이다(붙이면 403 이니 **넣지 말 것**).
 * 안 붙인 이유는 **실익이다**: 파트너 6,223곳 전수에서 삼성스토어가 24곳인데
 * **경원 관할은 갤러리아광교 한 곳(리뷰 18건)** 뿐이고 나머지 11개 시·강원 전역은 0곳이다.
 * 리뷰가 몰린 브랜드 대표계정(724건)은 **지점 정보가 없어** 매장별 분석에 못 쓴다.
 * **키워드 검색으로 판정하지 말 것** — `keyword=수원` 은 삼성 0곳을 준다(광교점 이름에
 * '수원'이 없다). 디렉터리를 훑어야 한다. 자세한 것은 `.scratch/weddingbook-probe.md`.
 *
 * 실측(2026-08-31) — 레몬테라스 673건 받아 **우리 매장 11건** · 요즘웨딩 800건 받아
 * **3건**, 열넷 다 그때까지 없던 글이었다.
 */
var CAFES = ['레몬테라스', '요즘웨딩'];
var CAFE_TAILS = ['삼성스토어', '삼성스토어 혼수', '삼성 가전 후기', '삼성디지털프라자'];

/* 화면의 「관심 카페」 — 사장님이 지목한 곳은 **건수가 적어도 늘 보여야 한다.**
   상위 12곳 막대에는 2~3건짜리가 영영 안 올라와, 넣어 달라고 한 카페가 화면에서
   사라진다. `naver:false` 는 이 수집기가 못 닿는 곳이라 **0 을 적지 않고 그 이유를 적는다.** */
var WATCH = [
  { name: '다이렉트 결혼준비', naver: true },
  { name: '메이크마이웨딩', naver: true },
  { name: '레몬테라스', naver: true },
  { name: '요즘웨딩', naver: true },
  { name: '웨딩북', naver: false, tag: '미포함', why: '네이버 카페가 아니라 별도 플랫폼(weddingbook.com)입니다. 리뷰 API 는 열려 있어 받을 수는 있으나, 파트너 6,223곳 전수에서 삼성스토어 24곳 중 경원 관할은 갤러리아광교 한 곳(리뷰 18건)뿐이라 아직 붙이지 않았습니다.' }
];

/* 지면에서 실제로 본 브랜드 표기만 넣는다. '삼성프라자'·'디지털프라자' 는 옛 이름인데
   카페 글에 살아 있다("예전에는 삼성프라자라고 더 익숙하게 부르는 분들도 있던데"). */
var BRANDS = ['삼성스토어', '삼성디지털프라자', '디지털프라자', '삼성프라자'];

/* **축구단을 걸러낸다** — `수원삼성` 은 프로축구단이고 `블루윙즈스토어` 라는 굿즈샵이
   있다. `수원삼성` + `스토어` 가 붙어 판정을 통과했다(실측 2건). 검색해 보기 전엔
   있는 줄도 몰랐던 함정이다. */
var NOISE = ['블루윙즈', '수원fc', '직관', '굿즈', '앤썸', 'md스토어', '축구', 'k리그'];

/* 백화점·몰 꼬리표. 같은 지역에 일반점과 체인점이 **둘 다** 있을 때 가르는 데 쓴다. */
var CHAINS = ['ak', '롯데', '신세계', '스타필드', '타임빌라스', '갤러리아', '이마트', '현대'];

/* ── 후기 유형 ────────────────────────────────────────────────────
 * 2026-08-31 사장님 요청: *"혼수후기인지 입주후기인지 구매후기인지 설치후기인지
 * 후기들은 분석해서 유형별로 구분될수있도록"*.
 *
 * **낱말은 지어내지 않고 실제 1,459건에서 세어 뽑았다.** 실측 비율 —
 * 혼수 54% · 구매 32% · 행사 29% · 입주 15% · 설치 3% · AS 2% · 안 걸림 17%.
 *
 * **순서가 규칙이다.** 703건이 여러 유형에 걸린다(「신혼가전 구매 후기」는 혼수이자
 * 구매다). 위에서부터 처음 걸리는 하나를 쓰되 **가장 특이한 것을 앞에** 둔다.
 * `구매` 는 어디에나 나오는 말이라 **맨 뒤**다 — 앞에 두면 전부 구매가 된다.
 *
 * **못 가른 것은 「기타」로 남긴다.** 그럴듯한 쪽에 밀어 넣지 않는다 — 이 저장소가
 * 되풀이해 지킨 규칙이다(짐작해 채우면 화면이 거짓말을 한다).
 */
var KINDS = [
  ['혼수', ['혼수', '신혼', '결혼준비', '예신', '예랑', '웨딩', '가전졸업', '졸업']],
  ['입주', ['입주', '이사', '신축', '집들이', '분양', '사전점검']],
  ['설치', ['설치', '배송', '기사님', '시공', '철거', '이전설치']],
  ['AS',   ['as', '수리', '서비스센터', '고장', '점검']],
  /* 행사 — 「오픈매장」·「Grand Open」·「리뉴얼」·「데이코 입점」이 기타에 몰려 있었다 */
  ['행사', ['박람회', '이벤트', '행사', '오픈', 'open', '리뉴얼', '입점', '세일', '할인',
            '특가', '특별전', '기획전', '프로모션', '초대권', '사전예약']],
  /* 추천 — 매장·직원을 칭찬하는 글. 바이럴에서 값어치가 가장 큰 갈래라 따로 센다 */
  ['추천', ['매니저님', '부점장님', '점장님', '판매명장', '추천', '칭찬', '감사', '친절']],
  /* 모바일 — 안 걸린 254건에 「핸드폰 산 후기」·「폴드8 실물」이 많았다(실측).
     **'모바일' 그 말 자체가 빠져 있어** 「…미래기술캠퍼스 모바일」이 기타로 샜다 */
  ['모바일', ['모바일', '핸드폰', '갤럭시', '폴드', '플립', '스마트폰', '휴대폰',
              '버즈', '워치', '태블릿', '민팃']],
  ['구매', ['구매', '구입', '계약', '견적', '상담', '결제', '내돈내산', '후기',
            '장만', '질렀', '가전완료', '해결했']]
];

/** 제목·카페 이름을 보고 유형 하나를 고른다. 못 가르면 '기타'. */
function kindOf_(text) {
  var t = norm_(text), i, j;
  for (i = 0; i < KINDS.length; i++) {
    var ws = KINDS[i][1];
    for (j = 0; j < ws.length; j++) if (t.indexOf(norm_(ws[j])) >= 0) return KINDS[i][0];
  }
  return '기타';
}

/* ── 판정 ──────────────────────────────────────────────────────
 * **여기가 이 기능의 전부다.** 네이버 검색은 따옴표를 강제하지 않아(따옴표 유무로
 * 결과가 같았다) `total` 을 그대로 믿으면 안 된다 — 실측으로 `삼성스토어 수원` 340건
 * 중 진짜는 3건이었고, 나머지는 청담점·AK수원·북수원·축구단 굿즈샵이었다.
 * **0건보다 나쁜 것이 「조용히 틀린 답」이다.** */

function norm_(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')      /* <b> 강조 태그 */
    .replace(/&[a-z]+;/g, ' ')    /* &quot; 등 */
    .replace(/\s+/g, '')          /* 띄어쓰기 무시 — '삼성 스토어' 로 띄어 쓴 글이 있다 */
    .toLowerCase();
}

/* 매장명이 브랜드와 **붙어** 나와야 한다. 앞뒤 어느 쪽이든 좋다 —
   실측에서 '삼성스토어 북수원' 과 '북수원 삼성스토어' 가 둘 다 나왔다. */
function hasStore_(text, name) {
  var t = norm_(text), n = norm_(name), i, b;
  for (i = 0; i < BRANDS.length; i++) {
    b = norm_(BRANDS[i]);
    if (t.indexOf(b + n) >= 0 || t.indexOf(n + b) >= 0) return true;
  }
  return false;
}

function isNoise_(text) {
  var t = norm_(text), i;
  for (i = 0; i < NOISE.length; i++) if (t.indexOf(norm_(NOISE[i])) >= 0) return true;
  return false;
}

/* 다른 매장 얘기인가. 두 갈래로 본다:
   ① 더 긴 이름이 브랜드와 붙어 나오면 그쪽 것이다 — '수원' 30건 중 9건이 'AK수원'·
      '북수원'·'스타필드수원'·'타임빌라스수원' 이었다.
   ② 꼬리표가 매장명 **근처**에 있으면 그 체인점 것이다 — `삼성 스토어 평택 ak점` 은
      붙여 쓰지 않아 ①에 안 걸린다.
   **자기 이름에 이미 꼬리표가 있으면 ②를 걸지 않는다** — 안 그러면 `AK분당` 이
   `서현 ak분당 삼성스토어 후기`(자기 매장 진짜 후기)를 남에게 넘겨 **60건이 2건이 된다.**
   막는 쪽만 보고 고치면 이 반대쪽 실패가 난다(실제로 한 번 그렇게 무너뜨렸다). */
function belongsToOther_(text, name, allNames) {
  var t = norm_(text), n = norm_(name), i, j, o, c, m, pairExists, at, around;
  for (i = 0; i < allNames.length; i++) {
    o = allNames[i];
    if (o !== name && norm_(o).indexOf(n) >= 0 && hasStore_(text, o)) return true;
  }
  for (i = 0; i < CHAINS.length; i++) if (n.indexOf(norm_(CHAINS[i])) >= 0) return false;
  for (i = 0; i < CHAINS.length; i++) {
    c = norm_(CHAINS[i]);
    pairExists = false;
    for (j = 0; j < allNames.length; j++) {
      m = norm_(allNames[j]);
      if (allNames[j] !== name && m.indexOf(c) >= 0 && m.indexOf(n) >= 0) { pairExists = true; break; }
    }
    if (!pairExists) continue;
    at = t.indexOf(n);
    if (at < 0) continue;
    around = t.substring(Math.max(0, at - 6), at + n.length + 6);
    if (around.indexOf(c) >= 0) return true;
  }
  return false;
}

/* ── 수집 ────────────────────────────────────────────────────── */

function props_() { return PropertiesService.getScriptProperties(); }

function today_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }

/**
 * 오늘 쓴 호출 수. **날짜가 바뀌면 저절로 0 이다** — 자정에 지우는 트리거를 따로 두면
 * 그것이 실패했을 때 한도가 영영 안 풀린다. 저장된 날짜와 오늘을 견주는 편이 안전하다.
 */
function usage_() {
  var d = today_(), n = 0;
  var raw = props_().getProperty('_dayUsage');
  if (raw) {
    try { var o = JSON.parse(raw); if (o && o.d === d) n = Number(o.n) || 0; } catch (e) {}
  }
  return { d: d, n: n };
}
function addUsage_(k) {
  var u = usage_();
  u.n += Number(k) || 0;
  props_().setProperty('_dayUsage', JSON.stringify(u));
  return u.n;
}
function dailyLimit_() {
  var v = Number(props_().getProperty('_dailyLimit'));
  return v > 0 ? v : DEFAULT_DAILY_LIMIT;
}

/**
 * 화면에서 한도를 바꾼다(2026-08-31 사장님 요청).
 *
 * **0 이나 빈 값을 저장하지 않는다** — 그러면 영영 못 모으는데 화면에는 「한도 0」이라고만
 * 뜬다. 위도 막는다: 한 바퀴가 2,096회라 그보다 훨씬 큰 값을 넣으면 한도를 둔 뜻이 없다.
 * **막는 이유를 함께 돌려준다** — 왜 안 되는지 모르면 사장님이 같은 값을 또 넣는다.
 */
function setDailyLimit(n) {
  n = Math.floor(Number(n));
  if (!(n >= 100)) return { ok: false, error: '한도는 100회 이상이어야 합니다.' };
  if (n > 50000) return { ok: false, error: '한도는 50,000회 이하로 정해 주세요.' };
  props_().setProperty('_dailyLimit', String(n));
  var u = usage_();
  return { ok: true, limit: n, used: u.n, sweep: SWEEP_CALLS };
}

/**
 * **키를 읽을 때 앞뒤 공백을 떼어 낸다.**
 * 스크립트 속성에 붙여넣다 보면 줄바꿈·공백이 딸려 들어가는데, 그러면 헤더 값이
 * 달라져 **401 이 난다.** 값은 멀쩡해 보이므로 화면으로는 영영 알 수 없다.
 * (이 저장소가 관리자 비밀번호에서 이미 겪은 그 종류다 — *"붙여넣다 섞이는 것을
 * 걷어낸다: 앞뒤 공백, 감싸는 따옴표"*.)
 */
function key_(name) {
  var v = props_().getProperty(name);
  return v == null ? '' : String(v).replace(/^[\s"']+|[\s"']+$/g, '');
}

/**
 * **키가 제대로 들어왔는지 스크립트가 스스로 말한다** — `?diag=1`.
 *
 * 2026-08-31 사장님이 키를 넣으셨는데도 401 이 계속 났다. 같은 키가 로컬에서는
 * 200 을 받으므로 **키가 아니라 Apps Script 가 그 값을 못 읽는 것**인데, 화면만
 * 봐서는 이름 오타인지 「사용자 속성」에 넣은 것인지 공백이 섞인 것인지 가릴 수 없다.
 * **값 자체는 절대 내보내지 않는다** — 길이와 앞 3글자만 보인다.
 */
function diag_() {
  var sp = PropertiesService.getScriptProperties().getProperties();
  var up = {};
  try { up = PropertiesService.getUserProperties().getProperties(); } catch (e) { /* 무시 */ }
  var peek = function (bag, k) {
    var v = bag[k];
    if (v == null) return '없음';
    var s = String(v);
    return '길이 ' + s.length + ' · 앞 3글자 "' + s.slice(0, 3) + '"'
      + (s !== s.trim() ? ' · **앞뒤 공백 있음**' : '');
  };
  return {
    스크립트속성_이름들: Object.keys(sp),
    사용자속성_이름들: Object.keys(up),
    NAVER_CLIENT_ID: peek(sp, 'NAVER_CLIENT_ID'),
    NAVER_CLIENT_SECRET: peek(sp, 'NAVER_CLIENT_SECRET'),
    사용자속성에_들어갔나: {
      NAVER_CLIENT_ID: peek(up, 'NAVER_CLIENT_ID'),
      NAVER_CLIENT_SECRET: peek(up, 'NAVER_CLIENT_SECRET')
    },
    지금_읽히는_값: { id: key_('NAVER_CLIENT_ID').length, secret: key_('NAVER_CLIENT_SECRET').length },
    참고: 'ID 는 10 자, SECRET 은 40 자여야 한다. 값 자체는 내보내지 않는다.'
  };
}

function search_(kind, query, start) {
  var id = key_('NAVER_CLIENT_ID'), sec = key_('NAVER_CLIENT_SECRET');
  if (!id || !sec) throw new Error('스크립트 속성에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 넣어 주세요.');
  /* **한 번에 100건씩 받는다**(2026-08-31 사장님 지적 — *"총 후기가 1459건밖에 안 되나요?
     모든 후기기록을 다 찾아서 업데이트해주세요"*).
     처음에는 30 건이었는데 `북수원` 만 해도 카페 total 이 128 건이라 **한참 덜 모았다.**
     실측: display 상한은 **100**(200 은 HTTP 400) · `start` 로 넘기면 **약 200 건까지**
     받힌다(start=201 부터 0건). 그래도 옛 30 건의 6.7 배다. */
  var url = API_BASE + '/' + kind + '?query=' + encodeURIComponent(query)
    + '&display=' + PAGE_SIZE + '&start=' + (start || 1) + '&sort=date';
  var res = UrlFetchApp.fetch(url, {
    headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': sec },
    muteHttpExceptions: true
  });
  /* **응답 본문까지 남긴다.** 상태 코드만 적으면 401 의 원인을 못 가른다 —
     NCP 는 두 경우를 갈라 말해 준다(실측):
       `Authentication information are missing` → **헤더가 안 실렸다**(빈 값)
       `Invalid authentication information`      → **값이 틀렸다**
     이 한 줄이 없어서 401 을 세 번 헛짚었다. */
  if (res.getResponseCode() !== 200) {
    var body = String(res.getContentText() || '').replace(/\s+/g, ' ').slice(0, 160);
    return { items: [], error: 'HTTP ' + res.getResponseCode() + ' ' + body };
  }
  try { return JSON.parse(res.getContentText()); } catch (e) { return { items: [], error: 'parse' }; }
}

function sheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  if (s.getLastRow() === 0) s.appendRow(header);
  return s;
}

/**
 * 하루 1회 도는 수집기. **트리거가 부른다** — 손으로 눌러도 된다.
 *
 * **중복은 링크 URL 로 막는다.** 같은 글이 매일 검색에 잡히므로 이것이 없으면
 * 누적이 매일 부풀어 오른다.
 *
 * **일간·주간·월간은 「발견일」 기준이다.** 카페 검색 결과에는 **작성일이 아예 없다**
 * (블로그만 `postdate` 를 준다). 그래서 우리가 **처음 본 날**을 기준으로 센다 —
 * 매일 돌면서 새로 잡힌 것만 더하므로 *"그날 새로 발견된 후기"* 라는 정직한 뜻이 된다.
 * 블로그는 작성일도 함께 담아 화면이 둘을 갈라 보여준다. **작성일인 척하지 않는다.**
 */
/**
 * **한 번에 다 못 돈다 — 이어서 돈다.**
 *
 * 질의를 8 갈래로 쪼개니(TAILS) 매장당 8×2소스×2쪽 = **32 회**, 65곳이면 **2,080 회**다.
 * Apps Script 는 한 번에 **6분**까지만 도는데 그 안에 못 끝난다.
 *
 * 그래서 **어디까지 했는지 기억했다가 이어서 돈다**(`_cursor` 스크립트 속성).
 * 시간이 다 되면 그 자리에서 멈추고 다음 실행이 이어받는다 — 하루 1회 트리거가
 * 여러 번 돌아도, 화면에서 몇 번 더 눌러도 결국 한 바퀴를 마친다.
 * **`done:true` 가 나오면 한 바퀴가 끝난 것**이고 커서는 처음으로 돌아간다.
 */
function collectReviews() {
  var itemSheet = sheet_(SHEET_ITEMS, HEADER);
  var seen = {}, i, k, n;
  var t0 = Date.now();
  var BUDGET_MS = 4.5 * 60 * 1000;      /* 6분 한도에서 여유를 둔다 — 시트 쓰기 시간이 남아야 한다 */
  var cursor = Number(props_().getProperty('_cursor') || 0);
  if (!(cursor >= 0) || cursor >= STORES.length) cursor = 0;
  if (itemSheet.getLastRow() > 1) {
    var links = itemSheet.getRange(2, 6, itemSheet.getLastRow() - 1, 1).getValues();
    for (i = 0; i < links.length; i++) seen[String(links[i][0])] = true;
  }

  var allNames = [];
  for (i = 0; i < STORES.length; i++) allNames.push(STORES[i][1]);

  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var calls = 0, got = 0, kept = 0, add = [], err = '';
  var kinds = ['blog', 'cafearticle'];

  /* **일일 한도를 여기서 한 번만 읽는다**(2026-08-31 사장님 요청).
     호출마다 속성을 읽으면 2,000번을 읽는 셈이라 느려지고, 무엇보다 **세는 곳이 둘이 되면
     두 숫자가 갈라진다.** 남은 몫은 `limit - used0 - calls` 하나로만 판단한다. */
  var limit = dailyLimit_(), used0 = usage_().n, hitLimit = false;
  var over = function () { return used0 + calls >= limit; };

  var stopped = false;
  for (i = cursor; i < STORES.length; i++) {
    /* **시간이 다 되면 그 자리에서 멈춘다** — 다음 실행이 여기서 이어받는다 */
    if (Date.now() - t0 > BUDGET_MS) { cursor = i; stopped = true; break; }
    /* **한도도 같은 방식으로 멈춘다.** 커서를 남기므로 내일 이 매장부터 이어 간다 —
       한도에 걸렸다고 처음부터 다시 돌면 뒤쪽 매장은 영영 못 훑는다. */
    if (over()) { cursor = i; stopped = true; hitLimit = true; break; }
    var code = STORES[i][0], name = STORES[i][1];
    var base = QUERY[name] || ('삼성스토어 ' + name);
    var mname = MATCH[name] || name;
    /* **질의를 쪼개 여러 번 묻는다** — 한 질의는 200건이 상한이라 큰 매장을 다 못 받는다 */
    for (var ti = 0; ti < TAILS.length; ti++) {
    var query = base + TAILS[ti];
    for (k = 0; k < kinds.length; k++) {
      /* **여러 쪽을 돈다** — 한 쪽(100건)으로는 total 이 큰 매장을 다 못 받는다 */
      for (var page = 0; page < MAX_PAGES; page++) {
        /* 한 매장이 최대 32회(2종 x 꼬리말 8 x 2쪽)를 쓴다 — 매장 단위로만 보면
           한도를 그만큼 넘길 수 있어 호출 직전에도 본다 */
        if (over()) { hitLimit = true; stopped = true; cursor = i; break; }
        var j;
        try { j = search_(kinds[k], query, page * PAGE_SIZE + 1); calls++; }
        catch (e) { err = String(e); break; }
        if (j.error) { err = kinds[k] + ':' + j.error; break; }
        var items = j.items || [];
        if (!items.length) break;                      /* 더 없으면 다음 쪽을 안 두드린다 */
        for (n = 0; n < items.length; n++) {
          var it = items[n];
          got++;
          var text = (it.title || '') + ' ' + (it.description || '');
          if (!hasStore_(text, mname)) continue;
          if (isNoise_(text)) continue;
          if (belongsToOther_(text, mname, allNames)) continue;
          kept++;
          var link = String(it.link || '');
          if (!link || seen[link]) continue;
          seen[link] = true;
          var post = String(it.postdate || '');
          add.push([
            /* **날짜는 「작성일」이 먼저다**(2026-08-31 사장님 지적 — *"후기가 올라온
               날짜로 맞춰주세요. 시스템은 지금 만들었지만 후기가 모두 오늘 올라온 게
               아닙니다"*). 블로그는 `postdate` 를 준다(YYYYMMDD).
               **카페는 네이버가 작성일을 아예 안 준다** — 응답 필드가
               `title·link·description·cafename·cafeurl` 다섯뿐이다(실측). 그때만
               발견일로 적고 **화면이 그 사실을 밝힌다.** 있는 척하지 않는다. */
            post.length === 8
              ? post.slice(0, 4) + '-' + post.slice(4, 6) + '-' + post.slice(6, 8)
              : stamp,
            code, name, kinds[k] === 'blog' ? '블로그' : '카페',
            String(it.title || '').replace(/<[^>]+>/g, ''), link,
            String(it.cafename || ''), post,
            stamp,                                     /* 처음 본 날 — 「새로 발견」을 세는 데 쓴다 */
            /* **제목만 본다.** 카페 이름을 넣었더니 다이렉트웨딩 카페의 「설치 후기」가
               카페 이름의 '웨딩' 때문에 「혼수」가 되고, 입주예정자 카페의 「구매 후기」가
               「입주」가 됐다(실물 표본에서 잡았다). **카페 이름은 글쓴이가 고른 말이 아니다.** */
            kindOf_(String(it.title || ''))
          ]);
        }
        if (items.length < PAGE_SIZE) break;           /* 마지막 쪽이다 */
      }
      if (err || hitLimit) break;
    }
    if (err || hitLimit) break;
    }   /* TAILS */
    if (hitLimit) break;
    /* **인증이 막혔으면 첫 실패에서 멈춘다.**
       처음에는 `스크립트 속성` 문구를 던지는 예외만 잡았는데, **HTTP 401 은 예외가
       아니라 정상 응답**이라 130 번을 다 돌았다(2026-08-31 실측: `calls:130 · got:0 ·
       error:"cafearticle:HTTP 401"`). 지금은 무료라 괜찮지만 유료로 바뀌면 헛돈
       130 회가 그대로 요금이 된다. 401·403 은 더 돌아도 결과가 같다. */
    if (err && (err.indexOf('스크립트 속성') >= 0 || err.indexOf('401') >= 0 || err.indexOf('403') >= 0)) break;
  }

  /* ── 관심 카페 훑기 ──────────────────────────────────────────
     **매장 한 바퀴를 다 돈 뒤에만 돈다.** 중간에 끼우면 이어달리기(`_cursor`)가
     매장을 가리키는 뜻을 잃는다. 시간이 모자라면 이번엔 건너뛰고 다음 차례에 한다 —
     이 훑기는 카페당 8회라 짧다. */
  var cafeCalls = 0, cafeAdd = 0;
  if (!stopped && !err) {
    for (var ci = 0; ci < CAFES.length; ci++) {
      if (Date.now() - t0 > BUDGET_MS) break;
      if (over()) { hitLimit = true; break; }
      for (var cti = 0; cti < CAFE_TAILS.length; cti++) {
        var cq = CAFES[ci] + ' ' + CAFE_TAILS[cti];
        for (var cp = 0; cp < MAX_PAGES; cp++) {
          if (over()) { hitLimit = true; break; }
          var cj;
          try { cj = search_('cafearticle', cq, cp * PAGE_SIZE + 1); calls++; cafeCalls++; }
          catch (e2) { err = String(e2); break; }
          if (cj.error) { err = 'cafearticle:' + cj.error; break; }
          var cItems = cj.items || [];
          if (!cItems.length) break;
          for (var cn = 0; cn < cItems.length; cn++) {
            var cit = cItems[cn];
            got++;
            var clink = String(cit.link || '');
            if (!clink || seen[clink]) continue;
            var ctext = (cit.title || '') + ' ' + (cit.description || '');
            if (isNoise_(ctext)) continue;
            /* **어느 매장 글인지는 65곳을 다 대 보고 가른다.** 매장별 질의가 아니라
               카페별 질의라 우리가 미리 아는 매장이 없다 — 판정은 기존 함수 그대로다. */
            for (var cs = 0; cs < STORES.length; cs++) {
              var cName = STORES[cs][1], cMatch = MATCH[cName] || cName;
              if (!hasStore_(ctext, cMatch)) continue;
              if (belongsToOther_(ctext, cMatch, allNames)) continue;
              kept++;
              seen[clink] = true;
              add.push([
                stamp,                                 /* 카페는 네이버가 작성일을 안 준다 */
                STORES[cs][0], cName, '카페',
                String(cit.title || '').replace(/<[^>]+>/g, ''), clink,
                String(cit.cafename || ''), '', stamp,
                kindOf_(String(cit.title || ''))
              ]);
              cafeAdd++;
              break;
            }
          }
          if (cItems.length < PAGE_SIZE) break;
        }
        if (err) break;
      }
      if (err) break;
    }
  }

  /* **쓴 만큼을 한 번에 적는다** — 호출마다 적으면 속성 쓰기가 2,000번이 된다.
     중간에 6분 한도로 끊겨도 이 줄까지는 온다(그 위 루프가 시간을 보고 스스로 멈춘다). */
  if (calls) addUsage_(calls);

  if (add.length) {
    itemSheet.getRange(itemSheet.getLastRow() + 1, 1, add.length, HEADER.length).setValues(add);
  }
  /* **한 바퀴를 마칠 때만 경쟁비교를 함께 돌린다**(최대 40회 · 한 바퀴의 2%).
     중간에 돌리면 같은 날 여러 번 쌓여 어느 것이 그날 값인지 알 수 없다. */
  var rivalRun = null;
  if (!stopped && !err && !over()) { try { rivalRun = collectRival(); } catch (e3) { rivalRun = { error: String(e3) }; } }

  /* 한 바퀴를 마쳤으면 커서를 처음으로 — 다음 실행이 새로 훑는다 */
  if (!stopped) cursor = 0;
  props_().setProperty('_cursor', String(cursor));

  sheet_(SHEET_LOG, LOG_HEADER).appendRow([new Date(), calls, got, kept, add.length, err]);
  return {
    calls: calls, got: got, kept: kept, added: add.length, error: err,
    /* **어디까지 했는지 화면이 알아야 한다** — 안 그러면 *"왜 65곳이 아니라 20곳만 돌았지"*
       가 된다. `done:false` 면 「이어서 수집」을 한 번 더 누르면 된다. */
    done: !stopped, from: cursor, stores: STORES.length,
    at: stopped ? cursor : STORES.length,
    /* 관심 카페 훑기를 실제로 돌았는지 · 몇 건 물었는지. **안 적으면 "왜 레몬테라스가
       안 늘지"를 확인할 길이 없다** — 시간이 모자라 건너뛴 것과 0건인 것은 다른 말이다. */
    cafeCalls: cafeCalls, cafeAdded: cafeAdd, cafes: CAFES.length,
    /* **한도로 멈춘 것과 시간으로 멈춘 것을 가른다** — 「이어서 수집」을 눌러도 되는지가
       다르다(시간이면 지금 눌러도 되고, 한도면 내일이거나 한도를 올려야 한다). */
    hitLimit: hitLimit, dayUsed: used0 + calls, dailyLimit: limit, sweep: SWEEP_CALLS,
    rival: rivalRun
  };
}

/** 하루 1회 새벽 3시 트리거를 건다. **한 번만 실행하면 된다** — 중복은 스스로 지운다. */
function setupTrigger() {
  var t = ScriptApp.getProjectTriggers(), i;
  for (i = 0; i < t.length; i++) {
    if (t[i].getHandlerFunction() === 'collectReviews') ScriptApp.deleteTrigger(t[i]);
  }
  ScriptApp.newTrigger('collectReviews').timeBased().atHour(3).everyDays(1).create();
  return '하루 1회 새벽 3시 트리거를 걸었습니다.';
}

/* ── 집계 ────────────────────────────────────────────────────── */

function readAll_() {
  var s = sheet_(SHEET_ITEMS, HEADER);
  if (s.getLastRow() < 2) return [];
  var v = s.getRange(2, 1, s.getLastRow() - 1, HEADER.length).getValues(), out = [], i;
  /* **시트는 날짜 칸을 `Date` 객체로 돌려준다.** 그대로 문자열로 만들면
     `Mon Aug 31 2026 00:00:00 GMT+0900 (한국 표준시)` 가 화면에 그대로 찍힌다 —
     **CLAUDE.md 가 사용 로그에서 이미 적어 둔 그 함정이다**(그때는 일별 추이 막대가
     전부 0 이었다). **들어오는 자리에서 맞춘다.** */
  var ymd = function (x) {
    if (x instanceof Date) return Utilities.formatDate(x, 'Asia/Seoul', 'yyyy-MM-dd');
    var t = String(x || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    var d = new Date(t);
    return isNaN(d.getTime()) ? t : Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
  };

  for (i = 0; i < v.length; i++) {
    /* `postdate` 도 시트가 숫자로 읽을 수 있다(20260830) — 문자열로 맞춘다 */
    var post = String(v[i][7] == null ? '' : v[i][7]).replace(/[^0-9]/g, '');
    out.push({
      /* **옛 줄과 함께 산다.** 열을 바꾸기 전에 쌓인 줄은 첫 열이 「발견일」이고
         `seenAt`(9번째)이 없다. 그때는 `postdate` 가 있으면 그것을 날짜로 쓰고,
         없으면 첫 열을 그대로 쓴다 — **다시 수집하지 않아도 옛 줄이 제 날짜를 찾는다.** */
      date: post.length === 8
        ? post.slice(0, 4) + '-' + post.slice(4, 6) + '-' + post.slice(6, 8)
        : ymd(v[i][0]),
      store: String(v[i][1]), storeName: String(v[i][2]),
      src: String(v[i][3]), title: String(v[i][4]), link: String(v[i][5]),
      cafe: String(v[i][6]), postdate: post,
      seenAt: ymd(v[i][8] || v[i][0]),
      /* **옛 줄에는 kind 칸이 없다** — 그때는 제목으로 그 자리에서 판정한다.
         다시 수집하지 않아도 옛 줄이 유형을 갖는다(날짜를 되살린 것과 같은 방식). */
      kind: String(v[i][9] || '') || kindOf_(String(v[i][4])),
      /* 작성일을 아는가 — 화면이 「추정」을 밝히는 데 쓴다. **있는 척하지 않는다.** */
      dated: post.length === 8
    });
  }
  return out;
}

/**
 * 관심 카페의 건수를 낸다.
 *
 * **이름이 정확히 일치하지 않는다** — 시트에 담기는 카페 이름은 네이버가 주는 전체
 * 이름이라 `레몬테라스 [인테리어,리폼,DIY,요리,결혼,육아,커뮤니티]` 꼴이다.
 * 그래서 **띄어쓰기를 지운 뒤 부분일치**로 본다(이 파일의 다른 판정과 같은 규칙).
 * 여러 카페가 걸리면 **합쳐서 센다** — 「마마웨딩」처럼 이름이 조금씩 다른 형제 카페가 있다.
 */
function watch_(byCafe) {
  var out = [], i, k, names = Object.keys(byCafe || {});
  for (i = 0; i < WATCH.length; i++) {
    var w = WATCH[i];
    if (!w.naver) { out.push({ name: w.name, n: null, why: w.why || '' }); continue; }
    var n = 0, hit = [];
    for (k = 0; k < names.length; k++) {
      if (norm_(names[k]).indexOf(norm_(w.name)) >= 0) { n += byCafe[names[k]]; hit.push(names[k]); }
    }
    out.push({ name: w.name, n: n, cafes: hit });
  }
  return out;
}

function summary_() {
  var rows = readAll_(), i;
  var tz = 'Asia/Seoul', now = new Date();
  var d0 = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var d7 = Utilities.formatDate(new Date(now.getTime() - 6 * 864e5), tz, 'yyyy-MM-dd');
  var d30 = Utilities.formatDate(new Date(now.getTime() - 29 * 864e5), tz, 'yyyy-MM-dd');

  /* **날짜는 「작성일」 기준이다**(2026-08-31 사장님 지적). 옛 방식은 「발견일」이라
     처음 수집한 날 1,459 건이 전부 그날로 몰렸다 — *"후기가 모두 오늘 올라온 게
     아닙니다"*. 지금은 블로그가 주는 `postdate` 를 쓴다.
     **카페는 네이버가 작성일을 안 준다** — 그 줄만 발견일이고 `dated:false` 로 표시해
     화면이 그 사실을 밝힌다. 섞어 놓고 모른 척하면 화면이 거짓말을 한다. */
  /* ★ **일간·주간·월간은 「작성일을 아는 글」만 센다**(2026-08-31 사장님 재지적 —
     *"오늘 올라온 후기가 1505건으로 되어있는데 근거가 불분명합니다. 글을 작성한 날짜
     기준으로 해야 합니다"*).
     **사장님 말씀이 정확했다.** 그 1,505건은 전부 카페 글이고 작성일을 아는 것이
     **0건**이었다 — 네이버가 카페 작성일을 안 주므로 우리가 「처음 본 날」로 적어 둔
     값인데, 그것을 그대로 「오늘 쓴 글」로 세고 있었다. **화면이 거짓말을 했다.**
     실측(2,802건 기준): 옛 방식 오늘 1,505 → 지금 **0** · 7일 1,520 → **15** · 30일 1,587 → **82**.
     **작성일을 모르는 글은 「전체 누적」에만 든다** — 있는 척하지 않는다. */
  var day = 0, week = 0, month = 0, dated = 0, newToday = 0;
  var minDate = '', maxDate = '';
  var byStore = {}, byCafe = {}, bySrc = { '블로그': 0, '카페': 0 }, byDay = {}, byMonth = {}, byKind = {};
  var byRegion = {};

  /* **후기가 0건인 매장도 목록에 세운다**(사장님: *"전점이 다 나와야 합니다"*).
     예전에는 잡힌 매장만 키가 생겨 **49곳만** 떴다 — 화면에서 사라진 16곳을 보고
     *"우리 매장이 없다"* 로 읽힌다. 감추는 것과 없는 것은 다른 말이다. */
  for (i = 0; i < STORES.length; i++) {
    byStore[STORES[i][1]] = 0;
    /* **묶음은 영업스케치 지역 하나뿐이다.** 한때 시·군을 한 층 더 뒀는데
       시·군과 지역이 1:1이 아니라 어긋났다 — 화성DSR모바일은 시·군이 화성인데
       편성은 수원이고, 미래기술캠퍼스모바일은 시·군이 수원인데 편성은 용인이다.
       지역이 6개(최대 16곳)라 한 층으로 충분하다. */
    var a0 = sido_(STORES[i][0]);
    if (!byRegion[a0]) byRegion[a0] = { n: 0, stores: [] };
    byRegion[a0].stores.push(STORES[i][1]);
  }

  for (i = 0; i < rows.length; i++) {
    var r = rows[i], f = r.date;
    if (r.dated) {
      dated++;
      if (f === d0) day++;
      if (f >= d7) week++;
      if (f >= d30) month++;
      /* **작성일 범위** — 사장님: *"언제까지 후기가 검출된 건지도 알고 싶습니다"*.
         작성일을 아는 글에서만 낸다(모르는 글의 날짜는 발견일이라 범위가 거짓이 된다). */
      if (!minDate || f < minDate) minDate = f;
      if (!maxDate || f > maxDate) maxDate = f;
    }
    if (r.seenAt === d0) newToday++;          /* 오늘 **새로 발견**한 것 — 뜻이 다르다 */
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    byStore[r.storeName] = (byStore[r.storeName] || 0) + 1;
    bySrc[r.src] = (bySrc[r.src] || 0) + 1;
    if (r.cafe) byCafe[r.cafe] = (byCafe[r.cafe] || 0) + 1;
    byDay[f] = (byDay[f] || 0) + 1;
    byMonth[f.slice(0, 7)] = (byMonth[f.slice(0, 7)] || 0) + 1;
    var a = sido_(r.store);
    if (!byRegion[a]) byRegion[a] = { n: 0, stores: [] };
    byRegion[a].n++;
  }
  /* 최근 순 — 작성일 기준 */
  rows.sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  /* 마지막 수집이 언제 어떻게 끝났는지 함께 낸다 — **실패를 0 으로 그리지 않는다.**
     이 저장소가 로그 파이프라인에서 이미 데인 자리다(실패를 성공으로 읽어 전 항목 0). */
  var log = sheet_(SHEET_LOG, LOG_HEADER), last = null;
  if (log.getLastRow() > 1) {
    var lv = log.getRange(log.getLastRow(), 1, 1, LOG_HEADER.length).getValues()[0];
    last = { at: String(lv[0]), calls: lv[1], got: lv[2], kept: lv[3], added: lv[4], error: String(lv[5] || '') };
  }

  return {
    ok: true, at: new Date().toISOString(),
    total: rows.length, day: day, week: week, month: month,
    /* **작성일을 아는 건수를 함께 낸다** — 화면이 *"1,459건 중 698건은 작성일을 안다"*
       고 밝힐 수 있어야 한다. 카페는 네이버가 안 주므로 그 차이를 감추면 안 된다. */
    dated: dated, newToday: newToday, byMonth: byMonth, byKind: byKind,
    /* **작성일을 모르는 글 수** — 화면이 「일간·주간·월간이 무엇을 세지 않았는지」를
       말할 수 있어야 한다. 감추면 사장님이 본 그 사고(오늘 1,505건)가 되풀이된다. */
    undated: rows.length - dated,
    /* **후기가 언제부터 언제까지인가**(사장님: *"언제까지 후기가 검출된 건지도 알고 싶습니다"*).
       작성일을 아는 글에서만 낸다 — 모르는 글의 날짜는 발견일이라 범위가 거짓이 된다. */
    minDate: minDate, maxDate: maxDate,
    /* **어디까지 훑었는지** — 새로고침만 해도 보여야 한다(2026-08-31 사장님 질문:
       *"이어서 수집하기 버튼은 안 나옵니다"*). 한 바퀴가 6분 한도에 걸려 매장 중간에서
       멈추는데, 화면이 그 사실을 안 적으면 **갤러리아광교가 왜 29건인지** 알 길이 없다. */
    cursor: Number(props_().getProperty("_cursor") || 0),
    /* 당사 vs LG — **없으면 null 이다.** 0 으로 그리면 「LG 후기가 없다」로 읽힌다 */
    rival: rival_(),
    /* **영업스케치 지역 6곳**(수원·용인·성남·평택·안양·강원).
       후기 0건인 매장도 목록에 있다 — 전점 표시(사장님 지시). */
    byRegion: byRegion,
    /* **관심 카페는 건수가 적어도 늘 내려보낸다** — 상위 12곳 막대에는 2~3건짜리가
       영영 안 올라와, 넣어 달라고 한 카페가 화면에서 사라진다.
       `naver:false` 는 0 이 아니라 **못 닿는 곳**이라 건수를 적지 않는다. */
    watch: watch_(byCafe),
    /* 한도 — 수집을 누르지 않아도 화면이 오늘 얼마나 썼는지 보여야 한다 */
    dayUsed: usage_().n, dailyLimit: dailyLimit_(), sweep: SWEEP_CALLS,
    stores: STORES.length, byStore: byStore, byCafe: byCafe, bySrc: bySrc, byDay: byDay,
    /* **링크를 전부 내려보낸다**(2026-08-31 사장님 지시 — *"해당 바이럴건수에 url도
       함께수집이되어야합니다"*). 수집은 처음부터 `link` 열에 담고 있었는데 **화면이
       200 건만 받아** 매장별로 골라 볼 수가 없었다. 건수와 링크가 이어져야 뜻이 있다.
       3,000 건이면 JSON 약 600KB — 관리자 화면이라 감당한다(사용 로그 대시보드가
       674KB 를 받는다). 그보다 많아지면 시트를 직접 여는 편이 낫다. */
    lastRun: last, recent: rows.slice(0, 3000), truncated: rows.length > 3000
  };
}

/**
 * 화면이 `google.script.run` 으로 부르는 공개 이름.
 *
 * **밑줄로 끝나는 이름은 못 부른다** — Apps Script 가 `summary_` 같은 이름을 비공개로
 * 취급해 클라이언트에서 막는다. 안쪽 함수는 밑줄을 유지하고(그 규칙이 이 파일 전체의
 * 관례다) 부를 수 있는 창구만 따로 낸다.
 */

/* ── 당사 vs LG 후기 비중 ──────────────────────────────────────────
 * 2026-08-31 사장님 요청: *"각 지점별 대조되는 X사(LG) 후기도 대조해서 당사A점과
 * X사A점의 후기 비중이 100분율로 어디가 앞서는가도 비교하고 싶습니다"*.
 *
 * ## 매장 대 매장이 아니라 **지역 대 지역**이다
 * 우리 매장 이름(북수원·갤러리아광교…)에 대응하는 LG 매장 이름을 우리는 모른다.
 * 「당사 A점 ↔ X사 A점」을 억지로 이으면 **없는 짝을 지어내는 것**이라, 정직하게
 * **영업스케치 지역 6곳**에서 견준다 — 「수원에서 삼성 몇 건 vs LG 몇 건」.
 *
 * ## 이 기능의 전부는 「양쪽에 같은 잣대」다
 * 우리 매장 후기는 정교한 매장 판정(`hasStore_`·`isNoise_`·`belongsToOther_`)을
 * 거치는데 LG 쪽에 그것을 안 대면 **우리에게 불리한 쪽으로 기운다** — 실측 표본에
 * `LG 북가좌점`(서울!)·`LG에서 가전 졸업`(매장명 없음) 같은 것이 섞여 있었다.
 * 그래서 **같은 질의 목록 · 같은 쪽수 · 같은 판정 함수**를 쓴다. 비중이 뜻을 가지려면
 * 이것뿐이다.
 *
 * ## 상한에 닿으면 비중을 내지 않는다
 * 네이버는 한 질의당 약 200건까지만 준다. 양쪽이 다 상한이면 「100 대 100 = 50%」가
 * 나오는데 **그건 잰 것이 아니다**(실측으로 수원이 정확히 그랬다).
 * 그때는 숫자를 내지 말고 **「상한이라 못 잽니다」라고 적는다** — 이 저장소가
 * 「없음」과 「확인 못 함」을 가르는 그 규칙과 같다.
 *
 * ## 담는 곳을 가른다
 * LG 후기는 **우리 매장 후기가 아니다.** 후기 시트(8,700건)에 섞으면 누적이 거짓이
 * 되므로 별도 시트에 요약만 담는다.
 */
var SHEET_RIVAL = '경쟁비교';
var RIVAL_HEADER = ['at', 'area', 'ours', 'rival', 'pct', 'capped', 'queries'];

/* LG 매장 브랜드 표기. **실측으로 실제 잡히는 것만 넣었다**(2026-08-31) —
   `lg베스트샵`·`베스트샵`·`lg전자베스트샵` 은 100/100 이 걸리고,
   `하이프라자`(법인명)는 32/100, `best샵` 은 20/100 이라 잡음이 많아 뺐다. */
var RIVAL_BRANDS = ['lg베스트샵', 'lg전자베스트샵', '베스트샵', 'lg전자 베스트샵'];

/* 지역마다 **사람이 실제로 쓰는 지명**. 양쪽 브랜드가 **같은 목록**을 쓴다 —
   여기가 갈리면 비중이 통째로 거짓이 된다.
   「강원」은 사람이 안 쓰는 말이라 대표 도시로 나눠 묻는다. */
var AREA_Q = {
  '수원': ['수원'],
  '용인': ['용인', '동탄'],
  '성남': ['성남', '분당'],
  '평택': ['평택'],
  '안양': ['안양', '평촌'],
  '강원': ['춘천', '원주', '강릉']
};

/** 브랜드 표기 + 지명이 함께 있는 글인가. **양쪽이 이 함수 하나를 쓴다.** */
function rivalHit_(text, brands, place) {
  var t = norm_(text), i;
  var brandOk = false;
  for (i = 0; i < brands.length; i++) if (t.indexOf(norm_(brands[i])) >= 0) { brandOk = true; break; }
  if (!brandOk) return false;
  if (t.indexOf(norm_(place)) < 0) return false;
  /* 축구단·굿즈샵 등은 양쪽 모두에 같은 잣대로 뺀다 */
  return !isNoise_(t);
}

/**
 * 지역별 당사 vs LG 후기 건수를 잰다.
 *
 * 호출 수 = 지명 10개 × 브랜드 2 × 2쪽 = **최대 40회**. 한 바퀴(2,096회)에 견주면
 * 2% 라 매 수집마다 함께 돌려도 부담이 없다.
 */
function collectRival() {
  var sh = sheet_(SHEET_RIVAL, RIVAL_HEADER);
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  var areas = Object.keys(AREA_Q), rows = [], calls = 0, err = '';

  /* **꼬리말로 질의를 쪼갠다 — 양쪽에 똑같이.**
     한 질의는 200건이 상한이라 쪼개지 않으면 6곳 전부 상한에 닿아 비중을 못 낸다
     (실측). 우리 후기 수집이 이미 쓰는 수법이고, 여기서 중요한 것은 **삼성·LG 에
     같은 꼬리말을 쓰는 것** — 한쪽만 쪼개면 그쪽만 많이 받아 비중이 거짓이 된다. */
  var RTAILS = ['', ' 혼수', ' 구매', ' 후기'];

  for (var ai = 0; ai < areas.length; ai++) {
    var area = areas[ai], places = AREA_Q[area];
    var got = { ours: {}, rival: {} };     /* 링크로 중복을 없앤다 */
    var lastAdd = { ours: 0, rival: 0 };

    var side = [['ours', BRANDS, '삼성스토어'], ['rival', RIVAL_BRANDS, 'LG베스트샵']];
    for (var si = 0; si < side.length; si++) {
      var key = side[si][0], brands = side[si][1], bq = side[si][2];
      for (var ti = 0; ti < RTAILS.length; ti++) {
        var before = Object.keys(got[key]).length;
        for (var pi = 0; pi < places.length; pi++) {
          var place = places[pi];
          var q = bq + ' ' + place + RTAILS[ti];
          for (var page = 0; page < MAX_PAGES; page++) {
            var j;
            try { j = search_('cafearticle', q, page * PAGE_SIZE + 1); calls++; }
            catch (e) { err = String(e); break; }
            if (j.error) { err = j.error; break; }
            var items = j.items || [];
            for (var n = 0; n < items.length; n++) {
              var it = items[n];
              var text = (it.title || '') + ' ' + (it.description || '');
              if (rivalHit_(text, brands, place)) got[key][String(it.link || '')] = 1;
            }
            if (items.length < PAGE_SIZE) break;
          }
          if (err) break;
        }
        if (ti === RTAILS.length - 1) lastAdd[key] = Object.keys(got[key]).length - before;
        if (err) break;
      }
      if (err) break;
    }

    var a = Object.keys(got.ours).length, b = Object.keys(got.rival).length;
    /* ★ **「상한이면 못 잰다」는 쓸 수 없는 규칙이었다.**
       네이버가 질의마다 끊으므로 절대 건수는 영영 못 채운다 — 그 규칙으로는 6곳 전부
       비중이 빈칸이 되어 화면에 아무것도 안 뜬다(실측으로 그랬다).
       **총량은 못 재도 비중은 잴 수 있다** — 실측에서 양쪽 증가율이 거의 같았다
       (12%/12% · 14%/15% · 11%/9% · 15%/15%). 한쪽만 빠르게 늘면 그때가 못 믿을 때다.
       그래서 **증가율 차이**를 본다: 8pt 넘게 벌어지면 비중을 내지 않는다. */
    var gO = a ? lastAdd.ours / a : 0, gR = b ? lastAdd.rival / b : 0;
    var skew = Math.abs(gO - gR) > 0.08;
    rows.push([
      stamp, area, a, b,
      skew ? '' : (a + b > 0 ? Math.round((a / (a + b)) * 100) : ''),
      skew ? 'Y' : '',
      places.join(' · ')
    ]);
    if (err) break;
  }

  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, RIVAL_HEADER.length).setValues(rows);
  if (calls) addUsage_(calls);
  return { rows: rows.length, calls: calls, error: err };
}

/** 화면에 낼 최신 한 회차. **없으면 없다고 한다** — 0 으로 그리지 않는다. */
function rival_() {
  var sh = sheet_(SHEET_RIVAL, RIVAL_HEADER);
  if (sh.getLastRow() < 2) return null;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, RIVAL_HEADER.length).getValues();
  var last = '', i;
  for (i = 0; i < v.length; i++) { var t = String(v[i][0]); if (t > last) last = t; }
  var out = [];
  for (i = 0; i < v.length; i++) {
    if (String(v[i][0]) !== last) continue;
    out.push({
      area: String(v[i][1]), ours: Number(v[i][2]) || 0, rival: Number(v[i][3]) || 0,
      pct: v[i][4] === '' || v[i][4] === null ? null : Number(v[i][4]),
      capped: String(v[i][5]) === 'Y', queries: String(v[i][6])
    });
  }
  return { at: last, rows: out };
}

function getSummary() { return summary_(); }

/* ── 화면 · JSON ─────────────────────────────────────────────── */

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * `?json=1` 이면 자료만, `?run=1` 이면 지금 수집, 아니면 화면.
 *
 * **전산PC 에서 열리는 것이 이 스크립트의 존재 이유다** — Vercel 이 막혀 있어
 * 사장님이 대시보드를 볼 수 없다(2026-08-31 확인: 구글 스크립트는 열린다).
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.json === '1') return json_(summary_());
  if (p.diag === '1') return json_(diag_());     /* 키가 제대로 들어왔는지 — 값은 안 나온다 */
  if (p.run === '1') return json_(collectReviews());
  var t = HtmlService.createTemplateFromFile('ReviewsIndex');
  t.data = JSON.stringify(summary_());
  return t.evaluate()
    .setTitle('경원영업팀 바이럴분석')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}
