/*
 * 제품 심벌 — 미니앱 공용.
 *
 * **이모지를 쓰지 않는 이유** — 이모지는 제품이 아니라 연상되는 물건을 그린다.
 * 전자레인지가 📻(라디오), 세탁기가 🫧(거품), 냉장고가 🧊(얼음)이었다.
 * 고객에게 화면을 돌려 보여 주는 도구에서 제품이 제품으로 안 보이면 곤란하다.
 * 게다가 이모지는 OS 가 그리는 컬러 비트맵이라 윈도우·안드로이드·iOS 모양이 제각각이고,
 * 키우면 뭉갠다.
 *
 * **한 곳에 모아 두는 이유** — 미니앱마다 복사해 두면 심벌 하나 고칠 때 네 곳을 고쳐야 한다.
 *
 * 그리는 규칙은 사이드바 아이콘(components/Icon.tsx)과 같다 —
 *   24×24 그리드 · stroke 1.6 · round cap/join · 채우기 없음
 *   사선은 45°만, 곡선은 정원 호만 — 임의 각도·베지어를 쓰지 않는다
 * 크기는 `width:1em` 이라 **담는 자리의 font-size 를 그대로 따른다**.
 * 이모지를 font-size 로 키우던 자리에 그대로 넣으면 크기가 맞는다.
 */
(function (global) {
  'use strict';

  var S = {
    /* ── 주방 ── */
    fridge:      '<rect x="5.5" y="2.5" width="13" height="19" rx="1.8"/><path d="M5.5 9.6h13"/><path d="M8.6 5.8v2.2M8.6 11.8v3"/>',
    /* 양문형 — 문이 좌우로 갈린다 */
    fridge_side: '<rect x="5.5" y="2.5" width="13" height="19" rx="1.8"/><path d="M12 2.5v19"/><path d="M10.2 9v3M13.8 9v3"/>',
    /* 1도어 — 칸이 하나다 */
    fridge_one:  '<rect x="6.5" y="2.5" width="11" height="19" rx="1.8"/><path d="M14.4 9.4v3"/>',
    /* 김치냉장고 — 서랍 세 칸과 가로 손잡이 */
    kimchi:      '<rect x="5.5" y="2.5" width="13" height="19" rx="1.8"/><path d="M5.5 8.8h13M5.5 15.1h13"/><path d="M10 5.8h4M10 12.1h4M10 18.4h4"/>',
    /* 식기세척기 — 겹쳐 세운 접시 두 장 */
    dish:        '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 8.2h17"/><circle cx="10.1" cy="14.6" r="3"/><circle cx="14.5" cy="14.6" r="3"/>',
    /* 인덕션·전기레인지 — 상판의 두 화구 */
    induction:   '<rect x="2.5" y="5.5" width="19" height="13" rx="1.8"/><circle cx="8.6" cy="10.6" r="3.2"/><circle cx="16" cy="10.6" r="2.4"/><path d="M5.5 16h6"/>',
    /* 전자레인지·오븐 — 도어 창과 조작부 */
    microwave:   '<rect x="3" y="5" width="18" height="14" rx="1.8"/><rect x="5.5" y="7.6" width="9.5" height="8.8" rx="1"/><path d="M17.9 8.2v2.6M17.9 13.4v2.6"/>',
    /* 냉동고 — 눕힌 뚜껑형. 세로형으로 그리면 냉장고와 구분이 안 된다 */
    freezer:     '<rect x="2.5" y="6.5" width="19" height="11" rx="1.8"/><path d="M2.5 10.2h19"/><path d="M15.6 8.3h3.4"/>',
    /* 제습기 — 본체에 물방울. 정수기와 달리 통이 몸통 안에 있다 */
    dehumid:     '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M8 5.6h8"/><path d="M12 9.6l-2.2 3.2a2.7 2.7 0 1 0 4.4 0L12 9.6Z"/>',
    /* 데이코 빌트인 — 캐비닛에 끼운 오븐 */
    dacor:       '<rect x="2.5" y="3.5" width="19" height="17" rx="1.8"/><path d="M2.5 7.2h19"/><path d="M5.6 5.4h4"/><rect x="5.5" y="10" width="13" height="7.5" rx="1"/>',
    /* 모니터 — 화면과 목·받침. TV 와 달리 스탠드가 가운데 하나다 */
    monitor:     '<rect x="2.5" y="3.5" width="19" height="13" rx="1.8"/><path d="M12 16.5v3"/><path d="M8 19.5h8"/>',
    /* 데스크탑 — 세운 본체. 전원 버튼과 통풍구 */
    desktop:     '<rect x="6.5" y="2.5" width="11" height="19" rx="1.6"/><path d="M9.4 6h5.2M9.4 8.6h5.2"/><circle cx="12" cy="17.4" r="1.5"/>',
    /* 프린터 — 본체 위로 들어가는 용지, 아래로 나오는 출력물 */
    printer:     '<rect x="3.5" y="8.5" width="17" height="7.5" rx="1.6"/><path d="M7 8.5V3.5h10v5"/><path d="M7 16h10v4.5H7Z"/>',
    /* 언더싱크 정수기 — 싱크 위로 나온 꼭지 */
    purifier:    '<path d="M4.5 20.5h15"/><path d="M8 20.5v-7a3.5 3.5 0 0 1 3.5-3.5H16"/><path d="M16 7.5v4"/><path d="M16 13.6l-1.4 2a1.4 1.4 0 1 0 2.8 0L16 13.6Z"/>',
    /* 카운터탑·얼음 정수기 — 본체 아래 받침 컵 */
    purifier_top:'<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M12 6.2v3.4"/><rect x="8.6" y="11.6" width="6.8" height="6.4" rx="1"/><path d="M8.6 14h6.8"/>',

    /* ── 세탁·의류 ── */
    washer:      '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 8.2h16"/><circle cx="12" cy="14.6" r="4"/><path d="M16.6 5.4h1.2"/>',
    /* 건조기 — 도어 안의 건조 표시. 세로 세 줄은 작게 그리면 뭉갠다 */
    dryer:       '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 8.2h16"/><circle cx="12" cy="14.6" r="4"/><path d="M9.7 13.6h4.6M9.7 15.6h4.6"/>',
    /* 콤보 — 세탁·건조가 한 대(도어 안의 도어) */
    combo:       '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 8.2h16"/><circle cx="12" cy="14.6" r="4"/><circle cx="12" cy="14.6" r="1.5"/>',
    /* 에어드레서 — 캐비닛 안의 옷걸이 */
    dresser:     '<rect x="5" y="2.5" width="14" height="19" rx="1.8"/><circle cx="12" cy="8.4" r="1.4"/><path d="M8 14.4 12 10.4l4 4"/><path d="M8 14.4h8"/>',

    /* ── 공조·청소 ── */
    aircon:      '<rect x="3" y="6.5" width="18" height="7" rx="1.8"/><path d="M6.5 17h11M8.5 20h7"/>',
    airpur:      '<rect x="6" y="2.5" width="12" height="19" rx="2"/><circle cx="12" cy="9.4" r="3.4"/><path d="M9 15.6h6M9.8 18.2h4.4"/>',
    /* 로봇청소기 — 위에서 본 몸체(앞이 평평하다) */
    robot:       '<circle cx="12" cy="12" r="8.5"/><path d="M4.7 7.8h14.6"/><circle cx="12" cy="13.4" r="2"/><path d="M7.5 17.6h9"/>',
    /* 무선청소기 — 손잡이·막대·마름모 헤드 */
    stick:       '<circle cx="19.3" cy="2.9" r="1.5"/><path d="M18.2 4 10 12.2"/><path d="M6.5 15.7 10 12.2l2.5 2.5L9 18.2Z"/>',

    /* ── 영상·음향·모바일 ── */
    tv:          '<rect x="2.5" y="4" width="19" height="13" rx="1.6"/><path d="M12 17v3.5"/><path d="M8 20.5h8"/>',
    soundbar:    '<rect x="2.5" y="8.5" width="19" height="7" rx="2"/><circle cx="7.4" cy="12" r="1.8"/><circle cx="16.6" cy="12" r="1.8"/><path d="M11.4 12h1.2"/>',
    phone:       '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M10.6 5.3h2.8"/><path d="M10.5 18.7h3"/>',
    tablet:      '<rect x="4.5" y="2.5" width="15" height="19" rx="2.2"/><path d="M10.4 18.9h3.2"/>',
    laptop:      '<rect x="4.5" y="4.5" width="15" height="10.5" rx="1.4"/><path d="M2.5 18.5h19"/>',
    watch:       '<rect x="7.5" y="7.5" width="9" height="9" rx="2.4"/><path d="M9.8 7.5V4.4h4.4v3.1M9.8 16.5v3.1h4.4v-3.1"/>',
    /* 이어폰 — 헤드밴드형이 24px 에서 가장 잘 읽힌다 */
    buds:        '<path d="M4.5 15.5v-3.5a7.5 7.5 0 0 1 15 0v3.5"/><rect x="2.5" y="14" width="4.2" height="6.2" rx="1.6"/><rect x="17.3" y="14" width="4.2" height="6.2" rx="1.6"/>',
  };

  /*
   * 라벨 → 심벌. **순서가 곧 우선순위다** —
   * '김치냉장고'는 '냉장고'보다, '세탁기·콤보'는 '세탁기'보다, '로봇청소기'는 '청소기'보다 먼저 와야 한다.
   */
  var RULES = [
    [/김치\s*냉장고|김치플러스/, 'kimchi'],
    /* 냉동고·데이코는 '냉장고' 규칙보다 먼저 봐야 한다 — 업소용 냉동고가 냉장고로 빠지지 않게 */
    [/냉동고/, 'freezer'],
    [/데이코|dacor/i, 'dacor'],
    [/제습/, 'dehumid'],
    [/모니터/, 'monitor'],
    [/데스크탑|데스크톱/, 'desktop'],
    [/프린터|복합기/, 'printer'],
    [/냉장고.*양문|양문.*냉장고/, 'fridge_side'],
    [/냉장고.*1\s*도어|1\s*도어.*냉장|원도어/, 'fridge_one'],
    [/냉장고|비스포크\s*AI\s*냉장/, 'fridge'],
    [/식기\s*세척/, 'dish'],
    [/인덕션|전기\s*레인지|하이라이트/, 'induction'],
    [/전자\s*레인지|오븐|큐커/, 'microwave'],
    [/정수기/, function (l) { return /카운터탑|얼음/.test(l) ? 'purifier_top' : 'purifier'; }],
    [/콤보/, 'combo'],
    [/건조기/, 'dryer'],
    [/세탁기|워시/, 'washer'],
    [/에어\s*드레서|드레서/, 'dresser'],
    [/에어컨|무풍/, 'aircon'],
    [/공기\s*청정/, 'airpur'],
    [/로봇\s*청소/, 'robot'],
    [/무선\s*청소|스틱\s*청소|청소기/, 'stick'],
    [/사운드\s*바|사운드바/, 'soundbar'],
    [/TV|티비|텔레비/i, 'tv'],
    [/노트북|갤럭시\s*북|그램/, 'laptop'],
    [/태블릿|탭\b/, 'tablet'],
    [/워치|시계/, 'watch'],
    [/버즈|이어폰|이어버드|헤드폰/, 'buds'],
    [/스마트폰|갤럭시\s*S|갤럭시\s*Z|폴드|플립|휴대폰/, 'phone'],
  ];

  /* 앱마다 쓰는 내부 키도 그대로 받아 준다 (care-app 의 PRODUCTS[].key 등) */
  var KEYS = {
    aircon: 'aircon', washer: 'washer', dryer: 'dryer', aicombo: 'combo', fridge: 'fridge',
    kimchi: 'kimchi', dish: 'dish', dresser: 'dresser', vacuum: 'robot',
    airpur_reusable: 'airpur', airpur_s: 'airpur',
    purifier_under: 'purifier', purifier_counter: 'purifier_top',
    induction: 'induction', microwave: 'microwave', soundbar: 'soundbar',
  };

  function symbolKey(label) {
    if (!label) return null;
    var s = String(label).trim();
    if (KEYS[s]) return KEYS[s];
    if (S[s]) return s;
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(s)) {
        var v = RULES[i][1];
        return typeof v === 'function' ? v(s) : v;
      }
    }
    return null;
  }

  /** 심벌 하나. 못 찾으면 fallback(대개 원래 이모지)으로 물러선다. */
  function prodSymbol(label, fallback) {
    /*
     * **크기 CSS 를 여기서도 넣는다.** 예전에는 upgradeIcons() 만 넣었는데, 이 함수만
     * 쓰는 앱에서는 규칙이 없어 SVG 가 담는 칸을 꽉 채웠다 — AS 에서 아이콘이 타일의
     * 85%(78.8px)까지 커졌다. 스타일 없는 SVG 는 width 가 auto 라 부모만큼 늘어난다.
     */
    injectCss();
    var k = symbolKey(label);
    if (!k || !S[k]) return fallback == null ? '' : fallback;
    return '<svg class="psym" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + S[k] + '</svg>';
  }

  /* 크기는 자리마다 다르므로 1em 으로 두고, 색만 삼성 블루로 정한다 */
  function injectCss() {
    if (document.getElementById('psym-css')) return;
    var st = document.createElement('style');
    st.id = 'psym-css';
    /*
     * 1em 으로 두면 이모지보다 작아 보인다 — 이모지 글리프는 em 상자를 거의 꽉 채우지만
     * 선으로 그린 SVG 는 안쪽에 여백이 남기 때문이다. 1.15em 이 눈으로 맞는 크기다.
     */
    st.textContent = '.psym{width:1.15em;height:1.15em;display:inline-block;vertical-align:-0.2em;'
      + 'color:#1428A0;flex:0 0 auto}';
    (document.head || document.documentElement).appendChild(st);
  }

  var EMO = /[←-⇿☀-➿⬀-⯿️⌚⌛⏰-⏺]|[\uD83C-\uD83E][\uDC00-\uDFFF]/;

  /**
   * 이미 그려진 이모지 아이콘 자리를 심벌로 바꾼다.
   *
   * HTML 에 이모지가 수백 군데 박혀 있는 앱(설치환경 가이드 등)을 한 줄씩 고치는 대신
   * 그려진 뒤에 갈아 끼운다. 라벨은 `data-cat` → 부모 글자 순으로 읽는다.
   */
  function upgradeIcons(root, selector) {
    injectCss();
    var sel = selector || '.ci,.p-icon,.drop-ico,.cat-ico,.ov-ico,.todo-ico,.c-ico';
    var list = (root || document).querySelectorAll(sel);
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.querySelector('svg.psym')) continue;             // 이미 바꾼 자리
      if (!EMO.test(el.textContent || '')) continue;          // 이모지가 아니면 손대지 않는다
      var p = el.parentElement || el;
      var label = (el.dataset && el.dataset.label)
        || (p.dataset && (p.dataset.cat || p.dataset.label))
        || (p.textContent || '').replace(el.textContent, '').trim();
      var svg = prodSymbol(label, null);
      if (!svg) continue;                                     // 모르는 라벨은 이모지를 그대로 둔다
      el.innerHTML = svg;
      n++;
    }
    return n;
  }

  global.PROD_SYMBOLS = S;
  global.prodSymbolKey = symbolKey;
  global.prodSymbol = prodSymbol;
  global.upgradeProdIcons = upgradeIcons;
  global.injectProdSymbolCss = injectCss;
})(window);
