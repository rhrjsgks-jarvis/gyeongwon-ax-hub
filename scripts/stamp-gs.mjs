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
  if (process.argv.includes('--check')) {
    const r = gsStampOk(src);
    console.log(r.ok ? '[stamp-gs] 표식이 맞다 — ' + r.ver : '[stamp-gs] ' + r.why);
    process.exit(r.ok ? 0 : 1);
  }
  if (process.argv.includes('--remote')) {
    const url = process.argv[process.argv.indexOf('--remote') + 1];
    if (!url || !/^https:/.test(url)) { console.error('[stamp-gs] --remote 뒤에 웹앱 주소를 주세요'); process.exit(1); }
    const mine = gsStampOk(src);
    const j = await (await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'json=1')).json();
    const got = j.gsVer || '(없음 — 옛 판이라 표식 자체가 없다)';
    console.log('배포본 ' + got);
    console.log('여기   ' + (mine.ver || '(표식 없음)'));
    const same = mine.ok && got === mine.ver;
    console.log(same ? 'OK — 같은 판이다' : 'X — 다르다. 붙여넣고 「배포 관리 → 새 버전」까지 하셨는지 보세요');
    process.exit(same ? 0 : 1);
  }
  const ver = gsStamp(src);
  fs.writeFileSync(GS, src.replace(LINE, "var GS_VER = '" + ver + "';   /* 붙여넣기 확인용 — `npm run stamp:gs` 가 찍는다(내용 해시) */"));
  console.log('[stamp-gs] ' + ver);
}
