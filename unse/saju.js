/**
 * 일진(日辰)과 지지(地支) 관계.
 *
 * 한국 "오늘의 운세"의 표준 방식이다. 그날의 육십갑자에서 지지를 뽑고,
 * 사용자 띠의 지지와 맺는 관계(삼합·육합·충·형·해)로 길흉을 판정한다.
 * 난수가 전혀 개입하지 않는다.
 *
 * 기준점 검증: (JDN - 11) % 60 == 0 이 갑자일.
 *   2000-01-07 → 갑자, 1900-01-01 → 갑술. 독립된 두 기준일 모두 일치 확인.
 */

export const GAN = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
export const GAN_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 12지지. 인덱스 0=자 … 11=해. zodiac.js의 CHINESE 배열과 순서가 같다. */
export const JI = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
export const JI_HANJA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 율리우스 적일. 그레고리력 기준, 정오 기준 정수값. */
export function jdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
    + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

/** 그날의 육십갑자. 태어난 날에 쓰면 그것이 곧 일주(日柱)다. */
export function dayGanji(y, m, d) {
  const i = ((jdn(y, m, d) - 11) % 60 + 60) % 60;
  return {
    index: i,
    ganIndex: i % 10,
    jiIndex: i % 12,
    name: GAN[i % 10] + JI[i % 12],
    hanja: GAN_HANJA[i % 10] + JI_HANJA[i % 12],
  };
}

/* ── 천간과 십성 ───────────────────────────────────────────── */

/** 천간의 오행과 음양. 인덱스는 GAN 과 같다 (0=갑 … 9=계). */
export const GAN_ELEMENT = ['wood', 'wood', 'fire', 'fire', 'earth', 'earth', 'metal', 'metal', 'water', 'water'];
export const GAN_YANG = [true, false, true, false, true, false, true, false, true, false];

/** 오행 상생: 목생화 화생토 토생금 금생수 수생목 */
const SHENG = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
/** 오행 상극: 목극토 토극수 수극화 화극금 금극목 */
const KE = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };

/**
 * 십성(十星) 판정.
 *
 * 사주에서 오늘의 운을 보는 핵심이다. 일간(日干)을 '나'로 놓고 그날 천간이
 * 나와 어떤 관계인지를 본다. 오행 관계로 다섯 갈래가 갈리고, 음양이 같은지
 * 다른지로 각각 둘로 나뉘어 열 가지가 된다.
 *
 * 점수는 재물을 보는 앱이라는 점을 반영했다. 재성(정재·편재)이 가장 높고,
 * 재물을 빼앗는 겁재와 압박으로 오는 편관이 가장 낮다.
 *
 * @param {number} dayGan   일간 인덱스 (사용자가 태어난 날의 천간)
 * @param {number} todayGan 오늘 일진의 천간 인덱스
 */
export function tenGod(dayGan, todayGan) {
  const me = GAN_ELEMENT[dayGan];
  const other = GAN_ELEMENT[todayGan];
  const sameYin = GAN_YANG[dayGan] === GAN_YANG[todayGan];

  if (me === other) {
    return sameYin
      ? { key: 'bigyeon', label: '비견', hanja: '比肩', score: -2,
          text: '나와 같은 기운이 오늘 하루를 함께합니다. 든든하나 몫을 나눠야 하는 날입니다.' }
      : { key: 'geopjae', label: '겁재', hanja: '劫財', score: -14,
          text: '재물을 나눠 가지려는 기운이 듭니다. 남의 말에 지갑을 열지 마십시오.' };
  }
  if (SHENG[me] === other) {
    return sameYin
      ? { key: 'siksin', label: '식신', hanja: '食神', score: 10,
          text: '내어놓은 것이 살이 되어 돌아오는 날입니다. 여유가 생기고 먹을 복이 따릅니다.' }
      : { key: 'sanggwan', label: '상관', hanja: '傷官', score: -6,
          text: '재주가 넘쳐 말이 앞서기 쉬운 날입니다. 드러내기보다 다듬는 편이 낫습니다.' };
  }
  if (KE[me] === other) {
    return sameYin
      ? { key: 'pyeonjae', label: '편재', hanja: '偏財', score: 18,
          text: '큰 재물이 스치는 날입니다. 흐르는 돈이니 붙잡되 움켜쥐지는 마십시오.' }
      : { key: 'jeongjae', label: '정재', hanja: '正財', score: 20,
          text: '바른 재물이 드는 날입니다. 요행이 아니라 제 몫이 돌아오는 자리입니다.' };
  }
  if (KE[other] === me) {
    return sameYin
      ? { key: 'pyeongwan', label: '편관', hanja: '偏官', score: -16,
          text: '누르는 기운이 강한 날입니다. 밀어붙이면 부러지니 몸을 낮추십시오.' }
      : { key: 'jeonggwan', label: '정관', hanja: '正官', score: 6,
          text: '질서가 서는 날입니다. 규칙을 지키는 쪽이 오히려 멀리 갑니다.' };
  }
  // 남은 경우는 상대가 나를 생하는 인성이다.
  return sameYin
    ? { key: 'pyeonin', label: '편인', hanja: '偏印', score: 2,
        text: '도움이 오되 한결같지는 않은 날입니다. 기대는 반만 거십시오.' }
    : { key: 'jeongin', label: '정인', hanja: '正印', score: 12,
        text: '나를 살리는 기운이 드는 날입니다. 배우고 기대기에 좋은 자리입니다.' };
}

/* ── 지지 관계 ─────────────────────────────────────────────── */

/**
 * 삼합(三合): 신자진(수국) · 해묘미(목국) · 인오술(화국) · 사유축(금국).
 * 각 조는 지지 인덱스를 4로 나눈 나머지가 같다는 성질이 있어 그것으로 판정한다.
 */
const SAMHAP_NAME = { 0: '신자진 수국', 1: '사유축 금국', 2: '인오술 화국', 3: '해묘미 목국' };

/** 삼형(三刑)·자형(自刑) 조합. */
const SAMHYUNG = [
  [2, 5, 8],   // 인사신
  [1, 10, 7],  // 축술미
];
const JAHYUNG = [4, 6, 9, 11]; // 진·오·유·해는 같은 지지끼리 만나면 자형

/**
 * 두 지지의 관계를 판정한다.
 * 여러 관계가 동시에 성립할 수 있어 우선순위를 둔다: 삼합 > 충 > 육합 > 형 > 해 > 평.
 * 충은 가장 강한 흉이라 육합보다 앞에 둔다.
 *
 * @param {number} a 사용자 띠의 지지 인덱스
 * @param {number} b 그날 일진의 지지 인덱스
 */
export function jiRelation(a, b) {
  // 삼합 — 서로 다른 지지이면서 4로 나눈 나머지가 같을 때
  if (a !== b && a % 4 === b % 4) {
    return { key: 'samhap', label: '삼합', score: 28, tone: 'best', detail: SAMHAP_NAME[a % 4] };
  }

  // 충 — 정반대에 놓인 지지
  if (Math.abs(a - b) === 6) {
    return { key: 'chung', label: '충', score: -25, tone: 'worst', detail: `${JI[a]}${JI[b]} 상충` };
  }

  // 육합 — 두 지지의 합이 12로 나누어 1이 남는 짝 (자축·인해·묘술·진유·사신·오미)
  if ((a + b) % 12 === 1) {
    return { key: 'yukhap', label: '육합', score: 20, tone: 'good', detail: `${JI[a]}${JI[b]} 육합` };
  }

  // 형 — 삼형과 자형
  if (a === b && JAHYUNG.includes(a)) {
    return { key: 'jahyung', label: '자형', score: -14, tone: 'bad', detail: `${JI[a]} 자형` };
  }
  for (const group of SAMHYUNG) {
    if (a !== b && group.includes(a) && group.includes(b)) {
      return { key: 'hyung', label: '형', score: -18, tone: 'bad', detail: `${JI[a]}${JI[b]} 상형` };
    }
  }
  if ((a === 0 && b === 3) || (a === 3 && b === 0)) {
    return { key: 'hyung', label: '형', score: -18, tone: 'bad', detail: '자묘 상형' };
  }

  // 해 — 두 지지의 합이 12로 나누어 7이 남는 짝
  if ((a + b) % 12 === 7) {
    return { key: 'hae', label: '해', score: -12, tone: 'bad', detail: `${JI[a]}${JI[b]} 상해` };
  }

  // 비화 — 같은 지지끼리 (자형에 해당하지 않는 경우)
  if (a === b) {
    return { key: 'bihwa', label: '비화', score: 5, tone: 'mild', detail: `${JI[a]} 비화` };
  }

  return { key: 'pyeong', label: '평', score: 0, tone: 'neutral', detail: '특별한 관계 없음' };
}

/**
 * 관계별 서술.
 * 화면 앞면에 그대로 나가는 문장이라 설명문이 아니라 운세의 어조로 쓴다.
 * 용어(삼합·충 등)와 숫자는 접힌 '셈법' 영역에만 노출한다.
 */
export const RELATION_TEXT = {
  samhap: '흩어져 있던 세 기운이 오늘 한자리에 모입니다. 따로 놀던 것들이 비로소 한 방향을 봅니다.',
  yukhap: '오늘의 기운이 당신과 짝을 이루어 서로를 붙듭니다. 맞물린 톱니처럼 일이 순하게 돌아갑니다.',
  bihwa: '오늘의 기운이 당신의 기운과 꼭 같습니다. 익숙해서 편하나, 그만큼 새로울 것도 적은 날입니다.',
  pyeong: '오늘의 기운은 당신을 비껴갑니다. 밀지도 당기지도 않으니, 스스로 정한 만큼만 나아가는 날입니다.',
  hae: '오늘의 기운이 당신을 슬며시 해칩니다. 크게 다칠 일은 없으나 자꾸 어긋나 손이 두 번 가는 날입니다.',
  hyung: '오늘의 기운이 당신과 서로를 벱니다. 부딪히기 쉬우니 말을 아끼고 결정을 미루는 편이 낫습니다.',
  jahyung: '오늘의 기운이 당신 안에서 스스로 얽힙니다. 발목을 잡는 것이 남이 아니라 자신인 날입니다.',
  chung: '오늘의 기운이 당신을 정면으로 칩니다. 뿌리가 흔들리는 날이니 크게 벌이지 마십시오.',
};

/** 관계를 한 마디로 이르는 말. 배지에 쓴다. */
export const RELATION_VERDICT = {
  samhap: '크게 어울리다',
  yukhap: '어울리다',
  bihwa: '같은 기운',
  pyeong: '고요하다',
  hae: '해롭다',
  hyung: '부딪히다',
  jahyung: '스스로 얽히다',
  chung: '크게 부딪히다',
};
