---
name: refresh-audit
description: 세일즈 코파일럿 전체 자료를 원문(삼성닷컴·삼성전자서비스·로지텍·삼성스토어 카탈로그·LG)과 대조해 바뀐 것을 찾고 반영한다. "전체 최신화", "자료 점검", "삼성닷컴과 다른 것", "바뀐 것 확인", "정기 점검", 상태줄에 「🗓점검 N건 기한」이 뜰 때 쓴다.
---

# 전체 최신화 점검 — 대장 → 대조 → 보고 → 반영 → 대장 갱신

원문은 예고 없이 바뀐다(2026-10 구독케어 개편·물류비(양중비) 신설을 둘 다 놓쳤다).
그래서 **출처마다 마지막 대조일과 주기**를 `scripts/fixtures/freshness.json` 에 적어 두고,
기한이 지나면 상태줄(`🗓점검 N건 기한`)과 매 질문 맥락(`[최신화]`)에 뜬다.

## 0. 로컬 세션인지 확인
삼성닷컴·삼성전자서비스는 브라우저 렌더·Origin 이 필요해 **로컬 전용**이다(클라우드 프록시가 막는다).

## 1. 무엇이 기한인지 본다
```
npm run check:fresh
```

## 2. 기한 지난 갈래만 서브에이전트로 **동시에** 대조한다 (읽기만)
갈래마다 한 에이전트. **저장소 자료(public/·scripts/)는 고치지 않고** `.scratch/refresh/<갈래>.md·json` 에
「우리 값 → 원문 값 · 출처 URL」 로 적게 한다. 갈래별 지시 요지:

| 갈래 | 대조 대상 | 우리 쪽 |
|---|---|---|
| 라인업 | `cxhr/pf/goodsList?dispClsfNo=&rows=500` 전 카테고리 | `scripts/fixtures/sec-catalog.json` · `public/finder-extra.json` · 타사비교 삼성 모델 |
| AS | samsungsvc `fee?tab=assure` 표 3개 · 멤버십 bluecare · 센터 API | `as-app.html` 의 DB·RB·CONTACTS · `svc-centers.json` |
| 설치환경 | 각 `sourceUrl` 렌더 DOM(지연 로드·탭·모달) · 규격도 파일명 개정번호 | `install-app.html` 의 INSTALL_DB |
| 구독 | 모바일·PC 구독 지면 · 구독 대상 품목 | `care-app.html` 의 MX_SUB·AI2_SUB·PRODUCTS |
| 카탈로그 | catalog.sesc 5종 호수(`samsung.aiibook.net/b2c/catImage/{Dir}/mokcha.txt`) · LG 베스트샵 카탈로그 · LG 모델(API) | 모델파인더 · 타사비교 |
| 설치비 | 로지텍 **지정 8곳만**(robots 금지 — 훑지 않는다) · 케어플러스 | `install-cost-source.json` |

에이전트 하나가 PDF·지면을 여럿 읽으면 컨텍스트가 넘쳐 죽는다 — **갈래마다 따로**, 본문은 파일로.

## 3. 사장님께 먼저 보고한다
「무엇이 원문과 다른가」를 갈래별로 짧게. **그 밖은 묻지 않고 반영한다**(CLAUDE.md 「묻지 않는다」).
다만 **사장님만 아는 사실**(단종 여부·업무 규칙)은 한 줄로 확인한다.

## 4. 반영 — 각 모듈의 규칙을 지킨다
- 원문에서 확인한 값만 넣는다. 못 찾은 것은 비우고 그렇게 적는다.
- 고친 자료의 **빌드를 함께 돌린다**: `build:index`(통합검색) · `build:sizereps` · `build:installcost` ·
  `build:svc` · `build:careplans` · 문항이면 `build:nmq → build:appbank → build:examtool → build:examweb`.
- `CACHE_VERSION`(sw.js) · `APP_VERSION`(lib/version.ts) 을 함께 올린다.
- `npm test` · 화면을 건드렸으면 `npm run test:e2e`.

## 5. 대장을 갱신한다 — **대조한 갈래만**
```
npm run check:fresh -- --done lineup,as-warranty,...
```
날짜는 「이 날 원문과 맞았다」는 증언이다. 대조하지 않은 갈래는 올리지 않는다.
