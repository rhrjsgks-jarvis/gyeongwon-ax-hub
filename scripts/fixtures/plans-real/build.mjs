// 도면 픽스처 재생성 — 실행: npm run build:plans
//
// install-app.html 이 참조하는 삼성닷컴 설치 규격도 중 PICKS 에 지정한 것을 내려받아
// 파일로 저장하고 index.json 을 다시 쓴다. 네트워크가 필요하므로 테스트가 아니라
// build-search-index.mjs 와 같은 성격의 "생성 도구"다.
//
// 도면을 추가/교체할 때:
//   1) PICKS 에 [id, 파일명] 을 넣는다 (파일명은 install-app.html 의 src 끝부분)
//   2) npm run build:plans 로 재생성
//   3) npm run test:plans 로 검증한 뒤 index.json 과 이미지를 함께 커밋
//
// 주의: install-app.html 에 이미 실려 있는(= 삼성닷컴에서 검증된) 도면만 대상으로 한다.
// 검증되지 않은 이미지를 픽스처에 넣지 말 것 — CLAUDE.md 의 최우선 원칙이다.

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { FIXTURE_DIR, INDEX_JSON, parseInstallImages, imageSize, dimTokens } from './lib.mjs';

// 선정 기준: ①설치 규격도/설치가이드 도면일 것(제품 실사진 제외)
//            ②캡션에 실측 치수가 명시돼 있을 것 ③카테고리가 고르게 분포할 것
const PICKS = [
  ['refri-4door-fs-bespoke',     'pc-set-one-refri-bespoke-4doorFs-rm_f91_f90_v4.jpg'],
  ['refri-4door-kitchenfit',     'pc01-01-02-02-01_v4.jpg'],
  ['refri-4door-kitchenfit-max', 'pc_02_02_01_4+4door_max_v5.jpg'],
  ['refri-2door-kitchenfit',     'pc01-01-02-03.jpg'],
  ['refri-1door-kitchenfit',     'pc01-01-02-04-01_v3.jpg'],
  ['refri-sbs-845-852',          'popup_pc_845_852_.jpg'],
  ['refri-pair-infinite',        'pc02-01-01.jpg'],
  ['kimchi-stand-4door',         'pc01-02-03-01.jpg'],
  ['washer-bespoke-ai',          'washingmachines_pcd_web_03_01.jpg'],
  ['washer-ai-combo',            'aicombo_guide_pc_v3.jpg'],
  ['dryer-stack-kit',            'col-kit_set_2025.jpg'],
  ['robot-builtin-drain',        'guide_pic01_pc.jpg'],
  ['dishwasher-true-builtin',    'guide_true_pc_v6.jpg'],
  ['airdresser-large',           'PC_Bespoke_airdresser_big_v3.jpg'],
  ['purifier-builtin',           'purifier_guide01_v7.png'],
];

const entries = parseInstallImages();
fs.mkdirSync(FIXTURE_DIR, { recursive: true });

const items = [];
const problems = [];

for (const [id, fileHint] of PICKS) {
  const hit = entries.find((e) => e.src.endsWith('/' + fileHint));
  if (!hit) { problems.push(`${id}: install-app.html 에서 '${fileHint}' 를 찾지 못함`); continue; }

  let buf;
  try {
    const res = await fetch(hit.src, { redirect: 'follow' });
    if (!res.ok) { problems.push(`${id}: HTTP ${res.status} ${hit.src}`); continue; }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    problems.push(`${id}: 다운로드 실패 (${e.message}) ${hit.src}`);
    continue;
  }

  const size = imageSize(buf);
  if (!size) { problems.push(`${id}: 이미지 헤더 파싱 실패 — 오류 페이지일 수 있음 ${hit.src}`); continue; }

  const file = id + (size.format === 'png' ? '.png' : '.jpg');
  fs.writeFileSync(path.join(FIXTURE_DIR, file), buf);

  items.push({
    id,
    category: hit.cat,
    file,
    src: hit.src,
    alt: hit.alt,
    cap: hit.cap,
    dims: dimTokens(hit.cap),
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    format: size.format,
    width: size.width,
    height: size.height,
    // 같은 도면이 여러 카테고리에서 재사용되는 경우가 있어 전부 기록한다
    usedInCategories: entries.filter((x) => x.src === hit.src).map((x) => x.cat),
  });

  console.log(`OK  ${id.padEnd(28)} ${size.width}x${size.height} ${size.format} ${buf.length}B  dims=${items.at(-1).dims.length}`);
}

const index = {
  description: '설치환경가이드(public/install-app.html)가 참조하는 실제 삼성닷컴 설치 규격도 스냅샷',
  source: 'samsung.com (images.samsung.com)',
  capturedAt: new Date().toISOString().slice(0, 10),
  note: '재배포용이 아니라 회귀 테스트 대조용 스냅샷이다. 원본이 바뀌면 npm run test:plans 가 알려준다.',
  count: items.length,
  items,
};
fs.writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + '\n', 'utf8');

console.log(`\n수집 완료: ${items.length}/${PICKS.length} 장`);
if (problems.length) {
  console.log('\n문제:');
  for (const p of problems) console.log(' -', p);
  process.exit(1);
}
