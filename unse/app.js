/**
 * 프론트엔드.
 *
 * 운세를 여기서 직접 계산한다. 일주(60)까지 넣으면 경우의 수가 8천을 넘어
 * 미리 구워 둘 수 없기 때문이다. 서버와 같은 엔진 파일을 그대로 불러 쓰므로
 * 로직이 갈라질 일은 없다.
 *
 * data.json 에는 시장 데이터와 종목 표만 담긴다.
 * 생년월일은 이 브라우저를 떠나지 않으며 localStorage 외에 남지 않는다.
 */

import { buildFortune } from './engine.js?v=c301b378';
import { stockCompatibility, compatLine } from './compat.js?v=c301b378';
import { SECTOR_KO } from './zodiac.js?v=c301b378';
import { renderShareCard } from './share.js?v=c301b378';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'fortune.birth';
const MARKET_KEY = 'fortune.market';

let DATA = null;
let TICKERS = null;   // 짧은 키를 엔진이 아는 이름으로 편 것
let CURRENT = null;   // 마지막으로 그린 운세 (공유에 쓴다)
let MARKET = 'KR';    // 인연 종목을 어느 시장에서 고를지

/* ── 유틸 ──────────────────────────────────────────── */

/** 한국은 원화 정수, 미국은 달러 소수 둘째 자리. */
const fmtPrice = (v, market) => {
  if (typeof v !== 'number') return '—';
  return market === 'KR'
    ? `₩${Math.round(v).toLocaleString('ko-KR')}`
    : `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

const fmtPct = (v) =>
  typeof v === 'number' ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—';

const signClass = (v) => (typeof v !== 'number' ? '' : v > 0 ? 'up' : v < 0 ? 'down' : '');

/** localStorage는 사생활 보호 모드 등에서 접근 자체가 throw 할 수 있다. */
function safeStore(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

/* ── 렌더 ──────────────────────────────────────────── */

function renderMarket(market) {
  const fg = market.fearGreed;
  $('fg-score').textContent = fg.score;
  $('fg-label').textContent = fg.label;
  $('fg-score').parentElement.dataset.tone = fg.tone;
  $('fg-mood').textContent = market.mood;

  $('fg-parts').innerHTML = fg.parts
    .map(
      (p) => `
      <div class="fg-part">
        <div class="fp-head"><span>${p.label}</span><b>${p.raw}</b></div>
        <div class="bar"><i style="width:${p.value.toFixed(0)}%"></i></div>
        <small>${p.desc}</small>
      </div>`
    )
    .join('');
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * 총운 점수를 0에서 세어 올리고 게이지를 함께 채운다.
 * conic-gradient 의 각도는 CSS transition 이 안 먹어서 프레임마다 직접 갱신한다.
 */
function animateScore(target) {
  const num = $('score-num');
  const gauge = $('gauge');

  if (reducedMotion()) {
    num.textContent = target;
    gauge.style.setProperty('--pct', `${target}%`);
    return;
  }

  const DURATION = 1100;
  let start = null;

  const step = (now) => {
    if (start === null) start = now;
    const t = Math.min(1, (now - start) / DURATION);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const v = target * eased;
    num.textContent = Math.round(v);
    gauge.style.setProperty('--pct', `${v}%`);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 결과 카드들을 시차를 두고 띄운다. */
function revealCards() {
  const cards = [...$('result').children].filter((el) => !el.hidden);
  cards.forEach((el, i) => {
    el.classList.add('reveal');
    // 레이아웃이 한 번 잡힌 뒤에 클래스를 붙여야 전환이 실제로 일어난다.
    requestAnimationFrame(() => {
      setTimeout(() => el.classList.add('in'), reducedMotion() ? 0 : i * 90);
    });
  });
}

/** 점수를 부호와 함께 표기. 0이면 영향 없음으로 적는다. */
const fmtScore = (v) => (v === 0 ? '영향 없음' : `${v > 0 ? '+' : ''}${v}`);

const scoreClass = (v) => (v > 0 ? 'plus' : v < 0 ? 'minus' : 'zero');

/**
 * 여섯 효를 직접 그린다. 유니코드 괘 기호(U+4DC0~)는 기기별 폰트 지원이 고르지 않아
 * 안드로이드 등에서 네모로 깨지기 때문에 쓰지 않는다.
 * lines는 아래에서 위 순서라 화면에 그릴 때 뒤집는다. 동효는 따로 표시한다.
 */
function hexagramLines(lines, movingLine) {
  return lines
    .map((v, i) => {
      const isMoving = i + 1 === movingLine;
      const cls = `yao ${v ? 'yang' : 'yin'}${isMoving ? ' moving' : ''}`;
      return `<div class="${cls}"><i></i><i></i></div>`;
    })
    .reverse()
    .join('');
}

/**
 * 오늘 닿은 세 가지를 그린다.
 *
 * 앞면에는 문장만 내보내고, 용어·각도·점수 같은 셈의 재료는 접힌 영역으로 보낸다.
 * 근거는 보여주되 계산서처럼 읽히지 않게 하려는 것이다.
 */
function renderBasis(b, total) {
  const hx = b.hexagram;

  const setVerdict = (id, word, score) => {
    $(id).textContent = word;
    $(id).className = `br-verdict ${scoreClass(score)}`;
  };

  $('hx-glyph').innerHTML = hexagramLines(hx.lines, hx.movingLine);
  $('hx-name').textContent = `${hx.ko} ${hx.hanja}`;
  $('hx-struct').textContent = `위는 ${hx.upper.nature}, 아래는 ${hx.lower.nature}`;
  $('hx-text').textContent = hx.text;
  $('hx-moving').textContent = hx.movingText;
  setVerdict('hx-verdict', hx.verdict, hx.score);

  $('god-title').textContent =
    `당신은 ${b.pillar.name}(${b.pillar.hanja})일에 태어났습니다. 오늘의 기운은 ${b.tenGod.label}(${b.tenGod.hanja}).`;
  $('god-text').textContent = b.tenGod.text;
  setVerdict('god-verdict', b.tenGod.verdict, b.tenGod.score);

  $('rel-title').textContent = `오늘은 ${b.ganji.name}(${b.ganji.hanja})의 날입니다.`;
  $('rel-text').textContent = b.dayRelation.text;
  setVerdict('rel-verdict', b.dayRelation.verdict, b.dayRelation.score);

  $('asp-title').textContent = `해는 오늘 ${b.aspect.sunSignKo}에 머뭅니다.`;
  $('asp-text').textContent = b.aspect.text;
  setVerdict('asp-verdict', b.aspect.verdict, b.aspect.score);

  // 접힌 셈법 — 여기서만 용어와 숫자를 드러낸다.
  const rows = [
    ['나', `일주 ${b.pillar.name} · 오늘 천간과 ${b.tenGod.label}`, b.tenGod.score],
    ['날', `${b.ganji.name}일 · 일지 ${b.pillar.ji}와 ${b.dayRelation.detail}`, b.dayRelation.score],
    ['띠', `${b.yearRelation.detail} · ${b.yearRelation.label}`, b.yearRelation.score],
    ['괘', `제${hx.no}괘 ${hx.ko} · ${hx.movingLine}효 동 · ${hx.fortuneLabel}`, hx.score],
    ['하늘', `${b.aspect.label}${b.aspect.key === 'none' ? '' : ` ${b.aspect.separation}°`}`, b.aspect.score],
  ];
  $('method-list').innerHTML =
    rows
      .map(
        ([tag, desc, s]) => `
        <li>
          <span class="ml-tag">${tag}</span>
          <span class="ml-desc">${desc}</span>
          <span class="ml-score ${scoreClass(s)}">${fmtScore(s)}</span>
        </li>`
      )
      .join('') +
    `<li class="ml-total">
       <span class="ml-tag">합</span>
       <span class="ml-desc">축마다 무게를 달리해 더한 값</span>
       <span class="ml-score">${total}점</span>
     </li>`;
}

/**
 * 종목 궁합 블록.
 * 상장일을 못 구한 종목은 궁합 자체가 없으므로 아무것도 그리지 않는다.
 * 없는 궁합을 지어내느니 비워 두는 편이 낫다.
 */
function compatBlock(t) {
  if (!t.compat) return '';
  const c = t.compat;
  return `
    <div class="tk-compat" data-tone="${c.tone}">
      <div class="tc-head">
        <span class="tc-title">궁합</span>
        <span class="tc-verdict"><b>${c.score}</b> · ${c.label}</span>
      </div>
      <div class="bar tc-bar"><i style="width:${c.score}%"></i></div>
      <p class="tc-line">${t.compatLine}</p>
      ${c.element.text ? `<p class="tc-elem">${c.element.text}</p>` : ''}
    </div>`;
}

/** 종목 카드 한 장. 인연 종목과 검색 결과가 같은 모양이어야 하므로 함수로 둔다. */
function tickerCard(t) {
  return `
    <li class="ticker">
      <div class="tk-top">
        <div class="tk-id">
          <b>${t.ticker}</b>
          <span>${t.name ?? ''}</span>
        </div>
        <div class="tk-price">
          <b>${fmtPrice(t.price, t.market)}</b>
          <span class="${signClass(t.chg1d)}">${fmtPct(t.chg1d)}</span>
        </div>
      </div>
      ${t.omen ? `<p class="tk-omen">${t.omen}</p>` : ''}
      ${compatBlock(t)}
      <div class="tk-meta">
        ${t.marketKo ? `<span class="tk-mkt">${t.marketKo}</span>` : ''}
        <span>${t.sectorKo}</span>
        <span>RSI ${typeof t.rsi14 === 'number' ? t.rsi14.toFixed(0) : '—'}</span>
        <span>20일 ${fmtPct(t.ret_20d)}</span>
      </div>
    </li>`;
}

function renderFortune(f) {
  $('w-emoji').textContent = f.western.emoji;
  $('w-name').textContent = f.western.ko;
  $('w-el').textContent = `${f.western.element}의 기운`;

  $('c-emoji').textContent = f.chinese.emoji;
  $('c-name').textContent = `${f.chinese.ko}띠`;
  $('c-el').textContent = `${f.chinese.element}의 기운`;

  $('gauge').dataset.band = f.band;
  animateScore(f.score);
  $('headline').textContent = f.headline;
  $('advice').textContent = f.advice;

  for (const [k, id] of [['wealth', 'wealth'], ['timing', 'timing'], ['insight', 'insight']]) {
    $(`bar-${id}`).style.width = `${f.detail[k]}%`;
    $(`num-${id}`).textContent = f.detail[k];
  }

  $('lk-num').textContent = f.lucky.number;
  $('lk-color').textContent = f.lucky.color;
  $('lk-time').textContent = f.lucky.time;

  renderBasis(f.basis, f.score);

  $('sector-line').textContent =
    `오늘 당신의 기운과 맞닿은 분야: ${f.sectors.map((s) => s.ko).join(' · ')}`;

  // 한국과 미국은 장 마감일이 달라 기준일이 갈린다. 보고 있는 시장의 날짜를 적는다.
  $('data-date').textContent =
    (MARKET === 'KR' ? DATA.krDate : DATA.date) ?? f.date;

  $('tickers').innerHTML = f.tickers.map(tickerCard).join('');

  $('input-card').hidden = true;
  for (const el of $('result').children) el.classList.remove('reveal', 'in');
  $('result').hidden = false;
  for (const el of document.querySelectorAll('.ad-slot')) el.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  revealCards();
}


/* ── 내 종목 궁합 ──────────────────────────────────── */

/**
 * 티커 또는 회사 이름으로 종목을 찾는다.
 * 티커 완전 일치를 가장 앞에 두고, 그다음 이름이 그 말로 시작하는 것,
 * 마지막으로 이름 어딘가에 들어 있는 것 순으로 최대 3개까지 돌려준다.
 */
function findTickers(query, limit = 3) {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const exact = [];
  const starts = [];
  const contains = [];

  for (const t of TICKERS) {
    const tk = t.ticker.toUpperCase();
    const nm = (t.name ?? '').toUpperCase();
    if (tk === q) exact.push(t);
    else if (tk.startsWith(q) || nm.startsWith(q)) starts.push(t);
    else if (nm.includes(q)) contains.push(t);
  }
  return [...exact, ...starts, ...contains].slice(0, limit);
}

function runLookup(query) {
  const msg = $('lookup-msg');
  const list = $('lookup-result');

  if (!CURRENT) return;

  const found = findTickers(query);
  if (!found.length) {
    list.innerHTML = '';
    msg.textContent = `'${query}' 로는 찾지 못했습니다. S&P 500 종목만 담고 있습니다.`;
    msg.hidden = false;
    return;
  }

  msg.hidden = true;
  const { jiIndex, element } = CURRENT.self;

  list.innerHTML = found
    .map((t) => {
      const compat = stockCompatibility(jiIndex, element, DATA.ipo?.[t.ticker], t.sector);
      return tickerCard({
        ...t,
        sectorKo: SECTOR_KO[t.sector] ?? t.sector,
        marketKo: t.market === 'KR' ? '한국' : '미국',
        compat,
        compatLine: compatLine(compat, CURRENT.chinese.ko),
      });
    })
    .join('');

  // 상장일이 없어 궁합을 못 낸 경우를 알려 준다. 조용히 빈 카드가 나가면 고장으로 보인다.
  if (found.every((t) => !DATA.ipo?.[t.ticker])) {
    msg.textContent = '이 종목은 상장일을 구하지 못해 궁합을 낼 수 없습니다.';
    msg.hidden = false;
  }
}

/* ── 동작 ──────────────────────────────────────────── */

/** 전송량을 줄이려고 짧게 줄여 둔 키를 엔진이 아는 이름으로 되돌린다. */
const expandTicker = (r) => ({
  ticker: r.t, name: r.n, sector: r.s, market: r.m ?? 'US', candidate: r.b === 1,
  price: r.p, chg1d: r.c, rsi14: r.rsi, trend: r.tr, cross: r.x,
  ret_20d: r.r20, pct_from_high52: r.ph, pct_from_low52: r.pl,
  vol_ratio: r.v, rs_rank: r.rs,
});

function show(birthStr) {
  if (!DATA) return;
  const [y, m, d] = birthStr.split('-').map(Number);
  if (!y || !m || !d) return;

  CURRENT = buildFortune({ y, m, d }, DATA.date, TICKERS, DATA.ipo ?? {}, MARKET);
  safeStore(() => localStorage.setItem(STORE_KEY, birthStr));
  renderFortune(CURRENT);
}

async function init() {
  // 날짜를 붙여 캐시를 우회한다. 자정 이후 낡은 결과가 남는 것을 막는다.
  const res = await fetch(`./data.json?v=${new Date().toISOString().slice(0, 10)}`);
  DATA = await res.json();

  TICKERS = DATA.tickers.map(expandTicker);

  // 티커 자동완성 목록. 517개라 한 번에 넣어도 부담이 없다.
  $('ticker-list').innerHTML = TICKERS
    .map((t) => `<option value="${t.ticker}">${(t.name ?? '').replace(/"/g, '&quot;')}</option>`)
    .join('');

  $('asof').textContent = `${DATA.date} 기준`;
  renderMarket(DATA.market);

  // 데이터가 다 실린 뒤에야 버튼을 연다.
  const btn = $('submit-btn');
  btn.disabled = false;
  btn.textContent = '운세 보기';

  const savedMarket = safeStore(() => localStorage.getItem(MARKET_KEY));
  if (savedMarket === 'US' || savedMarket === 'KR') {
    MARKET = savedMarket;
    for (const b of $('market-tabs').children) b.classList.toggle('active', b.dataset.market === MARKET);
  }

  const saved = safeStore(() => localStorage.getItem(STORE_KEY));
  if (saved) {
    $('birth').value = saved;
    show(saved);
  }
}

$('birth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  show($('birth').value);
});

$('market-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.mkt');
  if (!btn || btn.dataset.market === MARKET) return;

  MARKET = btn.dataset.market;
  for (const b of $('market-tabs').children) b.classList.toggle('active', b === btn);
  safeStore(() => localStorage.setItem(MARKET_KEY, MARKET));

  // 시장이 바뀌면 인연 종목이 달라진다. 운세 자체는 그대로이므로 다시 계산해 덮어 그린다.
  if (CURRENT) show($('birth').value);
});

$('lookup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  runLookup($('lookup').value);
});

$('again-btn').addEventListener('click', () => {
  $('lookup').value = '';
  $('lookup-result').innerHTML = '';
  $('lookup-msg').hidden = true;
  $('result').hidden = true;
  $('input-card').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('share-btn').addEventListener('click', async () => {
  const f = CURRENT;
  if (!f) return;

  const btn = $('share-btn');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '이미지 만드는 중…';

  const text = `[오늘의 투자 운세] ${f.western.ko} × ${f.chinese.ko}띠 — ${f.score}점
${f.headline}`;
  const url = location.origin + location.pathname;

  try {
    const blob = await renderShareCard(f);
    const file = new File([blob], 'today-fortune.jpg', { type: 'image/jpeg' });

    // 1순위: 이미지를 그대로 공유. 카톡·인스타에 결과가 그림으로 올라간다.
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, url });
      return;
    }

    // 2순위: 이미지 저장. 공유 시트가 없는 데스크톱 브라우저용.
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = '오늘의운세.jpg';
    a.click();
    URL.revokeObjectURL(href);
    btn.textContent = '이미지를 저장했습니다';
    setTimeout(() => { btn.textContent = label; }, 2000);
    return;
  } catch (e) {
    if (e?.name === 'AbortError') return; // 사용자가 공유를 취소한 것
    console.error(e);
  } finally {
    btn.disabled = false;
    if (btn.textContent === '이미지 만드는 중…') btn.textContent = label;
  }

  // 3순위: 이미지가 안 되면 글이라도 남긴다.
  try {
    await navigator.clipboard.writeText(`${text}
${url}`);
    btn.textContent = '내용을 복사했습니다';
    setTimeout(() => { btn.textContent = label; }, 2000);
  } catch { /* 무시 */ }
});

init().catch((e) => {
  console.error(e);
  const btn = $('submit-btn');
  btn.disabled = true;
  btn.textContent = '불러오지 못했습니다';
  $('input-card').insertAdjacentHTML(
    'beforeend',
    '<p class="err">데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>'
  );
});
