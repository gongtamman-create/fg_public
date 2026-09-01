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
