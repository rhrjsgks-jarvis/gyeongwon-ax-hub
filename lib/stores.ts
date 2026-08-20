/*
 * **매장 목록 — 한 곳에서만 적는다.**
 *
 * 예전에는 `app/page.tsx` 안에만 있었는데, 첫 접속 지점 선택과 점별 로그가 생기면서
 * 세 곳이 같은 목록을 봐야 한다(허브 컨시어지 드롭다운 · 지점 고르기 · 로그 라벨).
 * 세 벌로 적으면 한쪽만 고쳤을 때 화면이 서로 다른 말을 한다 — 이 저장소가 허브 카드
 * 개수·앱 버전·비교표 값에서 반복해서 데인 종류다.
 *
 * 점코드(`Z…`·`ZH…`)는 컨시어지 접수 링크의 `s=` 파라미터이자 **로그의 지점 열**이다.
 */
/*
 * `active` — **지금 이 앱을 쓰는 영업팀인가**(2026-08-20 사장님 지시).
 *
 * 전국 지점코드는 아직 다 등록하지 않았다. 지금은 **경원영업팀만** 쓰고 있으므로
 * 경원 지점은 `'Y'`, 다른 영업팀 지점은 `'N'` 으로 넣는다.
 *
 * **`Y` 인 지점만 통과시킨다**(`matchStore`). 다른 팀 코드로 들어오면 그 매장 통계가
 * 통째로 엉뚱한 팀에 잡힌다.
 * 다른 팀이 쓰기 시작하면 그 지점들을 `'Y'` 로 바꾸면 되고 코드는 그대로다.
 */
export type Store = { code: string; name: string; active: 'Y' | 'N' }

/** 관리자 점검용 — 이 지점을 고르면 **로그를 남기지 않는다**(2026-08-20 사장님 요청) */
export const TEST_STORE_CODE = 'Z000'
export function isTestStore(code: string): boolean { return code === TEST_STORE_CODE }

export const STORE_LIST: Store[] = [
  /* 관리자 점검용. 이 지점으로 두면 무엇을 눌러도 로그가 쌓이지 않는다 —
     점검 조작이 매장 통계에 섞이면 실제 사용량과 구분할 방법이 없어진다. */
  { code: 'Z000', name: '테스트점', active: 'Y' },
  { code: 'ZN01', name: '스타필드 수원', active: 'Y' },
  { code: 'ZHA7', name: '현대판교모바일', active: 'Y' },
  { code: 'Z279', name: '오산', active: 'Y' },
  { code: 'Z047', name: '수지', active: 'Y' },
  { code: 'Z150', name: '강릉옥천', active: 'Y' },
  { code: 'Z205', name: '단구', active: 'Y' },
  { code: 'Z206', name: '석사', active: 'Y' },
  { code: 'Z227', name: '속초', active: 'Y' },
  { code: 'Z243', name: '평택', active: 'Y' },
  { code: 'Z324', name: '분당', active: 'Y' },
  { code: 'Z343', name: '북수원', active: 'Y' },
  { code: 'Z378', name: '광주', active: 'Y' },
  { code: 'Z383', name: '안성', active: 'Y' },
  { code: 'Z398', name: '평택고덕', active: 'Y' },
  { code: 'Z399', name: '이천증포', active: 'Y' },
  { code: 'Z405', name: '평촌', active: 'Y' },
  { code: 'Z418', name: '안양모바일', active: 'Y' },
  { code: 'Z426', name: '용인구성', active: 'Y' },
  { code: 'Z451', name: '서수원', active: 'Y' },
  { code: 'Z509', name: '영통', active: 'Y' },
  { code: 'Z539', name: '디지털시티모바일', active: 'Y' },
  { code: 'Z541', name: '광명소하', active: 'Y' },
  { code: 'Z557', name: '성남', active: 'Y' },
  { code: 'Z567', name: 'AK분당', active: 'Y' },
  { code: 'Z579', name: '원주', active: 'Y' },
  { code: 'Z583', name: '춘천', active: 'Y' },
  { code: 'Z586', name: '평택세교', active: 'Y' },
  { code: 'Z607', name: '용인처인모바일', active: 'Y' },
  { code: 'Z608', name: '권선', active: 'Y' },
  { code: 'Z617', name: '안양본', active: 'Y' },
  { code: 'Z619', name: '수원', active: 'Y' },
  { code: 'Z621', name: '동탄', active: 'Y' },
  { code: 'Z624', name: '강릉', active: 'Y' },
  { code: 'Z640', name: '단계', active: 'Y' },
  { code: 'Z663', name: '하남미사', active: 'Y' },
  { code: 'Z666', name: '용인기흥', active: 'Y' },
  { code: 'ZH35', name: '롯데평촌', active: 'Y' },
  { code: 'ZH36', name: '롯데수원', active: 'Y' },
  { code: 'ZH57', name: '현대판교', active: 'Y' },
  { code: 'ZH64', name: '신세계사우스시티', active: 'Y' },
  { code: 'ZH73', name: 'AK수원', active: 'Y' },
  { code: 'ZH74', name: 'AK평택', active: 'Y' },
  { code: 'ZH75', name: 'AK원주', active: 'Y' },
  { code: 'ZH77', name: '신세계하남', active: 'Y' },
  { code: 'ZH96', name: '갤러리아광교', active: 'Y' },
  { code: 'ZH97', name: 'AK분당모바일', active: 'Y' },
  { code: 'ZHA1', name: '롯데동탄', active: 'Y' },
  { code: 'ZHA2', name: '롯데동탄모바일', active: 'Y' },
  { code: 'ZHB4', name: '타임빌라스수원', active: 'Y' },
  { code: 'ZIN5', name: '남양모바일', active: 'Y' },
  { code: 'ZMF6', name: '이마트안양', active: 'Y' },
  { code: 'ZR42', name: '기흥캠퍼스모바일', active: 'Y' },
  { code: 'ZR60', name: '화성캠퍼스모바일', active: 'Y' },
  { code: 'ZR65', name: '수원삼성전기모바일', active: 'Y' },
  { code: 'ZR78', name: '광명기아자동차모바일', active: 'Y' },
  { code: 'ZRA0', name: '화성DSR모바일', active: 'Y' },
  { code: 'ZRD0', name: '미래기술캠퍼스모바일', active: 'Y' },
  { code: 'ZRD2', name: '디지털시티2모바일', active: 'Y' },
  { code: 'ZRE0', name: '용인에버랜드모바일', active: 'Y' },
  { code: 'ZRE4', name: '평택캠퍼스모바일', active: 'Y' },
  { code: 'ZRE6', name: '기흥삼성SDI모바일', active: 'Y' },
  { code: 'ZRF7', name: '현대기아차연구소모바일', active: 'Y' },
  { code: 'ZRF8', name: '판교SDS모바일', active: 'Y' },
  { code: 'ZRF9', name: '기흥SDR모바일', active: 'Y' },
  { code: 'ZRG1', name: 'KGM평택모바일', active: 'Y' },
]

/*
 * **접속할 때마다 다시 묻는다**(2026-08-20 사장님 요청). 그래서 `localStorage` 가 아니라
 * **`sessionStorage`** 다 — 앱을 닫으면 지워지고 다음에 열 때 다시 고른다. 같은 세션
 * 안에서 화면을 옮길 때는 묻지 않는다(그것까지 물으면 상담이 막힌다).
 *
 * 익명 세션 id(`axhub_uid`)와 **수명이 같아져** 로그의 단위도 맞아떨어진다 —
 * "한 세션 = 한 매장의 상담 한 판"이 된다.
 */
const KEY = 'axhub_store'
const LEGACY_KEY = 'axhub_store'   // 예전에는 localStorage 에 두어 한 번만 물었다

/** 이번 접속에 고른 점코드. 아직 고르지 않았으면 빈 문자열 */
export function getStoreCode(): string {
  if (typeof sessionStorage === 'undefined') return ''
  try { return sessionStorage.getItem(KEY) || '' } catch { return '' }
}

export function setStoreCode(code: string): void {
  if (typeof sessionStorage === 'undefined') return
  try { sessionStorage.setItem(KEY, code) } catch { /* 사파리 비공개 모드 */ }
}

/**
 * 예전 방식(기기에 영구 저장)으로 남은 값을 지운다.
 * 남겨 두면 **그 기기만 영영 안 묻는 것처럼 보이지는 않지만**(읽지 않으므로) 쓰레기로 굳는다.
 */
export function clearLegacyStore(): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.removeItem(LEGACY_KEY) } catch { /* 무시 */ }
}

export function storeName(code: string): string {
  const s = STORE_LIST.find((x) => x.code === code)
  return s ? s.name : ''
}

/*
 * **정확히 일치하는 지점 하나를 찾는다 — 없으면 null.**
 *
 * 사장님 결정(2026-08-20): *"점코드 또는 점명으로만 접속해도 됩니다."* 별도 비밀번호 없이
 * **지점 식별자 자체가 통행증**이다. 그래서 부분 일치로 목록을 내밀지 않는다 —
 * `수` 한 글자로 여러 매장이 뜨면 아무나 눌러 들어갈 수 있어 열쇠 구실을 못 한다.
 *
 * 사람이 치는 방식은 받아 준다: 점코드는 **대소문자 무시**, 지점명은 **띄어쓰기 무시**.
 * 안 쓰는 팀(`active: 'N'`)은 통과시키지 않는다.
 */
export function matchStore(input: string): Store | null {
  const t = String(input || '').trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  return (
    STORE_LIST.find(
      (s) => s.active === 'Y' &&
        (s.code.toLowerCase() === t || s.name.replace(/\s+/g, '').toLowerCase() === t)
    ) || null
  )
}

/** 지금 쓰는 지점 수 — 화면이 "N곳"을 적을 때 쓴다(전체 목록을 세면 거짓이 된다) */
export const ACTIVE_STORES = STORE_LIST.filter((s) => s.active === 'Y')
