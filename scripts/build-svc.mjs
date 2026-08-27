/*
 * 서비스센터 자료 — 수집 원본(`scripts/fixtures/svc-centers.json`)에서
 * **화면이 쓰는 것만** 추려 `public/svc-centers.json` 을 만든다.
 * `install-cost` 와 같은 구조다: 원본은 fixture 에 굳혀 두고 배포본은 파생물이다.
 *
 * 줄이는 이유가 둘이다 — 매장 폰이 받는 양(286KB → 절반 아래)과, `enableList` 의
 * 숫자 코드(`value`)처럼 **화면이 안 쓰는 것**을 배포본에 싣지 않기 위해서다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/svc-centers.json'), 'utf8'));

/*
 * **`전남광주` 는 시도 이름이 아니다.** 원본 `rcode1` 이 그렇게 온다 —
 * 그 7곳의 `rcode2` 가 나주시·목포시·순천시라 **전남**이 맞다(광주광역시는 `광주` 로 따로 온다).
 * 원본 fixture 는 손대지 않고 **파생물에서만** 고친다 — 다음 수집분과 대조할 수 있어야 한다.
 */
const SIDO_FIX = { '전남광주': '전남' };

/* 가전(소형) 품목 — 이 중 하나라도 받으면 "가전도 접수" 다.
   스마트폰·태블릿·웨어러블만 받는 센터와 가르는 것이 상담의 핵심이다. */
const HOME = new Set(['TV','청소기','공기청정기','오븐/전자레인지','선풍기','기타 소형가전',
  '더 플레이트 인덕션(휴대용)','홈시어터','오디오','DVD','카메라','캠코더']);

const hhmm = (a, b) => (a && b) ? `${a}~${b}` : null;
/*
 * **원본에 HTML 태그가 섞여 있다** — `park` 값이 `건물 1층에 주차 가능합니다.<br/>※ …` 꼴이다.
 * 화면은 `esc()` 로 이스케이프하므로 그대로 두면 **`<br/>` 이 글자로 보인다**(실물에서 확인).
 * 태그를 살리지 않고 **지운다** — 이 앱은 원문 HTML 을 그리지 않는 것이 원칙이고
 * (시기성 공지 `custNotice` 를 아예 안 담은 것과 같은 이유), 줄바꿈은 뜻을 바꾸지 않는다.
 */
const plain = (v) => {
  if (!v) return null;
  const t = String(v).replace(new RegExp('<br[^>)]{0,4}[>)]', 'gi'), ' ')
    .replace(new RegExp('<[^>]*>', 'g'), ' ')
    .replace(new RegExp('&nbsp;', 'gi'), ' ')
    .replace(new RegExp('\\s+', 'g'), ' ').trim();
  return t || null;
};

/*
 * **거는 번호와 적는 번호를 구분한다** — 이 앱이 이미 세운 규칙이다
 * (`031-922-8546~7` 을 그대로 넘기면 `03192285467` 로 잘못 걸린다).
 *
 * 대표번호 칸에 **번호가 아닌 값이 11건** 있다 — `개인별 내선 활용` · `-` ·
 * `031-8061-내선번호` · `064) 729-3201,729-3211,…`. 삼성 쪽 자료 상태라 고칠 수 없다.
 * 그래서 **적는 것은 원문 그대로**, **거는 것은 첫 번째 온전한 번호만** 뽑는다.
 * 온전한 번호가 없으면 `dial` 을 비워 화면이 **버튼을 안 만든다** — 누르면 엉뚱한 데로
 * 걸리느니 글자로만 보이는 편이 낫다. `-` 처럼 번호가 아예 아닌 값은 통째로 버린다.
 */
const TEL_RE = new RegExp('(0[0-9]{1,2})[)-]?[ ]?([0-9]{3,4})[-. ]?([0-9]{4})');
function telOf(raw){
  const t = plain(raw);
  if (!t) return { tel: null, dial: null };
  const m = TEL_RE.exec(t);
  if (!m) return { tel: /[0-9]/.test(t) ? t : null, dial: null };
  return { tel: t, dial: m[1] + m[2] + m[3] };
}

const items = src.centers.map((c) => {
  const it = (c.enableList || []).map((e) => e.label || String(e));
  return {
    id: c.cenId,
    nm: c.vname || c.gname,
    full: c.gname,
    sd: SIDO_FIX[c.rcode1] || c.rcode1,
    sg: c.rcode2 || '',
    /* 도로명 주소로 조립한다 — 원본은 `doroname`(도산대로)과 `addressDoro`(336 …)가 갈려 있다.
       지번(`address`)은 시·구가 빠진 뒷부분만 와서 그것만으로는 찾아갈 수 없다. */
    ad: [c.doroname, c.addressDoro].filter(Boolean).join(' ').trim(),
    la: c.lat, ln: c.lng,
    wd: hhmm(c.weekdayStart, c.weekdayEnd),
    sa: hhmm(c.saturdayStart, c.saturdayEnd),
    ho: hhmm(c.holidayStart, c.holidayEnd),
    tel: telOf(c.hpRepTel).tel,
    dial: telOf(c.hpRepTel).dial,
    park: plain(c.park),
    taxi: plain(c.taxi),
    it,
    /* 가전 접수 여부를 **미리 계산해 둔다** — 화면이 매번 세면 목록을 그릴 때마다 178번 돈다 */
    home: it.some((x) => HOME.has(x)),
  };
}).sort((a, b) => (a.sd + a.sg + a.nm).localeCompare(b.sd + b.sg + b.nm, 'ko'));

const out = {
  at: src._collectedAt,
  src: src._source,
  n: items.length,
  /* **화면이 이 문장을 그대로 띄운다.** 센터 「수리 제품 선택」 목록에 냉장고·세탁기·에어컨이
     없다 — 대형 가전은 방문이 아니라 출장 수리다. 안 적으면 상담사가 헛걸음을 시킨다. */
  notice: '냉장고 · 세탁기 · 에어컨 등 대형 가전은 센터 방문이 아니라 출장 수리입니다. 센터에서 접수하는 가전은 TV · 청소기 · 공기청정기 · 오븐/전자레인지 등 소형가전입니다.',
  items,
};
fs.writeFileSync(path.join(root, 'public/svc-centers.json'), JSON.stringify(out));
const dirty = items.filter((x)=>/[<>]/.test((x.park||'')+(x.taxi||'')+x.ad));
if (dirty.length) console.warn('⚠ HTML 조각이 남았다 ' + dirty.length + '건 — ' + dirty[0].full + ' : ' + dirty[0].park);
const kb = (fs.statSync(path.join(root, 'public/svc-centers.json')).size / 1024).toFixed(0);
const sido = {}; for (const x of items) sido[x.sd] = (sido[x.sd] || 0) + 1;
console.log(`svc-centers.json 생성: ${items.length}곳 · ${kb}KB · 가전 접수 ${items.filter(x=>x.home).length}곳`);
console.log('시도별:', JSON.stringify(sido));
