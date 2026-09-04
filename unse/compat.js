/**
 * 종목과의 궁합.
 *
 * 종목에게도 태어난 날이 있다고 보고, 최초 거래일로 사주를 세운다.
 * 그러면 종목에도 지지(띠)와 오행이 생기고, 사람과 사람의 궁합을 보듯 견줄 수 있다.
 *
 *   1. 지지 관계 — 종목 상장일의 지지 vs 사용자 띠의 지지 (삼합·육합·충·형·해)
 *   2. 오행 관계 — 종목 섹터의 오행 vs 사용자 띠의 오행 (상생·비화·상극)
 *
 * 지지 판정은 일진에 쓰는 것과 같은 규칙(`saju.js`)을 그대로 쓴다.
 * 여기서도 난수는 쓰지 않는다.
 */

import { dayGanji, jiRelation, JI } from './saju.js?v=81948995';
import { CHINESE } from './zodiac.js?v=81948995';

/** 섹터에 오행을 배속한다. zodiac.js 의 오행→섹터 성향과 앞뒤가 맞도록 정했다. */
export const SECTOR_ELEMENT = {
  'Health Care': 'wood',
  'Consumer Discretionary': 'wood',
  'Communication Services': 'wood',
  'Energy': 'fire',
  'Information Technology': 'fire',
  'Real Estate': 'earth',
  'Materials': 'earth',
  'Financials': 'metal',
  'Industrials': 'metal',
  'Utilities': 'water',
  'Consumer Staples': 'water',
};

/** 오행 상생: 목생화 화생토 토생금 금생수 수생목 */
const SHENG = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };

/** 오행 상극: 목극토 토극수 수극화 화극금 금극목 */
const KE = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };

const ELEMENT_KO = { wood: '나무', fire: '불', earth: '흙', metal: '쇠', water: '물' };

/** 받침 유무에 따라 조사를 고른다. */
function josa(word, withBatchim, without) {
  const last = word.charCodeAt(word.length - 1) - 0xac00;
  if (last < 0 || last > 11171) return without; // 한글이 아니면 무난한 쪽으로
  return last % 28 !== 0 ? withBatchim : without;
}

/**
 * 오행 관계를 십성(十星)으로 읽는다.
 *
 * 단순히 상생은 좋고 상극은 나쁘다고 보면 재물을 놓친다.
 * 사주에서 **내가 극하는 오행이 재성(財星)**, 곧 재물이다.
 * 투자를 보는 앱이므로 이 자리를 가장 높게 친다.
 *
 *   재성(내가 극함)    — 재물의 자리        +16
 *   인성(나를 생함)    — 도움을 받는 자리   +12
 *   식상(내가 생함)    — 길러내는 자리      +6
 *   비겁(같은 오행)    — 나눠 갖는 자리     -2
 *   관성(나를 극함)    — 눌리는 자리        -12
 *
 * @param {string} user  사용자 띠의 오행
 * @param {string} stock 종목 섹터의 오행
 */
function elementRelation(user, stock) {
  const u = ELEMENT_KO[user];
  const s = ELEMENT_KO[stock];
  const sObj = josa(s, '을', '를');
  const uObj = josa(u, '을', '를');

  if (KE[user] === stock) {
    return {
      key: 'wealth', label: '재성', score: 16,
      text: `${u}이 ${s}${sObj} 다스립니다. 재물이 되는 자리이니 오래 두고 볼수록 좋습니다.`,
    };
  }
  if (SHENG[stock] === user) {
    return {
      key: 'support', label: '인성', score: 12,
      text: `${s}이 ${u}${uObj} 살립니다. 이 종목의 기운이 당신을 북돋우는 자리입니다.`,
    };
  }
  if (SHENG[user] === stock) {
    return {
      key: 'output', label: '식상', score: 6,
      text: `${u}이 ${s}${sObj} 살립니다. 당신이 내어주는 만큼 자라는 자리입니다.`,
    };
  }
  if (user === stock) {
    return {
      key: 'peer', label: '비겁', score: -2,
      text: `둘 다 ${u}의 기운입니다. 뜻은 통하나 몫을 나눠 가져야 하는 자리입니다.`,
    };
  }
  if (KE[stock] === user) {
    return {
      key: 'pressure', label: '관성', score: -12,
      text: `${s}이 ${u}${uObj} 누릅니다. 기운이 눌리는 자리이니 한 발 떨어져 보십시오.`,
    };
  }
  return { key: 'none', label: '무관', score: 0, text: '' };
}

const GRADES = [
  { min: 80, label: '천생연분', tone: 'best' },
  { min: 62, label: '잘 맞습니다', tone: 'good' },
  { min: 42, label: '무난합니다', tone: 'neutral' },
  { min: 25, label: '조심스럽습니다', tone: 'bad' },
  { min: 0, label: '상극입니다', tone: 'worst' },
];

/**
 * 사용자와 종목의 궁합을 낸다.
 *
 * @param {number} userJiIndex  사용자 띠의 지지 인덱스 (0=자 … 11=해)
 * @param {string} userElement  사용자 띠의 오행
 * @param {string} ipoDate      종목 최초 거래일 'YYYY-MM-DD'
 * @param {string} sector       종목 섹터 (GICS 영문명)
 * @returns {object|null}       상장일이 없으면 null — 궁합을 지어내지 않는다.
 */
export function stockCompatibility(userJiIndex, userElement, ipoDate, sector) {
  if (!ipoDate) return null;

  const [y, m, d] = ipoDate.split('-').map(Number);
  if (!y || !m || !d) return null;

  const ganji = dayGanji(y, m, d);
  const rel = jiRelation(userJiIndex, ganji.jiIndex);

  const stockElement = SECTOR_ELEMENT[sector];
  const elem = stockElement
    ? elementRelation(userElement, stockElement)
    : { key: 'none', label: '무관', score: 0, text: '' };

  const score = Math.round(Math.max(5, Math.min(99, 50 + rel.score + elem.score)));
  const grade = GRADES.find((g) => score >= g.min) ?? GRADES[GRADES.length - 1];

  return {
    score,
    label: grade.label,
    tone: grade.tone,
    ipoDate,
    // 종목의 '띠'. 상장일의 지지에서 나온다.
    stockJi: JI[ganji.jiIndex],
    stockAnimal: CHINESE[ganji.jiIndex].ko,
    stockGanji: ganji.name,
    stockElement: stockElement ? ELEMENT_KO[stockElement] : null,
    relation: { key: rel.key, label: rel.label, detail: rel.detail, score: rel.score },
    element: { key: elem.key, label: elem.label, score: elem.score, text: elem.text },
  };
}

/** 궁합을 한 줄로 이르는 말. 종목 카드에 붙는다. */
export function compatLine(c, userAnimalKo) {
  if (!c) return null;
  const born = c.ipoDate.slice(0, 4);
  const rel =
    c.relation.key === 'pyeong'
      ? '특별히 얽히지 않습니다'
      : `${c.relation.detail}${josa(c.relation.detail, '을', '를')} 이룹니다`;
  return `${born}년에 시장에 나온 ${c.stockAnimal}띠. 당신의 ${userAnimalKo}띠와 ${rel}.`;
}
