/**
 * 팀 게시판 — 글 접수·목록용 Google Apps Script 웹앱 (2026-08-30 사장님 요청)
 *
 * *"별도로 게시판같은걸만들어서 여러가지 이야기를 적을 수 있도록 하면 좋을것같습니다."*
 *
 * 세일즈 코파일럿의 `/board` 화면이 이 주소로 글을 보내고(doPost) 목록을 받아 간다(doGet).
 * 허브 쪽은 서버 라우트(`app/api/board/route.ts`)가 대신 두드린다 — 주소는 Vercel
 * 환경변수 `BOARD_GAS_URL` 에만 두고 저장소에는 커밋하지 않는다(public repo 다).
 *
 * ## 사용 로그(Code.gs)·시험 결과(Exam.gs)와 **다른 배포**다 — 합치지 말 것
 * 로그는 하루 수천 건이 자동으로 쌓이고, 게시판은 사람이 읽고 쓰는 글이다.
 * 한 시트에 섞으면 글이 로그에 묻힌다. 스프레드시트도 따로 만든다.
 *
 * ## 설치 (로그 시트를 연동할 때와 같은 절차)
 *  1) 새 Google 스프레드시트 생성 (이름 예: 세일즈코파일럿 게시판)
 *  2) 확장 프로그램 → Apps Script → 이 파일 내용을 그대로 붙여넣기 → 저장
 *  3) 배포 → 새 배포 → 유형: 웹 앱 → 실행: 나 / 액세스 권한: **전체** → 배포
 *  4) 발급된 /exec 주소를 Vercel 환경변수 `BOARD_GAS_URL` 에 넣고 **재배포**
 *     (환경변수는 기존 배포에 소급되지 않는다 — 대시보드의 Redeploy 버튼이면 된다)
 *
 * **이 파일을 고쳤으면 반드시 다시 배포할 것**(배포 관리 → 새 버전). 저장만으로는 안 바뀐다.
 */

const SHEET_NAME = '게시판';

/* **열은 뒤에만 붙인다.** 이 스크립트는 열을 자리로 쓰므로 가운데에 끼우면
   그 아래 모든 줄이 한 칸씩 밀린다(Code.gs 가 지점 열을 더할 때 겪은 것과 같다).
   시트에 이미 헤더가 있으면 자동으로 늘려 주지 않으니 1행에 직접 적을 것. */
const HEADER = ['ts', 'store', 'storeName', 'author', 'topic', 'title', 'body'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADER);
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 글 한 건을 받는다. 몸통은 `data=<JSON>` (urlencoded POST — 프리플라이트가 없다).
 *
 * · 길이를 자른다 — 제목 80자 · 본문 2,000자 · 이름 20자. 홈페이지가 공개 주소라
 *   무엇이 들어올지 모른다. 자르는 것은 받는 쪽의 마지막 방어다.
 * · **같은 글을 두 번 적지 않는다** — 저장은 됐는데 응답만 유실되면 화면이 재시도한다.
 *   마지막 글과 지점·제목·본문이 같고 5분 안이면 같은 글로 보고 ok 만 돌려준다
 *   (Exam.gs 의 중복 거름과 같은 장치).
 */
function doPost(e) {
  try {
    const raw = (e && e.parameter && e.parameter.data) || '';
    if (!raw) return json_({ ok: false, error: 'no data' });
    const d = JSON.parse(raw);

    const store = String(d.store || '').slice(0, 8);
    const storeNm = String(d.storeName || '').slice(0, 30);
    const author = String(d.author || '').slice(0, 20);
    const topic = String(d.topic || '자유').slice(0, 10);
    const title = String(d.title || '').slice(0, 80).trim();
    const body = String(d.body || '').slice(0, 2000).trim();
    if (!title || !body) return json_({ ok: false, error: 'empty' });

    const sheet = getSheet_();
    const last = sheet.getLastRow();
    if (last >= 2) {
      const prev = sheet.getRange(last, 1, 1, HEADER.length).getValues()[0];
      const prevTs = new Date(prev[0]).getTime();
      if (prev[1] === store && prev[5] === title && prev[6] === body
          && Date.now() - prevTs < 5 * 60 * 1000) {
        return json_({ ok: true, dedup: true });
      }
    }

    sheet.appendRow([new Date(), store, storeNm, author, topic, title, body]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * 최근 글 목록. `?limit=N` (기본 100 · 최대 300) — 최신이 먼저다.
 *
 * **끝까지 훑는다(break 금지).** 재시도로 옛 글이 뒤늦게 붙어 시간이 역행할 수 있다 —
 * Code.gs 가 `break` 로 앞부분을 통째로 잘라먹던 그 함정이다(2026-08-28 확인).
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const limit = Math.min(300, Math.max(1, Number(p.limit) || 100));
    const sheet = getSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return json_({ ok: true, posts: [] });

    const rows = sheet.getRange(2, 1, last - 1, HEADER.length).getValues();
    const posts = rows.map(function (r) {
      return {
        ts: new Date(r[0]).getTime() || 0,
        store: String(r[1] || ''),
        storeName: String(r[2] || ''),
        author: String(r[3] || ''),
        topic: String(r[4] || ''),
        title: String(r[5] || ''),
        body: String(r[6] || ''),
      };
    }).filter(function (x) { return x.title && x.body; });
    posts.sort(function (a, b) { return b.ts - a.ts; });
    return json_({ ok: true, posts: posts.slice(0, limit) });
  } catch (err) {
    return json_({ ok: false, error: String(err), posts: [] });
  }
}
