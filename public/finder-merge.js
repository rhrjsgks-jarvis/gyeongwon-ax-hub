/*
 * 삼성닷컴 수집분(`finder-extra.json` 의 `fill`)을 제품에 붙일 때 **같은 칸을 두 줄로
 * 만들지 않는다** (2026-08-30 신설).
 *
 * **공용 파일로 뺀 이유** — 제품 상세검색과 당사제품 비교가 같은 자료를 쓰는데,
 * 병합 규칙을 각자 적으면 한쪽만 고쳤을 때 **같은 제품의 사양이 두 화면에서 갈린다.**
 * 실제로 당사제품 비교는 fill 을 아예 안 붙여 200종에서 9,871줄이 안 보이고 있었다.
 *
 * 무엇이 문제였나 — 인라인은 `W×H×D`, 삼성닷컴은 `W×H×D(mm)` 라 병합이
 * "없던 항목" 으로 보고 **치수 줄을 하나 더** 붙였다. 화면에 서로 다른 치수 두 줄이 떠
 * 상담사가 어느 쪽을 읽어야 할지 알 수 없었다 — **값 하나가 틀린 것보다 나쁘다.**
 *
 * 두 겹으로 막는다:
 *  ① **라벨을 뜻 단위로** 견준다. 다만 **괄호 안이 아래 단위 목록에 있을 때만** 지운다 —
 *     "알파벳뿐이면 단위" 로 두었더니 `밝기 (Typical)` 과 `밝기 (Min)`, `소비전력 (Max)` 와
 *     `(DPMS)` 를 같은 칸으로 뭉갰다(모니터 89건). **다른 것을 재는 칸**이라 한 줄만
 *     남으면 자료가 사라진다.
 *  ② **값의 모양**으로 한 겹 더 — 라벨 표현이 아예 다르면 글자로는 못 잡는다
 *     (`W×H×D(mm) 실내기` vs `실내기 크기(가로 × 높이 × 깊이)`, 에어컨 94종).
 *     `a × b × c` 꼴이면 치수 행으로 보고, **어느 부품인지**를 읽어 그 부품 치수를
 *     이미 갖고 있으면 덧붙이지 않는다. 부품이 다르면 그대로 담는다 — 실외기·판넬·포장은
 *     **다른 것을 재는 값**이다.
 *
 * **어느 값이 맞는지는 여기서 정하지 않는다** — 이 저장소의 원칙대로 카탈로그가 기준이라
 * 기존 값을 남긴다. 어긋나는 것은 다음 카탈로그 대조 때 함께 볼 것.
 *
 * `test-finder` 가 **이 파일의 함수를 그대로 꺼내** 실제 자료로 돌린다 — 검사 쪽에 의도를
 * 다시 적으면 이 파일이 바뀌어도 통과해 아무것도 못 지킨다. 두 규칙을 각각 되돌려 넣어
 * 무는 것을 확인했다.
 */
(function () {
  "use strict";

  var UNIT = /^(mm|㎜|cm|㎝|m|kg|g|l|ml|w|kw|kwh|v|a|hz|㎐|db|㏈|㎡|㎥|℃|°c|°|inch|인치|pa|㎩|rpm)$/;

  function normLab(k) {
    return String(k).toLowerCase()
      .replace(/\(([^)]*)\)/g, function (m0, inner) {
        return UNIT.test(inner.replace(/^\s+|\s+$/g, "")) ? "" : m0;
      })
      .replace(/[\s·:,]/g, "")
      .replace(/[x*×]/g, "×")
      .replace(/(mm|㎜)$/, "");
  }

  var PARTS = ["실내기", "실외기", "판넬", "패널", "포장", "박스", "스탠드", "벽걸이", "본체",
               "미니워시", "개구부", "청정스테이션", "우퍼", "거치", "받침", "배관", "리모컨", "도어", "서랍", "충전"];

  function isTri(v) {
    var n = String(v).match(/[0-9][0-9,]*(?:\.[0-9]+)?/g) || [];
    return /[x*×]\s*[0-9]/.test(String(v)) && n.length >= 3;
  }

  function partOf(k, v) {
    var t = String(k) + " " + String(v);
    for (var i = 0; i < PARTS.length; i++) if (t.indexOf(PARTS[i]) >= 0) return PARTS[i];
    return "본체";
  }

  /** 제품 `p` 에 덧붙여도 되는 fill 행만 골라 돌려준다 */
  function pickRows(p, fillRows) {
    if (!p || !fillRows || !fillRows.length) return [];
    var have = {}, haveDim = {};
    (p.fx || []).forEach(function (r) {
      have[normLab(r[0])] = 1;
      if (isTri(r[1])) haveDim[partOf(r[0], r[1])] = 1;
    });
    return fillRows.filter(function (r) {
      if (have[normLab(r[0])]) return false;
      if (isTri(r[1]) && haveDim[partOf(r[0], r[1])]) return false;
      have[normLab(r[0])] = 1;   /* fill 끼리도 같은 칸을 두 번 적지 않는다 */
      return true;
    });
  }

  /*
   * 묶음(세트) 상품인가 — 2026-08-27 사장님 결정으로 검색·비교에서 뺀다.
   * 규칙은 제품 상세검색과 **한 벌**이어야 한다(당사제품 비교가 같은 것을 쓴다).
   * 괄호 안의 + 는 규격 설명(80㎡+33㎡)이고, Copilot+ · 열풍건조+ 는 제품·기능 이름이다.
   */
  function isPackage(p) {
    var s = String((p && p.group) || "");
    s = s.replace(/\([^)]*\)/g, " ");
    s = s.replace(/copilot\s*\+|열풍건조\s*\+/gi, " ");
    return /[+＋]|패키지|번들/.test(s);
  }

  window.AX_FILL = { pickRows: pickRows, normLab: normLab, isTri: isTri, partOf: partOf, isPackage: isPackage };
})();
