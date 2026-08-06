// 도면(설치 규격도) 픽스처 회귀 테스트
// 실행: node scripts/test-plans.mjs   (npm run test:plans)
//
// 배경: 설치환경가이드의 도면 이미지는 전부 images.samsung.com 원격 URL을 직접 참조한다.
// 그래서 두 가지 사고가 아무 경보 없이 일어날 수 있다.
//   ① 삼성닷컴이 URL을 정리하면 매장에서 이미지가 통째로 안 뜬다(빈 카드가 뜬다).
//   ② URL은 그대로인데 도면이 개정되면, 캡션에 적힌 치수와 그림이 어긋난다.
// ②가 특히 위험하다 — CLAUDE.md 가 못박은 대로 "설치 상담에서 치수 오류는 바로 사고"다.
//
// 이 테스트는 검증된 도면 15장의 스냅샷을 scripts/fixtures/plans-real/ 에 고정해 두고,
// 스냅샷·소스·원본 세 가지가 서로 어긋나지 않는지 확인한다.
//
// PART A 스냅샷 무결성      (오프라인)
// PART B 소스와의 연결      (오프라인)
// PART C 치수 회귀          (오프라인)
// PART D 원본 최신성        (네트워크 — 없으면 SKIP)

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  FIXTURE_DIR, INSTALL_HTML, readIndex, parseInstallImages, imageSize, dimTokens,
} from './fixtures/plans-real/lib.mjs';

let ok = true;
const fail = (msg) => { console.log('ERROR:', msg); ok = false; };
const warn = (msg) => { console.log('WARN:', msg); };

const index = readIndex();
const entries = parseInstallImages(fs.readFileSync(INSTALL_HTML, 'utf8'));
// 같은 도면이 여러 카테고리에서 재사용되므로 src → 사용처 배열로 모은다
const bySrc = new Map();
for (const e of entries) {
  if (!bySrc.has(e.src)) bySrc.set(e.src, []);
  bySrc.get(e.src).push(e);
}

// ── PART A. 스냅샷 무결성 ────────────────────────────────────────────────
// index.json 의 기록과 디스크의 파일이 일치하는가. 이미지 헤더까지 다시 파싱해
// "이미지인 척하는 오류 페이지"가 픽스처에 섞여 들어오지 않았는지 본다.
console.log('── PART A. 스냅샷 무결성 ──');

if (index.count !== index.items.length) {
  fail(`index.json 의 count(${index.count})와 실제 items 길이(${index.items.length})가 다름`);
}
if (index.items.length < 10) {
  fail(`도면 픽스처가 ${index.items.length}장뿐 — 최소 10장을 유지할 것`);
}

const seenIds = new Set();
const seenFiles = new Set();
let intact = 0;
for (const it of index.items) {
  if (seenIds.has(it.id)) fail(`id 중복: ${it.id}`);
  seenIds.add(it.id);
  if (seenFiles.has(it.file)) fail(`file 중복: ${it.file}`);
  seenFiles.add(it.file);

  const abs = path.join(FIXTURE_DIR, it.file);
  if (!fs.existsSync(abs)) { fail(`${it.id}: 픽스처 파일 없음 (${it.file})`); continue; }

  const buf = fs.readFileSync(abs);
  if (buf.length !== it.bytes) {
    fail(`${it.id}: 파일 크기 불일치 — 기록 ${it.bytes}B, 실제 ${buf.length}B`);
    continue;
  }
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== it.sha256) { fail(`${it.id}: sha256 불일치 — 파일이 변조·교체됨`); continue; }

  const size = imageSize(buf);
  if (!size) { fail(`${it.id}: 이미지 헤더를 읽을 수 없음 — 이미지가 아닐 수 있음`); continue; }
  if (size.format !== it.format || size.width !== it.width || size.height !== it.height) {
    fail(`${it.id}: 이미지 규격 불일치 — 기록 ${it.format} ${it.width}x${it.height}, ` +
         `실제 ${size.format} ${size.width}x${size.height}`);
    continue;
  }
  intact++;
}
if (intact === index.items.length) {
  console.log(`OK: 도면 ${intact}장 전부 sha256·바이트수·이미지 규격 일치`);
}

// ── PART B. 소스와의 연결 ────────────────────────────────────────────────
// 픽스처가 고아가 되면(= install-app.html 에서 그 도면을 더 이상 쓰지 않으면) 아무것도
// 지키지 못하면서 저장소 용량만 차지한다. 반대로 alt/cap 이 조용히 바뀌면 스냅샷과
// 화면 설명이 어긋난다. 양방향을 모두 본다.
console.log('\n── PART B. install-app.html 과의 연결 ──');

let linked = 0;
for (const it of index.items) {
  const hits = bySrc.get(it.src);
  if (!hits) {
    fail(`${it.id}: install-app.html 에 이 도면의 src 가 더 이상 없음 — 픽스처가 고아가 됨\n` +
         `        ${it.src}`);
    continue;
  }
  const inCat = hits.find((h) => h.cat === it.category);
  if (!inCat) {
    fail(`${it.id}: 카테고리 불일치 — 기록 "${it.category}", 현재 사용처 [${hits.map((h) => h.cat).join(', ')}]`);
    continue;
  }
  if (inCat.alt !== it.alt) {
    fail(`${it.id}: alt 변경됨\n        기록: ${it.alt}\n        현재: ${inCat.alt}`);
    continue;
  }
  if (inCat.cap !== it.cap) {
    fail(`${it.id}: 캡션 변경됨 — 치수 재검증 후 npm run build:plans 로 픽스처를 갱신할 것\n` +
         `        기록: ${it.cap}\n        현재: ${inCat.cap}`);
    continue;
  }
  const nowCats = hits.map((h) => h.cat).sort().join('|');
  const wasCats = [...it.usedInCategories].sort().join('|');
  if (nowCats !== wasCats) {
    warn(`${it.id}: 이 도면을 쓰는 카테고리가 바뀜 — 기록 [${wasCats}] → 현재 [${nowCats}]`);
  }
  linked++;
}
if (linked === index.items.length) {
  console.log(`OK: 도면 ${linked}장 전부 install-app.html 에 살아 있고 카테고리·alt·캡션 일치`);
}

// ── PART C. 치수 회귀 ────────────────────────────────────────────────────
// 캡션에서 뽑은 치수 토큰이 기록과 같은가. 캡션 문장을 다듬다가 숫자가 빠지거나
// 바뀌는 사고를 잡는 것이 목적이라, PART B 의 문자열 일치와 별개로 한 번 더 본다.
console.log('\n── PART C. 캡션 치수 회귀 ──');

let dimOk = 0;
let dimTotal = 0;
for (const it of index.items) {
  const hits = bySrc.get(it.src);
  const cur = hits?.find((h) => h.cat === it.category);
  if (!cur) continue;                       // PART B 에서 이미 실패로 보고됨

  if (it.dims.length === 0) {
    fail(`${it.id}: 기록된 치수가 하나도 없음 — 도면 픽스처는 치수가 명시된 캡션만 쓴다`);
    continue;
  }
  const now = new Set(dimTokens(cur.cap));
  const missing = it.dims.filter((d) => !now.has(d));
  if (missing.length) {
    fail(`${it.id}: 캡션에서 치수가 사라짐 — [${missing.join(', ')}]`);
    continue;
  }
  const added = [...now].filter((d) => !it.dims.includes(d));
  if (added.length) {
    warn(`${it.id}: 캡션에 치수가 추가됨 — [${added.join(', ')}] (build:plans 로 갱신 권장)`);
  }
  dimTotal += it.dims.length;
  dimOk++;
}
if (dimOk === index.items.length) {
  console.log(`OK: 도면 ${dimOk}장의 치수 토큰 ${dimTotal}개가 캡션과 일치`);
}

// ── PART D. 원본 최신성 (네트워크) ───────────────────────────────────────
// 삼성닷컴 원본이 그대로인지 확인한다. 다른 스위트는 전부 오프라인이라, 여기서
// 네트워크를 강제하면 삼성닷컴이 잠깐 느린 것만으로 CI 가 빨개진다.
// 그래서 이 구간은 실패가 아니라 SKIP 으로 빠진다 (test-e2e.mjs 의 playwright 처리와 같은 방침).
console.log('\n── PART D. 삼성닷컴 원본 최신성 (네트워크) ──');

/**
 * 원본 sha256 이 스냅샷과 다를 때 어떻게 취급할지 정하는 지점.
 *
 * 트레이드오프: 도면 개정은 캡션의 치수와 그림이 어긋났을 수 있다는 뜻이라 빨리 알아야
 * 하지만(→ 실패), 삼성닷컴이 CDN 재인코딩만 해도 해시는 바뀌므로 실패로 두면 우리가
 * 손대지 않은 날에도 CI 가 깨진다(→ 경고).
 *
 * 현재 방침: 내용이 바뀐 것은 확실하되 우리 잘못은 아니므로 **경고**로 두고 사람이
 * 도면을 눈으로 확인하게 한다. 실패로 바꾸려면 아래 return 을 false 로.
 */
function remoteMismatchIsFatal() {
  return false;
}

const SKIP_NETWORK = process.env.PLANS_SKIP_NETWORK === '1';
if (SKIP_NETWORK) {
  console.log('SKIP: PLANS_SKIP_NETWORK=1 로 원본 대조를 건너뜀');
} else {
  let checked = 0, same = 0, changed = 0, netErr = 0;
  for (const it of index.items) {
    let buf;
    try {
      const res = await fetch(it.src, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        // 404 는 네트워크 문제가 아니라 진짜 사고다 — 매장에서 이미지가 안 뜬다.
        fail(`${it.id}: 원본이 HTTP ${res.status} — 설치가이드에서 이미지가 깨진다\n        ${it.src}`);
        checked++;
        continue;
      }
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      netErr++;
      continue;
    }
    checked++;
    const sha = createHash('sha256').update(buf).digest('hex');
    if (sha === it.sha256) { same++; continue; }
    changed++;
    const msg = `${it.id}: 삼성닷컴 원본이 스냅샷과 다름 (${it.bytes}B → ${buf.length}B) — ` +
                `도면이 개정됐을 수 있으니 캡션 치수를 눈으로 재확인할 것\n        ${it.src}`;
    if (remoteMismatchIsFatal()) fail(msg); else warn(msg);
  }

  if (netErr === index.items.length) {
    console.log(`SKIP: 네트워크로 원본에 접근할 수 없어 대조를 건너뜀 (${netErr}건)`);
  } else {
    if (netErr) warn(`${netErr}건은 네트워크 오류로 대조하지 못함`);
    console.log(`OK: 원본 ${checked}건 대조 — 동일 ${same}건, 변경 ${changed}건`);
  }
}

console.log('\n' + (ok ? 'ALL PASS' : 'SOME FAILED'));
process.exit(ok ? 0 : 1);
