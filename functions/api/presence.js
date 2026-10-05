/**
 * Cloudflare Pages Function — 접속자 presence (2026-10-05 신설)
 *
 * GET  /api/presence                      → { count }                 읽기 전용(등록 안 함)
 * POST /api/presence  {}                  → { ok, count, banned }     하트비트 = 등록/갱신
 * POST /api/presence  {"leave":true}      → { ok }                    즉시 퇴장(pagehide 비콘)
 * 본문은 text/plain 으로 보낸다 — 단순 요청이라 교차 오리진(redalert.red)에서도 preflight 가 없고
 * navigator.sendBeacon 과 호환된다. 서버는 Content-Type 과 무관하게 본문을 JSON 으로 해석한다.
 *
 * [왜 서버로 옮겼나]
 * 이전: 브라우저가 presence/<sha256(ip)> 에 직접 set + onDisconnect().remove(), 규칙 .write:true.
 *   ① 누구나 임의 키를 무제한 생성 가능 — 2026-10-05 실측, 라이브 노드에 'test123' 같은 쓰레기 키가 있었다
 *   ② .read:true 라 키(IP 해시) 전체가 공개 — messages.ip 와 대조하면 "누가 지금 접속 중"이 보였다
 *   ③ 해시가 키 없는 SHA-256 이라 역산 가능 (functions/_lib/shared.js 참조)
 * 지금: 서버가 CF-Connecting-IP 를 HMAC 해시해 presence/<hash> = 마지막 하트비트 시각(ms) 으로 기록한다.
 *   규칙은 .read/.write 모두 false — DB 시크릿으로만 접근하고, 클라이언트는 숫자(count)만 받는다.
 *
 * [onDisconnect 대체 = 하트비트 + TTL]
 * REST 에는 onDisconnect 가 없다. 클라이언트가 HEARTBEAT(45초)마다 POST 하고, 서버는 TTL(120초)보다
 * 오래 조용한 항목을 하트비트 처리 중에 정리한다(PATCH null). 탭 종료는 pagehide 에서 leave 비콘.
 * 백그라운드 탭의 타이머는 브라우저가 1분까지 늦추므로 TTL 은 하트비트의 2배 이상으로 둔다.
 * 숫자가 아닌 값(구 클라이언트의 true, 쓰레기 키)은 전부 stale 로 간주해 자동 정리된다.
 *
 * [남용 방지] 같은 해시의 하트비트가 MIN_INTERVAL(10초)보다 잦으면 429 (쓰기 없음). count 는 429 에도
 * 실어 준다 — 같은 IP 의 여러 탭이 서로 429 를 맞아도 표시가 멈추지 않게.
 * 본문 1KB 초과 → 413.
 *
 * 환경변수 필요: FIREBASE_DB_SECRET (chat.js · vote.js 와 동일 키). 미설정 → 500 (조용한 무시 금지).
 */
import { DB_URL, ROOMS, jsonHeaders, preflight, dbAuth, ipHash } from "../_lib/shared.js";

const TTL_MS = 120_000;
const MIN_INTERVAL_MS = 10_000;
const MAX_BODY = 1024;
const MAX_PRUNE = 200; // 한 번의 PATCH 로 지우는 stale 키 상한 — 나머지는 다음 하트비트가 이어서 정리

/** 하트비트 노드 → { live: 살아있는 키 수, stale: 정리 대상 키[] , mine: 내 마지막 하트비트(ms)|null } */
function scan(data, now, myHash) {
  const out = { live: 0, stale: [], mine: null };
  if (!data || typeof data !== "object") return out;
  for (const [key, val] of Object.entries(data)) {
    const fresh = typeof val === "number" && Number.isFinite(val) && now - val <= TTL_MS && val <= now + 60_000;
    if (fresh) out.live += 1;
    else if (out.stale.length < MAX_PRUNE) out.stale.push(key);
    if (key === myHash && typeof val === "number") out.mine = val;
  }
  return out;
}

async function readNode(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("db read failed");
  return res.json();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = jsonHeaders(request);
  const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers });
  try {
    const auth = dbAuth(env);
    if (!auth) return fail(500, "server misconfigured");
    const room = new URL(request.url).searchParams.get("room") || "gongtam";
    const paths = ROOMS[room];
    if (!paths) return fail(400, "bad room");
    const data = await readNode(`${DB_URL}/${paths.presence}.json${auth}`);
    const { live } = scan(data, Date.now(), null);
    return new Response(JSON.stringify({ count: live }), { status: 200, headers });
  } catch (e) {
    return fail(502, e.message);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = jsonHeaders(request);
  const fail = (status, error, extra) =>
    new Response(JSON.stringify({ error, ...(extra || {}) }), { status, headers });

  try {
    const auth = dbAuth(env);
    if (!auth) return fail(500, "server misconfigured");

    // ── 본문 (text/plain 로 와도 JSON 으로 해석; 빈 본문 = {}) ──
    const raw = await request.text();
    if (raw.length > MAX_BODY) return fail(413, "body too large");
    let body = {};
    if (raw.trim()) {
      try { body = JSON.parse(raw); } catch { return fail(400, "bad body"); }
      if (!body || typeof body !== "object") return fail(400, "bad body");
    }
    const room = String(body.room ?? "gongtam");
    const paths = ROOMS[room];
    if (!paths) return fail(400, "bad room");

    const hash = await ipHash(request, env);
    const nodeUrl = `${DB_URL}/${paths.presence}.json${auth}`;
    const mineUrl = `${DB_URL}/${paths.presence}/${hash}.json${auth}`;

    // ── 퇴장 (pagehide 비콘) ──
    if (body.leave === true) {
      const del = await fetch(mineUrl, { method: "DELETE" });
      if (!del.ok) return fail(502, "db write failed");
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    // ── 하트비트 ──
    const now = Date.now();
    const data = await readNode(nodeUrl);
    const { live, stale, mine } = scan(data, now, hash);
    const alreadyLive = mine !== null && now - mine <= TTL_MS;

    if (mine !== null && now - mine < MIN_INTERVAL_MS) {
      // 너무 잦음 — 쓰기 없이 현재 수만 돌려준다(이 요청자는 이미 live 에 포함)
      return fail(429, "cooldown", { count: live });
    }

    const put = await fetch(mineUrl, { method: "PUT", body: JSON.stringify(now) });
    if (!put.ok) return fail(502, "db write failed");

    if (stale.length) {
      const patch = {};
      for (const k of stale) patch[k] = null;
      // 정리 실패는 치명적이지 않다(다음 하트비트가 다시 시도) — 응답은 그대로 간다
      await fetch(nodeUrl, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => {});
    }

    // 밴 표시용(UX). 실제 전송 차단은 /api/chat 가 전송할 때마다 다시 판정한다.
    let banned = false;
    try {
      const banRes = await fetch(`${DB_URL}/bans/${hash}.json${auth}`);
      banned = banRes.ok && Boolean(await banRes.json());
    } catch { /* 밴 조회 실패 → false (전송 시 서버가 어차피 막는다) */ }

    const count = live + (alreadyLive ? 0 : 1);
    return new Response(JSON.stringify({ ok: true, count, banned }), { status: 200, headers });
  } catch (e) {
    return fail(e.message === "server misconfigured" ? 500 : 502, e.message);
  }
}

export async function onRequestOptions(context) {
  return preflight(context.request, "GET, POST, OPTIONS");
}
