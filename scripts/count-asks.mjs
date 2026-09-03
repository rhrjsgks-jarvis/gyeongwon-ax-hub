#!/usr/bin/env node
/**
 * 선택창(AskUserQuestion)을 언제·몇 번·무엇을 물었는지 전사에서 센다.
 *
 * **왜 저장소가 들고 있나** — CLAUDE.md 의 「묻지 않는다」 규칙은 **지켰는지 셀 수
 * 있어야** 뜻이 있다. `.scratch/` 에 두면 이 PC 를 벗어나는 순간 사라져, 다음 세션은
 * 규칙만 읽고 자기가 몇 번 물었는지 모른다(이 저장소가 `gw.mjs` 로 이미 데인 종류다).
 *
 * **체감을 만드는 것은 총량이 아니라 밀도다**(2026-09-04 실측) — 8/14 세션은 8회지만
 * 27시간에 걸쳐(3.4시간에 1번), 9/3~9/4 세션은 3회인데 21분에 몰렸다(10분에 1번).
 * 그래서 날짜별과 **세션별 밀도**를 함께 찍는다.
 *
 *   node scripts/count-asks.mjs            (기본: 최근 14일)
 *   node scripts/count-asks.mjs 60         (60일)
 *   node scripts/count-asks.mjs all        (전체)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arg = process.argv[2] || '14';
const days = arg === 'all' ? Infinity : Number(arg) || 14;

/* 전사 폴더는 프로젝트 경로를 평탄화한 이름이다 — **영숫자가 아닌 모든 문자**가
   하이픈이 된다. 이 저장소 경로에는 한글이 있어 그것까지 바뀌므로
   (`…\노윤정\gyeongwon-ax-hub` → `C--Users-----gyeongwon-ax-hub`) 구분자만
   바꾸는 규칙으로는 못 찾는다. **역슬래시를 패턴에 쓰지 않는다** — heredoc·셸을
   지나며 조용히 먹혀 다른 뜻이 된다(이 저장소가 되풀이해 데인 함정이다).
   그래도 못 찾으면 **폴더 목록에서 꼬리가 맞는 것**을 집는다 — 평탄화 규칙이
   바뀌어도 도구가 조용히 0 을 돌려주지 않게. */
const root = path.join(os.homedir(), '.claude', 'projects');
let dir = path.join(root, process.cwd().replace(/[^A-Za-z0-9-]/g, '-'));
if (!fs.existsSync(dir) && fs.existsSync(root)) {
  const tail = path.basename(process.cwd());
  const hit = fs.readdirSync(root).filter((d) => d.endsWith(tail));
  if (hit.length === 1) dir = path.join(root, hit[0]);
}
if (!fs.existsSync(dir)) {
  console.log('전사 폴더를 못 찾았습니다:', dir);
  process.exit(0);
}

const since = days === Infinity ? '' : new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
  let txt;
  try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { continue; }
  if (txt.indexOf('AskUserQuestion') < 0) continue;
  for (const line of txt.split(String.fromCharCode(10))) {
    if (!line || line.indexOf('AskUserQuestion') < 0) continue;
    let o;
    try { o = JSON.parse(line); } catch (e) { continue; }
    const c = o && o.message && o.message.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (!b || b.type !== 'tool_use' || b.name !== 'AskUserQuestion') continue;
      const ts = String(o.timestamp || '');
      if (since && ts.slice(0, 10) < since) continue;
      const q = (b.input && b.input.questions && b.input.questions[0]) || {};
      rows.push({ ts, sess: f.slice(0, 8), q: String(q.question || '') });
    }
  }
}
rows.sort((a, b) => a.ts.localeCompare(b.ts));

if (!rows.length) { console.log('선택창 기록이 없습니다' + (since ? ' (' + since + ' 이후)' : '')); process.exit(0); }

const byDay = {};
rows.forEach((r) => { const d = r.ts.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
console.log('=== 날짜별 ===');
Object.keys(byDay).sort().forEach((d) => console.log(' ', d, String(byDay[d]).padStart(3) + '회'));

/* **세션별 밀도** — 규칙은 「한 세션에 최대 1회」다. 2회 이상이면 그 자체가 위반이고,
   짧은 시간에 몰린 것은 총량과 무관하게 크게 느껴진다. */
const bySess = {};
rows.forEach((r) => { (bySess[r.sess] = bySess[r.sess] || []).push(r); });
const dense = Object.entries(bySess).map(([s, a]) => {
  const span = Math.round((new Date(a[a.length - 1].ts) - new Date(a[0].ts)) / 60000);
  return { s, n: a.length, day: a[0].ts.slice(0, 10), span };
}).filter((d) => d.n > 1).sort((a, b) => (b.n / Math.max(1, b.span)) - (a.n / Math.max(1, a.span)));
if (dense.length) {
  console.log();
  console.log('=== 한 세션에 2회 이상 (규칙 위반 · 밀도 높은 순) ===');
  dense.slice(0, 10).forEach((d) => console.log(' ', d.day, d.s, String(d.n).padStart(2) + '회',
    d.span ? '· ' + d.span + '분에 걸쳐' : '· 같은 분에'));
}

console.log();
console.log('=== 최근 10건 ===');
rows.slice(-10).forEach((r) => console.log(' ', r.ts.slice(0, 10), r.ts.slice(11, 16), r.sess, '|', r.q.slice(0, 62)));
console.log();
console.log('총 ' + rows.length + '회' + (since ? ' (' + since + ' 이후)' : ''));
