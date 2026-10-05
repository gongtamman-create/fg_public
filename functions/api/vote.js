/**
 * Cloudflare Pages Function — 투표 프록시
 * 서버사이드에서 실제 IP를 해싱하여 투표 스터핑 방지
 *
 * POST /api/vote  { vote: "up"|"down" }
 *
 * [IP 해시 (2026-10-05)] 키 없는 SHA-256 → HMAC-SHA256(FIREBASE_DB_SECRET). votes/<날짜>/<해시> 키가
 * 공개 읽기(.read:true — 결과 집계를 클라이언트가 직접 읽는다)라 키 없는 해시는 IP 역산이 가능했다.
 * 구현·귀결(구 해시 키와 불일치)은 _lib/shared.js 참조. 날짜가 바뀌면 자연히 새 키 공간이다.
 * 규칙: votes 클라이언트 .write 는 false — 쓰기는 이 함수가 DB 시크릿으로만 한다.
 *
 * 환경변수 필요: FIREBASE_DB_SECRET (Firebase Console → 프로젝트 설정 → 서비스 계정 → 데이터베이스 비밀번호)
 *   미설정 → 500 (구 코드는 auth 없이 시도해 규칙에 막혀 "write failed"로 보였다 — 원인을 드러낸다)
 */
import { DB_URL, jsonHeaders, preflight, dbAuth, ipHash } from "../_lib/shared.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = jsonHeaders(request);
  const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers });

  try {
    // 1. 요청 파싱
    const body = await request.json().catch(() => null);
    const vote = body && body.vote;
    if (vote !== "up" && vote !== "down") return fail(400, "invalid vote");

    const auth = dbAuth(env);
    if (!auth) return fail(500, "server misconfigured");

    // 2. 실제 IP 해시 (Cloudflare가 제공하는 진짜 IP, HMAC)
    const hash = await ipHash(request, env);

    // 3. 날짜 (KST)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = kst.toISOString().slice(0, 10);

    // 4. 중복 체크
    const existing = await fetch(`${DB_URL}/votes/${dateStr}/${hash}.json${auth}`);
    const existingData = existing.ok ? await existing.json() : null;
    if (existingData) {
      // 이미 투표함 — 전체 결과 반환
      const result = await getVoteResults(auth, dateStr, hash);
      return new Response(JSON.stringify(result), { status: 200, headers });
    }

    // 5. 투표 저장
    const writeRes = await fetch(`${DB_URL}/votes/${dateStr}/${hash}.json${auth}`, {
      method: "PUT",
      body: JSON.stringify({ vote, ts: Date.now() }),
    });
    if (!writeRes.ok) return fail(500, "write failed");

    // 6. 전체 결과 반환
    const result = await getVoteResults(auth, dateStr, hash);
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (e) {
    return fail(500, e.message);
  }
}

// CORS preflight
export async function onRequestOptions(context) {
  return preflight(context.request, "POST, OPTIONS");
}

async function getVoteResults(auth, dateStr, myHash) {
  const snap = await fetch(`${DB_URL}/votes/${dateStr}.json${auth}`);
  const data = snap.ok ? await snap.json() : null;
  if (!data || typeof data !== "object") return { up: 50, down: 50, my: null, total: 0 };

  let upCount = 0, downCount = 0, myVote = null;
  for (const [hash, v] of Object.entries(data)) {
    if (!v || typeof v !== "object") continue;
    if (v.vote === "up") upCount++;
    else downCount++;
    if (hash === myHash) myVote = v.vote;
  }
  const total = upCount + downCount;
  const upPct = total > 0 ? Math.round((upCount / total) * 100) : 50;
  return { up: upPct, down: 100 - upPct, my: myVote, total };
}
