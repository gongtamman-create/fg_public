/**
 * 운세 생성 엔진.
 *
 * 총운은 전통 체계 세 축의 합으로만 결정된다. 난수가 개입하지 않는다.
 *
 *   1. 주역 괘   — 매화역수 시간점으로 뽑은 64괘의 길흉        (-18 ~ +18)
 *   2. 일진 지지 — 그날 육십갑자와 띠의 관계 (삼합·충 등)      (-25 ~ +28)
 *   3. 태양 각   — 그날 태양 황경과 별자리의 어스펙트           (-18 ~ +18)
 *
 * 시드 난수는 '어느 종목을 보여줄까'를 고르는 데만 남겨 두었다.
 * 종목 선택은 길흉 주장이 아니라 표시 대상을 정하는 절차이므로 여기에 두어도 무방하다.
 *
 * 종목에 대해 매수/매도/목표가/전망은 어떤 형태로도 말하지 않는다.
 * 화면에 나가는 종목 문구는 전부 '이미 관측된 값'의 서술이다.
 */

import {
  sectorAffinity, SECTOR_KO, ELEMENT_KO, CHINESE,
  getWesternZodiac, getChineseZodiac,
} from './zodiac.js?v=6820b909';
import { dayGanji, jiRelation, tenGod, RELATION_TEXT, RELATION_VERDICT, GAN, JI } from './saju.js?v=6820b909';
import { sunAspect, ASPECT_TEXT, ASPECT_VERDICT, SIGN_KO, sunSign, TROPICAL_ORDER } from './astro.js?v=6820b909';
import { castHexagram } from './iching.js?v=6820b909';
import { stockCompatibility, compatLine } from './compat.js?v=6820b909';

/* ── 시드 난수 (종목 선택 전용) ─────────────────────────────── */

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function shuffled(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── 전통 소재 ─────────────────────────────────────────────── */

/** 오행별 색. 별자리 원소와 띠 오행에서 뽑는다. */
const ELEMENT_COLORS = {
  fire:  ['붉은색', '주황색', '진홍색'],
  earth: ['황토색', '베이지', '카키'],
  air:   ['하늘색', '연회색', '민트'],
  water: ['남색', '검정', '청록색'],
  wood:  ['초록색', '연두색', '올리브'],
  metal: ['흰색', '은색', '금색'],
};

/** 십이시. 인덱스는 지지와 같다 (0=자시). */
const SIJI = [
  { ko: '자시', range: '23시~01시' }, { ko: '축시', range: '01시~03시' },
  { ko: '인시', range: '03시~05시' }, { ko: '묘시', range: '05시~07시' },
  { ko: '진시', range: '07시~09시' }, { ko: '사시', range: '09시~11시' },
  { ko: '오시', range: '11시~13시' }, { ko: '미시', range: '13시~15시' },
  { ko: '신시', range: '15시~17시' }, { ko: '유시', range: '17시~19시' },
  { ko: '술시', range: '19시~21시' }, { ko: '해시', range: '21시~23시' },
];

const HEADLINES = {
  high: [
    '흐름이 당신 쪽으로 기울어 있습니다',
    '막혀 있던 것이 트이는 날입니다',
    '오래 기다린 일에 답이 오는 날입니다',
    '당신의 판단이 유난히 잘 드는 날입니다',
  ],
  mid: [
    '서두르지 않으면 잃을 것이 없는 날입니다',
    '큰 파도도 큰 바람도 없는 날입니다',
    '한 걸음 물러서면 전체가 보이는 날입니다',
    '오늘의 침착함이 내일의 여유가 됩니다',
  ],
  low: [
    '오늘은 지키는 것이 버는 것입니다',
    '조급함이 가장 큰 적인 날입니다',
    '한 박자 쉬어 가도 늦지 않습니다',
    '무리한 결정은 내일로 미루는 것이 좋습니다',
  ],
};

/**
 * 상단에 놓는 조언.
 *
 * 아래 '닿은 것' 세 항목이 이미 그날의 형세를 말하므로, 여기서는 같은 말을 되풀이하지 않고
 * 무엇을 할지에 대해서만 이른다. (예전에는 가장 강한 축의 문장을 그대로 가져다 써서
 * 화면에 똑같은 문장이 두 번 나왔다.)
 */
const ADVICE = {
  high: [
    '문이 열려 있을 때일수록 문지방을 잘 살피십시오. 좋은 날에 그르치는 일이 가장 아깝습니다.',
    '오늘 얻은 것은 오늘 정리해 두십시오. 흐름이 좋을 때 세운 기준이 나중을 지킵니다.',
    '자신감이 오르는 날입니다. 다만 확신과 과신은 종이 한 장 차이입니다.',
    '주변의 말이 유난히 잘 들어오는 날입니다. 한 번쯤 귀를 기울여 보십시오.',
  ],
  mid: [
    '오늘 정하지 않아도 잃을 것이 없습니다. 급할수록 한 박자 늦추십시오.',
    '생각을 적어 두면 나중에 도움이 됩니다. 오늘의 판단을 기록으로 남겨 보십시오.',
    '미뤄 둔 작은 일을 하나만 처리해 보십시오. 작은 정리가 큰 흐름을 바꿉니다.',
    '남과 견주지 말고 어제의 자신과만 견주십시오. 오늘은 그것으로 충분합니다.',
  ],
  low: [
    '새로 벌이기보다 있는 것을 살피는 편이 낫습니다. 지키는 것도 버는 것입니다.',
    '감정이 앞설 수 있는 날입니다. 결정은 하룻밤 재워 두십시오.',
    '남의 말에 흔들리기 쉬운 날입니다. 자기 기준을 다시 확인해 보십시오.',
    '오늘 못 한 일은 내일 해도 늦지 않습니다. 무리해서 얻은 것은 오래가지 않습니다.',
  ],
};


/** 십성을 한 마디로 이르는 말. 배지에 쓴다. */
const TEN_GOD_VERDICT = {
  jeongjae: '재물이 든다', pyeonjae: '큰 재물이 스친다', jeongin: '도움을 받는다',
  siksin: '여유가 생긴다', jeonggwan: '질서가 선다', pyeonin: '도움이 오락가락한다',
  bigyeon: '몫을 나눈다', sanggwan: '말이 앞선다', geopjae: '재물이 샌다',
  pyeongwan: '눌린다',
};

const bandOf = (score) => (score >= 67 ? 'high' : score >= 40 ? 'mid' : 'low');
const clamp = (v) => Math.round(Math.max(5, Math.min(99, v)));

/* ── 종목 서술 ─────────────────────────────────────────────── */

function tickerOmen(row, rng, used = new Set()) {
  const lines = [];

  if (row.cross === 'GOLDEN') {
    lines.push(
      '단기선이 장기선을 갓 넘어선, 흐름이 바뀐 자리에 있습니다.',
      '짧은 흐름이 긴 흐름을 막 앞질렀습니다. 국면이 바뀐 자리입니다.',
      '오래 눌려 있던 선이 위로 고개를 든 참입니다.'
    );
  }
  if (row.cross === 'DEATH') {
    lines.push(
      '단기선이 장기선 아래로 내려온, 기운이 가라앉은 자리에 있습니다.',
      '짧은 흐름이 긴 흐름 아래로 내려섰습니다. 힘이 빠진 구간입니다.',
      '위를 받치던 선이 아래로 꺾여 내려온 상태입니다.'
    );
  }

  if (typeof row.rsi14 === 'number') {
    if (row.rsi14 >= 70) {
      lines.push(
        '기운이 한껏 달아올라 있습니다. 뜨거운 것은 오래 붙잡기 어렵습니다.',
        '열기가 가득 차 있습니다. 가장 뜨거울 때가 가장 조심스러운 때입니다.',
        '숨이 가쁠 만큼 달려온 자리입니다.'
      );
    } else if (row.rsi14 <= 30) {
      lines.push(
        '기운이 바닥에 웅크린 채 숨을 고르고 있습니다.',
        '한참을 눌려 있어 힘이 많이 빠진 상태입니다.',
        '차갑게 식은 자리에서 조용히 머물고 있습니다.'
      );
    }
  }

  if (typeof row.pct_from_high52 === 'number' && row.pct_from_high52 > -3) {
    lines.push(
      '52주 중 가장 높은 자리 근처에 서 있습니다.',
      '지난 1년을 통틀어 가장 높은 곳에 올라와 있습니다.',
      '일 년치 발자국 중 가장 높은 지점에 서 있습니다.'
    );
  }
  if (typeof row.pct_from_low52 === 'number' && row.pct_from_low52 < 5) {
    lines.push(
      '52주 중 가장 낮은 자리 근처에 머물러 있습니다.',
      '지난 1년을 통틀어 가장 낮은 곳에 내려와 있습니다.',
      '일 년치 발자국 중 가장 깊은 지점에 머물러 있습니다.'
    );
  }

  if (typeof row.ret_20d === 'number') {
    if (row.ret_20d > 15) {
      lines.push(
        '최근 한 달 사이 눈에 띄게 몸집을 키웠습니다.',
        '한 달 남짓한 시간에 제법 먼 길을 올라왔습니다.',
        '지난 한 달, 걸음이 유난히 빨랐습니다.'
      );
    } else if (row.ret_20d < -15) {
      lines.push(
        '최근 한 달 사이 적잖이 몸을 낮췄습니다.',
        '한 달 남짓한 시간에 제법 많이 내려앉았습니다.',
        '지난 한 달, 뒷걸음이 길었습니다.'
      );
    }
  }

  if (typeof row.vol_ratio === 'number' && row.vol_ratio > 1.8) {
    lines.push(
      '평소보다 많은 사람이 오가며 발길이 잦아졌습니다.',
      '유난히 북적이는 자리입니다. 시선이 몰려 있습니다.',
      '평소와 달리 오가는 손길이 부쩍 늘었습니다.'
    );
  }

  // 당일 변동이 크면 그것부터 말한다. 장기 추세 문구가 급락한 날에 붙는 모순을 막는다.
  if (typeof row.chg1d === 'number') {
    if (row.chg1d >= 3) {
      lines.push(
        '오늘 하루 성큼 발을 내디뎠습니다.',
        '하루 사이 기운이 눈에 띄게 솟았습니다.',
        '오늘만큼은 발걸음이 가벼웠습니다.'
      );
    } else if (row.chg1d <= -3) {
      lines.push(
        '오늘 하루 부쩍 몸을 낮췄습니다.',
        '하루 사이 기운이 눈에 띄게 꺾였습니다.',
        '오늘은 유난히 발걸음이 무거웠습니다.'
      );
    }
  }

  if (!lines.length) {
    lines.push(
      ...(row.trend === 'UP'
        ? [
            '큰 굴곡 없이 위쪽을 향해 걸어가고 있습니다.',
            '서두르는 기색 없이 제 걸음으로 오르막을 밟고 있습니다.',
            '요란하지 않게, 그러나 꾸준히 자리를 높여 왔습니다.',
          ]
        : [
            '뚜렷한 방향 없이 자리를 지키고 있습니다.',
            '나아가지도 물러서지도 않은 채 때를 기다리고 있습니다.',
            '조용한 구간에 머물며 숨을 고르는 중입니다.',
          ])
    );
  }

  const fresh = lines.filter((l) => !used.has(l));
  const chosen = pick(rng, fresh.length ? fresh : lines);
  used.add(chosen);
  return chosen;
}

function pickTickers(rng, snapshot, affinity, count = 3) {
  const bySector = new Map();
  for (const row of snapshot) {
    if (!bySector.has(row.sector)) bySector.set(row.sector, []);
    bySector.get(row.sector).push(row);
  }

  const chosen = [];
  const used = new Set();
  const usedOmens = new Set();
  const sectors = affinity.slice(0, Math.max(count, 4));

  for (const { sector } of sectors) {
    if (chosen.length >= count) break;
    const pool = (bySector.get(sector) ?? [])
      .filter((r) => !used.has(r.ticker))
      .sort((a, b) => (b.rs_rank ?? 0) - (a.rs_rank ?? 0) || (b.vol_ratio ?? 0) - (a.vol_ratio ?? 0))
      .slice(0, 25);
    if (!pool.length) continue;
    const row = pick(rng, pool);
    used.add(row.ticker);
    chosen.push({ ...row, omen: tickerOmen(row, rng, usedOmens) });
  }

  if (chosen.length < count) {
    const rest = shuffled(rng, snapshot.filter((r) => !used.has(r.ticker)).slice(0, 120));
    for (const row of rest) {
      if (chosen.length >= count) break;
      used.add(row.ticker);
      chosen.push({ ...row, omen: tickerOmen(row, rng, usedOmens) });
    }
  }

  return chosen;
}

/* ── 메인 ──────────────────────────────────────────────────── */

/**
 * 한 사람의 하루치 운세를 만든다.
 *
 * 예전에는 별자리(12)와 띠(12)만 써서 경우의 수가 144개뿐이었다. 같은 달에
 * 태어나고 띠만 같으면 결과가 똑같아, 생년월일을 받는 의미가 거의 없었다.
 * 사주에서 오늘의 운을 볼 때 기준이 되는 것은 태어난 날의 간지인 일주(日柱)이고
 * 그중 일간(日干)이 곧 '나'다. 그것을 넣어 경우의 수를 60배로 늘렸다.
 *
 *   일간 십성  — 내 일간과 오늘 천간의 관계 (재성·인성·겁재 …)  가장 무겁게 본다
 *   일지 관계  — 내 일지와 오늘 지지의 관계 (삼합·충 …)
 *   띠 관계    — 내 년지와 오늘 지지의 관계. 이 앱의 뿌리라 남겨 두되 가볍게 본다
 *   주역 괘    — 일주·생월일·오늘 일진을 함께 넣어 뽑는다
 *   태양 각    — 별자리와 오늘 태양 황경의 각
 *
 * @param {{y:number,m:number,d:number}} birth 생년월일
 * @param {string} today    기준일 'YYYY-MM-DD'
 * @param {Array}  snapshot 종목 스냅샷
 * @param {object} ipo      티커 → 상장일
 */
export function buildFortune(birth, today, snapshot, ipo = {}) {
  const { y, m, d } = birth;
  const [ty, tm, td] = today.split('-').map(Number);

  const western = getWesternZodiac(m, d);
  const chinese = getChineseZodiac(y, m, d);
  const jiIndex = CHINESE.findIndex((c) => c.id === chinese.id);

  // 태어난 날의 간지 = 일주. 일간이 나, 일지가 내 자리다.
  const pillar = dayGanji(y, m, d);
  const ganji = dayGanji(ty, tm, td);

  const god = tenGod(pillar.ganIndex, ganji.ganIndex);
  const dayRel = jiRelation(pillar.jiIndex, ganji.jiIndex);
  const yearRel = jiRelation(jiIndex, ganji.jiIndex);
  const aspect = sunAspect(western.id, ty, tm, td);
  const hexagram = castHexagram(
    pillar.index + ganji.index,
    m,
    d,
    TROPICAL_ORDER.indexOf(western.id) + 1
  );

  // 축마다 무게를 달리해 더한다. 사주의 무게중심이 일간에 있으므로 십성을 가장 크게 본다.
  const raw =
    god.score * 1.0 +
    dayRel.score * 0.8 +
    yearRel.score * 0.35 +
    hexagram.score * 0.7 +
    aspect.score * 0.5;

  const score = clamp(50 + raw * 0.7);
  const band = bandOf(score);

  // 세부운 — 축마다 비중을 달리해 뽑는다. 어느 기운이 센지가 그대로 드러난다.
  const detail = {
    wealth: clamp(50 + (god.score * 1.3 + dayRel.score * 0.6) * 0.72),
    timing: clamp(50 + (aspect.score * 1.4 + dayRel.score * 0.9) * 0.72),
    insight: clamp(50 + (hexagram.score * 1.4 + god.score * 0.7) * 0.72),
  };

  const headline = HEADLINES[band][(hexagram.no + hexagram.movingLine) % HEADLINES[band].length];
  const advice = ADVICE[band][(hexagram.no * 3 + pillar.index) % ADVICE[band].length];

  // 좋은 시간대 — 일지와 육합을 이루는 시(時). (a+b)%12==1 이 육합이다.
  const hapJi = ((1 - pillar.jiIndex) % 12 + 12) % 12;
  const luckyNumber = ((hexagram.no + pillar.index * 7) % 45) + 1;
  const colorPool = [...ELEMENT_COLORS[western.element], ...ELEMENT_COLORS[chinese.element]];

  const affinity = sectorAffinity(western, chinese);
  const rng = mulberry32(xmur3(`${today}|${y}-${m}-${d}`)());
  const tickers = pickTickers(rng, snapshot, affinity);

  return {
    birth: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    date: today,
    western: { id: western.id, ko: western.ko, emoji: western.emoji, element: ELEMENT_KO[western.element] },
    chinese: { id: chinese.id, ko: chinese.ko, emoji: chinese.emoji, hanja: chinese.hanja, element: ELEMENT_KO[chinese.element] },

    score,
    band,
    headline,
    advice,
    detail,

    basis: {
      // 내 일주 — "나는 어떤 사람인가"에 해당하는 자리
      pillar: { name: pillar.name, hanja: pillar.hanja, gan: GAN[pillar.ganIndex], ji: JI[pillar.jiIndex] },
      ganji: { name: ganji.name, hanja: ganji.hanja, ji: JI[ganji.jiIndex] },
      tenGod: {
        key: god.key, label: god.label, hanja: god.hanja,
        score: god.score, text: god.text, verdict: TEN_GOD_VERDICT[god.key],
      },
      dayRelation: {
        key: dayRel.key, label: dayRel.label, detail: dayRel.detail,
        score: dayRel.score, text: RELATION_TEXT[dayRel.key], verdict: RELATION_VERDICT[dayRel.key],
      },
      yearRelation: {
        key: yearRel.key, label: yearRel.label, detail: yearRel.detail,
        score: yearRel.score, verdict: RELATION_VERDICT[yearRel.key],
      },
      aspect: {
        key: aspect.key, label: aspect.label, separation: aspect.separation,
        score: aspect.score, text: ASPECT_TEXT[aspect.key],
        verdict: ASPECT_VERDICT[aspect.key], sunSignKo: SIGN_KO[sunSign(ty, tm, td)],
      },
      hexagram: {
        no: hexagram.no, ko: hexagram.ko, hanja: hexagram.hanja,
        upper: hexagram.upper, lower: hexagram.lower, lines: hexagram.lines,
        fortuneLabel: hexagram.fortuneLabel, verdict: hexagram.verdict, score: hexagram.score,
        text: hexagram.text, movingLine: hexagram.movingLine, movingText: hexagram.movingText,
      },
    },

    lucky: {
      number: luckyNumber,
      color: colorPool[hexagram.no % colorPool.length],
      time: `${SIJI[hapJi].ko} (${SIJI[hapJi].range})`,
    },

    sectors: affinity.slice(0, 3).map((a) => ({ ...a, ko: SECTOR_KO[a.sector] ?? a.sector })),
    tickers: tickers.map((t) => {
      // 종목의 상장일로 사주를 세워 사용자 띠와의 궁합을 낸다. 상장일이 없으면 궁합은 생략한다.
      const compat = stockCompatibility(jiIndex, chinese.element, ipo[t.ticker], t.sector);
      return {
        ticker: t.ticker,
        name: t.name,
        sector: t.sector,
        sectorKo: SECTOR_KO[t.sector] ?? t.sector,
        price: t.price,
        chg1d: t.chg1d,
        rsi14: t.rsi14,
        trend: t.trend,
        ret_20d: t.ret_20d,
        pct_from_high52: t.pct_from_high52,
        omen: t.omen,
        compat,
        compatLine: compatLine(compat, chinese.ko),
      };
    }),
  };
}
