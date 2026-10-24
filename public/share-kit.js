/*
 * 연락처·공유 도구 — 미니앱 공용.
 *
 * **한 곳에 모아 두는 이유** — 미니앱마다 복사해 두면 하나 고칠 때 다섯 곳을 고쳐야 한다
 * (제품 심벌을 prod-symbols.js 로 모은 것과 같은 이유다).
 *
 * ── 연락처 ──
 * 예전에는 번호가 `tel:` 링크라 누르면 **바로 전화가 걸렸다.** 그런데 상담사가 번호를
 * 원하는 경우가 반반이다 — 고객에게 불러 주거나 메모에 붙여 넣을 때는 걸리면 곤란하고,
 * PC 에서는 `tel:` 이 아예 동작하지 않는다. 그래서 누르면 **걸기 / 복사**를 고르게 한다.
 *
 * ── 공유 ──
 * 상담 결과를 고객 손에 남기는 통로다. **지금 보이는 화면을 처음부터 끝까지 그대로**
 * 이미지로 만든다(`captureScreen`). navigator.share 로 카톡 등에 바로 보내고,
 * 안 되면 내려받기로 물러선다.
 *
 * 예전에는 **내용을 캔버스에 다시 그려** 카드를 만들었는데, 다시 그리는 방식이라
 * "지금 보고 있는 것"과 "카드에 담기는 것"이 갈렸다 — 그것이 이 기능에서 가장 자주
 * 터진 고장이다(care 앱이 탭과 무관하게 회차표를 만들고, 제품 상세검색이 직전에 보던
 * 제품을 담아 나갔다). 사용자 요구도 처음부터 그것이었다:
 * *"지금 보여지는 화면이 그대로 공유되었으면 좋겠습니다 … 전체페이지를 캡쳐해서
 * 보내는 개념"*(2026-08-12). 화면을 읽어 그리므로 갈릴 여지가 없다.
 */
(function (global) {
  'use strict';

  /* ── 공통 시트 ── */
  function injectCss() {
    if (document.getElementById('sharekit-css')) return;
    var st = document.createElement('style');
    st.id = 'sharekit-css';
    st.textContent = [
      /*
       * **화면 가운데에 띄운다**(2026-08-27 사장님 보고 — *"하단에 닫기버튼이 짤려서
       * 보이게됩니다 … 중앙에 팝업이뜨면 더 좋을것같습니다"*).
       *
       * 예전에는 `align-items:flex-end` 인 **하단 시트**였는데, 미니앱은 iframe 안이고
       * 그 iframe 이 뷰포트 끝까지 차 있는 반면 **하단 바로가기 탭바가 그 위를 덮는다.**
       * 그래서 시트 맨 아래 「닫기」가 탭바 뒤로 들어갔다 — 실측 **21px 가림**
       * (폰 390·360 · 태블릿 820 전부. PC 는 탭바가 없어 멀쩡해서 여태 안 드러났다).
       *
       * **하단 여백으로는 못 고친다** — iframe 안에서는 탭바 높이를 알 수 없고, 앱마다
       * 다르며 PC 에는 아예 없다. 가운데로 옮기면 그 계산 자체가 사라진다.
       *
       * `.sk-dim` 의 `padding` 이 상하좌우 여백을 만들고, `max-height`+`overflow` 가
       * 버튼이 늘어도 화면을 넘지 않게 잡는다.
       */
      '.sk-dim{position:fixed;inset:0;background:rgba(15,20,35,.45);z-index:9000;display:flex;',
      '  align-items:center;justify-content:center;padding:16px;animation:sk-fade .14s ease-out}',
      '@keyframes sk-fade{from{opacity:0}to{opacity:1}}',
      '.sk-sheet{background:#fff;width:100%;max-width:400px;border-radius:16px;',
      '  padding:18px 16px;animation:sk-pop .18s ease-out;',
      '  max-height:100%;overflow-y:auto}',
      /* 가운데 팝업이라 아래에서 올라오는 대신 살짝 커지며 나타난다 */
      '@keyframes sk-pop{from{transform:scale(.96);opacity:0}to{transform:scale(1);opacity:1}}',
      '.sk-t{font-size:14px;font-weight:700;margin-bottom:2px}',
      '.sk-n{font-size:20px;font-weight:700;color:#1428A0;letter-spacing:-.01em;margin-bottom:14px}',
      '.sk-b{display:block;width:100%;border:1px solid #e5e7eb;background:#fff;border-radius:11px;',
      '  padding:13px;font-size:14px;font-weight:700;margin-bottom:8px;cursor:pointer;color:#16181b;',
      '  font-family:inherit;text-align:center;text-decoration:none}',
      '.sk-b.primary{background:#1428A0;border-color:#1428A0;color:#fff}',
      '.sk-b:active{opacity:.85}',
      '.sk-toast{position:fixed;left:50%;bottom:24%;transform:translateX(-50%);z-index:9100;',
      '  background:rgba(20,24,32,.92);color:#fff;padding:10px 16px;border-radius:10px;',
      '  font-size:13px;font-weight:700;pointer-events:none}',
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  function toast(msg) {
    injectCss();
    var t = document.createElement('div');
    t.className = 'sk-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1600);
  }

  function sheetOpen() { return !!document.querySelector('.sk-dim'); }

  function closeSheet() {
    var d = document.querySelector('.sk-dim');
    if (!d) return;
    d.remove();
    /* 휴대폰 뒤로가기용으로 쌓아 둔 히스토리 칸도 함께 되돌린다(back-kit.js).
       뒤로가기가 부른 닫기라면 back-kit 이 알아서 무시한다 */
    if (global.Back) global.Back.done();
  }

  /** 바닥에서 올라오는 시트. buttons = [{label, primary, href, onClick}] */
  function sheet(title, sub, buttons) {
    injectCss();
    closeSheet();
    var dim = document.createElement('div');
    dim.className = 'sk-dim';
    var box = document.createElement('div');
    box.className = 'sk-sheet';
    box.innerHTML = '<div class="sk-t"></div><div class="sk-n"></div>';
    box.querySelector('.sk-t').textContent = title;
    box.querySelector('.sk-n').textContent = sub;
    buttons.forEach(function (b) {
      var el = document.createElement(b.href ? 'a' : 'button');
      el.className = 'sk-b' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      if (b.href) el.href = b.href;
      el.addEventListener('click', function (e) {
        if (b.onClick) { e.preventDefault(); b.onClick(); }
        if (b.keepOpen !== true) closeSheet();
      });
      box.appendChild(el);
    });
    dim.appendChild(box);
    dim.addEventListener('click', function (e) { if (e.target === dim) closeSheet(); });
    document.body.appendChild(dim);
    /*
     * **휴대폰 뒤로가기가 앱을 벗어나지 않고 이 시트를 닫는다**(back-kit.js).
     * 연락처 시트는 아홉 앱 모두에서 뜨므로 여기 한 곳에 두면 전부 해결된다.
     */
    if (global.Back) global.Back.open(closeSheet, sheetOpen);
  }

  /* 클립보드는 https 나 localhost 에서만 열린다 — 안 되면 옛 방식으로 물러선다 */
  function copyText(s) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return legacyCopy(s); });
    }
    return Promise.resolve(legacyCopy(s));
  }
  function legacyCopy(s) {
    try {
      var ta = document.createElement('textarea');
      ta.value = s;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  /** 연락처 하나를 눌렀을 때 — 걸기 / 복사를 고르게 한다 */
  function contactSheet(name, number) {
    var digits = String(number).replace(/[^0-9+]/g, '');
    sheet(name, number, [
      { label: '전화 걸기', primary: true, href: 'tel:' + digits },
      { label: '번호 복사', onClick: function () {
        copyText(number).then(function (ok) { toast(ok ? '번호를 복사했습니다' : '복사하지 못했습니다'); });
      } },
      { label: '닫기' },
    ]);
  }

  /*
   * 화면에 이미 그려진 연락처를 가로챈다.
   * `data-tel` 이 있으면 그 값을, 없으면 글자에서 번호를 읽는다.
   */
  var TEL = /(1[5-9]\d{2}-\d{4}|0\d{1,2}-\d{3,4}-\d{4}|\+82[\d-]{8,})/;
  function wireContacts(root, selector) {
    var list = (root || document).querySelectorAll(selector || '[data-tel],a[href^="tel:"]');
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.dataset.skWired) continue;
      var num = el.dataset.tel
        || (el.getAttribute('href') || '').replace(/^tel:/, '')
        || ((el.textContent || '').match(TEL) || [])[0];
      if (!num) continue;
      var name = el.dataset.telName || (el.querySelector('b') || {}).textContent || el.textContent.trim();
      el.dataset.skWired = '1';
      (function (nm, nu) {
        el.addEventListener('click', function (e) { e.preventDefault(); contactSheet(nm, nu); });
      })(String(name).slice(0, 40), String(num).trim());
      n++;
    }
    return n;
  }

  /* ══════════════ 공유 카드 ══════════════
   *
   * 상담 결과를 고객 손에 남기는 통로다. **웹에는 화면을 그대로 캡처하는 API 가 없으므로**
   * 내용을 캔버스에 다시 그린다(배치 시뮬레이터가 결과 저장에 쓰던 방식과 같다).
   *
   * **2배로 그린다.** 카톡으로 보내면 재압축되는데 등배로 만들면 글자가 뭉갠다.
   * navigator.share(파일)를 먼저 쓰고, 없거나 실패하면 내려받기로 물러선다.
   * **취소(AbortError)는 실패가 아니다** — 조용히 끝낸다.
   */
  var W = 720, PAD = 34, SCALE = 2;
  var NAVY = '#1428A0', INK = '#16181b', SUB = '#6b7280', LINE = '#e9ecf3';

  function wrap(ctx, text, maxW) {
    var out = [], line = '';
    String(text).split(/\s+/).forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    });
    if (line) out.push(line);
    return out;
  }

  /**
   * 카드 이미지를 만든다.
   * opts = { app, title, subtitle, sections:[{h, rows:[[이름, 값, 설명?]]}], note, filename }
   */
  function buildCard(opts) {
    var m = document.createElement('canvas').getContext('2d');
    var F = function (sz, w) { m.font = (w || 600) + ' ' + sz + "px Pretendard, -apple-system, 'Segoe UI', sans-serif"; };

    /* 1차: 높이를 재기 위해 줄을 미리 접는다 */
    var body = [], y = 0;
    (opts.sections || []).forEach(function (s) {
      body.push({ t: 'h', v: s.h }); y += 40;
      (s.rows || []).forEach(function (r) {
        var val = r[1] == null ? '' : String(r[1]);
        /*
         * **이름도 접는다.** 예전에는 설명만 접고 이름은 fillText 로 한 줄에 그려,
         * 설치환경의 확인·주의 항목처럼 긴 문장이 오른쪽으로 넘쳐 잘렸다.
         * 값이 오른쪽에 붙으므로 그 폭만큼 빼고 접는다.
         */
        F(15, 800);
        var valW = val ? m.measureText(val).width + 14 : 0;
        F(15, 700);
        var nm = wrap(m, String(r[0]), W - PAD * 2 - valW);
        F(13, 400);
        var det = r[2] ? wrap(m, r[2], W - PAD * 2 - 8) : [];
        body.push({ t: 'r', nm: nm, val: val, det: det });
        y += nm.length * 21 + 5 + det.length * 19 + 10;
      });
      y += 8;
    });
    F(12, 400);
    var noteLines = opts.note ? wrap(m, opts.note, W - PAD * 2) : [];
    var H = 96 + y + (noteLines.length ? noteLines.length * 18 + 22 : 12) + PAD;

    var cv = document.createElement('canvas');
    cv.width = W * SCALE; cv.height = H * SCALE;
    var c = cv.getContext('2d');
    c.scale(SCALE, SCALE);
    var f = function (sz, w) { c.font = (w || 600) + ' ' + sz + "px Pretendard, -apple-system, 'Segoe UI', sans-serif"; };

    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    /* 머리 — 아홉 앱의 남색 바와 같은 색이다 */
    c.fillStyle = NAVY; c.fillRect(0, 0, W, 76);
    c.fillStyle = '#fff'; f(19, 800);
    c.fillText(opts.title || '', PAD, 34);
    c.fillStyle = '#C7D2FE'; f(12.5, 500);
    c.fillText((opts.app || '세일즈 코파일럿') + (opts.subtitle ? ' · ' + opts.subtitle : ''), PAD, 56);

    var cy = 96;
    body.forEach(function (b) {
      if (b.t === 'h') {
        c.fillStyle = SUB; f(12, 800);
        c.fillText(b.v, PAD, cy + 12);
        c.strokeStyle = LINE; c.lineWidth = 1;
        c.beginPath(); c.moveTo(PAD, cy + 22.5); c.lineTo(W - PAD, cy + 22.5); c.stroke();
        cy += 40;
        return;
      }
      var top = cy;
      c.fillStyle = INK; f(15, 700);
      b.nm.forEach(function (l) { c.fillText(l, PAD, cy + 14); cy += 21; });
      if (b.val) {
        c.fillStyle = NAVY; f(15, 800);
        c.textAlign = 'right'; c.fillText(b.val, W - PAD, top + 14); c.textAlign = 'left';
      }
      cy += 5;
      c.fillStyle = SUB; f(13, 400);
      b.det.forEach(function (l) { c.fillText(l, PAD, cy + 12); cy += 19; });
      cy += 10;
    });

    if (noteLines.length) {
      cy += 6;
      c.fillStyle = '#9aa0a6'; f(12, 400);
      noteLines.forEach(function (l) { c.fillText(l, PAD, cy + 10); cy += 18; });
    }

    /* 높이는 그리기 전에 어림으로 잡을 수밖에 없어 아래가 남는다 —
       다 그린 뒤 실제로 쓴 높이로 잘라낸다. 빈 여백이 붙어 있으면 카톡에서 어색하다. */
    var used = Math.ceil(cy + PAD);
    if (used > 0 && used < H) {
      var cut = document.createElement('canvas');
      cut.width = W * SCALE; cut.height = used * SCALE;
      cut.getContext('2d').drawImage(cv, 0, 0);
      return cut;
    }
    return cv;
  }

  function shareCard(opts) {
    var cv;
    try { cv = buildCard(opts); } catch (e) { toast('이미지를 만들지 못했습니다'); return; }
    var name = (opts.filename || '세일즈코파일럿') + '.png';
    cv.toBlob(function (blob) {
      if (!blob) { toast('이미지를 만들지 못했습니다'); return; }
      var file = null;
      try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { /* File 미지원 */ }
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        navigator.share({ files: [file], title: opts.title || '' })
          .catch(function (err) { if (!err || err.name !== 'AbortError') download(blob, name); });
        return;
      }
      download(blob, name);
    }, 'image/png');
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('이미지를 저장했습니다');
  }

  /*
   * 화면 **오른쪽 위**에 공유 버튼을 띄운다.
   *
   * 예전에는 오른쪽 아래였는데 **개발자 문의 버튼(💬)과 겹쳤다**(사용자 지적).
   * 그 버튼은 끌어서 옮길 수 있지만 기본 자리가 오른쪽 아래라, 둘을 같은 구석에
   * 두면 어느 앱에서든 부딪힌다.
   *
   * 위쪽에는 앱마다 높이가 다른 고정바가 있다(탭·상단바). 하나로 못박으면 어떤 앱에서는
   * 바를 덮고 어떤 앱에서는 붕 뜬다. 그래서 **고정바가 멈추는 자리를 재서 그 아래**에 둔다 —
   * sticky 는 스크롤하면 `top` 에 멈추므로 현재 위치가 아니라 `top + 높이`가 기준이다.
   */
  function stickyBottom() {
    /*
     * **머리 전체(고정이든 아니든) 아래**로 내린다.
     * 처음엔 sticky 가 멈추는 자리(top+높이)만 봤는데, 그건 스크롤한 뒤의 위치라
     * **화면 맨 위에서는 탭을 덮었다**(실측: AS 에서 버튼 62px, 탭은 68~122px).
     * 머리는 스크롤하면 올라가 사라지므로, 맨 아래 기준으로 잡아도 스크롤 후에
     * 겹칠 일이 없다 — 두 상태 모두 안전한 쪽을 고른다.
     */
    var y = 0;
    var list = document.querySelectorAll('.topbar, .hd, header, .mode-tabs');
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.height === 0) continue;
      y = Math.max(y, r.bottom);
    }
    return Math.min(Math.max(Math.round(y), 0), 200);
  }

  /* ══════════════ 화면 그대로 캡처 ══════════════
   *
   * **공유는 "지금 보이는 화면을 처음부터 끝까지" 내보낸다**(2026-08-12 사용자 요청:
   * *"공유버튼을 누르면 전체페이지를 캡쳐해서 보내는 개념"*).
   *
   * 예전에는 내용을 캔버스에 **다시 그린 요약 카드**를 내보냈다. 정리된 표라는 장점은
   * 있었지만 화면과 다른 그림이라, 상담사가 보고 있던 것과 고객 손에 남는 것이 갈렸다 —
   * "다른 내용이 나간다"는 지적이 반복된 뿌리가 여기다. 화면을 그대로 찍으면 그 여지가
   * 원시적으로 사라진다.
   *
   * 웹에는 화면을 캡처하는 API 가 없어(getDisplayMedia 는 매장 폰에서 못 쓴다) **DOM 을
   * 다시 그려 주는 라이브러리**를 쓴다. three.js 와 같은 이유로 `public/vendor/` 에 받아
   * 두고 상대경로로 부른다 — CDN 으로 되돌리지 말 것. **누를 때 받는다**(198KB·gzip 45KB).
   *
   * 한계는 정직하게 알아 둘 것:
   *  - **다른 도메인 이미지**(samsung.com 규격도)는 그 서버가 CORS 를 허용해야 찍힌다.
   *    안 되면 그 자리가 빈다 — 글자·표는 멀쩡하다.
   *  - 화면이 길면 픽셀이 커진다. 폰 메모리를 넘기지 않게 배율을 자동으로 낮춘다.
   */
  var h2c = null;
  function loadH2C() {
    if (h2c) return h2c;
    h2c = new Promise(function (res, rej) {
      if (global.html2canvas) return res(global.html2canvas);
      var s = document.createElement('script');
      s.src = 'vendor/html2canvas.min.js';
      s.onload = function () { global.html2canvas ? res(global.html2canvas) : rej(new Error('no h2c')); };
      s.onerror = function () { h2c = null; rej(new Error('load fail')); };
      document.head.appendChild(s);
    });
    return h2c;
  }

  /*
   * ── 다 만든 그림을 내보내는 자리 (2026-10-16 「깜빡이며 공유가 안 된다」) ──
   *
   * navigator.share 는 **방금 사람이 누른 직후**에만 열린다(브라우저의 사용자 활성화).
   * 그런데 화면을 담는 데 폰에서 몇 초가 걸려, 다 담았을 때는 그 권한이 끝나 있어
   * 공유가 거부되고 → 내려받기로 넘어가며 화면이 번쩍였다. 그래서:
   *  ① 아직 권한이 살아 있으면 곧장 공유창을 연다
   *  ② 끝났거나 거부되면 「공유하기」 한 번을 더 받는다 — 그 누름이 새 권한이 된다
   *  ③ 공유를 못 하는 기기면 그때 내려받는다
   */
  function deliver(blob, name, title) {
    var file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
    var canFile = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    if (!canFile) { download(blob, name); return Promise.resolve(true); }
    var share = function () {
      return navigator.share({ files: [file], title: title || '' }).then(function () { return true; });
    };
    var ask = function () {
      return new Promise(function (res) {
        sheet('화면을 담았습니다', '아래 버튼을 누르면 공유창이 열립니다', [
          { label: '공유하기', primary: true, onClick: function () {
            share().then(function () { res(true); }, function (err) {
              if (err && err.name === 'AbortError') return res(true);
              download(blob, name); res(true);
            });
          } },
          { label: '이미지로 저장', onClick: function () { download(blob, name); res(true); } },
        ]);
      });
    };
    var ua = navigator.userActivation;
    if (ua && !ua.isActive) return ask();
    return share().catch(function (err) {
      if (err && err.name === 'AbortError') return true;
      return ask();   /* 권한이 끝났거나 막혔다 — 내려받기로 바로 넘기지 않고 한 번 더 묻는다 */
    });
  }

  /** 지금 화면을 처음부터 끝까지 한 장으로. filename 은 저장 이름. */
  var busy = false;
  function captureScreen(filename) {
    /* 담는 중에 또 누르면 캡처가 겹쳐 화면이 거듭 번쩍인다 — 하나만 돈다 */
    if (busy) return Promise.resolve(false);
    busy = true;
    toast('화면을 담는 중입니다…');
    return loadH2C().then(function (H) {
      var doc = document.documentElement, body = document.body;
      var w = doc.clientWidth;
      var h = Math.max(body.scrollHeight, doc.scrollHeight, body.offsetHeight, doc.offsetHeight);
      /*
       * **배율은 화면 길이에 맞춰 낮춘다.** 두 가지 한도를 동시에 지켜야 한다:
       *
       *  ① **넓이** — 2배로 고정하면 긴 화면(제품 상세검색 3,600px)에서 2,800만 픽셀이 되어
       *     폰 메모리에서 캔버스가 통째로 비어 나온다. 1,200만 픽셀 아래로 잡는다.
       *  ② **한 변** — 브라우저 캔버스는 한 변이 **16,384px** 을 넘으면 그린 것이 사라진다.
       *     넓이만 보면 이 한도를 그냥 넘어간다 — 실측으로 **AS 연락처의 묶음을 전부 펼치면
       *     폰 폭에서 15,211px** 이고, 넓이 규칙만으로 잡은 배율 1.42 가 캔버스를
       *     **21,634px** 로 만들었다(2026-08-12 확인). 그러면 공유가 빈 그림으로 나간다.
       *
       * 그래서 **1배 밑으로도 내려간다.** 글자가 작아지는 것보다 빈 그림이 나가는 쪽이
       * 훨씬 나쁘다 — 화면 전체가 담기는 것이 이 기능의 요구사항이다.
       */
      var MAX_SIDE = 16000;
      var scale = Math.min(
        2,
        Math.sqrt(12e6 / Math.max(w * h, 1)),
        MAX_SIDE / Math.max(h, 1),
        MAX_SIDE / Math.max(w, 1)
      );
      var bg = getComputedStyle(body).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)') bg = '#ffffff';
      return H(body, {
        backgroundColor: bg, scale: scale, useCORS: true, logging: false,
        /* 전체 길이를 담는다 — 보이는 부분만 찍으면 "처음부터 끝까지"가 아니다 */
        width: w, height: h, windowWidth: w, windowHeight: h,
        scrollX: 0, scrollY: 0,
        /* 화면 위에 떠 있는 우리 UI(공유 버튼·토스트·시트)는 담지 않는다 */
        ignoreElements: function (el) {
          return el.id === 'sk-share' || (el.className && typeof el.className === 'string'
            && /(^|\s)(sk-toast|sk-dim)(\s|$)/.test(el.className));
        },
      });
    }).then(function (cv) {
      return new Promise(function (res) {
        cv.toBlob(function (blob) {
          busy = false;
          if (!blob) { toast('이미지를 만들지 못했습니다'); return res(false); }
          var name = (filename || '세일즈코파일럿') + '.png';
          deliver(blob, name, filename).then(function () { res(true); }, function () { res(true); });
        }, 'image/png');
      });
    }).catch(function () {
      busy = false;
      toast('화면을 담지 못했습니다');
      return false;
    });
  }


  /*
   * ── 인쇄 (2026-10-16 사장님 지시 — *"공유버튼을 인쇄하는것과 연동해주고 출력물을
   *    각 인터페이스에 맞게 디자인해주세요"*) ──
   *
   * 매장 전산 태블릿이 프린터에 물려 있어 **고객에게 종이로 건넬 수 있게** 됐다.
   * 공유 버튼 하나가 「이미지로 공유 / 인쇄」 둘을 고르게 한다 — 버튼을 하나 더 두면
   * 헤더가 좁은 폰에서 넘친다.
   *
   * 인쇄는 **화면을 사진 찍지 않고 브라우저 인쇄로 한다** — 벡터라 글자가 선명하고
   * A4 쪽 나눔을 브라우저가 한다(시험지 출력기가 PDF 버튼 대신 인쇄를 고른 것과 같은 이유).
   * iframe 안에서 window.print() 를 부르면 **그 미니앱만** 인쇄된다(헤더·사이드바 없이).
   *
   * 앱마다 다른 것은 둘뿐이다:
   *   · 그 앱 <style> 안의 `@media print` — 무엇을 감추고 어떻게 놓을지
   *   · `window.SK_PRINT_PREP()` — 인쇄 직전에 할 일(접힌 것 펼치기 등). 되돌릴 함수를 돌려준다
   * 공통으로 하는 일(머리·꼬리·A4 여백·우리 UI 감추기)은 여기 한 곳이다.
   */
  var printStore = '';
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function nowText() {
    var d = new Date();   /* 현지 시각 — toISOString 은 UTC 라 오전에 전날로 찍힌다 */
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function injectPrintCss() {
    if (document.getElementById('sharekit-print-css')) return;
    var st = document.createElement('style');
    st.id = 'sharekit-print-css';
    st.textContent = [
      '#sk-print-head,#sk-print-foot{display:none}',
      '@page{size:A4;margin:11mm 10mm 12mm}',
      '@media print{',
      '  html,body{background:#fff!important}',
      '  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      '  #sk-share,.sk-dim,.sk-toast,.toast,.sk-noprint,body>footer{display:none!important}',
      '  #sk-print-head,#sk-print-foot{display:block!important}',
      '  #sk-print-head{margin:0 0 12px;font-family:Pretendard,-apple-system,"Segoe UI",sans-serif;color:#111827}',
      '  #sk-print-head .bar{display:flex;justify-content:space-between;align-items:center;',
      '    border-bottom:2.5px solid #1428A0;padding:0 0 6px;font-size:10.5px;color:#4B5563}',
      '  #sk-print-head .brand{font-weight:700;color:#1428A0;letter-spacing:.01em;font-size:11px}',
      '  #sk-print-head .ttl{font-size:21px;font-weight:700;margin:10px 0 2px;color:#0B1220;letter-spacing:-.01em}',
      '  #sk-print-head .sub{font-size:11.5px;color:#4B5563}',
      '  #sk-print-foot{margin-top:14px;padding-top:7px;border-top:1px solid #D1D5DB;',
      '    font-family:Pretendard,-apple-system,"Segoe UI",sans-serif;font-size:9.5px;line-height:1.55;color:#6B7280;',
      '    break-inside:avoid}',
      '  #sk-print-foot b{color:#374151}',
      '  img,table,tr,figure,.sk-keep{break-inside:avoid}',
      '  h1,h2,h3,.sk-h{break-after:avoid}',
      '}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }
  function setText(el, sel, v) { var x = el.querySelector(sel); if (x) x.textContent = v || ''; }
  function printScreen(o) {
    o = o || {};
    injectPrintCss();
    var head = document.getElementById('sk-print-head');
    if (!head) {
      head = document.createElement('div');
      head.id = 'sk-print-head';
      head.innerHTML = '<div class="bar"><span class="brand">SAMSUNG 세일즈 코파일럿</span><span class="meta"></span></div>'
        + '<div class="ttl"></div><div class="sub"></div>';
      document.body.insertBefore(head, document.body.firstChild);
    }
    var foot = document.getElementById('sk-print-foot');
    if (!foot) {
      foot = document.createElement('div');
      foot.id = 'sk-print-foot';
      document.body.appendChild(foot);
    }
    /* 앱 이름은 build 의 app(「세일즈 코파일럿 · 」 접두는 머리 띠에 이미 있다) → 없으면 문서 제목 */
    var app = String(o.app || document.title || '').replace(/^세일즈 코파일럿\s*·\s*/, '').replace(/\s*—\s*세일즈 코파일럿$/, '');
    var title = o.title || app;
    setText(head, '.meta', '출력 ' + nowText() + (printStore ? ' · ' + printStore : ''));
    setText(head, '.ttl', title);
    setText(head, '.sub', title === app ? (o.subtitle || '') : app + (o.subtitle ? ' · ' + o.subtitle : ''));
    foot.innerHTML = '';
    /* 앱이 출처 상자를 본문에 이미 인쇄하면 printNote:'' 로 꼬리에서 뺀다(같은 말을 두 번 적지 않는다) */
    var note = o.printNote != null ? o.printNote : o.note;
    if (note) { var n = document.createElement('div'); n.textContent = note; foot.appendChild(n); }
    var d = document.createElement('div');
    d.innerHTML = '<b>상담 참고용 출력물입니다.</b> 가격·혜택·설치 조건은 바뀔 수 있으니 확정 전 삼성닷컴·고객센터(1588-3366)로 확인하세요.';
    foot.appendChild(d);

    /* 앱별 준비(접힌 것 펼치기 등) — 실패해도 인쇄는 한다 */
    var undo = null;
    try { if (typeof global.SK_PRINT_PREP === 'function') undo = global.SK_PRINT_PREP(o); } catch (e) {}
    /* PDF 로 저장할 때 파일 이름이 문서 제목에서 온다 */
    var oldTitle = document.title;
    if (o.filename) document.title = o.filename;
    var done = false;
    var restore = function () {
      if (done) return; done = true;
      document.title = oldTitle;
      try { if (typeof undo === 'function') undo(); } catch (e) {}
      global.removeEventListener('afterprint', restore);
    };
    global.addEventListener('afterprint', restore);
    /*
     * **늦게 받는 그림(loading=lazy)은 인쇄에서 빈칸이 된다** — 화면 밖 그림은 아직 안 받았다.
     * 전부 받게 하고 다 올 때까지(최대 3초) 기다렸다 인쇄한다. 설치환경 규격도가 그렇다.
     */
    var imgs = Array.prototype.slice.call(document.images);
    imgs.forEach(function (im) { if (im.loading === 'lazy') im.loading = 'eager'; });
    var waits = imgs.filter(function (im) { return !im.complete; }).map(function (im) {
      return new Promise(function (r) { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); });
    });
    if (waits.length) toast('인쇄 준비 중입니다…');
    Promise.race([Promise.all(waits), new Promise(function (r) { setTimeout(r, 3000); })]).then(function () {
     setTimeout(function () {
      try { global.print(); } catch (e) { toast('인쇄를 열지 못했습니다'); }
      /* afterprint 를 안 주는 브라우저가 있다 — print() 가 막는 동안 기다렸다 되돌린다 */
      setTimeout(restore, 1500);
     }, 120);
    });
  }

  /*
   * ── 인쇄할 것 고르기 (2026-10-23 사장님 지시 — *"인쇄 시 체크박스 선택해서 어떤 정보를
   *    인쇄할지 선택 가능하게"*) ──
   *
   * 화면에 보이는 **제목 달린 덩어리**를 목록으로 띄우고 체크를 푼 것은 인쇄에서 뺀다.
   * 앱마다 따로 짜지 않는다 — 앱이 `data-print="이름"` 을 달아 두면 그것을 쓰고, 없으면
   * 제목(h2·h3·summary)이 있는 카드를 찾는다. 하나뿐이면 묻지 않고 바로 인쇄한다.
   * 뺀 것은 `sk-noprint`(인쇄에서 숨김)를 붙였다가 인쇄가 끝나면 걷는다.
   */
  function printParts() {
    var seen = [], out = [];
    var vis = function (el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); };
    var tagged = Array.prototype.slice.call(document.querySelectorAll('[data-print]')).filter(vis);
    var cands = tagged.length ? tagged
      : Array.prototype.slice.call(document.querySelectorAll('.card, details.grp[open], details.sec, details.fold, .sec, .fold')).filter(vis);
    cands.forEach(function (el) {
      if (el.closest('.sk-dim')) return;
      if (seen.some(function (p) { return p.contains(el) || el.contains(p); })) return;   /* 바깥·안쪽이 겹치면 바깥 하나만 */
      var label = el.getAttribute('data-print');
      if (!label) {
        var h = el.querySelector('h2, h3, summary, .card-title, .sec-t, .hd');
        /* 제목 옆 배지(「대상」 등)가 붙어 읽히지 않게 조각마다 띄어 잇는다 */
        label = h ? Array.prototype.map.call(h.childNodes, function (n) { return (n.textContent || '').trim(); })
          .filter(Boolean).join(' ').replace(/\s+/g, ' ') : '';
      }
      if (!label) return;
      seen.push(el);
      out.push({ el: el, label: label.length > 40 ? label.slice(0, 40) + '…' : label });
    });
    return out;
  }
  function pickPrint(o) {
    var parts = printParts();
    if (parts.length < 2) { closeSheet(); printScreen(o); return; }
    /*
     * **열려 있는 시트를 그 자리에서 바꿔 쓴다.** 닫고 새로 열면 닫기가 뒤로가기 한 칸을
     * 늦게 소비하는 사이 새 시트가 칸을 쌓아, 허브(iframe) 안에서는 「인쇄」를 누르는 순간
     * 한 칸이 더 빠져 앱 밖으로 나가 버렸다(E2E 가 잡았다). 뒤로가기 칸은 처음 시트 것 하나만 쓴다.
     */
    var reuse = document.querySelector('.sk-dim');
    if (!reuse) closeSheet();
    injectCss();
    if (!document.getElementById('sk-pick-css')) {
      var st = document.createElement('style'); st.id = 'sk-pick-css';
      st.textContent = '.sk-pick{max-height:52vh;overflow:auto;margin:4px 0 12px;display:grid;gap:6px}'
        + '.sk-pick label{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid #E5E7EB;border-radius:11px;'
        + 'font-size:14px;font-weight:700;color:#1F2937;cursor:pointer;background:#fff}'
        + '.sk-pick label.on{border-color:#1428A0;background:#EEF2FF;color:#1428A0}'
        + '.sk-pick input{width:18px;height:18px;accent-color:#1428A0;flex:0 0 auto;margin:0}'
        + '.sk-pick-all{display:flex;gap:8px;margin:0 0 6px}'
        + '.sk-pick-all button{border:1.5px solid #D1D5DB;background:#fff;border-radius:99px;padding:5px 12px;font:inherit;font-size:12.5px;font-weight:700;color:#374151;cursor:pointer}';
      document.head.appendChild(st);
    }
    var dim = reuse || document.createElement('div'); dim.className = 'sk-dim';
    var box = (reuse && reuse.querySelector('.sk-sheet')) || document.createElement('div'); box.className = 'sk-sheet';
    box.innerHTML = '<div class="sk-t">인쇄할 내용</div><div class="sk-n">체크한 것만 A4 로 나갑니다</div>'
      + '<div class="sk-pick-all"><button type="button" data-a="1">모두 선택</button><button type="button" data-a="0">모두 해제</button></div>'
      + '<div class="sk-pick"></div>';
    var list = box.querySelector('.sk-pick');
    parts.forEach(function (p, i) {
      var l = document.createElement('label'); l.className = 'on';
      var c = document.createElement('input'); c.type = 'checkbox'; c.checked = true; c.dataset.i = i;
      c.addEventListener('change', function () { l.className = c.checked ? 'on' : ''; });
      l.appendChild(c); l.appendChild(document.createTextNode(p.label));
      list.appendChild(l);
    });
    box.querySelectorAll('.sk-pick-all button').forEach(function (b) {
      b.addEventListener('click', function () {
        list.querySelectorAll('input').forEach(function (c) { c.checked = b.dataset.a === '1'; c.dispatchEvent(new Event('change')); });
      });
    });
    var go = document.createElement('button'); go.type = 'button'; go.className = 'sk-b primary'; go.textContent = '인쇄 · PDF 저장 (A4)';
    go.addEventListener('click', function () {
      var off = [];
      list.querySelectorAll('input').forEach(function (c) { if (!c.checked) off.push(parts[+c.dataset.i].el); });
      if (off.length === parts.length) { toast('하나 이상 골라 주세요'); return; }
      off.forEach(function (el) { el.classList.add('sk-noprint', 'sk-picked-off'); });
      closeSheet();
      var undoPick = function () {
        off.forEach(function (el) { el.classList.remove('sk-noprint', 'sk-picked-off'); });
        global.removeEventListener('afterprint', undoPick);
      };
      global.addEventListener('afterprint', undoPick);
      setTimeout(undoPick, 4000);   /* afterprint 를 안 주는 브라우저 */
      printScreen(o);
    });
    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'sk-b'; cancel.textContent = '취소';
    cancel.addEventListener('click', closeSheet);
    box.appendChild(go); box.appendChild(cancel);
    if (reuse) return;   /* 바깥 누르기·뒤로가기는 처음 시트가 이미 걸어 두었다 */
    dim.appendChild(box);
    dim.addEventListener('click', function (e) { if (e.target === dim) closeSheet(); });
    document.body.appendChild(dim);
    if (global.Back) global.Back.open(closeSheet, sheetOpen);
  }

  /** 공유 버튼을 누르면 고른다 — 이미지로 공유 / 인쇄 */
  function chooseAction(build) {
    var o = null;
    try { o = build && build(); } catch (e) {}
    sheet('이 화면을', '공유하거나 인쇄합니다', [
      { label: '이미지로 공유', primary: true, onClick: function () { captureScreen(o && o.filename); } },
      { label: '인쇄 · PDF 저장 (A4)', keepOpen: true, onClick: function () { pickPrint(o || {}); } },
    ]);
  }

  /**
   * build() 는 **저장 이름**을 짓는 데만 쓴다(무엇을 보고 있었는지 파일명에 남기려고).
   * 그림 자체는 언제나 화면 그대로다.
   */
  function mountShareButton(build, label) {
    injectCss();
    if (document.getElementById('sk-share')) return;
    var st = document.createElement('style');
    /*
     * 흰 바탕에 남색 글씨다. 남색 고정바 위에 놓일 때도, 밝은 본문 위에 놓일 때도
     * 읽힌다 — 남색 버튼이면 남색 바 위에서 사라진다(AS 타일에서 겪은 것과 같다).
     */
    st.textContent = '#sk-share{position:fixed;right:12px;z-index:8000;background:#fff;color:#1428A0;'
      + 'border:1.5px solid #1428A0;border-radius:99px;padding:8px 15px;font-size:13px;font-weight:700;'
      + 'font-family:inherit;cursor:pointer;box-shadow:0 2px 10px rgba(14,28,48,.16)}'
      + '#sk-share:active{background:#EEF2FF}';
    document.head.appendChild(st);
    var b = document.createElement('button');
    b.id = 'sk-share'; b.type = 'button';
    b.textContent = label || '공유';
    b.style.top = (stickyBottom() + 8) + 'px';
    b.addEventListener('click', function () { chooseAction(build); });
    document.body.appendChild(b);
    /* 화면을 돌리면 바 높이가 달라진다 */
    window.addEventListener('resize', function () { b.style.top = (stickyBottom() + 8) + 'px'; });

    /*
     * ── 허브 안에서는 공유를 **앱 헤더 우측 상단**이 맡는다 (2026-08-11 사용자 요청) ──
     *
     * 떠 있는 버튼이 본문을 덮는다는 지적이 반복됐다(AS 안내문 첫 줄이 실제로 가려져
     * padding-right 로 자리를 비워 두고 있었다). 헤더로 올리면 덮을 일이 없고 자리가
     * 늘 같아 눈이 헤매지 않는다.
     *
     * 미니앱은 **혼자서도 열리는 파일**이므로(직접 URL 로 여는 경우가 있다) 감추는 것은
     * iframe 안에 있을 때뿐이다. 바깥 헤더가 없는데 감추면 공유할 길이 사라진다.
     */
    var embedded = false;
    try { embedded = window.parent && window.parent !== window; } catch (e) { embedded = true; }
    if (!embedded) return;

    b.style.display = b.style.display || '';
    b.dataset.skEmbedded = '1';

    /*
     * **공유는 언제나 할 수 있다** — 화면을 그대로 찍기 때문이다(2026-08-12).
     * 요약 카드를 만들던 시절에는 "만들 것이 있을 때만" 보였고, 앱마다 sync 함수가 이
     * 버튼의 display 를 만져 그 상태를 알렸다. 이제는 볼 화면이 곧 공유할 것이라
     * 감출 이유가 없다 — 상담사가 누르고 싶을 때 늘 그 자리에 있어야 한다.
     */
    function tell() {
      try { window.parent.postMessage({ sk: 'share-state', on: true }, '*'); } catch (e) {}
    }
    tell();
    window.addEventListener('message', function (e) {
      if (!e.data) return;
      /*
       * **바깥이 물으면 다시 답한다.** 알리기만 하면 유실된다 — 미니앱이 먼저 뜨고
       * 바깥 헤더가 나중에 듣기 시작하면 그 한 번이 사라져, 공유할 것이 있는데도
       * 아이콘이 끝내 안 떴다(AS 에서 실제로 그랬다. 설치환경은 카테고리를 고를 때
       * 상태가 다시 바뀌어 우연히 가려져 있었다).
       */
      if (e.data.sk === 'share-ping') { tell(); return; }
      /* 바깥 버튼을 누르면 이 안에서 찍는다 — 찍을 화면이 여기 있다 */
      if (e.data.sk !== 'share-click') return;
      if (typeof e.data.store === 'string') printStore = e.data.store;
      b.click();
    });
    /* 헤더가 맡으므로 안쪽 버튼은 감춘다 — 같은 일을 하는 버튼이 둘 보이면 헷갈린다 */
    var hide = document.createElement('style');
    hide.textContent = '#sk-share{visibility:hidden;pointer-events:none}';
    document.head.appendChild(hide);
  }

  /*
   * ── 사용 로그 ──
   * 미니앱은 iframe 안이라 **자기가 직접 로그를 못 보낸다**(`logEvent` 는 Next 쪽 모듈이다).
   * 그래서 부모에게 알리고 부모가 기록한다. 부모가 없으면(미니앱을 따로 열었을 때)
   * 조용히 아무 일도 하지 않는다 — 로그 때문에 화면이 깨지면 안 된다.
   *
   * `once` 를 주면 **그 세션에서 한 번만** 쌓는다. 상담 한 건에서 제품·탭을 오가면
   * 같은 화면이 수십 번 잡히는데, 그러면 "무엇을 많이 보는가"가 아니라 "누가 많이
   * 눌렀는가"가 되어 집계가 뒤틀린다(2026-08-20 사장님 지적).
   */
  function log(module, action, extra, once) {
    try {
      if (!window.parent || window.parent === window) return;
      window.parent.postMessage({
        sk: 'log', module: module, action: action,
        extra: extra == null ? '' : String(extra), once: !!once,
      }, '*');
    } catch (e) { /* 로그가 화면을 막지 않는다 */ }
  }
  global.AX_LOG = log;

  global.SHARE_KIT = {
    log: log,
    sheet: sheet, closeSheet: closeSheet, toast: toast, copyText: copyText,
    contactSheet: contactSheet, wireContacts: wireContacts,
    buildCard: buildCard, shareCard: shareCard, mountShareButton: mountShareButton,
    captureScreen: captureScreen, printScreen: printScreen, pickPrint: pickPrint, printParts: printParts,
  };
  global.printScreen = printScreen;
  global.captureScreen = captureScreen;
  global.contactSheet = contactSheet;
  global.wireContacts = wireContacts;
  global.shareCard = shareCard;
  global.mountShareButton = mountShareButton;
})(window);

/*
 * ── 태블릿 단계 메뉴 높이 맞춤 (2026-10-23 사장님 지적 — 「상하작동시 다같이 움직이면서 잘 작동이 안 됩니다」) ──
 * 단계마다 제 안에서 스크롤하고 끝에 닿아도 화면 전체를 끌지 않는다(각 앱 CSS 의 .dm-lvl).
 * 그러면 화면을 올리기 전에는 메뉴 아래쪽이 창 밖에 걸려 닿을 수 없으므로, **지금 보이는 높이**를
 * --dm-h 로 알려 준다. 메뉴가 없는 앱·폰 폭에서는 아무 일도 하지 않는다.
 */
(function () {
  var raf = 0;
  function fit() {
    raf = 0;
    var ms = document.querySelectorAll('.dmenu');
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      /* 서랍(position:fixed)은 offsetParent 가 비어도 보이는 상자다 — 그래서 실제로 그려졌는지로 본다 */
      if (!m.getClientRects().length || window.innerWidth < 720) { m.style.removeProperty('--dm-h'); continue; }
      /* 화면 확대(허브의 「가」 단추 — html 에 zoom)가 걸려 있으면 잰 값은 확대된 화면 기준이다.
         CSS px 로 되돌려 넣는다 — 안 그러면 확대만큼 또 커져 메뉴 아래가 창 밖으로 나간다 */
      var z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      var top = Math.max(0, m.getBoundingClientRect().top);
      m.style.setProperty('--dm-h', Math.max(160, Math.round((window.innerHeight - top - 24) / z)) + 'px');
    }
  }
  function ask() { if (!raf) raf = (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(fit); }
  window.addEventListener('scroll', ask, { passive: true });
  window.addEventListener('resize', ask);
  document.addEventListener('click', function () { setTimeout(ask, 0); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ask); else ask();
  setTimeout(ask, 600);
})();

/*
 * ── 사이드바 접기(☰) · 서랍 · 맨 위 경로 — 네 앱 공용 (2026-10-24 사장님 승인 시안) ──
 * 허브 머리의 ☰(lib/navCollapse.ts → IframeModule)가 신호를 보낸다.
 *   {sk:'navc', on}      접힘이면 html.ax-navc — 앱 메뉴(.ax-navbox)를 거두고 내용이 폭을 다 쓴다
 *   {sk:'navc-drawer'}   접힘에서 ☰ 를 다시 누름 → 메뉴를 내용 위로 덮어 연다(html.ax-drawer)
 *   {sk:'navc-set', on}  서랍 맨 위 「메뉴 펼쳐 두기」 → 부모에게 접기를 풀어 달라고 알린다
 * 서랍은 고르면(앱이 AxNav.done()) · 바깥 · Esc · 기기 뒤로가기로 닫힌다.
 *
 * **앱마다 복사하지 않는다** — 서랍을 여닫는 길이 앱마다 갈리면 한 곳만 고쳐 어긋난다.
 * 앱이 할 일은 셋뿐이다: 메뉴 상자에 class="ax-navbox" · 내용 칸의 접힘 배치(CSS) ·
 * 고른 뒤 AxNav.done() · 경로는 AxNav.crumb(상자, [[이름, 열쇠]...], 누르면 할 일).
 * 레이아웃(그리드 열)은 앱마다 달라 앱 CSS 에 둔다. 여기는 서랍·덮개·경로·펼침 줄만.
 */
(function () {
  var R = document.documentElement, pushed = false, onCrumb = null;
  var css = ''
    + '.dm-it.grp.has{color:#1428A0;font-weight:700}'
    + '.dm-it.sub{padding:7px 10px 7px 37px;font-size:13.5px}'
    + '.dm-pin{display:none;width:100%;margin-bottom:6px;border:1.5px solid #1428A0;background:#EEF2FF;color:#1428A0;font:inherit;'
    + 'font-weight:700;font-size:13.5px;padding:8px 10px;border-radius:10px;cursor:pointer}'
    + '.dm-pin:focus-visible{outline:2px solid #1428A0;outline-offset:1px}'
    + '.crumb{display:none}#navscrim{display:none}'
    + '@media screen and (min-width:720px){'
    + '.crumb:not(:empty){display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:0 0 10px;font-size:13.5px;font-weight:700;color:#5B6476}'
    + '.crumb button{border:0;background:transparent;font:inherit;color:#1428A0;padding:4px 6px;border-radius:7px;cursor:pointer}'
    + '.crumb button:hover{background:#EEF2FF}.crumb b{color:#0B1220;padding:4px 2px}.crumb .x{color:#C3CAD8}'
    + 'html.ax-navc body .ax-navbox{position:fixed!important;top:0!important;left:0!important;bottom:0!important;z-index:60!important;'
    + 'width:272px!important;max-height:none!important;margin:0!important;border-radius:0 14px 14px 0!important;padding:10px 8px!important;'
    + 'background:#fff!important;overflow:hidden!important;transform:translateX(-110%)!important;transition:transform .2s ease-out;'
    + 'box-shadow:6px 0 24px rgba(11,18,32,.22);visibility:hidden!important;box-sizing:border-box}'
    + 'html.ax-navc.ax-drawer body .ax-navbox{transform:none!important;visibility:visible!important}'
    + 'html.ax-navc .dm-pin{display:block}'
    + 'html.ax-navc.ax-drawer #navscrim{display:block;position:fixed;inset:0;z-index:55;background:rgba(11,18,32,.35)}'
    + '}'
    + '@media (prefers-reduced-motion:reduce){html.ax-navc body .ax-navbox{transition:none}}'
    + '@media print{.crumb,.dm-pin,#navscrim{display:none!important}}';
  function addCss() {
    if (document.getElementById('ax-nav-css')) return;
    var st = document.createElement('style'); st.id = 'ax-nav-css'; st.textContent = css;
    (document.head || R).appendChild(st);
  }
  addCss();
  function collapsed() { return R.classList.contains('ax-navc'); }
  function isOpen() { return R.classList.contains('ax-drawer'); }
  function refit() { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
  /* 지금 보이는 메뉴 상자 — AS 처럼 탭마다 메뉴가 있으면 보이는 탭의 것 */
  function box() {
    var bs = document.querySelectorAll('.ax-navbox');
    for (var i = 0; i < bs.length; i++) if (bs[i].getClientRects().length) return bs[i];
    return null;
  }
  /* 「메뉴 펼쳐 두기」 — 메뉴를 다시 그리는 앱이 있어(innerHTML) 열 때마다 있는지 보고 넣는다 */
  function ensurePin(b) {
    if (!b || b.querySelector('.dm-pin')) return;
    var p = document.createElement('button'); p.type = 'button'; p.className = 'dm-pin'; p.textContent = '메뉴 펼쳐 두기';
    b.insertBefore(p, b.firstChild);
  }
  function scrim() {
    if (document.getElementById('navscrim') || !document.body) return;
    var d = document.createElement('div'); d.id = 'navscrim'; d.className = 'sk-noprint'; document.body.appendChild(d);
  }
  function focusIn(b) {
    if (!b) return;
    var on = b.querySelector('.dm-it.on') || b.querySelector('.dm-it.has') || b.querySelector('.dm-it');
    if (on) { try { on.scrollIntoView({ block: 'nearest' }); on.focus({ preventScroll: true }); } catch (e) {} }
  }
  function close() { var was = isOpen(); R.classList.remove('ax-drawer'); pushed = false; return was; }
  function open() {
    if (!collapsed()) return;
    var b = box(); if (!b) return;          // 메뉴가 없는 탭(AS 센터 찾기 등)에서는 덮개만 뜨지 않게
    scrim(); ensurePin(b);
    R.classList.add('ax-drawer');
    if (window.Back && !pushed) { pushed = true; Back.open(close, isOpen); }
    refit(); focusIn(b);
  }
  /* 고른 뒤·바깥·Esc — 쌓아 둔 뒤로가기 칸도 함께 정리한다 */
  function done() { var p = pushed; if (close() && p && window.Back) Back.done(); }
  function setLocal(on) {
    if (collapsed() === on) return;
    R.classList.toggle('ax-navc', on);
    if (!on) done();
    refit();
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin) return;
    var d = e.data; if (!d) return;
    if (d.sk === 'navc') setLocal(!!d.on);
    else if (d.sk === 'navc-drawer') open();
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.id === 'navscrim') { done(); return; }
    if (t.closest('.dm-pin')) {
      done(); setLocal(false);
      try { parent.postMessage({ sk: 'navc-set', on: false }, location.origin); } catch (x) {}
      return;
    }
    var cb = t.closest('.crumb button');
    if (cb) {
      if (onCrumb) onCrumb(cb.getAttribute('data-crumb') || '');
      if (collapsed()) open(); else focusIn(box());
      return;
    }
    /* 서랍 안에서 묶음을 펼치면 앱이 메뉴를 다시 그린다 — 펼쳐 두기 단추를 되살린다 */
    if (isOpen()) setTimeout(function () { ensurePin(box()); }, 0);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) done(); });
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* 맨 위 경로 — parts = [[이름, 열쇠], …] 마지막이 지금 위치(굵게). 앞 것을 누르면 fn(열쇠) 뒤 메뉴가 열린다 */
  function crumb(el, parts, fn) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    onCrumb = fn || null;
    if (!parts || parts.length < 2) { el.innerHTML = ''; return; }
    el.innerHTML = parts.map(function (p, i) {
      return i === parts.length - 1 ? '<b>' + esc(p[0]) + '</b>'
        : '<button type="button" data-crumb="' + esc(p[1] == null ? '' : p[1]) + '">' + esc(p[0]) + '</button><span class="x">›</span>';
    }).join('');
  }
  window.AxNav = { open: open, done: done, collapsed: collapsed, crumb: crumb };
})();
