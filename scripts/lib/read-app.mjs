/*
 * 미니앱 HTML 을 테스트용으로 읽는다.
 *
 * 앱은 공용 제품 심벌을 `<script src="prod-symbols.js">` 로 불러온다. JSDOM 은 url 이
 * example.com 이라 그 상대 경로를 가져오지 못하고, 외부 스크립트가 해결될 때까지 뒤따르는
 * 인라인 스크립트를 미룬다 — 테스트가 `window.selectCat 이 함수가 아니다` 로 죽던 이유다.
 *
 * 파일을 그대로 끼워 넣으면 순서가 막히지 않고, 심벌도 실물과 같은 코드로 검사된다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const TAG = '<script src="prod-symbols.js"></script>';

export function readApp(file) {
  const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  if (!html.includes(TAG)) return html;
  const lib = fs.readFileSync(path.join(PUBLIC, 'prod-symbols.js'), 'utf8');
  return html.replace(TAG, '<script>' + lib + '</script>');
}
