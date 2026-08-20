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
export type Store = { code: string; name: string }

export const STORE_LIST: Store[] = [
  { code: 'ZN01', name: '스타필드 수원' },
  { code: 'ZHA7', name: '현대판교모바일' },
  { code: 'Z279', name: '오산' },
  { code: 'Z047', name: '수지' },
  { code: 'Z150', name: '강릉옥천' },
  { code: 'Z205', name: '단구' },
  { code: 'Z206', name: '석사' },
  { code: 'Z227', name: '속초' },
  { code: 'Z243', name: '평택' },
  { code: 'Z324', name: '분당' },
  { code: 'Z343', name: '북수원' },
  { code: 'Z378', name: '광주' },
  { code: 'Z383', name: '안성' },
  { code: 'Z398', name: '평택고덕' },
  { code: 'Z399', name: '이천증포' },
  { code: 'Z405', name: '평촌' },
  { code: 'Z418', name: '안양모바일' },
  { code: 'Z426', name: '용인구성' },
  { code: 'Z451', name: '서수원' },
  { code: 'Z509', name: '영통' },
  { code: 'Z539', name: '디지털시티모바일' },
  { code: 'Z541', name: '광명소하' },
  { code: 'Z557', name: '성남' },
  { code: 'Z567', name: 'AK분당' },
  { code: 'Z579', name: '원주' },
  { code: 'Z583', name: '춘천' },
  { code: 'Z586', name: '평택세교' },
  { code: 'Z607', name: '용인처인모바일' },
  { code: 'Z608', name: '권선' },
  { code: 'Z617', name: '안양본' },
  { code: 'Z619', name: '수원' },
  { code: 'Z621', name: '동탄' },
  { code: 'Z624', name: '강릉' },
  { code: 'Z640', name: '단계' },
  { code: 'Z663', name: '하남미사' },
  { code: 'Z666', name: '용인기흥' },
  { code: 'ZH35', name: '롯데평촌' },
  { code: 'ZH36', name: '롯데수원' },
  { code: 'ZH57', name: '현대판교' },
  { code: 'ZH64', name: '신세계사우스시티' },
  { code: 'ZH73', name: 'AK수원' },
  { code: 'ZH74', name: 'AK평택' },
  { code: 'ZH75', name: 'AK원주' },
  { code: 'ZH77', name: '신세계하남' },
  { code: 'ZH96', name: '갤러리아광교' },
  { code: 'ZH97', name: 'AK분당모바일' },
  { code: 'ZHA1', name: '롯데동탄' },
  { code: 'ZHA2', name: '롯데동탄모바일' },
  { code: 'ZHB4', name: '타임빌라스수원' },
  { code: 'ZIN5', name: '남양모바일' },
  { code: 'ZMF6', name: '이마트안양' },
  { code: 'ZR42', name: '기흥캠퍼스모바일' },
  { code: 'ZR60', name: '화성캠퍼스모바일' },
  { code: 'ZR65', name: '수원삼성전기모바일' },
  { code: 'ZR78', name: '광명기아자동차모바일' },
  { code: 'ZRA0', name: '화성DSR모바일' },
  { code: 'ZRD0', name: '미래기술캠퍼스모바일' },
  { code: 'ZRD2', name: '디지털시티2모바일' },
  { code: 'ZRE0', name: '용인에버랜드모바일' },
  { code: 'ZRE4', name: '평택캠퍼스모바일' },
  { code: 'ZRE6', name: '기흥삼성SDI모바일' },
  { code: 'ZRF7', name: '현대기아차연구소모바일' },
  { code: 'ZRF8', name: '판교SDS모바일' },
  { code: 'ZRF9', name: '기흥SDR모바일' },
  { code: 'ZRG1', name: 'KGM평택모바일' },
]

const KEY = 'axhub_store'

/** 지금 기기에 저장된 점코드. 아직 고르지 않았으면 빈 문자열 */
export function getStoreCode(): string {
  if (typeof localStorage === 'undefined') return ''
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}

export function setStoreCode(code: string): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(KEY, code) } catch { /* 사파리 비공개 모드 */ }
}

export function storeName(code: string): string {
  const s = STORE_LIST.find((x) => x.code === code)
  return s ? s.name : ''
}

/**
 * 지점명·점코드 어느 쪽으로도 찾는다 — 상담사는 매장 이름을 알고, 관리자는 코드를 안다.
 * 코드는 대소문자를 가리지 않고, 이름은 띄어쓰기를 무시한다("스타필드수원" · "스타필드 수원").
 */
export function findStores(q: string): Store[] {
  const t = q.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return STORE_LIST
  return STORE_LIST.filter(
    (s) => s.code.toLowerCase().includes(t) || s.name.replace(/\s+/g, '').toLowerCase().includes(t)
  )
}
