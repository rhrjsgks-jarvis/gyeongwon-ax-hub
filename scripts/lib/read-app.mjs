/*
 * 미니앱 HTML 을 테스트용으로 읽는다.
 *
 * 앱은 공용 스크립트를 `<script src="prod-symbols.js">` 처럼 상대경로로 불러온다. JSDOM 은
 * url 이 example.com 이라 그 경로를 가져오지 못하고, 외부 스크립트가 해결될 때까지 뒤따르는
 * 인라인 스크립트를 미룬다 — 테스트가 `window.selectCat 이 함수가 아니다` 로 죽던 이유다.
 *
 * 파일을 그대로 끼워 넣으면 순서가 막히지 않고, 공용 코드도 실물과 같은 것으로 검사된다.
 *
 * **한 파일만 알던 것을 목록으로 바꿨다**(2026-08-13). `back-kit.js` 를 아홉 앱에 붙이자
 * 레벨업 테스트가 통째로 죽었다 — 이 함수가 그 태그를 모르니 예전 증상이 그대로 재발한 것이다.
 * 새 공용 스크립트를 만들면 **여기 목록에 넣을 것.** 목록에 없는 태그는 그냥 두므로,
 * 빠뜨리면 그 앱의 검사가 "전역이 없다"로 죽는다(조용히 통과하지는 않는다).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
/** 끼워 넣을 공용 스크립트. 앱이 부르는 순서와 무관하게 각자 제자리에 들어간다 */
const LIBS = ['back-kit.js', 'prod-symbols.js', 'share-kit.js', 'finder-merge.js'];

export function readApp(file) {
  let html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  for (const lib of LIBS) {
    const tag = '<script src="' + lib + '"></script>';
    if (!html.includes(tag)) continue;
    const src = fs.readFileSync(path.join(PUBLIC, lib), 'utf8');
    html = html.replace(tag, '<script>' + src + '</script>');
  }
  return html;
}
