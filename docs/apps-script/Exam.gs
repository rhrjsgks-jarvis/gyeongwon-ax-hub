/**
 * 레벨업 챌린지 웹 시험 — 채점 결과 접수용 Google Apps Script 웹앱
 *
 * `tools/레벨업챌린지_시험.html` 이 제출 직후 이 주소로 결과 한 줄을 보낸다.
 * 받는 것은 **사번 8자리와 점수**뿐이다 — 이름·연락처는 애초에 받지 않는다
 * (그 파일은 링크로 퍼질 수 있어 개인정보를 최소로 둔다).
 *
 * ## 사용 로그(Code.gs)와 **다른 배포**다 — 합치지 말 것
 * 저쪽은 매장 사용 로그라 하루 수천 건이 쌓이고, 이쪽은 시험 응시 기록이라
 * 사람이 눈으로 읽고 성적을 매긴다. 한 시트에 섞으면 시험 결과가 로그에 묻힌다.
 * 스프레드시트도 따로 두는 편이 낫다(권한을 교육 담당에게만 열 수 있다).
 *
 * ## doGet 인 이유
 * 시험지 파일은 **메일로 받아 `file://` 로 여는 자립형 HTML** 이다. 그 상태에서
 * `POST` 는 프리플라이트(OPTIONS)가 붙고 Apps Script 는 그것을 받지 않아 막힌다.
 * 단순 `GET` 은 프리플라이트 없이 나가고 응답도 읽을 수 있어 **성공 여부를 확인할 수 있다** —
 * 그래서 시험지가 화면에 "기록됨 / 기록 실패"를 적을 수 있다.
 *
 * 설치:
 *  1) 새 Google 스프레드시트 생성
 *  2) 확장 프로그램 → Apps Script → 이 파일 내용을 그대로 붙여넣기
 *  3) 배포 → 새 배포 → 유형: 웹 앱 → 실행: 나 / **액세스 권한: 전체** → 배포
 *     ※ '전체'가 아니면 응시자 브라우저가 로그인 지면으로 튕겨 기록이 안 남는다
 *  4) 발급된 /exec 주소를 `scripts/exam-web-template.html` 의 `SCRIPT_URL` 에 넣고
 *     `npm run build:examweb` 을 다시 돌린다
 *
 * **이 파일을 고쳤으면 반드시 다시 배포할 것**(배포 관리 → 새 버전). 저장만으로는 안 바뀐다.
 */

const SHEET_NAME = '시험결과';

/* **열은 뒤에만 붙인다.** 이 스크립트는 열을 자리로 쓰므로 가운데에 끼우면
   그 아래 모든 줄이 한 칸씩 밀린다(Code.gs 가 지점 열을 더할 때 겪은 것과 같다).
   시트에 이미 헤더가 있으면 자동으로 늘려 주지 않으니 1행에 직접 적을 것. */
const HEADER = ['접수시각', '사번', '점수', '정답', '문항수', '시험지코드', '응시시각', '소요초'];

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
 * 결과 한 줄을 받는다.
 *
 * **같은 응시를 두 번 적지 않는다.** 시험지가 못 보낸 것을 브라우저에 남겼다가
 * 다음에 열 때 다시 보내는데, 저장은 됐는데 응답만 유실된 경우 같은 줄이 또 온다.
 * 사번+시험지코드+응시시각이 같으면 같은 응시다(Code.gs 의 batchId 와 같은 장치).
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const empId = String(p.empId || '').trim();
    if (!/^\d{8}$/.test(empId)) return json_({ ok: false, error: '사번 8자리가 아니다' });

    const key = 'exam_' + empId + '_' + (p.code || '') + '_' + (p.startedAt || '');
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) return json_({ ok: true, dup: true });

    /* 시트 접근은 **한 번에 하나만** — 응시자가 몰리면 같은 줄에 겹쳐 쓴다 */
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      getSheet_().appendRow([
        new Date(), empId, Number(p.score) || 0, Number(p.correct) || 0,
        Number(p.total) || 0, String(p.code || ''), String(p.startedAt || ''),
        Number(p.elapsed) || 0
      ]);
    } finally {
      lock.releaseLock();
    }
    cache.put(key, '1', 21600);   /* 6시간 — 재전송이 그 안에 온다 */
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** 브라우저로 열어 보면 무엇이 몇 건 쌓였는지 알려 준다 — 배포가 살아 있는지 확인용 */
function doPost(e) {
  return json_({ ok: false, error: 'doGet 으로 보낼 것 — 자립형 HTML 은 프리플라이트를 못 넘는다' });
}
