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

    /* ── 서비스 ──
     * 제품이 아니라 **업무**를 가리키는 자리(AS 연락처의 묶음 머리 등)에 쓴다.
     * 여기에 그림이 없어서 그 자리에만 이모지가 남아 있었다. 그리는 규칙은 위와 같다 —
     * 규칙이 갈리면 한 화면에서 그림이 두 종류로 보인다. */
    /* AS·수리 — 보증을 뜻하는 방패. 아래를 정원 호로 닫아 45°가 아닌 사선을 피한다 */
    shield:      '<path d="M4.5 5.8 12 3l7.5 2.8V12A7.5 7.5 0 0 1 4.5 12Z"/><path d="M9 11.8l2.2 2.2 3.8-4"/>',
    /* 물류·배송 — 화물칸 + 운전석(45° 사선) + 바퀴 두 개 */
    truck:       '<path d="M2.5 6.5h11v8.5h-11z"/><path d="M13.5 9.5h3l3 3v2.5h-6z"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    /* 이전설치 — 렌치보다 **옮기는 상자**가 16px 에서 훨씬 잘 읽히고 뜻도 정확하다.
     * 상자 안의 테이프 선은 뺐다 — 16px 에서 화살표와 뭉쳐 덩어리로 보였다. */
    move:        '<rect x="2.5" y="7" width="10" height="10" rx="1.4"/><path d="M15 12h5.5"/><path d="M18 9.5 20.5 12 18 14.5"/>',
    /* 후드 — 배기관 + 캐노피 + 아래 조리대.
     * 흡입 슬롯 세 줄을 그렸더니 16px 에서 빗자루로 읽혔다. 조리대 선 하나로 바꿨다. */
    hood:        '<path d="M10.6 2.5h2.8v3.5h-2.8z"/><path d="M3.5 9.5h17v4h-17z"/><path d="M6 17.5h12"/>',

    /* ── 화면 표시 ──
     * 본문 안의 상태 마커(✅·⚠)와 버튼·머리말 아이콘 자리. 여기까지 심벌로 덮어야
     * 한 화면에 OS 가 그리는 컬러 비트맵과 우리 선 그림이 섞이지 않는다. */
    check:       '<path d="M4.5 12.5 9.5 17.5 19.5 7.5"/>',
    warn:        '<path d="M12 3.5 21.5 20H2.5L12 3.5Z"/><path d="M12 9.5v4.5"/><path d="M12 17h.01"/>',
    x:           '<path d="M6 6l12 12M18 6 6 18"/>',
    info:        '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.8h.01"/>',
    dot:         '<circle cx="12" cy="12" r="5"/>',
    doc:         '<path d="M5.5 3.5h9L18.5 7.5v13h-13z"/><path d="M14 3.5v4.5h4.5"/><path d="M8.5 12.5h7M8.5 16h5"/>',
    note:        '<path d="M4.5 19.5v-3.5L16 4.5l3.5 3.5L8 19.5H4.5Z"/><path d="M13.5 7 17 10.5"/>',
    tool:        '<path d="M14.5 3.5a4.5 4.5 0 0 0 5.4 5.9L9.7 19.6a2.6 2.6 0 1 1-3.7-3.7L16.2 5.7"/>',
    ruler:       '<path d="M3.5 14.5 14.5 3.5l6 6-11 11-6-6Z"/><path d="M7.5 10.5 9.5 12.5M10.5 7.5 12.5 9.5M13.5 4.5 15.5 6.5"/>',
    target:      '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
    bolt:        '<path d="M13.5 2.5 5.5 13.5h5.5l-1 8 8-11h-5.5l1-8Z"/>',
    link:        '<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1.5 1.5"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5L12.5 16.5"/>',
    bulb:        '<path d="M12 2.8a6 6 0 0 0-3.5 10.9v2.3h7v-2.3A6 6 0 0 0 12 2.8Z"/><path d="M9.8 19h4.4M10.5 21.3h3"/>',
    home:        '<path d="M3.5 11 12 3.5l8.5 7.5"/><path d="M5.8 12.8v7.7h12.4v-7.7"/>',
    chart:       '<path d="M3.5 20.5h17"/><path d="M7 17.5v-6M12 17.5v-10M17 17.5v-4"/>',
    call:        '<path d="M8.6 3.5 11 8 8.8 10.2a11 11 0 0 0 5 5L16 13l4.5 2.4v3.6a1.5 1.5 0 0 1-1.7 1.5C10.6 19.8 4.2 13.4 3 5.2A1.5 1.5 0 0 1 4.5 3.5h4.1Z"/>',
    calendar:    '<rect x="3.5" y="5.5" width="17" height="15" rx="1.8"/><path d="M3.5 10h17"/><path d="M8 3.5v4M16 3.5v4"/>',
    ticket:      '<path d="M2.5 8.5h19v3a2.5 2.5 0 0 0 0 5v3h-19v-3a2.5 2.5 0 0 0 0-5v-3Z"/><path d="M12 9.5v5"/>',
    gift:        '<rect x="3" y="9.5" width="18" height="11" rx="1.5"/><path d="M2 6.5h20v3H2z"/><path d="M12 6.5v14"/><path d="M12 6.5 9 3.5M12 6.5 15 3.5"/>',
    cart:        '<circle cx="9.5" cy="19.5" r="1.6"/><circle cx="17.5" cy="19.5" r="1.6"/><path d="M2.5 3.5h2.6l3 12h11l2.4-8.5H7"/>',
    search:      '<circle cx="10.8" cy="10.8" r="6.8"/><path d="M15.8 15.8 20.5 20.5"/>',
    pin:         '<path d="M12 21.5V13"/><path d="M9 3.5h6l-1 6 3 2.5H7l3-2.5-1-6Z"/>',
    share:       '<path d="M12 15.5V3.5"/><path d="M8.5 7 12 3.5 15.5 7"/><path d="M4.5 13.5v6a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-6"/>',
    plus:        '<path d="M12 5v14M5 12h14"/>',
    play:        '<path d="M7.5 4.5 19 12 7.5 19.5v-15Z"/>',
    arrows:      '<path d="M3.5 12h17"/><path d="M7 8.5 3.5 12 7 15.5M17 8.5 20.5 12 17 15.5"/>',
    arrow_ne:    '<path d="M6.5 17.5 17.5 6.5"/><path d="M9.5 6.5h8v8"/>',
    fire:        '<path d="M12 2.8S6.5 7.5 6.5 13a5.5 5.5 0 0 0 11 0c0-2.5-1.8-4.6-3-6-.6 1.6-1.6 2.4-2.5 2.4 0-2.6 0-6.6 0-6.6Z"/>',
    wind:        '<path d="M3.5 8.5h10a3 3 0 1 0-3-3"/><path d="M3.5 13h13a3 3 0 1 1-3 3"/><path d="M3.5 17.5h6"/>',
    drop:        '<path d="M12 3.2 6.8 11a6.2 6.2 0 1 0 10.4 0L12 3.2Z"/>',
    camera:      '<rect x="2.5" y="6.5" width="19" height="13" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8.5 6.5 10 3.5h4l1.5 3"/>',
    chat:        '<path d="M20.5 14.5a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9Z"/>',
    money:       '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9.5v5M18 9.5v5"/>',
    store:       '<path d="M4 10.5v10h16v-10"/><path d="M2.5 8 4.5 3.5h15L21.5 8a3 3 0 0 1-6 0 3 3 0 0 1-7 0 3 3 0 0 1-6 0Z"/>',
    book:        '<path d="M4 4.5h6a3 3 0 0 1 2 2.8v12a2.4 2.4 0 0 0-2-1.8H4v-13Z"/><path d="M20 4.5h-6a3 3 0 0 0-2 2.8v12a2.4 2.4 0 0 1 2-1.8h6v-13Z"/>',
    edu:         '<path d="M2.5 8.5 12 4l9.5 4.5L12 13 2.5 8.5Z"/><path d="M6.5 10.5v5c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-5"/>',
    tap:         '<path d="M9 11V5.5a2 2 0 1 1 4 0V13"/><path d="M13 10.5a2 2 0 0 1 4 0V12a2 2 0 0 1 4 0v3.5a5 5 0 0 1-5 5h-2.5a5 5 0 0 1-4-2L7 15.5a2 2 0 0 1 3-2.5"/>',
    clip:         '<path d="M17.5 10.5 10 18a4 4 0 0 1-5.7-5.7l8.5-8.5a2.8 2.8 0 0 1 4 4l-8.5 8.5a1.6 1.6 0 0 1-2.3-2.3l7.8-7.8"/>',
    /* 저울(비교) — 16px 에서 접시를 곡선으로 그리면 뭉갠다. 짧은 가로선 둘로 둔다 */
    scale:        '<path d="M12 4v16"/><path d="M6 20h12"/><path d="M4 8h16"/><path d="M4 8 1.8 13h4.4L4 8Z"/><path d="M20 8l-2.2 5h4.4L20 8Z"/>',
    compass:      '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5Z"/>',
    /* 톱니 — **축(허브)과 링이 있어야 톱니로 읽힌다.** 처음에 링 없이 방사선만 그렸더니
     * 16px 에서 태양이 됐다. 톱니는 넷만 둔다 — 여덟이면 그 크기에서 원으로 뭉갠다 */
    gear:         '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7"/><path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4"/>',
    sprout:       '<path d="M12 20.5v-7"/><path d="M12 13.5a5 5 0 0 0-5-5H4.5a5 5 0 0 0 5 5H12Z"/><path d="M12 13.5a4.5 4.5 0 0 1 4.5-4.5h3a4.5 4.5 0 0 1-4.5 4.5H12Z"/>',
    timer:        '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4h3"/><path d="M9.5 2.5h5"/><path d="M12 2.5v3.5"/>',
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

  /*
   * ── 이모지 → 심벌 ─────────────────────────────────────────────
   *
   * 본문에 박힌 이모지까지 덮는다. 아이콘 **자리**만 갈아 끼우던 `upgradeIcons` 로는
   * 문장 안의 `✅`·`⚠` 를 못 잡아, 한 화면에 OS 가 그리는 컬러 비트맵과 우리 선 그림이
   * 섞여 보였다(실측 681곳 — `✅` 만 348곳).
   *
   * **확실한 것만 적는다.** 모르는 이모지는 그대로 두는 편이 낫다 — 뜻이 어긋난 그림을
   * 넣으면 상담사가 화면을 잘못 읽는다(설치환경 이미지 원칙과 같다).
   */
  var EMOJI = {
    '✅': 'check', '✔': 'check', '☑': 'check',
    '⚠': 'warn', '❌': 'x', '✖': 'x', 'ℹ': 'info',
    '🔵': 'dot', '🔴': 'dot', '🟡': 'dot', '⚪': 'dot', '⚫': 'dot',
    '📋': 'doc', '📄': 'doc', '📝': 'note', '✏': 'note',
    '🔧': 'tool', '🛠': 'tool', '📐': 'ruler', '🎯': 'target', '⚡': 'bolt',
    '🔗': 'link', '💡': 'bulb', '🏠': 'home', '📊': 'chart', '📈': 'chart',
    '📞': 'call', '☎': 'call', '📅': 'calendar', '🗓': 'calendar',
    '🎫': 'ticket', '🎁': 'gift', '🛒': 'cart', '🔍': 'search', '🔎': 'search',
    '📌': 'pin', '📤': 'share', '➕': 'plus', '▶': 'play',
    '↔': 'arrows', '↕': 'arrows', '↗': 'arrow_ne',
    '🔥': 'fire', '♨': 'fire', '💨': 'wind', '🌀': 'wind', '🌬': 'wind', '💧': 'drop',
    '📸': 'camera', '💬': 'chat', '💰': 'money', '🏬': 'store',
    '📖': 'book', '📚': 'book', '🎓': 'edu', '👆': 'tap',
    '📎': 'clip', '⚖': 'scale', '🧭': 'compass', '⚙': 'gear', '🌱': 'sprout', '⏱': 'timer', '⏰': 'timer', '⌛': 'timer',
    /* 품목 — 같은 품목이면 앱이 달라도 같은 그림이어야 한다 */
    '🧊': 'fridge', '🥬': 'kimchi', '🫧': 'washer', '🧺': 'washer', '👗': 'dresser',
    '🍽': 'dish', '🍳': 'induction', '📺': 'tv', '📱': 'phone', '💻': 'laptop',
    '❄': 'aircon', '🔊': 'soundbar', '🧹': 'stick', '📻': 'microwave', '🚰': 'purifier',
    '🤖': 'robot', '🛡': 'shield', '🚚': 'truck',
  };
  /* 이모지 뒤에 따라오는 변형 선택자(U+FE0F)까지 함께 먹는다 — 안 그러면 네모가 남는다 */
  var EMOJI_RE = new RegExp('(' + Object.keys(EMOJI).join('|') + ')️?', 'g');
  /* 글자를 넣을 수 없는 자리 — 여기에 SVG 를 넣으면 화면이 깨진다 */
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, OPTION: 1, SELECT: 1, TITLE: 1, svg: 1 };

  /**
   * 텍스트 안의 이모지를 심벌로 갈아 끼운다. **속성값과 스크립트는 건드리지 않는다** —
   * 텍스트 노드만 훑기 때문에 `data-cat="🧊 냉장고"` 같은 값이나 코드가 망가질 일이 없다.
   * 이미 바꾼 자리(`svg.psym` 안)는 텍스트 노드가 없으므로 저절로 건너뛴다.
   */
  function upgradeEmoji(root) {
    injectCss();
    var w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !EMOJI_RE.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        while (p && p.nodeType === 1) {
          if (SKIP[p.tagName] || SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var hits = [], n;
    while ((n = w.nextNode())) hits.push(n);
    for (var i = 0; i < hits.length; i++) {
      var t = hits[i], frag = document.createDocumentFragment(), last = 0, m;
      EMOJI_RE.lastIndex = 0;
      while ((m = EMOJI_RE.exec(t.nodeValue))) {
        if (m.index > last) frag.appendChild(document.createTextNode(t.nodeValue.slice(last, m.index)));
        var span = document.createElement('span');
        span.innerHTML = prodSymbol(EMOJI[m[1]], '');
        if (span.firstChild) frag.appendChild(span.firstChild);
        else frag.appendChild(document.createTextNode(m[0]));
        last = m.index + m[0].length;
      }
      if (last < t.nodeValue.length) frag.appendChild(document.createTextNode(t.nodeValue.slice(last)));
      t.parentNode.replaceChild(frag, t);
    }
    return hits.length;
  }

  global.PROD_SYMBOLS = S;
  global.prodEmojiMap = EMOJI;
  global.upgradeEmoji = upgradeEmoji;
  global.prodSymbolKey = symbolKey;
  global.prodSymbol = prodSymbol;
  global.upgradeProdIcons = upgradeIcons;
  global.injectProdSymbolCss = injectCss;

  /*
   * ── 스스로 설치한다 ──────────────────────────────────────────
   *
   * 예전에는 이 배선(첫 실행 + 다시 그릴 때마다)을 **앱마다 복사**해 두었다. 네 앱에
   * 같은 블록이 있었고, 나머지 다섯에도 붙이면 아홉 벌이 된다 — 고칠 일이 생기면
   * 아홉 곳을 고쳐야 한다. 앱은 `<script src="prod-symbols.js">` 한 줄만 두면 된다.
   *
   * **되풀이되지 않는다.** 갈아 끼우면 DOM 이 바뀌어 감시자가 다시 부르지만, 그때는
   * 바꿀 이모지가 없어 아무것도 안 바뀌고 거기서 멈춘다.
   *
   * `data-no-psym` 을 `<html>`·`<body>` 에 두면 이 앱만 건너뛴다 — 인쇄물처럼
   * 원본 그대로여야 하는 화면을 위해 남겨 둔 손잡이다.
   */
  function autoInstall() {
    var el = document.documentElement;
    if (el.hasAttribute('data-no-psym') || (document.body && document.body.hasAttribute('data-no-psym'))) return;
    var run = function () {
      try { upgradeIcons(document); } catch (e) {}
      try { if (document.body) upgradeEmoji(document.body); } catch (e) {}
    };
    run();
    var start = function () {
      run();
      if (!document.body) return;
      new MutationObserver(function () {
        clearTimeout(global.__psymT);
        global.__psymT = setTimeout(run, 40);
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
  autoInstall();
})(window);
