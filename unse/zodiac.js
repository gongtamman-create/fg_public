/**
 * 별자리(12) · 띠(12) 판별과 오행/원소 → 섹터 성향 매핑.
 *
 * 여기서 나오는 섹터 가중치가 "이 사람에게 어떤 종목을 보여줄까"의 유일한 근거다.
 * 종목 자체의 좋고 나쁨과는 무관하며, 순전히 조합을 갈라주는 역할만 한다.
 */

/** GICS 11개 섹터. screener_snapshot.sector 값과 문자열이 정확히 일치해야 한다. */
export const SECTORS = [
  'Information Technology',
  'Health Care',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Energy',
  'Utilities',
  'Real Estate',
  'Materials',
  'Communication Services',
];

export const SECTOR_KO = {
  'Information Technology': '정보기술',
  'Health Care': '헬스케어',
  'Financials': '금융',
  'Consumer Discretionary': '경기소비재',
  'Consumer Staples': '필수소비재',
  'Industrials': '산업재',
  'Energy': '에너지',
  'Utilities': '유틸리티',
  'Real Estate': '부동산',
  'Materials': '소재',
  'Communication Services': '커뮤니케이션',
};

/**
 * 서양 12별자리. start=[월, 일] 이며 다음 별자리 시작 전날까지가 해당 구간.
 * element: 불/흙/공기/물
 */
export const WESTERN = [
  { id: 'capricorn',   ko: '염소자리',   start: [12, 22], element: 'earth', emoji: '♑' },
  { id: 'aquarius',    ko: '물병자리',   start: [1, 20],  element: 'air',   emoji: '♒' },
  { id: 'pisces',      ko: '물고기자리', start: [2, 19],  element: 'water', emoji: '♓' },
  { id: 'aries',       ko: '양자리',     start: [3, 21],  element: 'fire',  emoji: '♈' },
  { id: 'taurus',      ko: '황소자리',   start: [4, 20],  element: 'earth', emoji: '♉' },
  { id: 'gemini',      ko: '쌍둥이자리', start: [5, 21],  element: 'air',   emoji: '♊' },
  { id: 'cancer',      ko: '게자리',     start: [6, 22],  element: 'water', emoji: '♋' },
  { id: 'leo',         ko: '사자자리',   start: [7, 23],  element: 'fire',  emoji: '♌' },
  { id: 'virgo',       ko: '처녀자리',   start: [8, 23],  element: 'earth', emoji: '♍' },
  { id: 'libra',       ko: '천칭자리',   start: [9, 23],  element: 'air',   emoji: '♎' },
  { id: 'scorpio',     ko: '전갈자리',   start: [10, 23], element: 'water', emoji: '♏' },
  { id: 'sagittarius', ko: '사수자리',   start: [11, 22], element: 'fire',  emoji: '♐' },
];

/**
 * 12지지(띠)와 각 지지의 오행.
 * 배열 순서는 자(쥐)부터이며, 인덱스 = (연도 - 4) % 12 로 맞춰져 있다.
 */
export const CHINESE = [
  { id: 'rat',     ko: '쥐',     hanja: '子', element: 'water', emoji: '🐀' },
  { id: 'ox',      ko: '소',     hanja: '丑', element: 'earth', emoji: '🐂' },
  { id: 'tiger',   ko: '호랑이', hanja: '寅', element: 'wood',  emoji: '🐅' },
  { id: 'rabbit',  ko: '토끼',   hanja: '卯', element: 'wood',  emoji: '🐇' },
  { id: 'dragon',  ko: '용',     hanja: '辰', element: 'earth', emoji: '🐉' },
  { id: 'snake',   ko: '뱀',     hanja: '巳', element: 'fire',  emoji: '🐍' },
  { id: 'horse',   ko: '말',     hanja: '午', element: 'fire',  emoji: '🐎' },
  { id: 'goat',    ko: '양',     hanja: '未', element: 'earth', emoji: '🐐' },
  { id: 'monkey',  ko: '원숭이', hanja: '申', element: 'metal', emoji: '🐒' },
  { id: 'rooster', ko: '닭',     hanja: '酉', element: 'metal', emoji: '🐓' },
  { id: 'dog',     ko: '개',     hanja: '戌', element: 'earth', emoji: '🐕' },
  { id: 'pig',     ko: '돼지',   hanja: '亥', element: 'water', emoji: '🐖' },
];

/** 서양 4원소 → 섹터 가중치. */
const WESTERN_AFFINITY = {
  fire:  { 'Energy': 3, 'Information Technology': 2, 'Consumer Discretionary': 2, 'Industrials': 1 },
  earth: { 'Real Estate': 3, 'Materials': 2, 'Consumer Staples': 2, 'Financials': 1 },
  air:   { 'Communication Services': 3, 'Information Technology': 2, 'Industrials': 2, 'Consumer Discretionary': 1 },
  water: { 'Health Care': 3, 'Utilities': 2, 'Consumer Staples': 2, 'Financials': 1 },
};

/**
 * 오행 → 섹터 가중치.
 *
 * 십성(十星)으로 잡는다. 사주에서 **내가 극하는 오행이 재성(財星)**, 곧 재물이다.
 * 투자를 보는 앱이므로 재성 자리를 가장 높이 치고, 나를 생해주는 인성이 그다음,
 * 나와 같은 비겁은 가장 낮게 둔다. 비겁은 몫을 나눠 갖는 자리라 재물로는 약하다.
 *
 * 이렇게 해야 `compat.js` 의 궁합 판정과도 앞뒤가 맞는다.
 * 예전처럼 같은 오행 섹터만 뽑으면 '인연이 닿은 종목'이 죄다 비겁으로 나와
 * 궁합 점수가 낮게 깔리는 모순이 생긴다.
 *
 *   섹터 오행: 나무=헬스케어·경기소비재·커뮤니케이션 / 불=에너지·정보기술
 *              흙=부동산·소재 / 쇠=금융·산업재 / 물=유틸리티·필수소비재
 */
const ELEMENT_AFFINITY = {
  // 나무 → 재성은 흙, 인성은 물
  wood:  { 'Real Estate': 3, 'Materials': 3, 'Utilities': 2, 'Consumer Staples': 2, 'Health Care': 1 },
  // 불 → 재성은 쇠, 인성은 나무
  fire:  { 'Financials': 3, 'Industrials': 3, 'Health Care': 2, 'Consumer Discretionary': 2, 'Energy': 1 },
  // 흙 → 재성은 물, 인성은 불
  earth: { 'Utilities': 3, 'Consumer Staples': 3, 'Energy': 2, 'Information Technology': 2, 'Real Estate': 1 },
  // 쇠 → 재성은 나무, 인성은 흙
  metal: { 'Health Care': 3, 'Consumer Discretionary': 3, 'Communication Services': 2, 'Real Estate': 2, 'Financials': 1 },
  // 물 → 재성은 불, 인성은 쇠
  water: { 'Energy': 3, 'Information Technology': 3, 'Financials': 2, 'Industrials': 2, 'Utilities': 1 },
};

export const ELEMENT_KO = {
  fire: '불', earth: '흙', air: '공기', water: '물', wood: '나무', metal: '쇠',
};

/**
 * 생일(월/일)로 서양 별자리를 판별한다.
 * 염소자리가 해를 걸치므로 12/22 이후와 1/19 이전을 함께 처리한다.
 */
export function getWesternZodiac(month, day) {
  // 시작일 순으로 정렬해두고 뒤에서부터 훑으면 경계 비교가 한 번으로 끝난다.
  const ordered = [...WESTERN].sort((a, b) => a.start[0] - b.start[0] || a.start[1] - b.start[1]);
  let found = ordered[ordered.length - 1]; // 12/22 이후 → 염소자리
  for (const sign of ordered) {
    const [m, d] = sign.start;
    if (month > m || (month === m && day >= d)) found = sign;
  }
  return found;
}

/**
 * 생년월일로 띠를 판별한다.
 * 사주에서 해가 바뀌는 기준은 양력 1월 1일이 아니라 입춘(대략 2월 4일)이므로
 * 2월 3일까지는 전년도 띠로 계산한다.
 */
export function getChineseZodiac(year, month, day) {
  const effectiveYear = (month < 2 || (month === 2 && day <= 3)) ? year - 1 : year;
  const idx = ((effectiveYear - 4) % 12 + 12) % 12;
  return CHINESE[idx];
}

/**
 * 별자리 원소와 띠 오행을 합산해 섹터 선호도를 낸다.
 * 반환값은 가중치 내림차순으로 정렬된 배열.
 */
export function sectorAffinity(western, chinese) {
  const scores = Object.fromEntries(SECTORS.map((s) => [s, 0]));
  for (const [sector, w] of Object.entries(WESTERN_AFFINITY[western.element] || {})) {
    scores[sector] += w;
  }
  for (const [sector, w] of Object.entries(ELEMENT_AFFINITY[chinese.element] || {})) {
    scores[sector] += w;
  }
  return Object.entries(scores)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([sector, weight]) => ({ sector, weight }));
}

/** 144개 조합 전체를 만들어 반환한다. 빌드 시 순회용. */
export function allCombos() {
  const out = [];
  for (const w of WESTERN) {
    for (const c of CHINESE) {
      out.push({ key: `${w.id}-${c.id}`, western: w, chinese: c });
    }
  }
  return out;
}
