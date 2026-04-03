/**
 * Cloudflare Pages Function — 투표 프록시
 * 서버사이드에서 실제 IP를 해싱하여 투표 스터핑 방지
 *
 * POST /api/vote  { vote: "up"|"down" }
 *
 * 환경변수 필요: FIREBASE_DB_SECRET (Firebase Console → 프로젝트 설정 → 서비스 계정 → 데이터베이스 비밀번호)
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS
  const headers = {
    "Access-Control-Allow-Origin": "https://gongtam.com",
    "Content-Type": "application/json",
  };

  try {
    // 1. 요청 파싱
    const body = await request.json();
    const vote = body.vote;
    if (vote !== "up" && vote !== "down") {
      return new Response(JSON.stringify({ error: "invalid vote" }), { status: 400, headers });
    }

    // 2. 실제 IP에서 해시 생성 (Cloudflare가 제공하는 진짜 IP)
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(ip));
    const ipHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // 3. 날짜 (KST)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = kst.toISOString().slice(0, 10);

    // 4. Firebase에 중복 체크
    const dbUrl = "https://gongtamcom-default-rtdb.firebaseio.com";
    const auth = env.FIREBASE_DB_SECRET ? `?auth=${env.FIREBASE_DB_SECRET}` : "";

    const existing = await fetch(`${dbUrl}/votes/${dateStr}/${ipHash}.json${auth}`);
    const existingData = await existing.json();
    if (existingData) {
      // 이미 투표함 — 전체 결과 반환
      const result = await getVoteResults(dbUrl, auth, dateStr, ipHash);
      return new Response(JSON.stringify(result), { status: 200, headers });
    }

    // 5. 투표 저장
    const voteData = { vote, ts: Date.now() };
    const writeRes = await fetch(`${dbUrl}/votes/${dateStr}/${ipHash}.json${auth}`, {
      method: "PUT",
      body: JSON.stringify(voteData),
    });

    if (!writeRes.ok) {
      return new Response(JSON.stringify({ error: "write failed" }), { status: 500, headers });
    }

    // 6. 전체 결과 반환
    const result = await getVoteResults(dbUrl, auth, dateStr, ipHash);
    return new Response(JSON.stringify(result), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://gongtam.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function getVoteResults(dbUrl, auth, dateStr, myHash) {
  const snap = await fetch(`${dbUrl}/votes/${dateStr}.json${auth}`);
  const data = await snap.json();
  if (!data) return { up: 50, down: 50, my: null, total: 0 };

  let upCount = 0, downCount = 0, myVote = null;
  for (const [hash, v] of Object.entries(data)) {
    if (v.vote === "up") upCount++;
    else downCount++;
    if (hash === myHash) myVote = v.vote;
  }
  const total = upCount + downCount;
  const upPct = total > 0 ? Math.round((upCount / total) * 100) : 50;
  return { up: upPct, down: 100 - upPct, my: myVote, total };
}
