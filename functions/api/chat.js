/**
 * Cloudflare Pages Function — 채팅 전송 프록시 (2026-08-05 신설, 2026-08-06 멀티룸, 2026-10-05 HMAC·닉 정규화)
 *
 * POST /api/chat  { text: string, nick: string, room?: string }
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
 * [IP 해시 (2026-10-05)] 키 없는 SHA-256 → HMAC-SHA256(FIREBASE_DB_SECRET). 공개 노드(messages.ip)에
 * 실리는 값이라 키 없는 해시는 IPv4 전수 역산으로 원 IP 가 복원됐다. 구현·귀결은 _lib/shared.js 참조.
 *
 * [멀티룸 (2026-08-06)]
 * room 파라미터로 사이트별 채팅방을 분리한다. 생략 시 "gongtam"(기존 경로 그대로 =
 * 배포된 구 클라이언트와 하위호환). 방별로 메시지·쿨다운 경로만 다르고,
 * 밴 목록(bans/)과 금칙어는 전 방 공유 — 한 번 밴이면 모든 방에서 밴이다.
 * 새 방 추가는 _lib/shared.js ROOMS 에 항목 추가 + firebase-rules.json에 rooms/<방> 규칙 추가.
 *
 * [이 함수가 서버에서 강제하는 것 — 전부 클라이언트에서는 우회 가능했던 것들]
 *   · 밴 여부 (실제 IP 해시 기준, 전 방 공유)
 *   · 쿨다운 5초 (방별 chat_rate/<ipHash>)
 *   · 길이 1~20자
 *   · 금칙어 2종 합집합 — assets/banned-words.json(욕설·스팸, 공개) +
 *     비공개 목록(env.BANNED_WORDS_PRIVATE 우선, 없으면 functions/api/banned-words-private.json).
 *     서버 검증이라 임베드 사이트에 목록 파일을 배포하지 않아도 차단은 동일하게 걸린다
 *   · admin=false 고정 — 관리자 사칭 원천 차단. 관리자 메시지는 이 경로를 쓰지 않고
 *     Firebase Auth로 직접 쓴다(규칙이 auth.uid로 검증).
 *   · 관리자 닉 사칭 차단 — NFKC 정규화 + 보이지 않는 문자 제거 + trim 후 '살충제'로 **시작**하면 거부
 *     (구 코드는 완전일치만 봐서 '살충제​', '살충제.' 같은 변형이 통과했다)
 *
 * 환경변수 필요: FIREBASE_DB_SECRET (vote.js·presence.js와 동일 키)
 *   미설정 시 규칙에 막혀 쓰기가 실패한다 → 500 반환(조용한 무시 금지).
 * 선택: BANNED_WORDS_PRIVATE — JSON 문자열 {"words":[...]} 또는 [...]. 설정하면 번들 파일 대신 이것을 쓴다.
 */
// 금칙어는 **공개 가능한 것과 아닌 것**으로 갈린다(2026-08-12 분리).
//   · assets/banned-words.json  = 욕설·스팸. 클라이언트가 fetch해 즉시 피드백 → 공개 불가피.
//   · functions/api/banned-words-private.json = 출처 관련. functions/ 아래라 정적 서빙되지 않는다.
//     ⚠ 단 저장소 자체가 PUBLIC 이라 파일은 결국 공개돼 있다(2026-10-05 감사). 목표는 env.BANNED_WORDS_PRIVATE
//       로 옮기고 이 파일을 {"words":[]} 로 비우는 것. 파일 삭제는 아래 import 가 깨져 빌드가 실패하므로
//       삭제하려면 import 줄과 폴백도 함께 제거해야 한다.
// 서버는 둘을 **합쳐서** 검증하므로 차단 능력은 분리 전과 동일하다.
import BANNED from "../../assets/banned-words.json";
import BANNED_PRIVATE from "./banned-words-private.json";
import { DB_URL, ROOMS, jsonHeaders, preflight, dbAuth, ipHash } from "../_lib/shared.js";

const MAX_MSG_LEN = 20;
const MAX_NICK_LEN = 30;
const COOLDOWN_MS = 5000;
const ADMIN_NICK = "살충제";

// 보이지 않는 문자 — 닉 사이에 끼워 '살충제'와 다른 문자열로 위장하는 데 쓰인다.
// 제로폭 U+200B–U+200D · 단어결합자 U+2060 · BOM U+FEFF (감사 지적분) +
// 같은 성질의 양방향 제어문자 U+200E–U+200F · U+202A–U+202E · U+2066–U+2069, 불가시 결합자 U+2061–U+2064, 소프트하이픈 U+00AD
// \u 이스케이프로 적는다 — 리터럴로 두면 편집기·diff 에서 보이지 않아 조용히 지워지거나 바뀐다
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function stripInvisible(s) {
  return String(s).replace(INVISIBLE_RE, "");
}

// 비교용 정규화: NFKC(전각·호환 문자 → 표준형) → 보이지 않는 문자 제거 → 양끝 공백 제거
function normalizeNick(s) {
  return stripInvisible(String(s).normalize("NFKC")).trim();
}
const ADMIN_NICK_NORM = normalizeNick(ADMIN_NICK);

function impersonatesAdmin(nick) {
  return normalizeNick(nick).startsWith(ADMIN_NICK_NORM);
}

// 비공개 금칙어: 환경변수 우선, 깨졌거나 없으면 번들 파일. 어느 경로든 비면 공개 목록만 걸린다.
function privateBannedWords(env) {
  const raw = env && env.BANNED_WORDS_PRIVATE;
  if (raw) {
    try {
      const j = JSON.parse(raw);
      const words = Array.isArray(j) ? j : (j && Array.isArray(j.words) ? j.words : null);
      if (words) return words;
    } catch (_) { /* 깨진 JSON → 파일로 폴백 (차단 능력이 조용히 사라지지 않게) */ }
  }
  return BANNED_PRIVATE.words || [];
}

function containsBannedWord(text, env) {
  const lower = text.toLowerCase();
  const all = [...(BANNED.words || []), ...privateBannedWords(env)];
  return all.some((w) => w && lower.includes(String(w).toLowerCase()));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = jsonHeaders(request);
  const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return fail(400, "bad body");

    const text = String(body.text ?? "").trim();
    // 저장되는 닉에서도 보이지 않는 문자는 제거한다 — 정당한 용도가 없고 타인 닉 시각 사칭에만 쓰인다
    const nick = stripInvisible(String(body.nick ?? "")).trim();
    const room = String(body.room ?? "gongtam");

    // ── 방 화이트리스트 ──
    const paths = ROOMS[room];
    if (!paths) return fail(400, "bad room");

    // ── 입력 검증 (클라이언트 검사는 UX일 뿐, 여기가 정본) ──
    if (text.length < 1 || text.length > MAX_MSG_LEN) return fail(400, "length");
    if (nick.length < 1 || nick.length > MAX_NICK_LEN) return fail(400, "nick");
    // 관리자 닉 사칭 차단 — 관리자는 이 경로를 쓰지 않는다. 정규화 후 접두 일치까지 거부.
    if (impersonatesAdmin(nick)) return fail(403, "reserved nick");
    if (containsBannedWord(text, env)) return fail(400, "banned word");

    const auth = dbAuth(env);
    if (!auth) return fail(500, "server misconfigured");

    // ── 실제 IP 해시 (HMAC — 클라이언트가 위조 불가, 키 없이 역산 불가) ──
    const hash = await ipHash(request, env);

    // ── 밴 확인 (서버 기준, 전 방 공유) ──
    const banRes = await fetch(`${DB_URL}/bans/${hash}.json${auth}`);
    if (banRes.ok && (await banRes.json())) return fail(403, "banned");

    // ── 쿨다운 (서버 기준, 방별) ──
    const now = Date.now();
    const rateRes = await fetch(`${DB_URL}/${paths.rate}/${hash}.json${auth}`);
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
    const writeRes = await fetch(`${DB_URL}/${paths.messages}.json${auth}`, {
      method: "POST",
      body: JSON.stringify({ nick, text, ts: now, ip: hash, admin: false }),
    });
    if (!writeRes.ok) return fail(500, "write failed");

    // 쿨다운 타임스탬프 갱신은 저장 성공 후에만 — 실패한 요청이 사용자를 묶지 않게 한다
    await fetch(`${DB_URL}/${paths.rate}/${hash}.json${auth}`, { method: "PUT", body: JSON.stringify(now) });

    return new Response(JSON.stringify({ ok: true, ts: now }), { status: 200, headers });
  } catch (e) {
    return fail(500, e.message);
  }
}

export async function onRequestOptions(context) {
  return preflight(context.request, "POST, OPTIONS");
}
