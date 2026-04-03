/**
 * Cloudflare Pages Function — 나스닥 실시간 시세 프록시
 * GET /api/nasdaq
 * Yahoo Finance에서 ^IXIC 데이터를 가져와 반환
 */
export async function onRequestGet() {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://gongtam.com",
    "Cache-Control": "public, max-age=30",
  };

  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?range=1d&interval=5m";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) {
      return new Response(JSON.stringify({ error: "no data" }), { status: 502, headers });
    }

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const changePct = prevClose ? ((price - prevClose) / prevClose * 100) : 0;
    const marketState = meta.currentTradingPeriod?.current?.timezone || "";
    const isOpen = meta.currentTradingPeriod?.regular
      ? (Date.now() / 1000 >= meta.currentTradingPeriod.regular.start && Date.now() / 1000 <= meta.currentTradingPeriod.regular.end)
      : false;

    return new Response(JSON.stringify({
      price: Math.round(price * 100) / 100,
      change_pct: Math.round(changePct * 100) / 100,
      is_open: isOpen,
    }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
