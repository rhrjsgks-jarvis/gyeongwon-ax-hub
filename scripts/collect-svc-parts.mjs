/*
 * 삼성전자서비스 휴대폰·태블릿·PC 정품 부품 가격 수집 → <출력 경로>(기본 .scratch/svc/selfparts-all.json)
 *   node scripts/collect-svc-parts.mjs [출력 경로]   →   node scripts/build-svc-parts.mjs <같은 경로>
 *
 * 소모품샵 「고객 자가수리」(smItemApi/list)를 갈래마다 통째로 받는다. 예전에는 .scratch 의
 * selfparts2.mjs(휴대폰·태블릿) + pcparts.mjs(노트북·모니터) 둘로 받아 손으로 합쳤는데,
 * 주간 자동 점검(scripts/weekly-scan.mjs)이 돌리려면 커밋된 한 벌이어야 한다.
 * API 는 브라우저 세션이 있어야 응답한다(curl 은 401) — **로컬 전용**.
 * 갈래가 0건이면 던진다 — 반쪽 자료로 화면을 덮으면 부품가가 통째로 사라진다.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PARTS_DIRS = { '스마트폰(S, A)': '175708103', '스마트폰(폴더블)': '670009235', '태블릿': '255733217', '노트북': '176274689', '모니터': '401598359' };

export async function collectParts() {
  const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
    await p.goto('https://www.samsungsvc.co.kr/shop/product?category=175707397', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    const items = {};
    for (const [k, id] of Object.entries(PARTS_DIRS)) {
      items[k] = [];
      for (let page = 1; page < 30; page++) {
        const j = await p.evaluate(async ([id, page]) => (await (await fetch(`https://api.samsungsvc.co.kr/svc/smItemApi/list?directoryId=${id}&itemStatus=00,40,80&sorting=registConfirmDate+desc+registReqDate+desc&page=${page}&pageSize=200&_siteId=ssvc`, { credentials: 'include' })).json()), [id, page]);
        const got = j.items || [];
        items[k].push(...got.map((x) => ({ name: x.itemName, series: (x.directoryId || []).map((d) => d.label).slice(-1)[0], svcModel: x.svcModel, part: x.ezoneCode, price: x.price, returnPrice: x.returnPrice, status: x.itemStatus && x.itemStatus.label })));
        if (items[k].length >= j.totalCount || !got.length) break;
        await p.waitForTimeout(700);
      }
      if (!items[k].length) throw new Error(k + ' 갈래가 0건이다 — 원문이 막혔거나 구조가 바뀌었다');
    }
    return { collectedAt: new Date().toISOString(), items };
  } finally { await b.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] || '.scratch/svc/selfparts-all.json';
  const raw = await collectParts();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(raw, null, 1));
  console.log(Object.entries(raw.items).map(([k, a]) => k + ' ' + a.length).join(' · ') + ' → ' + out);
}
