/*
 * 삼성전자서비스 소모품샵 가전 소모품 가격 수집 → <출력 경로>(기본 .scratch/svc/consum-all.json)
 *   node scripts/collect-svc-consum.mjs [출력 경로]
 *
 * 소모품샵 상단 메뉴의 가전 7갈래(에어컨·공기청정기 · 세탁/건조/에어드레서 · 청소기 · 냉장고 ·
 * 주방가전 · TV/모니터 · 프린터)를 smItemApi/list 로 통째로 받는다. 이 API 는 브라우저 세션이
 * 있어야 응답해(curl 은 401) 지면을 한 번 연 뒤 그 안에서 fetch 한다 — **로컬 전용**.
 * 모바일·노트북은 케이스·파우치 같은 액세서리라 수리비와 무관해 받지 않는다.
 * 갈래가 0건이면 던진다 — 반쪽 자료로 화면을 덮으면 소모품이 통째로 사라진다.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONSUM_CATS = { '에어컨·공기청정기': '10422', '세탁기·건조기·에어드레서': '10423', '청소기': '10424', '냉장고': '10425', '주방가전': '10427', 'TV·모니터': '10409', '프린터·복합기': '10403' };

export async function collectConsum() {
  const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const p = await b.newPage();
    await p.goto('https://www.samsungsvc.co.kr/shop/product?category=10422', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    const items = {};
    for (const [k, id] of Object.entries(CONSUM_CATS)) {
      items[k] = [];
      for (let page = 1; page < 40; page++) {
        const j = await p.evaluate(async ([id, page]) => {
          const r = await fetch(`https://api.samsungsvc.co.kr/svc/smItemApi/list?directoryId=${id}&itemStatus=00,40,80&sorting=registConfirmDate+desc+registReqDate+desc&page=${page}&pageSize=200&_siteId=ssvc`, { credentials: 'include' });
          return r.json();
        }, [id, page]);
        const got = j.items || [];
        items[k].push(...got.map((x) => ({ name: x.itemName, dirs: (x.directoryId || []).map((d) => d.label), svcModel: x.svcModel, part: x.ezoneCode, price: x.price, status: x.itemStatus && x.itemStatus.label })));
        if (items[k].length >= j.totalCount || !got.length) break;
        await p.waitForTimeout(600);
      }
      if (!items[k].length) throw new Error(k + ' 갈래가 0건이다 — 원문이 막혔거나 구조가 바뀌었다');
    }
    return { collectedAt: new Date().toISOString(), items };
  } finally { await b.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] || '.scratch/svc/consum-all.json';
  const raw = await collectConsum();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(raw, null, 1));
  console.log(Object.entries(raw.items).map(([k, a]) => k + ' ' + a.length).join(' · ') + ' → ' + out);
}
