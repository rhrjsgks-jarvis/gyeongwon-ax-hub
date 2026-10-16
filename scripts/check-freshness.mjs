/*
 * **자료 최신화 점검 대장** — `npm run check:fresh`
 *
 * 2026-10-16 사장님 — *"구독프로그램이 변경된 것도, 물류비 내용이 추가된 것도 잊고 있었다.
 * 놓치지 않고 주기적으로 체크할 방법"*. 원문(삼성닷컴·로지텍·삼성전자서비스…)은 예고 없이
 * 바뀌고, 앱은 그 사실을 모른다. 그래서 **출처마다 마지막으로 대조한 날과 주기**를 적어 두고,
 * 기한이 지나면 상태줄과 매 질문 맥락에 뜨게 한다 — 사람이 기억할 필요를 없앤다.
 *
 *   npm run check:fresh                 기한표 (네트워크 안 씀)
 *   npm run check:fresh -- --done KEY   그 출처를 오늘 대조했다고 적는다(여럿이면 쉼표)
 *
 * 대장은 `scripts/fixtures/freshness.json` 한 곳이다 — 상태줄도 이 파일의 `overdue()` 를 쓴다.
 * **대조하지 않고 날짜만 올리지 말 것** — 날짜가 곧 "이때 원문과 맞았다"는 증언이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LEDGER = 'scripts/fixtures/freshness.json';

const DAY = 86400000;
const ymd = (d) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;   // 현지 날짜(UTC 쓰지 말 것)
};

export function load(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, LEDGER), 'utf8'));
}

/** 기한이 지난 것 — 모르는 날짜(빈칸)도 기한이 지난 것으로 본다. 「모른다」를 「괜찮다」로 바꾸지 않는다 */
export function overdue(items, now = new Date()) {
  return items.map((it) => {
    const t = it.checkedAt ? new Date(it.checkedAt + 'T00:00:00').getTime() : NaN;
    const age = Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY) : null;
    const left = age == null ? -1 : it.everyDays - age;
    return { ...it, age, left };
  }).filter((x) => x.left < 0).sort((a, b) => a.left - b.left);
}

function table(items, now = new Date()) {
  const rows = items.map((it) => {
    const [o] = overdue([it], now);
    const t = it.checkedAt ? new Date(it.checkedAt + 'T00:00:00').getTime() : NaN;
    const age = Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY) : null;
    const state = o ? (age == null ? '모름' : `${-o.left}일 지남`) : `${it.everyDays - age}일 남음`;
    return `${o ? '⚠' : '✓'} ${it.name.padEnd(18)} ${String(it.checkedAt || '—').padEnd(10)} ${('매 ' + it.everyDays + '일').padEnd(7)} ${state.padEnd(9)} ${it.how}`;
  });
  return rows.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const L = load();
  const i = process.argv.indexOf('--done');
  if (i > 0) {
    const keys = String(process.argv[i + 1] || '').split(',').filter(Boolean);
    const today = ymd(new Date());
    for (const k of keys) {
      const it = L.items.find((x) => x.key === k);
      if (!it) { console.error(`없는 출처: ${k} — 있는 것: ${L.items.map((x) => x.key).join(', ')}`); process.exit(1); }
      it.checkedAt = today;
    }
    fs.writeFileSync(LEDGER, JSON.stringify(L, null, 2) + '\n');
    console.log(`${keys.join(', ')} → ${today} 로 적었습니다`);
  }
  const od = overdue(L.items);
  console.log(table(L.items));
  console.log(od.length
    ? `\n기한 지난 점검 ${od.length}건 — 대조하고 나서 --done 으로 적을 것`
    : '\n기한 지난 점검 없음');
}
