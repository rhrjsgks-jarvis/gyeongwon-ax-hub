# 경원 AX 허브 (gyeongwon-ax-hub)

경원영업팀(삼성 가전 영업)을 위한 세일즈 지원 도구. Next.js 14 App Router.
GitHub → Vercel 자동배포 파이프라인으로 운영 중이며, 이 파일은 Claude Code가 세션마다 자동으로 읽는 프로젝트 메모리다.

## 배포 파이프라인

- 저장소: `https://github.com/rhrjsgks-jarvis/gyeongwon-ax-hub` (main 브랜치, public repo)
- 배포: main에 push하면 Vercel이 자동 빌드/배포 (별도 CLI 배포 불필요)
- 프로덕션 URL: `https://gyeongwon-ax-hub.vercel.app`
- Vercel projectId: `prj_JskGnqqArCARl3mNBm6tp1dmdu46` / teamId: `team_o104cKtnAQcEaKospwGIAt9N`
- git push 인증은 로컬에 SSH 키 또는 `gh auth login`으로 한 번만 설정해두면 이후 세션에서 재설정 불필요 (Cowork 샌드박스 환경과 달리 로컬 환경은 인증정보가 세션 간 유지됨).

## 구조 패턴

각 기능 모듈은 "Next.js 라우트가 정적 HTML 미니앱을 iframe으로 감싸는" 동일한 패턴을 따른다:

| 라우트 (`app/*/page.tsx`) | 감싸는 정적 파일 (`public/*.html`) |
|---|---|
| `/install` | `install-app.html` (설치환경 가이드) |
| `/compare` | `compare-app.html` (타사비교) |
| `/finder` | `finder-app.html` |
| `/care` | `care-app.html` |
| `/planner` | `package-planner.html` |
| `/quiz` | `quiz-app.html` |

새 모듈을 추가하거나 기존 모듈을 수정할 때:
- 실제 로직/데이터는 대부분 `public/*.html` 안의 인라인 `<script>`에 있다 (React 컴포넌트가 아님). 이 정적 HTML을 직접 편집하는 것이 일반적인 작업 방식이다.
- `app/page.tsx`의 `MODULE_GROUPS` 배열(섹션별 그룹핑, 각 그룹 안에 `modules[]`)이 허브 메인 카드 노출 순서·섹션 구성을 결정한다. 컨시어지·쿠폰 배포프로그램처럼 외부 링크 묶음은 `CONCIERGE_LINKS`/`COUPON_LINKS` 같은 별도 섹션으로 관리한다.
- 사이드바/하단 내비게이션 `NAV_ITEMS`(+ 데스크탑 사이드바 전용 `QUICK_LINKS`)도 함께 확인.
- `lib/logEvent.ts`의 `LogModule` 유니온 타입에 새 모듈 키를 추가해야 로깅이 정상 동작한다.

## 설치환경 가이드 모듈 (`public/install-app.html`)

- 데이터: `INSTALL_DB` 객체, 한글 카테고리명을 키로 사용. 각 엔트리 구조:
  `emoji, subtitle, types[], space[][2], utility[][2], checklist[], cautions[], source, sourceUrl, images?[{src,alt,cap}]`
- 이미지 카드 표시 여부는 JS에서 `images.length` 기준으로 토글 (`imageCard.style.display`).
- 현재 21개 카테고리 (드롭다운 순서 = `INSTALL_DB` 객체 순서, 둘 다 항상 동기화 유지):
  냉장고 4도어 프리스탠딩 → 4도어 키친핏 → 4도어 키친핏 Max → 2도어 → 1도어 → 양문형 → 일반형 → 페어(2대 이상) 설치 → 김치냉장고 → 세탁기·콤보 → 건조기 → 에어컨 → TV → 청소기(무선청소기) → 로봇청소기 → 식기세척기 → 에어드레서 → 인덕션 → 정수기 → 전자레인지 → 공기청정기
- 스마트폰/노트북은 설치환경이 적용되지 않아 카테고리에서 완전히 제거됨 (드롭다운·DB 모두에 없음). 되살리지 말 것.

### 핵심 원칙 — 절대 타협 금지

**삼성닷컴 등 공식 출처에서 실제로 확인·검증된 이미지만 사용한다. 인접 제품이나 유사 모델의 이미지를 재활용/추측으로 넣지 않는다.** 치수가 명시된 설치가이드 이미지를 찾지 못하면 해당 카테고리는 텍스트+원본 링크만 제공하고 정직하게 "이미지 없음" 상태로 둔다 (예: 현재 청소기·전자레인지·공기청정기가 이 상태). 이는 사용자가 반복적으로 강조한 최우선 원칙이다.

### 이미지 리서치 방법론

- 삼성닷컴 페이지는 종종 이미지가 lazy-load(`lozad.js`)되거나 라디오버튼 탭 위젯(`new-set-guide`, 패널 ID `guidePanel0X-0X-...`)·JS 모달 안에 있어 단순 fetch로는 `<>`(빈 src) 또는 아예 누락된다. **브라우저 도구(Playwright MCP, Chrome DevTools 등)로 렌더링된 DOM을 직접 조회**해 `data-src`나 모달 내부 `<img>`의 실제 src를 확인해야 한다. (단순 fetch/curl만으로 "이미지 없음"이라 단정한 뒤 나중에 브라우저로 재조사해 실제로는 있었던 사례가 로봇청소기·인덕션에서 있었음.)
- 캡션(`cap`)에 들어가는 치수·모델명은 반드시 해당 페이지에서 직접 확인한 값만 기재하고 출처(`samsung.com`)를 명시한다.

## 모델파인더 — 삼성스토어 카탈로그 기준 정합성

모델파인더 DB는 **삼성스토어 카탈로그(`samsungstore.com/event/catalog.sesc`)를 기준**으로 맞춘다.
사용자가 구글드라이브로 카탈로그 PDF(mobile/it/md/dp)를 공유해주면 대조·갱신한다.

- 카탈로그에는 **가격이 없다**(4개 PDF 전수 확인). 모델코드·치수·스펙만 있으므로, 카탈로그에서
  새로 추가한 제품은 `price: null`로 두고 기존 제품의 가격은 유지한다.
- `price: null` 처리 규칙(파인더 로직에 반영됨): JS에서 `null <= 300`이 참이라 그대로 두면
  가격 미상 제품이 최저가처럼 예산검색 상단에 뜨는 왜곡이 생긴다. 따라서 ①예산 조건이 걸린
  검색에서 제외 ②가격 정렬 시 항상 뒤로 ③패키지/AI 예산배분 후보에서 제외 ④카드에는
  "가격 문의"로 표시한다. 새 제품을 가격 없이 추가할 때 이 규칙이 유지되는지 확인할 것.
- PRODUCTS 배열(CE+MX)과 별도로 **HARMAN 배열(54종)이 런타임에 합쳐진다**. 화면 문구의
  "OOO종"은 둘의 합이므로 제품을 추가하면 `finder-app.html`의 표기 2곳과 `app/page.tsx`
  모델파인더 카드 설명도 함께 갱신해야 한다(과거 실제 수량과 표기가 어긋나 있었음).
- MD 카탈로그(제휴·리빙 상품)는 삼성 자체 제품이 아니므로 `src:'LIVING'` + 카테고리명 앞에
  "리빙"을 붙여 구분한다(리빙 안마의자·비데·욕실케어·도어락·도어벨·전동커튼·선풍기·밥솥 등 9개 카테고리).
- IT 카탈로그 스펙표는 "모델명 → 모델코드 N개 → (라벨 + 값 N개) 반복" 구조라 파싱 가능하지만,
  지면 뒤쪽(프린터 섹션) 값이 라벨 정렬 붕괴로 섞여 들어오는 구간이 있다. 실제로 모니터 해상도에
  프린터 DPI 값이 들어온 사례가 있었으므로, 파싱한 값은 반드시 형식 검증 후 반영할 것.
- 2026-07-31 카탈로그 대조로 발견·정정한 오류: **S26+의 모델번호가 SM-S936N(실제로는 S25+의
  코드)으로 잘못 들어가 있었다 → SM-S947N**. S26/S26+ 치수도 카탈로그 실측값으로 정정.

## 허브 통합검색 (`/search`)

허브 메인 상단 검색창에서 **제품명·모델코드·카테고리·기능**을 한 번에 찾아 해당 모듈로 보낸다.

- 각 모듈 데이터는 `public/*.html` 인라인 스크립트 안에 있어 React 페이지가 직접 읽을 수 없다.
  그래서 `scripts/build-search-index.mjs`가 정적으로 추출해 **`public/search-index.json`**(약 430건)을
  만들고, `/search` 페이지는 그 JSON만 fetch해서 검색한다.
- **모듈 데이터(제품·카테고리)를 수정하면 `npm run build:index`를 다시 돌리고 커밋해야 한다.**
  `scripts/test-search.mjs`가 "커밋된 인덱스 == 지금 재생성한 인덱스"를 검사하므로 빠뜨리면 테스트가 실패한다.
- 검색 결과 클릭 시 딥링크로 이동한다: 파인더 `?q=`, 설치환경 `?cat=`, 타사비교 `?cat=`.
  **중요**: 이 쿼리는 Next 라우트에 붙는 것이라 그냥 두면 iframe 안 정적 앱까지 전달되지 않는다.
  `components/IframeModule.tsx`가 마운트 후 `ref.current.src`에 현재 쿼리스트링을 합쳐 넣어 전달한다
  (hydration은 속성 불일치를 DOM에 반영하지 않으므로 useState 초기화나 src prop만으로는 동작하지 않음).
- 모델파인더 자체 검색은 예산·치수 필터 등 고급 기능이 있어 그대로 둔다. 허브 통합검색은 "빠른 진입점",
  파인더는 "전문 검색"으로 역할을 나눈다.

## 테스트 & 검증 워크플로우

6개 모듈 전부에 `scripts/test-*.mjs` 회귀 테스트가 있다 (jsdom으로 `public/*.html`을 `runScripts:'dangerously'`로 로드해 인라인 스크립트의 전역 함수를 직접 호출·검증하는 동일 패턴, 매 세션 재작성할 필요 없음). 변경 후 항상 관련 스크립트 + 전체를 실행:

```bash
node scripts/test-install.mjs   # 설치환경가이드: 21개 카테고리 전체 렌더링, 이미지 개수/카드노출/링크 유효성, 키워드 검색
node scripts/test-finder.mjs    # 모델파인더: 50개 카테고리 전수 검색(350종), AI추천/브랜드뷰 흐름, 패키지모드
node scripts/test-care.mjs      # AI Care: 16개 제품 전수, 12/36개월 플랜전환, overview/timeline 모드
node scripts/test-planner.mjs   # 패키지 플래너: 18개 카테고리 × 5개 평형, 할인율·예산배분 계산
node scripts/test-compare.mjs   # 타사비교: 13개 카테고리 × 브랜드 × 모델 268개 조합, escHtml/history XSS 회귀
node scripts/test-levelup.mjs   # 레벨업테스트: 25문항 구성, 채점(CE/MX/에세이), 이름·사번·에세이 XSS 회귀
node --experimental-strip-types scripts/test-admin.mjs   # AX 대시보드: lib/logEvent.ts 집계·CSV 내보내기 회귀
node scripts/test-consistency.mjs   # 크로스파일 모델코드 일관성: 골든 모델코드 4파일 존재·최상위 SKU 동일성 회귀
node scripts/test-search.mjs    # 통합검색: 인덱스 최신성(재생성 대조), 대표 검색어 모듈 매칭, 딥링크 처리 존재
node scripts/build-search-index.mjs   # (테스트 아님) 통합검색 인덱스 재생성 — 모듈 데이터 수정 후 필수
npx tsc --noEmit                # 타입체크
```
(`npm test`로 위 전체를 한 번에 실행 가능)

새 카테고리·제품을 추가하거나 이미지 개수가 바뀌면 각 스크립트의 기대값(예: `test-install.mjs`의 `expectedImageCounts`)을 반드시 함께 갱신할 것 — 안 하면 테스트가 실패한다. `compare-app.html`/`test-app.html`은 XSS 회귀 가드가 포함돼 있으므로 이스케이프 로직(`escHtml`)을 건드릴 때 특히 주의.

AX 현황 대시보드(`app/admin/page.tsx`)는 정적 HTML이 아닌 React 클라이언트 컴포넌트라 다른 모듈과 같은 jsdom-전체페이지 패턴은 쓸 수 없다. 대신 실제 로직이 몰려 있는 `lib/logEvent.ts`(집계·CSV 내보내기)를 Node의 `--experimental-strip-types`로 직접 임포트해 순수 함수 단위로 검증한다(`scripts/test-admin.mjs`) — 컴포넌트 자체의 렌더링/인증 게이트는 아직 커버하지 않음.

같은 제품의 모델코드가 test-app.html/finder-app.html/package-planner.html/compare-app.html
4개 파일에 각각 독립적으로 박혀 있어 한 파일만 고치고 나머지를 놓치는 사고가 실제로 여러 번
있었다(냉장고 RF→RM, 세탁기 WD25→WD90, 김치냉장고 RQ→RK 등). `scripts/test-consistency.mjs`가
이를 감지하는 안전망이다 — 단, compare-app.html의 "P등급"과 package-planner.html의 FLAGSHIP은
목적이 달라 항상 같은 SKU를 가리키지 않으므로(세탁기·건조기는 콤보 vs 별도기기, TV는 Micro RGB vs
OLED, 식기세척기는 다른 F세대 티어 — 모두 조사로 확인된 의도된 선택) 정확히 같아야 하는 카테고리와
세대 접두사만 같으면 되는 카테고리를 스크립트 내에서 구분해 검사한다. 새로 검증한 모델코드를
GOLDEN 배열에 추가할 때 이 구분을 참고할 것.

커밋 전 실수로 생성되는 `tsconfig.tsbuildinfo`, `package-lock.json`은 `.gitignore`에 등록되어 있으니 git에 올라가지 않는지 확인할 것 (과거 여러 번 실수로 커밋되었다가 별도 정리 커밋이 필요했음).

## 배포 후 검증

push 후 Vercel 대시보드/CLI로 최신 배포의 커밋 해시가 로컬 HEAD와 일치하고 `READY` 상태인지 확인. 가능하면 실제 배포 URL(`gyeongwon-ax-hub.vercel.app/install`)을 브라우저로 열어 변경한 카테고리를 선택해 이미지가 깨지지 않고 로드되는지 스크린샷으로 육안 확인한다.

## 사용자 선호 (항상 준수)

- 정확도 최우선, 전문가 보고서 수준, 교차검증·사실확인 필수
- AI가 작성했다는 티(AI 작성 문구, "🤖 Generated with Claude" 류 서명 등)는 결과물/커밋 메시지에 남기지 않는다
- 간결하고 직접적인 커뮤니케이션 선호 — 불필요한 설명 최소화
