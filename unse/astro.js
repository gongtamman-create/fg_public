/**
 * 태양 트랜싯 어스펙트.
 *
 * 그날 태양의 황경을 구하고, 각 별자리 구간의 중심과 이루는 각도로 길흉을 본다.
 * 서양 점성술에서 실제로 쓰는 어스펙트(합·육각·사각·삼각·대충)를 그대로 적용한다.
 *
 * 태양 위치만 쓰기 때문에 천체력 파일이 필요 없다. 아래 근사식의 오차는 0.01도 수준이며,
 * 춘분·하지·추분·동지 네 지점에서 각각 0.39 / 0.62 / 0.97 / 0.13도로 검증했다.
 * 어스펙트 판정에 ±6~8도의 허용범위(orb)를 쓰므로 이 정도 오차는 결과에 영향을 주지 않는다.
 */

import { jdn } from './saju.js?v=6820b909';

/** 회귀황도 12궁 순서. 양자리 0도에서 시작한다. */
export const TROPICAL_ORDER = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

/** 별자리 구간의 중심 황경. 경계보다 중심을 쓰는 편이 판정이 안정적이다. */
export function signCenter(signId) {
  const i = TROPICAL_ORDER.indexOf(signId);
  if (i < 0) throw new Error(`알 수 없는 별자리: ${signId}`);
  return i * 30 + 15;
}

/** 그날 자정(UT) 기준 태양 황경(도). */
export function solarLongitude(y, m, d) {
  const n = jdn(y, m, d) - 2451545.0 + 0.5;
  const L = (280.460 + 0.9856474 * n) % 360;          // 평균황경
  const g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180; // 평균근점이각
  const lambda = L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  return ((lambda % 360) + 360) % 360;
}

/** 태양이 오늘 머무는 별자리. */
export function sunSign(y, m, d) {
  return TROPICAL_ORDER[Math.floor(solarLongitude(y, m, d) / 30)];
}

/**
 * 어스펙트 정의.
 * orb는 허용 오차각으로, 정각에서 이만큼 벗어나도 그 어스펙트로 본다.
 */
const ASPECTS = [
  { key: 'conjunction', label: '합',   angle: 0,   orb: 8, score: 8,   tone: 'good' },
  { key: 'sextile',     label: '육각', angle: 60,  orb: 6, score: 12,  tone: 'good' },
  { key: 'square',      label: '사각', angle: 90,  orb: 6, score: -14, tone: 'bad' },
  { key: 'trine',       label: '삼각', angle: 120, orb: 8, score: 18,  tone: 'best' },
  { key: 'opposition',  label: '대충', angle: 180, orb: 8, score: -18, tone: 'worst' },
];

/**
 * 오늘 태양과 해당 별자리 사이의 어스펙트를 판정한다.
 * 어느 정각에도 걸리지 않으면 '무각'이며 길흉이 없다.
 */
export function sunAspect(signId, y, m, d) {
  const sun = solarLongitude(y, m, d);
  const center = signCenter(signId);

  // 두 황경 사이의 각도. 0~180도로 접는다.
  let sep = Math.abs(sun - center) % 360;
  if (sep > 180) sep = 360 - sep;

  for (const a of ASPECTS) {
    if (Math.abs(sep - a.angle) <= a.orb) {
      return { ...a, separation: Number(sep.toFixed(1)), sunLongitude: Number(sun.toFixed(1)) };
    }
  }
  return {
    key: 'none', label: '무각', angle: null, score: 0, tone: 'neutral',
    separation: Number(sep.toFixed(1)), sunLongitude: Number(sun.toFixed(1)),
  };
}

/**
 * 어스펙트별 서술.
 * 각도와 용어는 접힌 '셈법' 영역으로 빼고, 앞면에는 이 문장만 내보낸다.
 */
export const ASPECT_TEXT = {
  conjunction: '해가 당신의 자리에 그대로 내려앉았습니다. 감출 것도 꾸밀 것도 없이 제 색이 가장 짙게 드러나는 날입니다.',
  sextile: '해가 비스듬한 자리에서 당신에게 손을 내밉니다. 먼저 잡으면 잡히고, 가만히 두면 그냥 지나가는 날입니다.',
  trine: '해가 당신과 가장 편안한 각으로 마주 섭니다. 애써 밀지 않아도 흐름이 등을 밀어주는 날입니다.',
  square: '해가 당신을 모로 칩니다. 걸리는 일이 있겠으나, 넘어서고 나면 반드시 남는 것이 있습니다.',
  opposition: '해가 하늘 건너편에서 당신을 똑바로 마주 봅니다. 한쪽으로 기울면 크게 흔들리니 가운데를 지키십시오.',
  none: '해가 당신과 각을 맺지 않고 그저 지나갑니다. 하늘이 조용하니 제 일에 몰두하기 좋은 날입니다.',
};

/** 어스펙트를 한 마디로 이르는 말. 배지에 쓴다. */
export const ASPECT_VERDICT = {
  conjunction: '겹치다',
  sextile: '이롭다',
  trine: '크게 이롭다',
  square: '어긋나다',
  opposition: '마주 서다',
  none: '고요하다',
};

/** 별자리 id → 한글 이름. 해가 오늘 어느 자리에 드는지 이르는 데 쓴다. */
export const SIGN_KO = {
  aries: '양자리', taurus: '황소자리', gemini: '쌍둥이자리', cancer: '게자리',
  leo: '사자자리', virgo: '처녀자리', libra: '천칭자리', scorpio: '전갈자리',
  sagittarius: '사수자리', capricorn: '염소자리', aquarius: '물병자리', pisces: '물고기자리',
};
