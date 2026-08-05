/**
 * Cloudflare Pages Function — 채팅 전송 프록시 (2026-08-05 신설)
 *
 * POST /api/chat  { text: string, nick: string }
 *
 * [왜 서버를 거치는가]
 * 이전 구조는 브라우저가 Firebase에 직접 쓰면서 **자기 IP를 자기가 신고**했다:
 *   api.ipify.org로 내 IP 조회 → 내가 SHA-256 → 내가 bans/<hash> 조회 → 내가 입력창 숨김
 * 전 단계가 클라이언트라 ① ipify 요청만 막거나 ② 콘솔에서 db.ref("messages").push()를
 * 직접 호출하면 밴이 그대로 뚫렸다. 메시지의 ip 필드도 클라이언트 값이라 임의 해시를
 * 보내면 밴 대상 자체가 어긋났다. 설계 문서의 "새로고침해도 우회 불가"는 성립하지 않았다.
 *
 * 여기서는 Cloudflare가 주는 CF-Connecting-IP를 서버가 해싱하므로 클라이언트가 거짓말할
 * 수 없다. /api/vote가 투표 스터핑을 막으려고 쓰던 것과 동일한 패턴이다.
 *
 * [이 함수가 서버에서 강제하는 것 — 전부 클라이언트에서는 우회 가능했던 것들]
 *   · 밴 여부 (실제 IP 해시 기준)
 *   · 쿨다운 5초 (chat_rate/<ipHash>)
 *   · 길이 1~20자
 *   · 금칙어 (assets/banned-words.json SSOT)
 *   · admin=false 고정 — 관리자 사칭 원천 차단. 관리자 메시지는 이 경로를 쓰지 않고
 *     Firebase Auth로 직접 쓴다(규칙이 auth.uid로 검증).
 *
 * 환경변수 필요: FIREBASE_DB_SECRET (vote.js와 동일 키)
 *   미설정 시 규칙에 막혀 쓰기가 실패한다 → 500 반환(조용한 무시 금지).
 */
import BANNED from "../../assets/banned-words.json";

const DB_URL = "https://gongtamcom-default-rtdb.firebaseio.com";
const ORIGIN = "https://gongtam.com";
const MAX_MSG_LEN = 20;
const MAX_NICK_LEN = 30;
const COOLDOWN_MS = 5000;
const ADMIN_NICK = "살충제";

const headers = { "Access-Control-Allow-Origin": ORIGIN, "Content-Type": "application/json" };
const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers });

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function containsBannedWord(text) {
  const lower = text.toLowerCase();
  return (BANNED.words || []).some((w) => lower.includes(String(w).toLowerCase()));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => null);
    if (!body) return fail(400, "bad body");

    const text = String(body.text ?? "").trim();
    const nick = String(body.nick ?? "").trim();

    // ── 입력 검증 (클라이언트 검사는 UX일 뿐, 여기가 정본) ──
    if (text.length < 1 || text.length > MAX_MSG_LEN) return fail(400, "length");
    if (nick.length < 1 || nick.length > MAX_NICK_LEN) return fail(400, "nick");
    // 관리자 닉 사칭 차단 — 관리자는 이 경로를 쓰지 않는다
    if (nick === ADMIN_NICK) return fail(403, "reserved nick");
    if (containsBannedWord(text)) return fail(400, "banned word");

    // ── 실제 IP 해시 (클라이언트가 위조 불가) ──
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipHash = await sha256Hex(ip);

    const auth = env.FIREBASE_DB_SECRET ? `?auth=${env.FIREBASE_DB_SECRET}` : "";
    if (!env.FIREBASE_DB_SECRET) return fail(500, "server misconfigured");

    // ── 밴 확인 (서버 기준) ──
    const banRes = await fetch(`${DB_URL}/bans/${ipHash}.json${auth}`);
    if (banRes.ok && (await banRes.json())) return fail(403, "banned");

    // ── 쿨다운 (서버 기준) ──
    const now = Date.now();
    const rateRes = await fetch(`${DB_URL}/chat_rate/${ipHash}.json${auth}`);
    if (rateRes.ok) {
      const last = Number(await rateRes.json()) || 0;
      const waited = now - last;
      if (waited < COOLDOWN_MS) {
        return new Response(
          JSON.stringify({ error: "cooldown", retry_in: Math.ceil((COOLDOWN_MS - waited) / 1000) }),
          { status: 429, headers }
        );
      }
    }

    // ── 메시지 저장 (admin은 항상 false — 사칭 차단) ──
    const writeRes = await fetch(`${DB_URL}/messages.json${auth}`, {
      method: "POST",
      body: JSON.stringify({ nick, text, ts: now, ip: ipHash, admin: false }),
    });
    if (!writeRes.ok) return fail(500, "write failed");

    // 쿨다운 타임스탬프 갱신은 저장 성공 후에만 — 실패한 요청이 사용자를 묶지 않게 한다
    await fetch(`${DB_URL}/chat_rate/${ipHash}.json${auth}`, { method: "PUT", body: JSON.stringify(now) });

    return new Response(JSON.stringify({ ok: true, ts: now }), { status: 200, headers });
  } catch (e) {
    return fail(500, e.message);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
