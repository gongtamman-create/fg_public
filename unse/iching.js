/**
 * 주역 64괘 — 매화역수(梅花易數) 시간점 방식.
 *
 * 소강절의 매화역수는 시초를 뽑거나 동전을 던지지 않고, 주어진 수(연지·월·일·시)를
 * 대입해 괘를 얻는다. 그래서 난수 없이 결정론적으로 괘가 나온다.
 *
 *   상괘 = (수의 합) mod 8      (0이면 8)
 *   하괘 = (수의 합 + 시) mod 8  (0이면 8)
 *   동효 = (수의 합 + 시) mod 6  (0이면 6)
 *
 * 여기서는 전통의 '연지수' 자리에 사용자 띠의 지지수를, '시' 자리에 별자리 번호를 넣는다.
 * 띠와 별자리가 각각 괘의 상·하를 가르므로 144조합이 원리에 따라 갈린다.
 */

/** 선천팔괘 수. 1건 2태 3리 4진 5손 6감 7간 8곤. */
export const TRIGRAMS = {
  1: { ko: '건', hanja: '乾', symbol: '☰', nature: '하늘' },
  2: { ko: '태', hanja: '兌', symbol: '☱', nature: '못' },
  3: { ko: '리', hanja: '離', symbol: '☲', nature: '불' },
  4: { ko: '진', hanja: '震', symbol: '☳', nature: '우레' },
  5: { ko: '손', hanja: '巽', symbol: '☴', nature: '바람' },
  6: { ko: '감', hanja: '坎', symbol: '☵', nature: '물' },
  7: { ko: '간', hanja: '艮', symbol: '☶', nature: '산' },
  8: { ko: '곤', hanja: '坤', symbol: '☷', nature: '땅' },
};

/**
 * 괘 번호 조견표. HEX_TABLE[하괘][상괘] = 주역 괘 번호(문왕 후천 배열).
 * 예: 하괘 진(4), 상괘 감(6) → 3번 수뢰준.
 */
const HEX_TABLE = {
  1: { 1: 1,  2: 43, 3: 14, 4: 34, 5: 9,  6: 5,  7: 26, 8: 11 }, // 하괘 건
  2: { 1: 10, 2: 58, 3: 38, 4: 54, 5: 61, 6: 60, 7: 41, 8: 19 }, // 하괘 태
  3: { 1: 13, 2: 49, 3: 30, 4: 55, 5: 37, 6: 63, 7: 22, 8: 36 }, // 하괘 리
  4: { 1: 25, 2: 17, 3: 21, 4: 51, 5: 42, 6: 3,  7: 27, 8: 24 }, // 하괘 진
  5: { 1: 44, 2: 28, 3: 50, 4: 32, 5: 57, 6: 48, 7: 18, 8: 46 }, // 하괘 손
  6: { 1: 6,  2: 47, 3: 64, 4: 40, 5: 59, 6: 29, 7: 4,  8: 7  }, // 하괘 감
  7: { 1: 33, 2: 31, 3: 56, 4: 62, 5: 53, 6: 39, 7: 52, 8: 15 }, // 하괘 간
  8: { 1: 12, 2: 45, 3: 35, 4: 16, 5: 20, 6: 8,  7: 23, 8: 2  }, // 하괘 곤
};

/** 길흉 등급별 점수. 총운 합산에 쓰인다. */
export const FORTUNE_SCORE = { best: 18, good: 10, neutral: 0, bad: -10, worst: -18 };
export const FORTUNE_LABEL = { best: '대길', good: '길', neutral: '평', bad: '흉', worst: '대흉' };

/** 괘의 길흉을 한 마디로 이르는 말. 화면 배지에 쓴다. */
export const FORTUNE_VERDICT = {
  best: '크게 길하다', good: '길하다', neutral: '고요하다', bad: '흉하다', worst: '크게 흉하다',
};

/**
 * 64괘. text는 그날의 태도를 이르는 한 줄이며, 종목이나 매매에 대한 말은 넣지 않는다.
 */
export const HEXAGRAMS = {
  1:  { ko: '중천건', hanja: '重天乾', fortune: 'best',    text: '하늘이 쉬지 않고 도는 형상입니다. 스스로 힘써 나아가면 막힐 것이 없습니다.' },
  2:  { ko: '중지곤', hanja: '重地坤', fortune: 'good',    text: '땅이 만물을 싣는 형상입니다. 앞서기보다 받아들이고 따를 때 이롭습니다.' },
  3:  { ko: '수뢰준', hanja: '水雷屯', fortune: 'bad',     text: '싹이 언 땅을 뚫는 형상입니다. 시작이 더디니 조급함을 버려야 합니다.' },
  4:  { ko: '산수몽', hanja: '山水蒙', fortune: 'neutral', text: '안개가 산을 가린 형상입니다. 모르는 것을 아는 체하지 않으면 길이 열립니다.' },
  5:  { ko: '수천수', hanja: '水天需', fortune: 'neutral', text: '구름이 모였으나 비는 아직인 형상입니다. 기다림 자체가 오늘의 할 일입니다.' },
  6:  { ko: '천수송', hanja: '天水訟', fortune: 'bad',     text: '물과 하늘이 서로 등진 형상입니다. 다툼이 생기기 쉬우니 물러서는 편이 낫습니다.' },
  7:  { ko: '지수사', hanja: '地水師', fortune: 'neutral', text: '땅속에 물이 모인 형상입니다. 질서를 세우면 많은 것을 움직일 수 있습니다.' },
  8:  { ko: '수지비', hanja: '水地比', fortune: 'good',    text: '물이 땅을 고루 적시는 형상입니다. 사람을 가까이하면 도움이 옵니다.' },
  9:  { ko: '풍천소축', hanja: '風天小畜', fortune: 'neutral', text: '구름은 있으나 비가 오지 않는 형상입니다. 작게 쌓는 것으로 충분한 날입니다.' },
  10: { ko: '천택리', hanja: '天澤履', fortune: 'neutral', text: '범의 꼬리를 밟는 형상입니다. 조심스럽게 디디면 해를 입지 않습니다.' },
  11: { ko: '지천태', hanja: '地天泰', fortune: 'best',    text: '하늘과 땅의 기운이 사귀는 형상입니다. 막힌 것이 통하고 뜻이 맞아떨어집니다.' },
  12: { ko: '천지비', hanja: '天地否', fortune: 'worst',   text: '하늘과 땅이 등을 돌린 형상입니다. 통하지 않으니 무리하게 밀어붙이지 마십시오.' },
  13: { ko: '천화동인', hanja: '天火同人', fortune: 'good', text: '불이 하늘로 오르는 형상입니다. 뜻이 같은 사람과 함께하면 멀리 갑니다.' },
  14: { ko: '화천대유', hanja: '火天大有', fortune: 'best', text: '해가 하늘 한가운데 뜬 형상입니다. 가진 것이 크니 나눌수록 더 커집니다.' },
  15: { ko: '지산겸', hanja: '地山謙', fortune: 'good',    text: '높은 산이 땅 아래 있는 형상입니다. 낮출수록 오히려 높아지는 날입니다.' },
  16: { ko: '뇌지예', hanja: '雷地豫', fortune: 'good',    text: '우레가 땅을 울리는 형상입니다. 미리 갖춰 두면 때가 왔을 때 놓치지 않습니다.' },
  17: { ko: '택뢰수', hanja: '澤雷隨', fortune: 'good',    text: '못 속에 우레가 잠긴 형상입니다. 고집을 내려놓고 흐름을 따르면 이롭습니다.' },
  18: { ko: '산풍고', hanja: '山風蠱', fortune: 'bad',     text: '그릇 안이 상한 형상입니다. 미뤄 둔 문제를 오늘 손대야 할 때입니다.' },
  19: { ko: '지택림', hanja: '地澤臨', fortune: 'good',    text: '높은 곳에서 아래를 굽어보는 형상입니다. 다가오는 기운이 있으니 맞을 준비를 하십시오.' },
  20: { ko: '풍지관', hanja: '風地觀', fortune: 'neutral', text: '바람이 땅 위를 지나는 형상입니다. 움직이기보다 보고 살피기에 좋은 날입니다.' },
  21: { ko: '화뢰서합', hanja: '火雷噬嗑', fortune: 'neutral', text: '입 안에 걸린 것을 씹어 삼키는 형상입니다. 걸림돌을 덮지 말고 끊어내야 합니다.' },
  22: { ko: '산화비', hanja: '山火賁', fortune: 'neutral', text: '산 아래 불이 비추는 형상입니다. 꾸밈은 좋으나 알맹이를 잊지 마십시오.' },
  23: { ko: '산지박', hanja: '山地剝', fortune: 'worst',   text: '산이 깎여 내리는 형상입니다. 덜어내는 때이니 새로 벌이지 않는 것이 상책입니다.' },
  24: { ko: '지뢰복', hanja: '地雷復', fortune: 'good',    text: '땅 밑에서 우레가 되살아나는 형상입니다. 끝난 듯 보이던 것이 다시 돌아옵니다.' },
  25: { ko: '천뢰무망', hanja: '天雷无妄', fortune: 'neutral', text: '우레가 하늘 아래 치는 형상입니다. 억지를 부리지 않으면 허물이 없습니다.' },
  26: { ko: '산천대축', hanja: '山天大畜', fortune: 'best', text: '산이 하늘의 기운을 품은 형상입니다. 그동안 쌓아온 것이 힘을 발휘합니다.' },
  27: { ko: '산뢰이', hanja: '山雷頤', fortune: 'neutral', text: '턱이 움직여 무언가를 기르는 형상입니다. 무엇을 들이고 있는지 살펴보십시오.' },
  28: { ko: '택풍대과', hanja: '澤風大過', fortune: 'bad',  text: '들보가 휘어지는 형상입니다. 힘에 부치는 일을 떠안지 마십시오.' },
  29: { ko: '중수감', hanja: '重水坎', fortune: 'worst',   text: '구덩이가 거듭 겹친 형상입니다. 험한 자리이니 발밑을 거듭 확인해야 합니다.' },
  30: { ko: '중화리', hanja: '重火離', fortune: 'good',    text: '불이 서로 이어 밝은 형상입니다. 밝게 보이는 만큼 태우지 않도록 조심하십시오.' },
  31: { ko: '택산함', hanja: '澤山咸', fortune: 'good',    text: '산 위에 못이 있는 형상입니다. 마음이 통하니 먼저 손을 내밀면 응답이 옵니다.' },
  32: { ko: '뇌풍항', hanja: '雷風恒', fortune: 'good',    text: '우레와 바람이 함께 가는 형상입니다. 하던 대로 꾸준히 하는 것이 답입니다.' },
  33: { ko: '천산둔', hanja: '天山遯', fortune: 'bad',     text: '하늘 아래 산이 물러나는 형상입니다. 나서지 않고 비켜서는 것이 지혜입니다.' },
  34: { ko: '뇌천대장', hanja: '雷天大壯', fortune: 'good', text: '우레가 하늘에서 울리는 형상입니다. 기세가 좋으나 예의를 잃으면 다칩니다.' },
  35: { ko: '화지진', hanja: '火地晉', fortune: 'good',    text: '해가 땅 위로 솟는 형상입니다. 나아가는 데 거침이 없는 날입니다.' },
  36: { ko: '지화명이', hanja: '地火明夷', fortune: 'worst', text: '해가 땅 밑으로 진 형상입니다. 밝음을 감추고 때를 기다려야 합니다.' },
  37: { ko: '풍화가인', hanja: '風火家人', fortune: 'good', text: '불에서 바람이 이는 형상입니다. 안을 먼저 다스리면 밖이 따라옵니다.' },
  38: { ko: '화택규', hanja: '火澤睽', fortune: 'bad',     text: '불은 오르고 못은 내리는 형상입니다. 어긋남이 있으니 작은 일부터 맞춰 가십시오.' },
  39: { ko: '수산건', hanja: '水山蹇', fortune: 'worst',   text: '산 앞에 물이 가로놓인 형상입니다. 앞이 막혔으니 돌아가는 길을 찾아야 합니다.' },
  40: { ko: '뇌수해', hanja: '雷水解', fortune: 'good',    text: '우레와 비가 얽힘을 푸는 형상입니다. 묶여 있던 것이 풀리는 날입니다.' },
  41: { ko: '산택손', hanja: '山澤損', fortune: 'neutral', text: '아래를 덜어 위를 더하는 형상입니다. 지금의 덜어냄이 뒤의 보탬이 됩니다.' },
  42: { ko: '풍뢰익', hanja: '風雷益', fortune: 'best',    text: '위를 덜어 아래를 더하는 형상입니다. 보태지는 기운이 있으니 나아가도 좋습니다.' },
  43: { ko: '택천쾌', hanja: '澤天夬', fortune: 'neutral', text: '못이 하늘 위로 넘치는 형상입니다. 결단할 때이나 힘으로만 밀면 위태롭습니다.' },
  44: { ko: '천풍구', hanja: '天風姤', fortune: 'bad',     text: '바람이 하늘 아래서 만나는 형상입니다. 뜻밖의 만남이 있으나 깊이 엮이지 마십시오.' },
  45: { ko: '택지췌', hanja: '澤地萃', fortune: 'good',    text: '못이 땅 위에 모인 형상입니다. 사람과 재물이 모이니 중심을 잡아야 합니다.' },
  46: { ko: '지풍승', hanja: '地風升', fortune: 'good',    text: '땅에서 나무가 자라 오르는 형상입니다. 한 걸음씩 오르면 높이 이릅니다.' },
  47: { ko: '택수곤', hanja: '澤水困', fortune: 'worst',   text: '못에 물이 빠진 형상입니다. 곤궁한 때이니 말을 아끼고 몸을 낮추십시오.' },
  48: { ko: '수풍정', hanja: '水風井', fortune: 'neutral', text: '우물이 자리를 지키는 형상입니다. 자리를 옮기기보다 안을 맑게 할 때입니다.' },
  49: { ko: '택화혁', hanja: '澤火革', fortune: 'neutral', text: '가죽을 벗겨 바꾸는 형상입니다. 바꿀 때이나 명분이 서야 탈이 없습니다.' },
  50: { ko: '화풍정', hanja: '火風鼎', fortune: 'good',    text: '솥이 세 발로 굳게 선 형상입니다. 자리가 안정되니 새것을 담아도 좋습니다.' },
  51: { ko: '중뢰진', hanja: '重雷震', fortune: 'bad',     text: '우레가 거듭 치는 형상입니다. 놀랄 일이 있으나 중심을 지키면 상하지 않습니다.' },
  52: { ko: '중산간', hanja: '重山艮', fortune: 'neutral', text: '산이 겹쳐 멈춰 선 형상입니다. 멈춰야 할 자리에서 멈추는 것이 상책입니다.' },
  53: { ko: '풍산점', hanja: '風山漸', fortune: 'good',    text: '산 위 나무가 천천히 자라는 형상입니다. 순서를 지켜 나아가면 반드시 이릅니다.' },
  54: { ko: '뇌택귀매', hanja: '雷澤歸妹', fortune: 'bad', text: '순서가 뒤바뀐 형상입니다. 서두른 결정은 뒤에 값을 치르게 됩니다.' },
  55: { ko: '뇌화풍', hanja: '雷火豐', fortune: 'good',    text: '해가 중천에 이른 풍성한 형상입니다. 가득 찬 뒤에는 기울음을 잊지 마십시오.' },
  56: { ko: '화산려', hanja: '火山旅', fortune: 'bad',     text: '산 위에 불이 붙어 머물지 못하는 형상입니다. 오래 머물 자리가 아닙니다.' },
  57: { ko: '중풍손', hanja: '重風巽', fortune: 'neutral', text: '바람이 거듭 부는 형상입니다. 부드럽게 파고들면 뜻을 이룹니다.' },
  58: { ko: '중택태', hanja: '重澤兌', fortune: 'good',    text: '못이 나란히 잇닿은 형상입니다. 기쁜 일이 있으나 말이 헤퍼지기 쉽습니다.' },
  59: { ko: '풍수환', hanja: '風水渙', fortune: 'neutral', text: '바람이 물 위를 흩는 형상입니다. 흩어지는 때이니 모을 것을 미리 정하십시오.' },
  60: { ko: '수택절', hanja: '水澤節', fortune: 'neutral', text: '못이 물을 담아 조절하는 형상입니다. 한도를 정해 두면 탈이 없습니다.' },
  61: { ko: '풍택중부', hanja: '風澤中孚', fortune: 'good', text: '알을 품은 형상입니다. 진심이 통하니 믿음으로 대하면 이롭습니다.' },
  62: { ko: '뇌산소과', hanja: '雷山小過', fortune: 'neutral', text: '새가 낮게 나는 형상입니다. 작은 일은 되나 큰 일은 무리입니다.' },
  63: { ko: '수화기제', hanja: '水火旣濟', fortune: 'good', text: '물과 불이 제자리를 얻은 형상입니다. 이룬 뒤가 더 어려우니 끝을 챙기십시오.' },
  64: { ko: '화수미제', hanja: '火水未濟', fortune: 'neutral', text: '건너기 직전의 형상입니다. 아직 이르지 않았으니 마지막 한 걸음을 신중히.' },
};

/** 동효 위치별 서술. 괘 안에서 지금 어느 자리에 있는지를 이른다. */
export const YAO_TEXT = {
  1: '초효가 동합니다. 아직 드러나지 않은 시작의 자리입니다.',
  2: '이효가 동합니다. 안에서 중심을 잡는 자리입니다.',
  3: '삼효가 동합니다. 안팎이 바뀌는 고비의 자리입니다.',
  4: '사효가 동합니다. 바깥으로 나선 조심스러운 자리입니다.',
  5: '오효가 동합니다. 가장 높고 바른 자리입니다.',
  6: '상효가 동합니다. 다 이룬 뒤 물러날 것을 생각하는 자리입니다.',
};

/**
 * 매화역수로 괘를 뽑는다.
 *
 * @param {number} jiNumber   띠의 지지수 (자=1 … 해=12)
 * @param {number} month      월
 * @param {number} day        일
 * @param {number} signNumber 별자리 번호 (양자리=1 … 물고기자리=12)
 */
/**
 * 팔괘 번호 → 세 효의 음양. 아래에서 위 순서로 [초, 중, 상], 1이 양(⚊) 0이 음(⚋).
 *
 * 선천팔괘 수 1~8(건태리진손감간곤)은 (8 - 번호)를 3자리 2진수로 쓴 것과 정확히 일치한다.
 * 건=111, 태=110, 리=101, 진=100, 손=011, 감=010, 간=001, 곤=000.
 */
function trigramLines(n) {
  return (8 - n).toString(2).padStart(3, '0').split('').map(Number);
}

export function castHexagram(jiNumber, month, day, signNumber) {
  const base = jiNumber + month + day;

  // 나머지가 0이면 8번째(곤) / 6번째 효로 본다. 매화역수의 관례다.
  const upper = base % 8 || 8;
  const lower = (base + signNumber) % 8 || 8;
  const movingLine = (base + signNumber) % 6 || 6;

  const no = HEX_TABLE[lower][upper];
  const hex = HEXAGRAMS[no];

  return {
    no,
    ko: hex.ko,
    hanja: hex.hanja,
    fortune: hex.fortune,
    fortuneLabel: FORTUNE_LABEL[hex.fortune],
    verdict: FORTUNE_VERDICT[hex.fortune],
    score: FORTUNE_SCORE[hex.fortune],
    text: hex.text,
    upper: { no: upper, ...TRIGRAMS[upper] },
    lower: { no: lower, ...TRIGRAMS[lower] },
    // 여섯 효를 아래에서 위로. 화면에서 유니코드 괘 기호 대신 직접 그리는 데 쓴다.
    // 괘 기호(U+4DC0~)는 기기별 폰트 지원이 고르지 않아 네모로 깨지는 일이 잦다.
    lines: [...trigramLines(lower), ...trigramLines(upper)],
    movingLine,
    movingText: YAO_TEXT[movingLine],
  };
}
