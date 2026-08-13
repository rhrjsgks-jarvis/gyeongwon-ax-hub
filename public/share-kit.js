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
      '.sk-dim{position:fixed;inset:0;background:rgba(15,20,35,.45);z-index:9000;display:flex;',
      '  align-items:flex-end;justify-content:center;animation:sk-fade .14s ease-out}',
      '@keyframes sk-fade{from{opacity:0}to{opacity:1}}',
      '.sk-sheet{background:#fff;width:100%;max-width:460px;border-radius:16px 16px 0 0;',
      '  padding:18px 16px calc(16px + env(safe-area-inset-bottom));animation:sk-up .18s ease-out}',
      '@keyframes sk-up{from{transform:translateY(14px)}to{transform:translateY(0)}}',
      '.sk-t{font-size:14px;font-weight:800;margin-bottom:2px}',
      '.sk-n{font-size:20px;font-weight:800;color:#1428A0;letter-spacing:-.01em;margin-bottom:14px}',
      '.sk-b{display:block;width:100%;border:1px solid #e5e7eb;background:#fff;border-radius:11px;',
      '  padding:13px;font-size:14px;font-weight:700;margin-bottom:8px;cursor:pointer;color:#16181b;',
      '  font-family:inherit;text-align:center;text-decoration:none}',
      '.sk-b.primary{background:#1428A0;border-color:#1428A0;color:#fff}',
      '.sk-b:active{opacity:.85}',
      '.sk-toast{position:fixed;left:50%;bottom:24%;transform:translateX(-50%);z-index:9100;',
      '  background:rgba(20,24,32,.92);color:#fff;padding:10px 16px;border-radius:10px;',
      '  font-size:13px;font-weight:600;pointer-events:none}',
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

  /** 지금 화면을 처음부터 끝까지 한 장으로. filename 은 저장 이름. */
  function captureScreen(filename) {
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
          if (!blob) { toast('이미지를 만들지 못했습니다'); return res(false); }
          var name = (filename || '세일즈코파일럿') + '.png';
          var file = null;
          try { file = new File([blob], name, { type: 'image/png' }); } catch (e) {}
          if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
            navigator.share({ files: [file], title: filename || '' })
              .catch(function (err) { if (!err || err.name !== 'AbortError') download(blob, name); })
              .then(function () { res(true); }, function () { res(true); });
            return;
          }
          download(blob, name);
          res(true);
        }, 'image/png');
      });
    }).catch(function () {
      toast('화면을 담지 못했습니다');
      return false;
    });
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
      + 'border:1.5px solid #1428A0;border-radius:99px;padding:8px 15px;font-size:13px;font-weight:800;'
      + 'font-family:inherit;cursor:pointer;box-shadow:0 2px 10px rgba(14,28,48,.16)}'
      + '#sk-share:active{background:#EEF2FF}';
    document.head.appendChild(st);
    var b = document.createElement('button');
    b.id = 'sk-share'; b.type = 'button';
    b.textContent = label || '공유';
    b.style.top = (stickyBottom() + 8) + 'px';
    b.addEventListener('click', function () {
      var o = null;
      try { o = build && build(); } catch (e) {}
      captureScreen(o && o.filename);
    });
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
      b.click();
    });
    /* 헤더가 맡으므로 안쪽 버튼은 감춘다 — 같은 일을 하는 버튼이 둘 보이면 헷갈린다 */
    var hide = document.createElement('style');
    hide.textContent = '#sk-share{visibility:hidden;pointer-events:none}';
    document.head.appendChild(hide);
  }

  global.SHARE_KIT = {
    sheet: sheet, closeSheet: closeSheet, toast: toast, copyText: copyText,
    contactSheet: contactSheet, wireContacts: wireContacts,
    buildCard: buildCard, shareCard: shareCard, mountShareButton: mountShareButton,
    captureScreen: captureScreen,
  };
  global.captureScreen = captureScreen;
  global.contactSheet = contactSheet;
  global.wireContacts = wireContacts;
  global.shareCard = shareCard;
  global.mountShareButton = mountShareButton;
})(window);
