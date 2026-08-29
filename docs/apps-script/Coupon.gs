/**
 * 경원영업팀 시크릿쿠폰 — 전 점 공유 발급기 (2026-08-28 사장님 요청)
 *
 * *"점 선택을 없애고 들어가면 버즈쿠폰발급 워치쿠폰발급으로 하고 모든 쿠폰은 랜덤으로
 *   생성되게 … 쿠폰을 모든 점이 공유하는 걸로 형식을 바꾸도록 하겠습니다."*
 * *"9월이 되면 신규 쿠폰을 발급받습니다. 9월 대비 점명은 삭제하는 게 맞습니다."*
 *
 * 예전에는 매장명을 쳐서 **그 매장 몫만** 보여줬다(실측: 성남 버즈 51매 · 오산 43매).
 * 9월부터는 배정을 나누지 않으므로 **모든 점이 같은 풀을 나눠 쓴다** —
 * 매장명 입력이 사라지고 들어가면 곧바로 쿠폰 종류 버튼이 뜬다.
 *
 * ─────────────────────────────────────────────────────────────
 * **함수 이름을 기존 것 그대로 둔다.**
 *
 * 화면(`CouponIndex.html`)이 부르는 이름이 이미 정해져 있어(`getAvailableTypes` ·
 * `drawCoupon` · `confirmUse` · `cancelDraw`) 새로 짓지 않았다. 이름을 바꾸면 화면과
 * 스크립트가 서로 다른 말을 하게 되고, 그때 나오는 오류가 *"함수를 찾을 수 없습니다"*
 * 뿐이라 붙여넣는 사람이 원인을 짚기 어렵다.
 *
 * 다만 **매장 인자는 받기만 하고 쓰지 않는다.** 옛 화면이 남아 있어도 죽지 않게 하려는
 * 것이고(`getAvailableTypes(store)` 처럼 넘어와도 무시한다), `getStoreList` ·
 * `findStoreCode` 도 옛 화면이 부를 수 있어 **살아는 있되 매장을 가르지 않는다.**
 *
 * ─────────────────────────────────────────────────────────────
 * 시트 구조 — **탭 하나가 쿠폰 종류 하나다**
 *
 *   탭 이름이 곧 화면의 버튼 이름이다(`버즈4쿠폰` · `워치울트라2/워치9쿠폰`).
 *   9월에 종류가 늘면 **탭을 하나 더 만들고 코드를 붙여넣기만** 하면 버튼이 생긴다 —
 *   스크립트를 고칠 일이 없다(사장님이 "나중에 더할 예정"이라 한 그 요구다).
 *
 *   | A: 쿠폰번호        | B: 상태  | C: 시각              |
 *   |--------------------|----------|----------------------|
 *   | SBZ-8842-1193      | 사용     | 2026-09-01 14:02:11  |
 *   | SBZ-7710-2284      | 미사용   |                      |
 *   | SBZ-9931-4402      |          |                      |  ← 빈칸도 미사용으로 본다
 *
 *   **상태는 `미사용` · `사용` 둘뿐이다**(사장님 확정). 잔여 수량은 `미사용` 개수이고,
 *   발급하면 `사용` 으로 바뀐다. **열 위치는 못 박지 않는다** — `detectCols_` 가 찾아낸다.
 *
 *   - **A열에 점명을 두지 않는다.** 9월 신규분부터 쿠폰번호만 붙여넣는다.
 *   - **첫 줄이 머리글이어도 되고 아니어도 된다** — 코드처럼 안 생긴 줄은 건너뛴다.
 *     붙여넣는 사람이 머리글을 넣을지 말지 신경 쓰지 않아도 되게 한 것이다.
 *   - **`_` 로 시작하거나 숨긴 탭은 쿠폰이 아니다**(`_메모` 같은 것을 자유롭게 두라고 비운 규칙).
 *   - **기록은 이 시트가 곧 기록이다.** 사장님 결정이 *"코드와 시각만"* 이라 따로 기록 탭을
 *     만들지 않았다 — B·C 두 칸이 이미 그 답을 갖고 있고, 표가 하나면 어긋날 일도 없다.
 *     (지점은 남기지 않는다. 전 점이 공유하는 풀이라 "누가 가져갔나"를 세지 않기로 했다.)
 *
 * ─────────────────────────────────────────────────────────────
 * 붙여넣은 뒤 **`설정확인` 을 한 번 실행해 보라**(편집기에서 함수 고르고 ▶).
 * 어느 탭을 쿠폰으로 보고 몇 장을 세었는지 로그로 찍어 준다 — 붙여넣기가 제대로 됐는지
 * 화면을 열기 전에 확인할 수 있다.
 */

/*
 * **상태는 두 가지뿐이다**(2026-08-28 사장님 확정:
 * *"미사용만 잔여쿠폰 수량으로 띄워주고 사용한 것은 사용으로 바꾸는 방식으로 그대로 유지"*).
 *
 * 한때 `대기` 라는 중간 상태를 넣었다가 걷어냈다 — 시트를 사람이 열어 봤을 때 모르는 말이
 * 있으면 안 되고, 사장님이 쓰던 방식을 그대로 두는 것이 맞다.
 *
 * 두 가지만 쓰므로 **뽑는 순간 바로 `사용`으로 바꾼다.** 그래서 중요한 것이 뒤집혔다:
 *   - 예전: 사용완료를 **안 누르면** 쿠폰이 풀려 **중복 발급**될 수 있었다
 *   - 지금: 아무것도 안 눌러도 **중복은 절대 안 난다.** 대신 안내하지 않았을 때
 *          **「취소」를 눌러야** 그 쿠폰이 되살아난다
 *
 * 같은 번호가 두 고객에게 나가는 사고가 재고 한 장 잃는 것보다 훨씬 나쁘므로
 * **틀리는 방향이 안전한 쪽**이다. 화면 경고 문구도 그에 맞춰 적혀 있다.
 */
var STATE_USED = '사용';
var STATE_FREE = '미사용';
// 열 번호는 못 박지 않는다 — `detectCols_` 가 시트를 보고 찾는다(아래 참조).

/**
 * **HTML 파일 이름을 못 박지 않는다.**
 *
 * 기존 프로젝트의 화면 파일이 `Index.html` 일 수도, `CouponIndex.html` 일 수도 있다.
 * 이름 하나가 어긋나면 화면이 통째로 안 뜨는데 오류 메시지가 *"파일을 찾을 수 없습니다"*
 * 뿐이라 원인을 짚기 어렵다. 그래서 흔한 이름을 차례로 시도하고, 끝내 못 찾으면
 * **무엇을 해야 하는지 화면에 적는다**(이 저장소가 관리자 인증에서 *"스택만 보면 세팅을
 * 여기서 포기한다"* 며 세운 규칙과 같다).
 */
var HTML_CANDIDATES = ['CouponIndex', 'Index', 'index', 'Coupon', 'coupon'];

function doGet() {
  for (var i = 0; i < HTML_CANDIDATES.length; i++) {
    try {
      return HtmlService.createTemplateFromFile(HTML_CANDIDATES[i])
        .evaluate()
        .setTitle('경원영업팀 시크릿쿠폰')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
    } catch (err) { /* 다음 이름으로 */ }
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:24px;line-height:1.8">' +
    '<b>화면 파일을 찾지 못했습니다.</b><br><br>' +
    'Apps Script 편집기에서 HTML 파일 이름을 <b>CouponIndex</b> 로 만들어 주세요.<br>' +
    '<small>찾아본 이름: ' + HTML_CANDIDATES.join(', ') + '</small></div>'
  );
}

/* ── 안쪽 도구 ───────────────────────────────────────────── */

function couponSheets_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().filter(function (s) {
    return s.getName().charAt(0) !== '_' && !s.isSheetHidden();
  });
}

function sheetByName_(name) {
  var found = null;
  couponSheets_().forEach(function (s) { if (s.getName() === name) found = s; });
  return found;
}

/**
 * **머리글인지 쿠폰번호인지는 모양으로 가른다.**
 *
 * 붙여넣는 사람이 머리글을 넣을 수도, 안 넣을 수도 있다. 첫 줄을 무조건 버리면 머리글이
 * 없을 때 **쿠폰 한 장이 조용히 사라지고**, 무조건 쓰면 '쿠폰번호'라는 글자가 쿠폰이 된다.
 * 그래서 "숫자가 들어 있고 어느 정도 길다"는 쿠폰번호의 성질로 판정한다.
 */
function looksLikeCode_(v) {
  var s = String(v == null ? '' : v).trim();
  if (s.length < 6) return false;
  if (!/[0-9]/.test(s)) return false;
  if (/^(코드|쿠폰|쿠폰번호|번호|code|coupon)$/i.test(s)) return false;
  return true;
}

/**
 * **열 위치를 짐작하지 않고 찾아낸다.**
 *
 * 처음에는 "A열이 쿠폰번호"라고 못 박았다가 화면이 통째로 **「소진」** 으로 떴다.
 * 지금 시트는 **A열이 점명**이고(9월에 지울 예정이라 아직 남아 있다) 점명은 쿠폰번호처럼
 * 안 생겨서 전부 걸러졌기 때문이다. 그래서 열을 찾아내게 했다 —
 * **지금 시트에서도 되고, A열을 지운 뒤에도 그대로 된다.**
 *
 *  - **쿠폰번호 열** = 쿠폰번호처럼 생긴 값이 가장 많은 열(동점이면 왼쪽).
 *  - **상태 열** = 그 오른쪽에서 `미사용`·`사용` 같은 말이 있는 열.
 *    **이걸 반드시 찾아야 한다** — 옛 상태를 못 읽으면 **이미 나간 쿠폰을 다시 발급한다.**
 *    같은 번호가 두 고객에게 가는 사고라 이 파일에서 가장 위험한 지점이다.
 *    상태처럼 생긴 값이 하나도 없으면 번호 열 오른쪽 칸을 쓴다.
 *  - **시각 열** = 상태 열의 오른쪽 칸.
 *
 * **빈칸도 `미사용` 과 같은 뜻으로 본다.** 시트에는 `미사용`이라 적혀 있지만, 새로 붙여넣은
 * 줄은 상태 칸이 비어 있을 수 있다 — 그것을 "나갔다"로 읽으면 **멀쩡한 쿠폰이 통째로
 * 소진으로 보인다**(실제로 그렇게 떠서 헤맸다).
 */
var FREE_WORDS = ['', '미사용', '미발급', '사용가능', 'n', 'no', 'false'];
var STATE_WORDS = ['사용', '미사용', '발급', '미발급', '사용완료', '사용가능', 'y', 'n'];

function detectCols_(values) {
  var width = 0;
  for (var i = 0; i < values.length; i++) width = Math.max(width, values[i].length);

  // ① 쿠폰번호 열 — 코드처럼 생긴 값이 가장 많은 열
  var codeCol = 0, best = 0;
  for (var c = 0; c < width; c++) {
    var n = 0;
    for (var r = 0; r < values.length; r++) if (looksLikeCode_(values[r][c])) n++;
    if (n > best) { best = n; codeCol = c; }
  }
  if (!best) return null;                       // 쿠폰번호를 못 찾았다 — 0 이 아니라 '모름'이다

  // ② 상태 열 — 번호 열 오른쪽에서 상태처럼 생긴 말이 있는 첫 열
  var stateCol = -1;
  for (var c2 = codeCol + 1; c2 < Math.max(width, codeCol + 4); c2++) {
    for (var r2 = 0; r2 < values.length; r2++) {
      var v = String((values[r2][c2] == null ? '' : values[r2][c2])).trim().toLowerCase();
      if (v && STATE_WORDS.indexOf(v) !== -1) { stateCol = c2; break; }
    }
    if (stateCol !== -1) break;
  }
  if (stateCol === -1) stateCol = codeCol + 1;  // 전부 미사용이면 오른쪽 칸을 쓴다

  return { code: codeCol + 1, state: stateCol + 1, time: stateCol + 2 };
}

/** 그 탭의 줄들을 상태와 함께 읽는다. `row` 는 시트의 실제 행 번호다. */
function readRows_(sheet) {
  var last = sheet.getLastRow();
  if (last < 1) return { cols: null, rows: [] };
  var width = Math.max(sheet.getLastColumn(), 3);
  var values = sheet.getRange(1, 1, last, width).getValues();

  var cols = detectCols_(values);
  if (!cols) return { cols: null, rows: [] };

  var out = [];
  for (var i = 0; i < values.length; i++) {
    var code = String(values[i][cols.code - 1] == null ? '' : values[i][cols.code - 1]).trim();
    if (!looksLikeCode_(code)) continue;
    var state = String(values[i][cols.state - 1] == null ? '' : values[i][cols.state - 1]).trim();
    var free = FREE_WORDS.indexOf(state.toLowerCase()) !== -1;
    out.push({ row: i + 1, code: code, state: state, free: free });
  }
  return { cols: cols, rows: out };
}

/* ── 화면이 부르는 것 ────────────────────────────────────── */

/**
 * 쿠폰 종류 목록 — 탭마다 남은 장수를 함께 준다.
 * 인자는 옛 화면이 매장명을 넘겨도 죽지 않게 받아만 두고 쓰지 않는다.
 */
function getAvailableTypes(ignoredStore) {
  return couponSheets_().map(function (s) {
    var read = readRows_(s);
    /* **0 과 '모름'을 구분한다.** 열을 못 읽었는데 `count:0` 을 주면 화면이 「소진」이라
       적는데, 그건 거짓말이다 — 쿠폰은 멀쩡히 있고 우리가 못 읽은 것이다.
       실제로 그렇게 떠서 사장님이 "안 열립니다"라고 하셨다. */
    if (!read.cols) return { type: s.getName(), count: 0, total: 0, unreadable: true };
    var count = 0;
    read.rows.forEach(function (r) { if (r.free) count++; });
    return { type: s.getName(), count: count, total: read.rows.length };
  });
}

/**
 * **`미사용` 중 하나를 랜덤으로 뽑아 곧바로 `사용`으로 바꾼다.**
 *
 * `LockService` 가 반드시 필요하다 — 두 매장이 같은 순간에 누르면 **같은 쿠폰이 두 번
 * 나간다.** 읽고·고르고·쓰는 사이에 남이 끼어들 수 있기 때문이다. 전 점이 하나의 풀을
 * 나눠 쓰게 되면서 이 위험이 예전보다 커졌다(예전에는 매장마다 몫이 갈려 있었다).
 *
 * 인자를 둘 받는 것은 옛 화면이 `drawCoupon(store, type)` 으로 부르기 때문이다.
 * 하나만 넘어오면 그것을 종류로 본다.
 */
function drawCoupon(a, b) {
  var type = (b === undefined || b === null || b === '') ? a : b;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { success: false, message: '다른 매장이 발급 중입니다. 잠시 뒤 다시 눌러 주세요.' };
  }
  try {
    var sheet = sheetByName_(type);
    if (!sheet) return { success: false, message: '쿠폰 종류를 찾을 수 없습니다: ' + type };

    var read = readRows_(sheet);
    if (!read.cols) {
      return { success: false, message: '시트에서 쿠폰번호 열을 찾지 못했습니다. 「' + type + '」 탭을 확인해 주세요.' };
    }
    var rows = read.rows.filter(function (r) { return r.free; });
    if (!rows.length) return { success: false, message: '소진', soldOut: true };

    /* **뽑는 순간 바로 `사용`으로 바꾼다.** 상태가 둘뿐이라 잡아 둘 자리가 없고,
       무엇보다 이래야 **같은 번호가 두 고객에게 나가지 않는다.** 안내하지 않았으면
       화면의 「취소」가 `미사용` 으로 되돌린다. */
    var pick = rows[Math.floor(Math.random() * rows.length)];
    sheet.getRange(pick.row, read.cols.state).setValue(STATE_USED);
    sheet.getRange(pick.row, read.cols.time).setValue(new Date());
    SpreadsheetApp.flush();

    return {
      success: true,
      couponType: type,
      couponNumber: pick.code,
      rowIndex: pick.row,
      remain: rows.length - 1
    };
  } catch (err) {
    return { success: false, message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 고객에게 안내했다 — 사용완료로 확정한다.
 * 뽑을 때 이미 `사용`으로 바꿔 두었으므로 **사실상 확인 버튼**이다. 그래도 한 번 더 적는다 —
 * 중간에 무엇이 잘못돼 상태가 어긋났을 때 여기서 바로잡히고, 여러 번 눌러도 결과가 같다.
 */
function confirmUse(type, rowIndex, couponNumber) {
  return setState_(type, rowIndex, couponNumber, STATE_USED);
}

/** 안내하지 않았다 — 풀로 되돌린다. **이 버튼을 눌러야 쿠폰이 되살아난다.** */
function cancelDraw(type, rowIndex, couponNumber) {
  return setState_(type, rowIndex, couponNumber, STATE_FREE);
}

/**
 * **행 번호로 찾되 쿠폰번호로 검산한다.**
 *
 * 행 번호만 믿으면 그 사이 누가 시트에서 줄을 지웠을 때 **엉뚱한 쿠폰이 사용 처리된다.**
 * 반대로 쿠폰번호만 쓰면 같은 번호가 두 줄 있을 때 어느 줄인지 못 가른다. 둘을 함께 본다.
 */
function setState_(type, rowIndex, couponNumber, state) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, message: '잠시 뒤 다시 시도해 주세요.' };
  try {
    var sheet = sheetByName_(type);
    if (!sheet) return { success: false, message: '쿠폰 종류를 찾을 수 없습니다: ' + type };

    var read = readRows_(sheet);
    if (!read.cols) return { success: false, message: '시트에서 쿠폰번호 열을 찾지 못했습니다.' };

    var want = String(couponNumber || '').trim();
    var row = Number(rowIndex) || 0;
    if (row >= 1 && row <= sheet.getLastRow()) {
      var here = String(sheet.getRange(row, read.cols.code).getValue() || '').trim();
      if (here !== want) row = 0;               // 줄이 밀렸다 — 번호로 다시 찾는다
    } else {
      row = 0;
    }
    if (!row) {
      for (var i = 0; i < read.rows.length; i++) {
        if (read.rows[i].code === want) { row = read.rows[i].row; break; }
      }
    }
    if (!row) return { success: false, message: '해당 쿠폰을 찾지 못했습니다.' };

    sheet.getRange(row, read.cols.state).setValue(state);
    /* 되돌릴 때는 시각도 지운다 — 안 지우면 "안 나간 쿠폰인데 시각이 찍혀 있다"가 되어
       나중에 시트를 사람이 볼 때 발급된 것으로 오해한다. */
    sheet.getRange(row, read.cols.time).setValue(state === STATE_USED ? new Date() : '');
    SpreadsheetApp.flush();
    return { success: true };
  } catch (err) {
    return { success: false, message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

/* ── 옛 화면 호환 ────────────────────────────────────────────
 * 매장을 가르지 않으므로 이 둘은 할 일이 없다. 그래도 **지우지 않는다** —
 * 배포가 어긋나 옛 화면이 잠깐 남아 있어도 오류로 멈추지 않게 하기 위해서다.
 * (새 화면은 이 둘을 부르지 않는다.)
 ──────────────────────────────────────────────────────────── */
function getStoreList() { return []; }
function findStoreCode(name) { return { status: 'ok', store: String(name || '') }; }

/* ── 붙여넣은 뒤 한 번 확인해 보는 함수 ─────────────────────
 * 편집기에서 `설정확인` 을 고르고 ▶ 를 누르면 **실행 로그**에 결과가 찍힌다.
 * 화면을 열기 전에 "탭을 제대로 읽고 있는가"를 알 수 있다.
 ──────────────────────────────────────────────────────────── */
function 설정확인() {
  var types = getAvailableTypes();
  if (!types.length) {
    Logger.log('쿠폰 탭이 하나도 없습니다. 탭 이름이 _ 로 시작하거나 숨겨져 있지 않은지 보세요.');
    return;
  }
  var letter = function (n) { return String.fromCharCode(64 + n); };
  couponSheets_().forEach(function (s) {
    var read = readRows_(s);
    if (!read.cols) {
      Logger.log('탭 「' + s.getName() + '」 — 쿠폰번호 열을 찾지 못했습니다.');
      return;
    }
    var free = 0;
    read.rows.forEach(function (r) { if (r.free) free++; });
    Logger.log('탭 「' + s.getName() + '」 — 전체 ' + read.rows.length + '장 · 남은 것 ' + free + '장'
      + '  (쿠폰번호 ' + letter(read.cols.code) + '열 · 상태 ' + letter(read.cols.state) + '열 · 시각 ' + letter(read.cols.time) + '열)');
  });
  Logger.log('※ 열 위치가 엉뚱하면 그 탭의 첫 몇 줄을 확인해 주세요.');
}
