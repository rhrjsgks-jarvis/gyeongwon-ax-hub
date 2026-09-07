/**
 * **붙여넣은 `.gs` 가 새 판인지 1초에 확인하는 표식을 찍는다** (2026-09-07).
 *
 * 이 세션에서만 *"배포 완료했습니다"* → *"확인해 보니 확정할 수 없습니다"* 왕복이
 * **여섯 번** 있었다. 서버 코드는 응답 스키마를 안 바꾸면 **밖에서 볼 방법이 없어서**다
 * (저장된 오류 문자열은 옛 값이라 증거가 못 된다 — 실제로 그것으로 한 번 오진했다).
 *
 * `?json=1` 에 `gsVer` 를 실으면 **받는 즉시** 확정된다.
 * 값은 **파일 내용의 해시**라 사람이 올리는 것을 잊을 수 없다 —
 * `.gs` 를 고치면 해시가 달라지고, `npm test` 가 「다시 찍으라」고 알린다.
 *
 *   node scripts/stamp-gs.mjs          찍는다
 *   node scripts/stamp-gs.mjs --check  맞는지만 본다(검사가 쓴다)
 *   node scripts/stamp-gs.mjs --remote <웹앱주소>   배포본과 대조한다
 *
 * **웹앱 주소는 저장소에 적지 않는다** — `?json=1` 이 잠금 없이 후기 자료를 주므로
 * 공개 저장소에 두면 그대로 새어 나간다. 인자로 넘긴다.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const GS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'apps-script', 'Reviews.gs');
const LINE = /^var GS_VER = '[^']*';.*$/m;
/* 화면 파일도 같은 방식으로 — **붙여넣기는 파일별이라 따로 어긋난다** */
const IX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'apps-script', 'ReviewsIndex.html');
const IXLINE = /^<!-- IX_VER: [^>]*-->$/m;

/** 표식 줄 자신은 빼고 해시한다 — 안 그러면 찍을 때마다 값이 또 달라진다 */
export function gsHash(src) {
  return crypto.createHash('sha1').update(src.replace(LINE, ''), 'utf8').digest('hex').slice(0, 8);
}
export function gsStamp(src) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + gsHash(src);
}
/** 커밋된 값이 지금 내용과 맞는가 */
/** 화면 파일 표식 — 서버와 같은 규칙(자기 줄을 빼고 해시) */
export function ixHash(src) {
  /* **줄과 개행을 함께 지운다** — 내용만 지우면 빈 줄이 남아 찍기 전/후 해시가 갈린다 */
  const cut = new RegExp('^<!-- IX_VER: [^' + String.fromCharCode(10) + ']*' + String.fromCharCode(10) + '?', 'm');
  return crypto.createHash('sha1').update(src.replace(cut, ''), 'utf8').digest('hex').slice(0, 8);
}
export function ixStampOk(src) {
  const m = src.match(/^<!-- IX_VER: ([^ ]+) -->$/m);
  if (!m) return { ok: false, why: 'IX_VER 이 없다' };
  const want = ixHash(src);
  return String(m[1]).split('-').pop() === want ? { ok: true, ver: m[1] }
    : { ok: false, why: '화면 표식이 낡았다 — ' + m[1] + ' (내용 해시 ' + want + ')', ver: m[1] };
}

export function gsStampOk(src) {
  const m = src.match(/^var GS_VER = '([^']*)';/m);
  if (!m) return { ok: false, why: 'GS_VER 이 없다' };
  const want = gsHash(src);
  const got = String(m[1]).split('-').pop();
  return got === want ? { ok: true, ver: m[1] }
    : { ok: false, why: '표식이 낡았다 — ' + m[1] + ' (내용 해시 ' + want + ')', ver: m[1] };
}

if (process.argv[1] && process.argv[1].endsWith('stamp-gs.mjs')) {
  const src = fs.readFileSync(GS, 'utf8');
  if (!LINE.test(src)) { console.error('[stamp-gs] GS_VER 줄이 없다 — Reviews.gs 에 먼저 넣을 것'); process.exit(1); }
  const ixSrc = fs.readFileSync(IX, 'utf8');
  if (process.argv.includes('--check')) {
    const a = gsStampOk(src), b = ixStampOk(ixSrc);
    console.log(a.ok ? '[stamp] .gs   ' + a.ver : '[stamp] .gs   ' + a.why);
    console.log(b.ok ? '[stamp] .html ' + b.ver : '[stamp] .html ' + b.why);
    process.exit(a.ok && b.ok ? 0 : 1);
  }
  if (process.argv.includes('--remote')) {
    const url = process.argv[process.argv.indexOf('--remote') + 1];
    if (!url || !/^https:/.test(url)) { console.error('[stamp-gs] --remote 뒤에 웹앱 주소를 주세요'); process.exit(1); }
    const mg = gsStampOk(src), mi = ixStampOk(ixSrc);
    const j = await (await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'json=1')).json();
    const gGot = j.gsVer || '';
    /* 화면은 HTML 본문에서 표식을 찾는다 — Apps Script 가 이스케이프해 서빙하므로
       역슬래시를 걷어낸다(이 저장소가 배포 확인에서 두 번 데인 자리). */
    const raw = await (await fetch(url)).text();
    const B = String.fromCharCode(92);
    const html = raw.split(B).join('');
    const im = html.match(/IX_VER: ([0-9a-z-]+)/);
    const iGot = im ? im[1] : '';
    const line = (nm, got, mine) => {
      const same = mine.ok && got === mine.ver;
      console.log((same ? ' O ' : ' X ') + nm + '  배포본 ' + (got || '(표식 없음 — 옛 판)')
        + '  /  여기 ' + (mine.ver || '(표식 없음)'));
      return same;
    };
    const ok1 = line('.gs  ', gGot, mg), ok2 = line('.html', iGot, mi);
    console.log(ok1 && ok2 ? '' + String.fromCharCode(10) + 'OK — 둘 다 같은 판이다'
      : '' + String.fromCharCode(10) + 'X — 다른 파일이 있습니다. 붙여넣고 「배포 관리 → 새 버전」까지 하셨는지 보세요');
    process.exit(ok1 && ok2 ? 0 : 1);
  }
  const ver = gsStamp(src);
  fs.writeFileSync(GS, src.replace(LINE, "var GS_VER = '" + ver + "';   /* 붙여넣기 확인용 — `npm run stamp:gs` 가 찍는다(내용 해시) */"));
  console.log('[stamp] .gs   ' + ver);
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const iver = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + ixHash(ixSrc);
  const DOC = /^<!doctype html>/im;
  fs.writeFileSync(IX, IXLINE.test(ixSrc) ? ixSrc.replace(IXLINE, '<!-- IX_VER: ' + iver + ' -->')
    : ixSrc.replace(DOC, function (m) { return m + String.fromCharCode(10) + '<!-- IX_VER: ' + iver + ' -->'; }));
  console.log('[stamp] .html ' + iver);
}
