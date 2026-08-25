/* # 출제 로직 — **A4 인쇄용과 웹 시험이 함께 쓴다** (2026-08-25)
 *
 * 사장님이 `urlquizgenerator_SKILL.md` 로 방향을 주며 **인터랙티브 웹 시험**을 최종
 * 목표로 정했다. 그 도구도 같은 문제은행에서 같은 규칙으로 뽑아야 하는데,
 * 출제부를 두 벌로 두면 **한쪽만 고쳤을 때 두 시험지가 다른 말을 한다** —
 * 이 저장소가 허브 카드 개수·앱 버전·비교표 값에서 반복해서 데인 그 사고다.
 *
 * 그래서 이 파일 하나만 고치고, 두 빌더가 `/*__EXAM_CORE__*` + `/` 자리에 통째로 끼운다.
 * **브라우저에서 그대로 도는 고전 스크립트**여야 한다 — import/export 를 쓰지 말 것
 * (자립형 파일이라 모듈 로더가 없다).
 *
 * 여기 담긴 것 — 시드 난수 · 시험지 코드 · 난이도 배분 · 출제(`pick`).
 * 화면 그리기는 각 틀이 알아서 한다(한쪽은 A4 지면, 한쪽은 타이머 달린 웹). */
/* ── 시드 난수 ──
   **왜 시드를 쓰나** — 시험지 코드로 같은 시험지를 다시 뽑을 수 있어야 한다.
   여러 장 인쇄하면 시험지와 정답지가 섞이는데, 코드가 있으면 짝을 되찾는다.
   Math.random 을 쓰면 그 순간 결과가 사라져 재인쇄가 불가능하다. */
function seedFrom(code){
  var h = 2166136261;
  for (var i = 0; i < code.length; i++){ h ^= code.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed){
  var s = seed || 1;
  return function(){ s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
/* I·O·0·1 은 뺀다 — 손으로 옮겨 적을 때 헷갈린다 */
var LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(){
  var c = '';
  for (var i = 0; i < 4; i++) c += LETTERS.charAt(Math.floor(Math.random() * LETTERS.length));
  return c;
}
function shuffle(arr, rnd){
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--){
    var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ── 문항 뽑기 ──
   사용자 요청 그대로 **순수 랜덤**이다 — 카테고리마다 반드시 나오게 하지 않는다
   (그건 /test 앱이 하는 일이고 여기는 성격이 다르다).
   **맞추는 것은 CE / MX 비중 하나뿐이다**(2026-08-24 사장님 지시: 50% / 50%).
   한쪽이 모자라면 **모자란 만큼 반대쪽으로 채우고 그 사실을 밝힌다** — 조용히 넘기지 않는다. */
/* ## 한 시험지가 동시에 지켜야 하는 것이 셋이다 (2026-08-24 사장님 지시)
 *   ① CE 50% / MX 50%
 *   ② 난이도 **상·중·하를 섞는다** — 난이도별로 시험지를 따로 내지 않는다
 *   ③ **LG 비교 문항 4개 고정** — "시험문제 LG비교문항 필요"
 *
 * 셋이 서로 물린다. LG 문항은 전부 CE 라 ③을 채우면 ①의 CE 자리가 줄고, 그 문항들의
 * 난이도가 ②의 칸을 먹는다. 그래서 **가장 빡빡한 것부터 채운다** — LG(9개 카테고리에서
 * 37문항뿐) → 난이도×갈래 → 남는 자리.
 *
 * **모자라면 조용히 넘기지 않고 화면에 적는다.** 이 저장소의 규칙이고, 여기서 특히 중요하다 —
 * "LG 4문항"은 사장님과 한 약속이라 안 지켜졌으면 그 사실이 보여야 한다. */
var LV_ORDER = ['하', '중', '상'];
/* ## 난이도 비중은 출력할 때마다 고른다 (2026-08-25 사장님 요청)
 * *"문제난이도 비중을 선택해서 출력할수있게"* · *"상담매니저들 실력향상과 전문성을 위한
 * 시험문제이기때문에 조금 더 문제 난이도가 높아도 됩니다"* → 기본을 **하4·중8·상8** 로
 * 올렸다(상 30% → 40%). 옛 기본은 하6·중8·상6 이었고 '쉽게' 가 그 자리를 대신한다.
 *
 * **`중` 은 8 아래로 내리지 않는다.** LG 비교 문항 74개가 **전부 '중'** 이라
 * `중 < LG_WANT(6)` 이면 "LG 6문항 고정" 이 그 자리에서 깨진다. 프리셋 넷이 모두
 * 중 7~8 인 이유이고, '직접 지정' 에서 낮추면 화면이 그 사실을 적는다(아래 `render`). */
/* 2026-08-25 사장님 지시로 **웹 시험과 같은 기준**이 됐다 — 방향성 문서
   (`urlquizgenerator_SKILL.md`)의 **상 50 · 중 35 · 하 15**. 20문항이면 10·7·3 으로
   정확히 떨어진다. 옛 값 하4·중8·상8(상 40%)은 프리셋 '쉽게' 쪽으로 내려갔다.
   *"이 시험은 붙는 시험이 아니다 … 목표는 평균 60점대"* 가 그 근거이고,
   A4 를 매장 교육용이라 다르게 둘지 물었으나 **맞추라**는 답을 받았다.
   **중은 6 아래로 내리지 않는다** — LG 비교 문항이 전부 '중' 이라 약속이 깨진다. */
var LV_MIX = { '하': 3, '중': 7, '상': 10 };
var LG_WANT = 6;   /* 2026-08-24 사장님 요청으로 4 → 6. 은행 68문항이라 두 시험지 기대 겹침 0.5개 */

/** 고른 비중을 문항 수 n 에 맞춰 나눈다. mix 는 **비율**이라 합이 20 이 아니어도 된다
 *  (직접 지정에서 3·3·4 처럼 쳐도 그대로 돌아간다). */
function lvQuota(n, mix){
  mix = mix || LV_MIX;
  var tot = 0, q = {}, sum = 0, i, L;
  for (i = 0; i < LV_ORDER.length; i++) tot += Math.max(0, mix[LV_ORDER[i]] || 0);
  if (!tot) return lvQuota(n, LV_MIX);           /* 셋 다 0 이면 기본값으로 되돌린다 */
  for (i = 0; i < LV_ORDER.length; i++){
    q[LV_ORDER[i]] = Math.round(n * Math.max(0, mix[LV_ORDER[i]] || 0) / tot);
    sum += q[LV_ORDER[i]];
  }
  /* 반올림으로 어긋난 만큼을 어디서 맞추는가 — **모자라면 큰 칸에 얹고, 넘치면 작은 칸에서 뺀다.**
     예전에는 '중' 에 몰아줬는데, 비중을 고를 수 있게 되면서 '중' 이 0 인 배분이 생겨
     **고르지도 않은 난이도가 시험지에 들어갔다.** 그래서 큰 칸으로 바꿨는데, 이번엔
     넘칠 때도 큰 칸에서 깎아 **강조한 난이도가 되레 줄었다** — 25문항 상 50% 가
     12.5 라 13 이어야 하는데 12 가 됐다(사장님 방향성 문서의 점검표가
     *"난이도 '상'이 절반 이상인가"* 다). 강조한 칸은 지키고 얇은 칸을 양보시킨다. */
  var over = sum - n;
  if (over < 0) {
    var big = LV_ORDER[0];
    for (i = 1; i < LV_ORDER.length; i++) if (q[LV_ORDER[i]] > q[big]) big = LV_ORDER[i];
    q[big] += -over;
  } else {
    while (over > 0) {
      var small = null;
      for (i = 0; i < LV_ORDER.length; i++) {
        var L = LV_ORDER[i];
        if (q[L] > 0 && (small === null || q[L] < q[small])) small = L;
      }
      if (small === null) break;
      q[small]--; over--;
    }
  }
  return q;
}

function pick(n, mxPct, rnd, mix){
  var wantMx = Math.round(n * mxPct / 100);
  var wantLv = lvQuota(n, mix);
  var need = { lv: lvQuota(n, mix), div: { MX: wantMx, CE: n - wantMx } };
  var all = BANK.items, used = {}, out = [];

  /* 조건에 맞는 것 하나를 무작위로 집는다. 없으면 null — 부르는 쪽이 조건을 늦춘다. */
  function take(ok){
    var pool = [], i;
    for (i = 0; i < all.length; i++) if (!used[all[i].i] && ok(all[i])) pool.push(all[i]);
    if (!pool.length) return null;
    var q = pool[Math.floor(rnd() * pool.length)];
    used[q.i] = 1; out.push(q);
    if (need.lv[q.lv] > 0) need.lv[q.lv]--;
    if (need.div[q.div] > 0) need.div[q.div]--;
    return q;
  }

  /* ① LG 문항 먼저 — 가장 얇아서 나중에 채우면 자리가 남지 않는다 */
  var gotLg = 0;
  while (gotLg < LG_WANT && out.length < n) {
    /* **난이도 칸을 넘어서까지 LG 를 밀어 넣지 않는다** (2026-08-25).
       난이도 비중이 사장님이 그 자리에서 고른 값이 된 뒤로, 갈래(CE/MX)만 늦추고
       난이도는 지킨다 — 안 그러면 `상 20` 을 골랐는데 LG 6개가 '중' 이라 **상 14** 가
       나온다(실측). 못 넣은 만큼은 `render` 가 원인과 함께 화면에 적는다. */
    var q = take(function(x){ return x.lg && need.lv[x.lv] > 0 && need.div[x.div] > 0; })
         || take(function(x){ return x.lg && need.lv[x.lv] > 0; });
    if (!q) break;                       /* 은행에 LG 문항이 모자란다 */
    gotLg++;
  }

  /* ② 난이도 × 갈래를 함께 맞추고, 안 되면 한 조건씩 늦춘다.
   *
   * **채우면서 LG 를 또 뽑지 않는다.** LG 문항도 일반 풀에 들어 있어 그냥 채우면 우연히
   * 더 뽑히고, 그러면 "LG 4문항 고정"이 약속이 아니라 하한이 된다(실측으로 6개가 나왔다).
   * 정말 채울 것이 없을 때만 마지막 폴백에서 받아들인다 — 문항 수를 못 채우는 쪽이 더 나쁘다. */
  var noLg = function(x){ return !x.lg || gotLg < LG_WANT; };
  while (out.length < n) {
    var q2 = take(function(x){ return noLg(x) && need.lv[x.lv] > 0 && need.div[x.div] > 0; })
          || take(function(x){ return noLg(x) && need.lv[x.lv] > 0; })
          || take(function(x){ return noLg(x) && need.div[x.div] > 0; })
          || take(function(x){ return noLg(x); })
          || take(function(){ return true; });
    if (!q2) break;                      /* 은행이 바닥났다 */
    if (q2.lg) gotLg++;
  }

  var got = { lv: {}, div: { CE: 0, MX: 0 }, lg: 0 };
  for (var k = 0; k < out.length; k++){
    got.lv[out[k].lv] = (got.lv[out[k].lv] || 0) + 1;
    got.div[out[k].div]++;
    if (out[k].lg) got.lg++;
  }
  return { list: shuffle(out, rnd), wantMx: wantMx, wantLv: wantLv, wantLg: LG_WANT,
           gotMx: got.div.MX, gotCe: got.div.CE, gotLv: got.lv, gotLg: got.lg };
}

