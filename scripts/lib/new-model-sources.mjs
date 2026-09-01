/* # 신규 44개 모델 — 재료를 한 곳에서 읽는다
 *
 * 2026-09-01 사장님 지시로 시험지의 **가전 문항을 신규 44개 모델로 통째로 갈았다.**
 * 문항 생성기(`build-new-model-questions.mjs`)가 쓰는 재료를 여기서 모아 준다 —
 * 읽는 코드를 생성기 안에 두면 검사가 같은 것을 다시 적게 되고, 두 벌이 되면
 * 어긋난다(이 저장소가 허브 카드 개수·앱 버전에서 반복해서 데인 종류다).
 *
 * 재료는 **전부 커밋된 파일**이다. `.scratch/` 를 읽지 않는다 — 그 폴더는 커밋되지
 * 않아 다른 PC 에서 빌드가 죽고, 「커밋본 == 재생성」 검사가 그 자리에서 무너진다.
 *
 *   · `scripts/fixtures/usp-models.json` … 44개 모델의 명부이자 공식 셀링포인트
 *   · `public/finder-app.html` 의 `PRODUCTS` + `public/finder-extra.json` … 사양
 *   · `public/install-app.html` 의 `INSTALL_DB` … 설치환경 366줄
 *   · `public/install-cost.json` … 설치 추가비·이전설치·할증·거리 비용
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** 소스에서 `marker` 뒤의 첫 배열/객체 리터럴을 통째로 떼어 파싱한다.
 *  정규식으로 긁으면 원문이 조금만 바뀌어도 **조용히 빈 값**이 되므로 괄호를 센다. */
function literal(src, marker, open) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`소스에서 ${marker} 를 찾지 못했다`);
  const close = open === '[' ? ']' : '}';
  let i = src.indexOf(open, at), s = i, d = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === open) d++;
    else if (src[i] === close) { d--; if (!d) { end = i; break; } }
  }
  if (end < 0) throw new Error(`${marker} 의 끝을 찾지 못했다`);
  return src.slice(s, end + 1);
}

/** 44개 모델 명부 — 사장님이 지목한 목록 그대로다 */
export function readModels() {
  return JSON.parse(rd('scripts/fixtures/usp-models.json'));
}

/** 모델파인더 사양. 인라인 `PRODUCTS`·`HARMAN_PRODUCTS` 와 삼성닷컴 수집분을 합친다.
 *  **`fx` 모양이 두 가지다** — 인라인은 `[[라벨,값]]`, 옛 항목은 객체일 수 있다.
 *  한쪽만 보면 사양 깊이가 절반이 된다. */
export function readSpecs() {
  const html = rd('public/finder-app.html');
  const P = JSON.parse(literal(html, 'let PRODUCTS = [', '['));
  const H = JSON.parse(literal(html, 'const HARMAN_PRODUCTS = [', '['));
  const extra = JSON.parse(rd('public/finder-extra.json'));
  const byModel = new Map();
  for (const p of [...P, ...H, ...(extra.add || [])]) if (p.model && !byModel.has(p.model)) byModel.set(p.model, p);
  const fill = extra.fill || {};
  return { byModel, fill, all: [...byModel.values()] };
}

/** 한 모델의 사양을 한 줄짜리 `[라벨, 값]` 목록으로. 인라인 값이 이기고 빈 항목만 채운다
 *  (`finder-extra.json` 의 `fill` 규칙 그대로 — 카탈로그 대조값을 덮지 않는다). */
export function fxOf(specs, model) {
  const p = specs.byModel.get(model);
  if (!p) return [];
  let base = p.fx || [];
  if (!Array.isArray(base)) base = Object.entries(base);
  const seen = new Set(base.map(x => String(x[0]).replace(/\s/g, '')));
  const out = base.map(x => [String(x[0]), String(x[1])]);
  for (const [k, v] of (specs.fill[model] || [])) {
    const key = String(k).replace(/\s/g, '');
    if (!seen.has(key)) { out.push([String(k), String(v)]); seen.add(key); }
  }
  return out;
}

/** 설치환경 가이드 원문 */
export function readInstallDB() {
  return JSON.parse(JSON.stringify(eval('(' + literal(rd('public/install-app.html'), 'const INSTALL_DB = {', '{') + ')')));
}

/** 설치비용·사전준비 */
export function readInstallCost() {
  return JSON.parse(rd('public/install-cost.json'));
}

/** 한 카테고리의 설치환경 원문을 한 덩이 문자열로 — 「그 값이 원문에 있는가」 검산용 */
export function installText(db, cat) {
  const v = db[cat];
  if (!v) throw new Error(`INSTALL_DB 에 '${cat}' 가 없다`);
  const rows = [];
  rows.push(v.subtitle || '');
  for (const t of v.types || []) rows.push(t);
  for (const key of ['space', 'utility']) for (const r of v[key] || []) rows.push(r.join(' :: '));
  for (const key of ['checklist', 'cautions']) for (const r of v[key] || []) rows.push(String(r));
  return rows.join('\n');
}
