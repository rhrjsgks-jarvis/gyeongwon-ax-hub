/**
 * 경원 AX 허브 — 팀 전체 사용 로그 집계용 Google Apps Script 웹앱
 *
 * 역할:
 *  - doPost: 이벤트 **배치**를 받아 시트에 한 번에 적는다({batchId, events:[...]}).
 *            한 건짜리(옛 클라이언트)도 그대로 받는다. 같은 batchId 가 다시 오면 버린다.
 *            action이 'feedback'(건의사항)이면 FEEDBACK_EMAIL로 알림 메일도 발송한다.
 *  - doGet : 관리자 대시보드(app/admin/page.tsx)가 팀 전체 로그를 읽어갈 때 사용(JSON 반환).
 *            `?days=60&limit=5000` 으로 기간을 좁힐 수 있다.
 *
 * ※ 2026-08-11 개정 — 매장 500곳 확대에 대비해 배치·중복제거·기간조회를 넣었다.
 *   그 전에는 이벤트 1건이 실행 1회여서 하루 실행시간 90분 한도를 넘길 계산이었다.
 *   **이 파일을 고쳤으면 반드시 Apps Script 에 다시 배포해야 한다**(배포 관리 → 새 버전).
 *
 * 설치 방법(요약 — 자세한 단계는 docs/apps-script/SETUP.md 참고):
 *  1) 새 Google 스프레드시트 생성 (시트 이름: "logs")
 *  2) 확장 프로그램 → Apps Script → 이 파일 내용을 그대로 붙여넣기
 *  3) 배포 → 새 배포 → 유형: 웹 앱 → 실행: 나 / 액세스 권한: 전체 → 배포
 *  4) 발급된 /exec URL을 복사해서 알려주면 lib/logEvent.ts의 GAS_URL에 반영
 *
 * 기존에 이미 배포한 적이 있다면(URL이 이미 있다면): 이 파일 내용을 덮어쓰기만 하고
 * "배포 → 배포 관리 → 수정 아이콘 → 새 버전"으로 재배포하면 된다(URL은 그대로 유지됨).
 */

// 건의사항(action:'feedback') 접수 시 알림 메일을 받을 주소. 필요하면 바꿔도 된다.
const FEEDBACK_EMAIL = 'rhrjsgks@gmail.com';

const SHEET_NAME = 'logs';
/*
 * **열은 뒤에만 붙인다**(2026-08-20 지점 열 추가). 시트에는 이미 옛 로그가 쌓여 있고
 * 이 스크립트는 **자리로** 쓰므로, 가운데에 끼우면 그 아래 모든 줄이 한 칸씩 밀린다.
 * 옛 줄의 새 칸은 비어 있고, 대시보드가 그것을 '(미지정)'으로 따로 센다 —
 * 0 으로 적으면 "안 썼다"는 거짓말이 된다.
 *
 * **시트에 이미 헤더가 있으면 자동으로 늘려 주지 않는다.** 열을 더한 뒤에는 시트 1행에
 * store · storeName 두 칸을 직접 적어 두거나, 시트를 새로 만들 것.
 */
const HEADER = ['ts', 'date', 'module', 'action', 'uid', 'extra', 'receivedAt', 'store', 'storeName'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADER);
  return sheet;
}

/**
 * 이벤트를 시트에 적는다. **한 건짜리와 배치 둘 다 받는다.**
 *
 * 배치를 받게 된 이유: 예전에는 브라우저가 이벤트 1건마다 POST 했고 그때마다 이 함수가
 * 한 번씩 실행됐다. Apps Script 무료 계정은 하루 실행시간 90분 · 동시 실행 30개가 한도라
 * 매장이 500곳으로 늘면(하루 5~6천 건) 한도를 넘긴다. 배치로 받으면 실행 횟수가 1/20 이 된다.
 *
 * 그리고 **`appendRow` 를 건마다 부르지 않는다.** appendRow 는 호출마다 시트를 건드려
 * 느리다. `setValues` 로 한 번에 쓰면 20건이 1건과 비슷한 시간에 끝난다 — 배치의 이득이
 * 실행 '횟수'만이 아니라 '시간'에서도 나오는 지점이다.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    // 한 건짜리(옛 클라이언트)도 계속 받는다 — 배포 시점이 어긋나도 로그가 끊기지 않는다
    const events = Array.isArray(body.events) ? body.events : [body];
    if (!events.length) {
      return json_({ ok: true, saved: 0 });
    }

    /* 같은 배치를 두 번 받으면 버린다.
       서버는 저장했는데 응답이 유실되면 클라이언트가 같은 배치를 다시 보낸다. 그대로 적으면
       사용량이 부풀려진다. 배치 이름은 내용에서 만들어지므로 재시도해도 같은 값이 온다. */
    const bid = body.batchId ? String(body.batchId) : '';
    if (bid) {
      const cache = CacheService.getScriptCache();
      if (cache.get('b_' + bid)) return json_({ ok: true, saved: 0, duplicate: true });
      cache.put('b_' + bid, '1', 21600);        // 6시간 — 재시도는 그 안에 끝난다
    }

    const now = new Date().toISOString();
    const rows = events.map(function (ev) {
      return [ev.ts || '', ev.date || '', ev.module || '', ev.action || '',
              ev.uid || '', ev.extra || '', now];
    });

    /* 여러 매장이 동시에 쓰면 같은 줄에 겹쳐 쓸 수 있다. 예전에는 한 건씩 appendRow 라
       충돌 창이 좁았지만 배치는 넓어지므로 잠금을 건다. */
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = getSheet_();
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADER.length).setValues(rows);
    } finally {
      lock.releaseLock();
    }

    events.forEach(function (ev) { if (ev.action === 'feedback') sendFeedbackEmail_(ev); });
    return json_({ ok: true, saved: rows.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendFeedbackEmail_(body) {
  if (!FEEDBACK_EMAIL) return;
  const when = body.ts ? new Date(Number(body.ts)).toISOString() : new Date().toISOString();
  const subject = '[경원 AX 허브] 새 건의사항이 접수되었습니다';
  const bodyText =
    '경원 AX 허브(gyeongwon-ax-hub.vercel.app)에 새 건의사항이 접수되었습니다.\n\n' +
    '내용: ' + (body.extra || '(내용 없음)') + '\n' +
    '접수 시각: ' + when + '\n' +
    '세션 ID(익명): ' + (body.uid || '-') + '\n';
  GmailApp.sendEmail(FEEDBACK_EMAIL, subject, bodyText);
}

/**
 * 대시보드가 팀 전체 로그를 읽어간다.
 *
 * `?days=14` 로 기간을 좁힐 수 있다. 매장이 늘면 시트가 하루 수천 줄씩 자라는데
 * 대시보드는 14일치만 그리므로 전부 읽을 이유가 없다 — 실측으로 왕복 3.9초였고
 * 서버 라우트의 타임아웃이 8초라 그대로 두면 언젠가 대시보드가 통째로 빈다.
 * 뒤에서부터 읽다가 기간을 벗어나면 멈춘다(시트는 시간순으로 쌓인다).
 *
 * **`date` 칸은 클라이언트가 다시 만든다.** 시트에 Date 로 저장돼 있어
 * 'Wed Jul 29 2026 …' 처럼 나오고, 그러면 일별 집계 키('YYYY-MM-DD')와 어긋난다.
 * 여기서 굳이 고치지 않는 이유는 이미 쌓인 줄이 그대로이기 때문이다 — 받는 쪽에서
 * `ts` 로 다시 만드는 것이 옛 줄까지 함께 고쳐 준다(lib/logEvent.ts `normalizeLogs`).
 */
function doGet(e) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return json_({ logs: [] });

  const p = (e && e.parameter) || {};
  const days = Math.max(1, Math.min(3650, Number(p.days) || 60));
  const maxRows = Math.max(1, Math.min(20000, Number(p.limit) || 5000));
  const since = Date.now() - days * 86400000;

  const startRow = Math.max(2, lastRow - maxRows + 1);
  const numRows = lastRow - startRow + 1;
  const values = sheet.getRange(startRow, 1, numRows, HEADER.length).getValues();

  const logs = [];
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const ts = Number(row[0]);
    if (!ts) continue;                    // 헤더가 섞였거나 빈 줄
    if (ts < since) break;                // 시간순이라 여기서 멈추면 된다
    logs.push({
      ts: ts,
      date: String(row[1]),
      module: String(row[2]),
      action: String(row[3]),
      uid: String(row[4]),
      extra: row[5] ? String(row[5]) : undefined,
    });
  }
  logs.reverse();                         // 다시 시간순으로
  return json_({ logs: logs });
}
