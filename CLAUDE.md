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
- `app/page.tsx`의 `MODULES` 배열이 허브 메인 카드 노출 순서를 결정한다.
- 사이드바/하단 내비게이션 `NAV_ITEMS`도 함께 확인.
- `lib/logEvent.ts`의 `LogModule` 유니온 타입에 새 모듈 키를 추가해야 로깅이 정상 동작한다.

## 설치환경 가이드 모듈 (`public/install-app.html`)

- 데이터: `INSTALL_DB` 객체, 한글 카테고리명을 키로 사용. 각 엔트리 구조:
  `emoji, subtitle, types[], space[][2], utility[][2], checklist[], cautions[], source, sourceUrl, images?[{src,alt,cap}]`
- 이미지 카드 표시 여부는 JS에서 `images.length` 기준으로 토글 (`imageCard.style.display`).
- 현재 20개 카테고리 (드롭다운 순서 = `INSTALL_DB` 객체 순서, 둘 다 항상 동기화 유지):
  냉장고 4도어 프리스탠딩 → 4도어 키친핏 → 4도어 키친핏 Max → 2도어 → 1도어 → 양문형 → 일반형 → 페어(2대 이상) 설치 → 김치냉장고 → 세탁기·콤보 → 건조기 → 에어컨 → TV → 청소기(무선청소기) → 로봇청소기 → 식기세척기 → 인덕션 → 정수기 → 전자레인지 → 공기청정기
- 스마트폰/노트북은 설치환경이 적용되지 않아 카테고리에서 완전히 제거됨 (드롭다운·DB 모두에 없음). 되살리지 말 것.

### 핵심 원칙 — 절대 타협 금지

**삼성닷컴 등 공식 출처에서 실제로 확인·검증된 이미지만 사용한다. 인접 제품이나 유사 모델의 이미지를 재활용/추측으로 넣지 않는다.** 치수가 명시된 설치가이드 이미지를 찾지 못하면 해당 카테고리는 텍스트+원본 링크만 제공하고 정직하게 "이미지 없음" 상태로 둔다 (예: 현재 청소기·전자레인지·공기청정기가 이 상태). 이는 사용자가 반복적으로 강조한 최우선 원칙이다.

### 이미지 리서치 방법론

- 삼성닷컴 페이지는 종종 이미지가 lazy-load(`lozad.js`)되거나 라디오버튼 탭 위젯(`new-set-guide`, 패널 ID `guidePanel0X-0X-...`)·JS 모달 안에 있어 단순 fetch로는 `<>`(빈 src) 또는 아예 누락된다. **브라우저 도구(Playwright MCP, Chrome DevTools 등)로 렌더링된 DOM을 직접 조회**해 `data-src`나 모달 내부 `<img>`의 실제 src를 확인해야 한다. (단순 fetch/curl만으로 "이미지 없음"이라 단정한 뒤 나중에 브라우저로 재조사해 실제로는 있었던 사례가 로봇청소기·인덕션에서 있었음.)
- 캡션(`cap`)에 들어가는 치수·모델명은 반드시 해당 페이지에서 직접 확인한 값만 기재하고 출처(`samsung.com`)를 명시한다.

## 테스트 & 검증 워크플로우

6개 모듈 전부에 `scripts/test-*.mjs` 회귀 테스트가 있다 (jsdom으로 `public/*.html`을 `runScripts:'dangerously'`로 로드해 인라인 스크립트의 전역 함수를 직접 호출·검증하는 동일 패턴, 매 세션 재작성할 필요 없음). 변경 후 항상 관련 스크립트 + 전체를 실행:

```bash
node scripts/test-install.mjs   # 설치환경가이드: 20개 카테고리 전체 렌더링, 이미지 개수/카드노출/링크 유효성, 키워드 검색
node scripts/test-finder.mjs    # 모델파인더: 41개 카테고리 전수 검색, AI추천/브랜드뷰 흐름, 패키지모드
node scripts/test-care.mjs      # AI Care: 16개 제품 전수, 12/36개월 플랜전환, overview/timeline 모드
node scripts/test-planner.mjs   # 패키지 플래너: 18개 카테고리 × 5개 평형, 할인율·예산배분 계산
node scripts/test-compare.mjs   # 타사비교: 70개 카테고리×브랜드×모델 조합, escHtml/history XSS 회귀
node scripts/test-levelup.mjs   # 레벨업테스트: 25문항 구성, 채점(CE/MX/에세이), 이름·사번·에세이 XSS 회귀
npx tsc --noEmit                # 타입체크
```

새 카테고리·제품을 추가하거나 이미지 개수가 바뀌면 각 스크립트의 기대값(예: `test-install.mjs`의 `expectedImageCounts`)을 반드시 함께 갱신할 것 — 안 하면 테스트가 실패한다. `compare-app.html`/`test-app.html`은 XSS 회귀 가드가 포함돼 있으므로 이스케이프 로직(`escHtml`)을 건드릴 때 특히 주의.

AX 현황 대시보드(`app/admin/page.tsx`)는 정적 HTML이 아닌 React 클라이언트 컴포넌트라 위 jsdom 패턴을 그대로 쓸 수 없다 — 아직 자동 회귀테스트 없음.

커밋 전 실수로 생성되는 `tsconfig.tsbuildinfo`, `package-lock.json`은 `.gitignore`에 등록되어 있으니 git에 올라가지 않는지 확인할 것 (과거 여러 번 실수로 커밋되었다가 별도 정리 커밋이 필요했음).

## 배포 후 검증

push 후 Vercel 대시보드/CLI로 최신 배포의 커밋 해시가 로컬 HEAD와 일치하고 `READY` 상태인지 확인. 가능하면 실제 배포 URL(`gyeongwon-ax-hub.vercel.app/install`)을 브라우저로 열어 변경한 카테고리를 선택해 이미지가 깨지지 않고 로드되는지 스크린샷으로 육안 확인한다.

## 사용자 선호 (항상 준수)

- 정확도 최우선, 전문가 보고서 수준, 교차검증·사실확인 필수
- AI가 작성했다는 티(AI 작성 문구, "🤖 Generated with Claude" 류 서명 등)는 결과물/커밋 메시지에 남기지 않는다
- 간결하고 직접적인 커뮤니케이션 선호 — 불필요한 설명 최소화
