/**
 * 경원 AX 허브 — 팀 전체 사용 로그 집계용 Google Apps Script 웹앱
 *
 * 역할:
 *  - doPost: 각 팀원 브라우저(lib/logEvent.ts)가 보내는 이벤트 1건을 시트에 한 줄 추가.
 *            action이 'feedback'(건의사항)이면 FEEDBACK_EMAIL로 알림 메일도 발송한다.
 *  - doGet : 관리자 대시보드(app/admin/page.tsx)가 팀 전체 로그를 읽어갈 때 사용(JSON 반환)
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
const HEADER = ['ts', 'date', 'module', 'action', 'uid', 'extra', 'receivedAt'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADER);
  return sheet;
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const sheet = getSheet_();
    sheet.appendRow([
      body.ts || '',
      body.date || '',
      body.module || '',
      body.action || '',
      body.uid || '',
      body.extra || '',
      new Date().toISOString(),
    ]);
    if (body.action === 'feedback') sendFeedbackEmail_(body);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
  MailApp.sendEmail(FEEDBACK_EMAIL, subject, bodyText);
}

function doGet(e) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return ContentService.createTextOutput(JSON.stringify({ logs: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // 최근 5000행까지만 반환(시트가 무한정 커지는 것에 대비한 안전장치)
  const maxRows = 5000;
  const startRow = Math.max(2, lastRow - maxRows + 1);
  const numRows = lastRow - startRow + 1;
  const values = sheet.getRange(startRow, 1, numRows, HEADER.length).getValues();
  const logs = values.map((row) => ({
    ts: Number(row[0]),
    date: String(row[1]),
    module: String(row[2]),
    action: String(row[3]),
    uid: String(row[4]),
    extra: row[5] ? String(row[5]) : undefined,
  }));
  return ContentService.createTextOutput(JSON.stringify({ logs }))
    .setMimeType(ContentService.MimeType.JSON);
}
