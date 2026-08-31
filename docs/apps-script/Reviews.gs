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

/* **열은 뒤에만 붙인다** — 이 스크립트는 열을 자리로 쓰므로 가운데에 끼우면 그 아래
   모든 줄이 한 칸씩 밀린다(Code.gs 가 지점 열을 더할 때 겪은 것과 같다). */
var HEADER = ['foundAt', 'store', 'storeName', 'src', 'title', 'link', 'cafe', 'postdate'];
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

/* ── 이름이 전국에 겹치는 매장은 **검색어를 좁힌다** ──
 * 「광주」는 배제어로 못 푼다. 실측 16건이 **전부 광주광역시**였고(신세계광주·풍암·
 * 광천·진월효천·김대중컨벤션센터) 그중 절반은 본문 어디에도 광주광역시 표시가 없다.
 * 반면 `삼성스토어 경기광주` 로 물으면 9건이 전부 진짜다 — **글쓴이들이 스스로
 * 「경기광주」라고 적는다.** 자기도 헷갈릴 걸 알기 때문이다.
 * 규칙을 정교하게 만드는 것보다 **질의를 고치는 쪽**이 원인에 가까웠다. */
var QUERY = { '광주': '삼성스토어 경기광주' };
var MATCH = { '광주': '경기광주' };

/* 지면에서 실제로 본 브랜드 표기만 넣는다. '삼성프라자'·'디지털프라자' 는 옛 이름인데
   카페 글에 살아 있다("예전에는 삼성프라자라고 더 익숙하게 부르는 분들도 있던데"). */
var BRANDS = ['삼성스토어', '삼성디지털프라자', '디지털프라자', '삼성프라자'];

/* **축구단을 걸러낸다** — `수원삼성` 은 프로축구단이고 `블루윙즈스토어` 라는 굿즈샵이
   있다. `수원삼성` + `스토어` 가 붙어 판정을 통과했다(실측 2건). 검색해 보기 전엔
   있는 줄도 몰랐던 함정이다. */
var NOISE = ['블루윙즈', '수원fc', '직관', '굿즈', '앤썸', 'md스토어', '축구', 'k리그'];

/* 백화점·몰 꼬리표. 같은 지역에 일반점과 체인점이 **둘 다** 있을 때 가르는 데 쓴다. */
var CHAINS = ['ak', '롯데', '신세계', '스타필드', '타임빌라스', '갤러리아', '이마트', '현대'];

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

function search_(kind, query) {
  var p = props_();
  var id = p.getProperty('NAVER_CLIENT_ID'), sec = p.getProperty('NAVER_CLIENT_SECRET');
  if (!id || !sec) throw new Error('스크립트 속성에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 넣어 주세요.');
  var url = API_BASE + '/' + kind + '?query=' + encodeURIComponent(query) + '&display=30&sort=date';
  var res = UrlFetchApp.fetch(url, {
    headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': sec },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return { items: [], error: 'HTTP ' + res.getResponseCode() };
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
function collectReviews() {
  var itemSheet = sheet_(SHEET_ITEMS, HEADER);
  var seen = {}, i, k, n;
  if (itemSheet.getLastRow() > 1) {
    var links = itemSheet.getRange(2, 6, itemSheet.getLastRow() - 1, 1).getValues();
    for (i = 0; i < links.length; i++) seen[String(links[i][0])] = true;
  }

  var allNames = [];
  for (i = 0; i < STORES.length; i++) allNames.push(STORES[i][1]);

  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var calls = 0, got = 0, kept = 0, add = [], err = '';
  var kinds = ['blog', 'cafearticle'];

  for (i = 0; i < STORES.length; i++) {
    var code = STORES[i][0], name = STORES[i][1];
    var query = QUERY[name] || ('삼성스토어 ' + name);
    var mname = MATCH[name] || name;
    for (k = 0; k < kinds.length; k++) {
      var j;
      try { j = search_(kinds[k], query); calls++; }
      catch (e) { err = String(e); break; }
      if (j.error) { err = kinds[k] + ':' + j.error; continue; }
      var items = j.items || [];
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
        add.push([stamp, code, name, kinds[k] === 'blog' ? '블로그' : '카페',
          String(it.title || '').replace(/<[^>]+>/g, ''), link,
          String(it.cafename || ''), String(it.postdate || '')]);
      }
    }
    /* **인증이 막혔으면 첫 실패에서 멈춘다.**
       처음에는 `스크립트 속성` 문구를 던지는 예외만 잡았는데, **HTTP 401 은 예외가
       아니라 정상 응답**이라 130 번을 다 돌았다(2026-08-31 실측: `calls:130 · got:0 ·
       error:"cafearticle:HTTP 401"`). 지금은 무료라 괜찮지만 유료로 바뀌면 헛돈
       130 회가 그대로 요금이 된다. 401·403 은 더 돌아도 결과가 같다. */
    if (err && (err.indexOf('스크립트 속성') >= 0 || err.indexOf('401') >= 0 || err.indexOf('403') >= 0)) break;
  }

  if (add.length) {
    itemSheet.getRange(itemSheet.getLastRow() + 1, 1, add.length, HEADER.length).setValues(add);
  }
  sheet_(SHEET_LOG, LOG_HEADER).appendRow([new Date(), calls, got, kept, add.length, err]);
  return { calls: calls, got: got, kept: kept, added: add.length, error: err };
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
  for (i = 0; i < v.length; i++) {
    out.push({
      foundAt: String(v[i][0]), store: String(v[i][1]), storeName: String(v[i][2]),
      src: String(v[i][3]), title: String(v[i][4]), link: String(v[i][5]),
      cafe: String(v[i][6]), postdate: String(v[i][7])
    });
  }
  return out;
}

function summary_() {
  var rows = readAll_(), i;
  var tz = 'Asia/Seoul', now = new Date();
  var d0 = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var d7 = Utilities.formatDate(new Date(now.getTime() - 6 * 864e5), tz, 'yyyy-MM-dd');
  var d30 = Utilities.formatDate(new Date(now.getTime() - 29 * 864e5), tz, 'yyyy-MM-dd');

  var day = 0, week = 0, month = 0;
  var byStore = {}, byCafe = {}, bySrc = { '블로그': 0, '카페': 0 }, byDay = {};
  for (i = 0; i < rows.length; i++) {
    var r = rows[i], f = r.foundAt;
    if (f === d0) day++;
    if (f >= d7) week++;
    if (f >= d30) month++;
    byStore[r.storeName] = (byStore[r.storeName] || 0) + 1;
    bySrc[r.src] = (bySrc[r.src] || 0) + 1;
    if (r.cafe) byCafe[r.cafe] = (byCafe[r.cafe] || 0) + 1;
    byDay[f] = (byDay[f] || 0) + 1;
  }
  /* 최근 순 */
  rows.sort(function (a, b) { return a.foundAt < b.foundAt ? 1 : -1; });

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
  if (p.run === '1') return json_(collectReviews());
  var t = HtmlService.createTemplateFromFile('ReviewsIndex');
  t.data = JSON.stringify(summary_());
  return t.evaluate()
    .setTitle('경원영업팀 매장 언급 후기')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}
