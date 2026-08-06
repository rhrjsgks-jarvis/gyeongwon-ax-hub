// 도면 픽스처 공용 헬퍼 — build.mjs(생성)와 test-plans.mjs(검사)가 함께 쓴다.
//
// 생성기와 테스트가 각자 정규식을 갖고 있으면 "생성할 땐 통과, 검사할 땐 실패"가 나므로
// 파싱 로직은 반드시 이 파일 하나에만 둔다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.join(FIXTURE_DIR, '..', '..', '..');
export const INSTALL_HTML = path.join(REPO_ROOT, 'public', 'install-app.html');
export const INDEX_JSON = path.join(FIXTURE_DIR, 'index.json');

/**
 * install-app.html 의 INSTALL_DB 이미지 항목을 카테고리와 함께 전수 추출한다.
 *
 * INSTALL_DB 는 인라인 <script> 안의 객체 리터럴이고 카테고리 키는 들여쓰기 2칸의
 * '한글명':{ 형태다. jsdom 으로 실행해서 읽을 수도 있지만, 이 테스트는 "소스에 무엇이
 * 적혀 있는가"를 보는 것이 목적이므로 텍스트 파싱이 더 정확하다(실행하면 런타임에
 * 조립된 값이 보여 캡션 원문 변경을 놓칠 수 있다).
 *
 * @returns {{cat:string, src:string, alt:string, cap:string}[]}
 */
export function parseInstallImages(html = fs.readFileSync(INSTALL_HTML, 'utf8')) {
  const out = [];
  let cat = null;
  for (const line of html.split(/\r?\n/)) {
    const mCat = line.match(/^\s{2}'([^']+)'\s*:\s*\{/);
    if (mCat) { cat = mCat[1]; continue; }
    const m = line.match(
      /\{\s*src\s*:\s*(['"])(.*?)\1\s*,\s*alt\s*:\s*(['"])(.*?)\3\s*,\s*cap\s*:\s*(['"])([\s\S]*?)\5\s*\}/
    );
    if (m) out.push({ cat, src: m[2], alt: m[4], cap: m[6] });
  }
  return out;
}

/**
 * 이미지 바이너리 헤더에서 실제 포맷·픽셀 크기를 읽는다.
 *
 * 바이트 수만 보면 부족하다 — CDN 이 오류 페이지(HTML)를 200 으로 돌려주는 경우가 있어,
 * "이미지인 척하는 HTML"이 픽스처로 들어오는 것을 여기서 차단한다.
 *
 * @returns {{format:'png'|'jpeg', width:number, height:number}|null} 이미지가 아니면 null
 */
export function imageSize(buf) {
  // PNG: 8바이트 시그니처 뒤 IHDR 의 width/height(빅엔디안 4바이트씩)
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: SOI(FFD8) 이후 세그먼트를 훑어 SOF 마커에서 크기를 읽는다.
  // FFC4(DHT)·FFC8(JPG)·FFCC(DAC)는 SOF 가 아니므로 제외해야 한다.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      // 길이 필드가 없는 마커(스탠드얼론)는 2바이트만 건너뛴다
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSOF =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { format: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

// 캡션 표기가 카테고리마다 다르다. 세 형태를 모두 잡는다:
//   ① 단위 붙은 수치   "1,853mm", "105°"
//   ② 라벨 붙은 수치   "폭595", "높이815~895"  (식기세척기 계열은 단위를 안 붙인다)
//   ③ 치수 곱 표기     "600×815~900×595"
const DIM_PATTERNS = [
  /\d[\d,]*(?:~\d[\d,]*)?\s*(?:mm|㎜|cm|°)/g,
  /(?:폭|깊이|높이|가로|세로|이격|간격|두께)\s*\d[\d,]*(?:~\d[\d,]*)?/g,
  /\d[\d,]*(?:~\d[\d,]*)?(?:\s*×\s*\d[\d,]*(?:~\d[\d,]*)?)+/g,
];

/**
 * 캡션에서 치수 토큰을 뽑는다. 설치 상담에서 치수 오류는 바로 사고이므로,
 * 이 토큰 집합이 픽스처 기록과 어긋나면 테스트가 실패한다.
 * @returns {string[]} 공백을 제거한 토큰 (중복 제거, 등장 순서 유지)
 */
export function dimTokens(cap) {
  const set = new Set();
  for (const re of DIM_PATTERNS) {
    for (const m of cap.matchAll(re)) set.add(m[0].replace(/\s+/g, ''));
  }
  return [...set];
}

export function readIndex() {
  return JSON.parse(fs.readFileSync(INDEX_JSON, 'utf8'));
}
