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
 * 상담 결과를 고객 손에 남기는 통로다. 화면을 그대로 캡처하는 API 는 웹에 없으므로
 * **내용을 캔버스에 다시 그려** 이미지로 만든다(배치 시뮬레이터가 쓰던 방식과 같다).
 * navigator.share 로 카톡 등에 바로 보내고, 안 되면 내려받기로 물러선다.
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

  function closeSheet() {
    var d = document.querySelector('.sk-dim');
    if (d) d.remove();
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
        F(15, 700);
        var nm = String(r[0]);
        F(13, 400);
        var det = r[2] ? wrap(m, r[2], W - PAD * 2 - 8) : [];
        body.push({ t: 'r', nm: nm, val: r[1] == null ? '' : String(r[1]), det: det });
        y += 26 + det.length * 19 + 10;
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
      c.fillStyle = INK; f(15, 700);
      c.fillText(b.nm, PAD, cy + 14);
      if (b.val) {
        c.fillStyle = NAVY; f(15, 800);
        c.textAlign = 'right'; c.fillText(b.val, W - PAD, cy + 14); c.textAlign = 'left';
      }
      cy += 26;
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

  /** 화면 오른쪽 아래에 공유 버튼을 띄운다. build() 는 shareCard 옵션을 돌려준다. */
  function mountShareButton(build, label) {
    injectCss();
    if (document.getElementById('sk-share')) return;
    var st = document.createElement('style');
    st.textContent = '#sk-share{position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom));'
      + 'z-index:8000;background:#1428A0;color:#fff;border:0;border-radius:99px;padding:11px 17px;'
      + 'font-size:13px;font-weight:800;font-family:inherit;cursor:pointer;'
      + 'box-shadow:0 4px 14px rgba(20,40,160,.32)}#sk-share:active{opacity:.85}';
    document.head.appendChild(st);
    var b = document.createElement('button');
    b.id = 'sk-share'; b.type = 'button';
    b.textContent = label || '고객에게 공유';
    b.addEventListener('click', function () {
      var o = build();
      if (!o) { toast('공유할 내용이 없습니다'); return; }
      shareCard(o);
    });
    document.body.appendChild(b);
  }

  global.SHARE_KIT = {
    sheet: sheet, closeSheet: closeSheet, toast: toast, copyText: copyText,
    contactSheet: contactSheet, wireContacts: wireContacts,
    buildCard: buildCard, shareCard: shareCard, mountShareButton: mountShareButton,
  };
  global.contactSheet = contactSheet;
  global.wireContacts = wireContacts;
  global.shareCard = shareCard;
  global.mountShareButton = mountShareButton;
})(window);
