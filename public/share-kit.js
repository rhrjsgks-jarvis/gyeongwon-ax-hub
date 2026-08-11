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

  global.SHARE_KIT = {
    sheet: sheet, closeSheet: closeSheet, toast: toast, copyText: copyText,
    contactSheet: contactSheet, wireContacts: wireContacts,
  };
  global.contactSheet = contactSheet;
  global.wireContacts = wireContacts;
})(window);
