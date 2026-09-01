/**
 * 프론트엔드.
 *
 * 서버가 없으므로 하는 일은 단순하다:
 *   data.json(144개 조합 전부)을 받아두고, 생년월일로 조합 키를 만들어 꺼내 그린다.
 *   생년월일은 절대 네트워크로 나가지 않으며 localStorage에만 남는다.
 */

import { getWesternZodiac, getChineseZodiac } from './zodiac.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'fortune.birth';

let DATA = null;

/* ── 유틸 ──────────────────────────────────────────── */

const fmtPrice = (v) =>
  typeof v === 'number' ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—';

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

  $('rel-title').textContent = `오늘은 ${b.ganji.name}(${b.ganji.hanja})의 날입니다.`;
  $('rel-text').textContent = b.relation.text;
  setVerdict('rel-verdict', b.relation.verdict, b.relation.score);

  $('asp-title').textContent = `해는 오늘 ${b.aspect.sunSignKo}에 머뭅니다.`;
  $('asp-text').textContent = b.aspect.text;
  setVerdict('asp-verdict', b.aspect.verdict, b.aspect.score);

  // 접힌 셈법 — 여기서만 용어와 숫자를 드러낸다.
  const rows = [
    ['괘', `제${hx.no}괘 ${hx.ko} · ${hx.movingLine}효 동 · ${hx.fortuneLabel}`, hx.score],
    ['날', `${b.ganji.name}일 · ${b.relation.detail} · ${b.relation.label}`, b.relation.score],
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
       <span class="ml-desc">기본 50에 위 셋을 더한 값</span>
       <span class="ml-score">${total}점</span>
     </li>`;
}

function renderFortune(f) {
  $('w-emoji').textContent = f.western.emoji;
  $('w-name').textContent = f.western.ko;
  $('w-el').textContent = `${f.western.element}의 기운`;

  $('c-emoji').textContent = f.chinese.emoji;
  $('c-name').textContent = `${f.chinese.ko}띠`;
  $('c-el').textContent = `${f.chinese.element}의 기운`;

  $('score-num').textContent = f.score;
  $('gauge').dataset.band = f.band;
  // 원형 게이지: 점수만큼 채운다.
  $('gauge').style.setProperty('--pct', `${f.score}%`);
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

  $('tickers').innerHTML = f.tickers
    .map(
      (t) => `
      <li class="ticker">
        <div class="tk-top">
          <div class="tk-id">
            <b>${t.ticker}</b>
            <span>${t.name ?? ''}</span>
          </div>
          <div class="tk-price">
            <b>${fmtPrice(t.price)}</b>
            <span class="${signClass(t.chg1d)}">${fmtPct(t.chg1d)}</span>
          </div>
        </div>
        <p class="tk-omen">${t.omen}</p>
        <div class="tk-meta">
          <span>${t.sectorKo}</span>
          <span>RSI ${typeof t.rsi14 === 'number' ? t.rsi14.toFixed(0) : '—'}</span>
          <span>20일 ${fmtPct(t.ret_20d)}</span>
        </div>
      </li>`
    )
    .join('');

  $('data-date').textContent = f.date;
  $('input-card').hidden = true;
  $('result').hidden = false;
  for (const el of document.querySelectorAll('.ad-slot')) el.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── 동작 ──────────────────────────────────────────── */

function show(birthStr) {
  if (!DATA) return;
  const [y, m, d] = birthStr.split('-').map(Number);
  if (!y || !m || !d) return;

  const w = getWesternZodiac(m, d);
  const c = getChineseZodiac(y, m, d);
  const f = DATA.combos[`${w.id}-${c.id}`];
  if (!f) return;

  safeStore(() => localStorage.setItem(STORE_KEY, birthStr));
  renderFortune(f);
}

async function init() {
  // 날짜를 붙여 캐시를 우회한다. 자정 이후 낡은 결과가 남는 것을 막는다.
  const res = await fetch(`./data.json?v=${new Date().toISOString().slice(0, 10)}`);
  DATA = await res.json();

  $('asof').textContent = `${DATA.date} 기준`;
  renderMarket(DATA.market);

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

$('again-btn').addEventListener('click', () => {
  $('result').hidden = true;
  $('input-card').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('share-btn').addEventListener('click', async () => {
  const f = DATA?.combos[
    (() => {
      const [y, m, d] = $('birth').value.split('-').map(Number);
      return `${getWesternZodiac(m, d).id}-${getChineseZodiac(y, m, d).id}`;
    })()
  ];
  if (!f) return;

  const text = `[오늘의 투자 운세] ${f.western.ko} × ${f.chinese.ko}띠 — ${f.score}점\n${f.headline}`;
  const url = location.origin + location.pathname;

  if (navigator.share) {
    try { await navigator.share({ title: '오늘의 투자 운세', text, url }); return; } catch { /* 취소 */ }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    const b = $('share-btn');
    const old = b.textContent;
    b.textContent = '복사되었습니다';
    setTimeout(() => { b.textContent = old; }, 1600);
  } catch { /* 무시 */ }
});

init().catch((e) => {
  console.error(e);
  $('input-card').insertAdjacentHTML(
    'beforeend',
    '<p class="err">데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>'
  );
});
