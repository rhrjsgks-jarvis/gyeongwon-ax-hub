# 도면 픽스처 (`plans-real`)

설치환경가이드(`public/install-app.html`)가 참조하는 **실제 삼성닷컴 설치 규격도**의 스냅샷이다.
`npm run test:plans`(→ `scripts/test-plans.mjs`)가 이 디렉터리를 기준으로 회귀 검사한다.

## 왜 필요한가

설치환경가이드의 도면은 전부 `images.samsung.com` 원격 URL을 그대로 참조한다.
그래서 아무 경보 없이 다음 두 사고가 일어날 수 있다.

1. **삼성닷컴이 URL을 정리하면** 매장에서 이미지가 통째로 안 뜬다 — 빈 카드만 남는다.
2. **URL은 그대로인데 도면이 개정되면** 캡션에 적힌 치수와 그림이 어긋난다.

2번이 특히 위험하다. `CLAUDE.md`가 못박은 대로 **설치 상담에서 치수 오류는 바로 사고**다.
기존 8개 스위트는 전부 데이터·순수 함수만 보기 때문에 둘 다 잡지 못한다.

## 무엇이 들어 있나

| 파일 | 역할 |
|---|---|
| `index.json` | 도면 15장의 메타데이터 (출처 URL·카테고리·캡션·치수 토큰·sha256·픽셀 크기) |
| `*.jpg` / `*.png` | 도면 원본 스냅샷 (총 15장, 약 1.2MB) |
| `lib.mjs` | 생성기와 테스트가 **공유하는** 파서 (`parseInstallImages` / `imageSize` / `dimTokens`) |
| `build.mjs` | 픽스처 재생성 (`npm run build:plans`) |

스냅샷은 **재배포 목적이 아니라 회귀 테스트 대조용**이다.

### 수록 도면 (15장 / 12개 카테고리)

냉장고 4도어 프리스탠딩 · 4도어 키친핏 · 4도어 키친핏 Max · 2도어 · 1도어 · 양문형 ·
페어 설치 / 김치냉장고 / 세탁기 · 콤보(2장) / 건조기 / 로봇청소기 / 식기세척기 /
에어드레서 / 정수기

### `index.json` 항목 스키마

```jsonc
{
  "id": "refri-2door-kitchenfit",   // 픽스처 식별자 (= 파일명 접두)
  "category": "냉장고 2도어",        // INSTALL_DB 의 카테고리 키
  "file": "refri-2door-kitchenfit.jpg",
  "src": "https://images.samsung.com/...",  // install-app.html 의 원본 URL
  "alt": "...",                     // install-app.html 의 alt 원문
  "cap": "...",                     // install-app.html 의 cap 원문
  "dims": ["12mm", "105°", "595mm", "1,853mm", "이격12"],  // 캡션에서 뽑은 치수 토큰
  "bytes": 50335,
  "sha256": "...",
  "format": "jpeg", "width": 1280, "height": 574,
  "usedInCategories": ["냉장고 2도어"]   // 같은 도면을 쓰는 모든 카테고리
}
```

## 테스트가 보는 것 (`npm run test:plans`)

| 구간 | 내용 | 네트워크 |
|---|---|---|
| **A. 스냅샷 무결성** | 파일 존재 · 바이트수 · sha256 · 이미지 헤더(포맷/픽셀크기) 일치. 최소 10장 유지 | 불필요 |
| **B. 소스와의 연결** | `src`가 `install-app.html`에 아직 살아 있는가(고아 픽스처 방지), 카테고리 · `alt` · `cap` 원문 일치 | 불필요 |
| **C. 캡션 치수 회귀** | 기록된 치수 토큰이 현재 캡션에서 여전히 추출되는가 | 불필요 |
| **D. 원본 최신성** | 삼성닷컴 원본이 200이고 sha256이 스냅샷과 같은가 | 필요 (없으면 SKIP) |

- **PART D는 네트워크가 없으면 실패가 아니라 SKIP**이다. 다른 스위트가 전부 오프라인이라,
  삼성닷컴이 잠깐 느린 것만으로 CI가 빨개지면 안 된다
  (`test-e2e.mjs`가 playwright 없을 때 SKIP하는 것과 같은 방침).
  강제로 끄려면 `PLANS_SKIP_NETWORK=1`.
- **원본 404는 SKIP이 아니라 실패**다. 네트워크 문제가 아니라 진짜로 매장에서 이미지가 깨지는 상황이다.
- **원본 해시 불일치는 기본이 경고(WARN)**다. 삼성닷컴이 CDN 재인코딩만 해도 해시는 바뀌므로
  실패로 두면 우리가 손대지 않은 날에도 CI가 깨진다. 정책은 `test-plans.mjs`의
  `remoteMismatchIsFatal()` 한 곳에서 바꾼다.

## 도면을 추가·교체할 때

```bash
# 1) build.mjs 의 PICKS 에 [id, 파일명] 추가 (파일명은 install-app.html 의 src 끝부분)
# 2) 재생성
npm run build:plans
# 3) 검증 후 index.json + 이미지 함께 커밋
npm run test:plans
```

### 절대 원칙

**`install-app.html`에 이미 실려 있는(= 삼성닷컴 출처가 검증된) 도면만 픽스처로 넣는다.**
인접 제품이나 유사 모델의 이미지를 추측으로 채우지 않는다 — `CLAUDE.md`의 최우선 원칙과 동일하다.
치수를 확정하지 못한 도면은 픽스처에 넣지 말고 비워 두는 편이 낫다.

## 캡션이 바뀌었다고 테스트가 실패하면

`install-app.html`의 캡션을 고쳤다면 PART B/C가 실패한다. 이건 의도된 동작이다.
**치수가 정확한지 삼성닷컴 원본에서 눈으로 재확인한 뒤** `npm run build:plans`로 픽스처를 갱신한다.
확인 없이 갱신하면 이 테스트가 존재하는 이유가 사라진다.
