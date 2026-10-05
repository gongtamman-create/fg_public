/**
 * Pages Functions 공용 모듈 (2026-10-05 신설) — functions/api/* 가 전부 여기서 가져다 쓴다.
 *
 * [왜 한 곳인가]
 * IP 해시·CORS 허용 목록·DB 주소·방 경로가 chat.js / vote.js 에 각각 복제돼 있었다.
 * 해시 방식을 바꾸는 변경이 두 파일을 따로 고쳐야 하는 구조였고, 한쪽만 바뀌면 밴 키와
 * 투표 키가 어긋나 조용히 깨진다. 정의는 여기 한 곳, 각 함수는 import 해서 쓴다.
 *
 * ⚠ 라우팅: Pages 라우터(wrangler filepath-routing)는 /^onRequest(Get|Post|...)?$/ export 가
 *    있는 모듈만 URL 경로로 만든다. 이 파일에는 그런 export 가 없으므로 경로가 생기지 않는다.
 *    여기에 onRequest* 를 추가하지 말 것.
 *
 * [IP 해시 = HMAC-SHA256(key = FIREBASE_DB_SECRET, msg = CF-Connecting-IP), hex 64자]
 * 이전은 키 없는 SHA-256(ip) 였다. IPv4 공간은 2^32 라 공개 노드(messages.ip, votes/<날짜>/<키>)에
 * 실린 해시를 보고 전수 역산(레인보우)하면 원 IP 가 복원된다 — "해시니까 익명"이 성립하지 않았다.
 * 비밀 키를 섞으면 키 없이는 역산할 수 없다. 키는 함수 환경변수에만 있고 저장소·클라이언트에 없다.
 * 출력은 이전과 같은 64자 hex — 규칙의 `length <= 64` 검증과 UI(살충 버튼의 msg.ip)가 그대로 통과한다.
 * 귀결: 구 해시로 저장된 bans/ · votes/ 키는 새 해시와 맞지 않는다 → 기존 밴은 재발급해야 한다.
 */

export const DB_URL = "https://gongtamcom-default-rtdb.firebaseio.com";

// 방 → DB 경로. gongtam 은 최상위 경로(라이브 무중단·하위호환), 신규 방은 rooms/<방>/ 네임스페이스.
// 새 방 추가 = 여기 + firebase-rules.json 규칙. (hupe 방은 2026-08-06 제거 — redalert.red 도 gongtam 방 공유)
export const ROOMS = {
  gongtam: { messages: "messages", rate: "chat_rate", presence: "presence" },
};

// CORS 허용 오리진 — 임베드 사이트가 늘면 여기만 추가.
export const ALLOWED_ORIGINS = new Set([
  "https://gongtam.com",
  "https://www.gongtam.com",
  "https://redalert.red",
  "https://www.redalert.red",
]);
export const DEFAULT_ORIGIN = "https://gongtam.com";

export function corsOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;
}

/** JSON 응답 공통 헤더 (CORS + no-store). */
export function jsonHeaders(request, extra = {}) {
  return {
    "Access-Control-Allow-Origin": corsOrigin(request),
    "Vary": "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...extra,
  };
}

/** CORS preflight 응답. methods 예: "POST, OPTIONS" */
export function preflight(request, methods) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": corsOrigin(request),
      "Vary": "Origin",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** `?auth=<secret>` 쿼리. 시크릿 미설정이면 null — 호출측이 500 으로 명시 실패한다(조용한 무시 금지). */
export function dbAuth(env) {
  return env && env.FIREBASE_DB_SECRET ? `?auth=${env.FIREBASE_DB_SECRET}` : null;
}

const enc = new TextEncoder();
// env 객체 → CryptoKey. isolate 가 살아 있는 동안 importKey 를 1회만 한다(env 가 요청별로 새 객체면 그냥 재생성).
const keyCache = new WeakMap();

async function hmacKey(env) {
  if (!env || !env.FIREBASE_DB_SECRET) throw new Error("server misconfigured");
  let key = keyCache.get(env);
  if (!key) {
    key = await crypto.subtle.importKey(
      "raw",
      enc.encode(env.FIREBASE_DB_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keyCache.set(env, key);
  }
  return key;
}

/** HMAC-SHA256(secret, message) → 소문자 hex 64자. */
export async function hmacHex(env, message) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(String(message)));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 요청자 IP 해시. Cloudflare 가 붙이는 CF-Connecting-IP 기준이라 클라이언트가 위조할 수 없다. */
export async function ipHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  return hmacHex(env, ip);
}
