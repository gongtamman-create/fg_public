/**
 * 결과를 이미지 한 장으로 그린다.
 *
 * 링크만 공유하면 og.png 가 뜨는데, 그건 누구에게나 같은 그림이라 자랑할 거리가 없다.
 * 여기서는 그 사람의 오늘 결과를 그대로 담아 이미지로 만든다.
 *
 * 서버가 없으므로 캔버스로 그려 그 자리에서 파일을 만든다.
 * 카톡·인스타에 잘 맞는 4:5 비율(1080×1350)을 쓴다.
 *
 * JPEG 으로 내보낸다. 배경을 꽉 채워 그리므로 투명도가 필요 없고,
 * 같은 그림이 PNG 797KB / JPEG(92%) 117KB 였다. WebP 는 더 작지만
 * 메신저마다 처리가 달라 공유용으로는 JPEG 이 무난하다.
 */

const W = 1080;
const H = 1350;
const PAD = 76;

const C = {
  bg: '#0b0d17',
  card: '#161a2c',
  line: '#272d4c',
  text: '#eceef8',
  text2: '#c8cee6',
  muted: '#8f97bd',
  faint: '#5a6288',
  gold: '#f2cd82',
  goldHi: '#ffdf9e',
  goldDim: '#b08d4c',
  up: '#ff6b6b',
  down: '#5aa9f0',
};

const FONT = `'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo',
  'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif`;

const f = (size, weight = 400) => `${weight} ${size}px ${FONT}`;

/** 네 갈래 별. 폰트에 ✦ 글리프가 없는 기기가 있어 직접 그린다. */
function sparkle(g, cx, cy, r, color) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 - 90) * Math.PI / 180;
    const rad = i % 2 === 0 ? r : r * 0.26;
    const x = cx + rad * Math.cos(a);
    const y = cy + rad * Math.sin(a);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

/** 주어진 폭에 맞춰 줄을 나눈다. 한국어는 어절 단위로 끊는다. */
function wrap(g, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 여섯 효를 그린다. lines 는 아래에서 위 순서. */
function hexagram(g, x, y, w, lines, movingLine) {
  const bh = 9;
  const gap = 9;
  [...lines].reverse().forEach((v, i) => {
    const yy = y + i * (bh + gap);
    const idx = 6 - i; // 위에서부터 그리므로 효 번호는 거꾸로
    g.fillStyle = idx === movingLine ? C.goldHi : C.goldDim;
    if (v) {
      roundRect(g, x, yy, w, bh, 3);
      g.fill();
    } else {
      const half = (w - 18) / 2;
      roundRect(g, x, yy, half, bh, 3);
      g.fill();
      roundRect(g, x + w - half, yy, half, bh, 3);
      g.fill();
    }
  });
}

const fmtPrice = (v, market) =>
  typeof v !== 'number'
    ? '—'
    : market === 'KR'
      ? `₩${Math.round(v).toLocaleString('ko-KR')}`
      : `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * 결과 카드를 그려 JPEG Blob 으로 돌려준다.
 * @param {object} fortune buildFortune() 결과
 */
export async function renderShareCard(fortune) {
  // 웹폰트가 아직 안 실려 있으면 시스템 폰트로 그려져 화면과 달라 보인다.
  try { await document.fonts?.ready; } catch { /* 무시 */ }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  // 배경
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  const glow = g.createRadialGradient(W * 0.5, -120, 40, W * 0.5, -120, 900);
  glow.addColorStop(0, 'rgba(126,110,214,.42)');
  glow.addColorStop(1, 'rgba(126,110,214,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // 별 — 위치를 날짜로 고정해 같은 날 같은 그림이 나오게 한다.
  let seed = 0;
  for (const ch of fortune.date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 0.8 + rnd() * 1.5;
    g.fillStyle = `rgba(255,255,255,${(0.15 + rnd() * 0.45).toFixed(2)})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  let y = PAD + 16;

  // 머리말
  sparkle(g, PAD + 14, y + 14, 17, C.gold);
  g.fillStyle = C.gold;
  g.font = f(31, 700);
  g.textAlign = 'left';
  g.fillText('오늘의 투자 운세', PAD + 42, y + 25);

  g.fillStyle = C.faint;
  g.font = f(24, 500);
  g.textAlign = 'right';
  g.fillText(fortune.date, W - PAD, y + 25);
  g.textAlign = 'left';

  y += 92;

  // 별자리 × 띠
  g.textAlign = 'center';
  g.font = f(60);
  g.fillText(fortune.western.emoji, W / 2 - 150, y + 56);
  g.fillText(fortune.chinese.emoji, W / 2 + 150, y + 56);
  g.fillStyle = C.muted;
  g.font = f(30, 500);
  g.fillText('×', W / 2, y + 46);

  g.fillStyle = C.text;
  g.font = f(30, 700);
  g.fillText(fortune.western.ko, W / 2 - 150, y + 106);
  g.fillText(`${fortune.chinese.ko}띠`, W / 2 + 150, y + 106);

  y += 168;

  // 총운
  g.fillStyle = C.goldHi;
  g.font = f(150, 800);
  g.fillText(String(fortune.score), W / 2, y + 118);
  g.fillStyle = C.muted;
  g.font = f(30, 500);
  g.fillText('점', W / 2 + g.measureText(String(fortune.score)).width / 2 + 92, y + 118);

  y += 168;

  g.fillStyle = C.text;
  g.font = f(42, 700);
  for (const line of wrap(g, fortune.headline, W - PAD * 2 - 40)) {
    g.fillText(line, W / 2, y);
    y += 56;
  }

  y += 30;
  g.textAlign = 'left';

  // 근거 — 괘와 일주
  const b = fortune.basis;
  g.strokeStyle = C.line;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(PAD, y);
  g.lineTo(W - PAD, y);
  g.stroke();
  y += 46;

  hexagram(g, PAD, y - 6, 96, b.hexagram.lines, b.hexagram.movingLine);

  g.fillStyle = C.text;
  g.font = f(32, 700);
  g.fillText(`${b.hexagram.ko} ${b.hexagram.hanja}`, PAD + 128, y + 22);
  g.fillStyle = C.muted;
  g.font = f(25, 500);
  g.fillText(
    `${b.pillar.name}일생 · 오늘 ${b.tenGod.label} · ${b.hexagram.verdict}`,
    PAD + 128, y + 62
  );

  y += 128;

  g.strokeStyle = C.line;
  g.beginPath();
  g.moveTo(PAD, y);
  g.lineTo(W - PAD, y);
  g.stroke();
  y += 44;

  // 인연 종목
  g.fillStyle = C.gold;
  g.font = f(24, 800);
  g.fillText('오늘 인연이 닿은 종목', PAD, y);
  y += 30;

  for (const t of fortune.tickers.slice(0, 3)) {
    roundRect(g, PAD, y, W - PAD * 2, 108, 18);
    g.fillStyle = 'rgba(255,255,255,.035)';
    g.fill();
    g.strokeStyle = C.line;
    g.lineWidth = 2;
    g.stroke();

    g.fillStyle = C.text;
    g.font = f(32, 700);
    g.fillText(t.ticker, PAD + 26, y + 44);

    g.fillStyle = C.faint;
    g.font = f(23, 500);
    const nm = (t.name ?? '').slice(0, 22);
    g.fillText(nm, PAD + 26, y + 78);

    g.textAlign = 'right';
    g.fillStyle = C.text;
    g.font = f(29, 700);
    g.fillText(fmtPrice(t.price, t.market), W - PAD - 26, y + 44);

    if (t.compat) {
      g.fillStyle = t.compat.score >= 62 ? C.goldHi : t.compat.score >= 42 ? C.muted : C.down;
      g.font = f(24, 600);
      g.fillText(`궁합 ${t.compat.score} · ${t.compat.label}`, W - PAD - 26, y + 78);
    }
    g.textAlign = 'left';

    y += 124;
  }

  // 꼬리말
  g.fillStyle = C.goldDim;
  g.font = f(26, 700);
  g.textAlign = 'center';
  g.fillText('gongtam.com/unse', W / 2, H - PAD + 6);
  g.fillStyle = C.faint;
  g.font = f(19, 500);
  g.fillText('오락 목적이며 투자 자문이 아닙니다', W / 2, H - PAD + 40);

  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92));
}
