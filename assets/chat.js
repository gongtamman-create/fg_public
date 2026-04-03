/* ══════════════════════════════════════════
   개미공탐지수 — 실시간 채팅 (chat.js)
   Firebase Realtime Database · XSS 방지
   ══════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Firebase 설정 (공개 키) ── */
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCL08aiP4C_wVvjkbmg-rpNsIN6IO___q0",
    authDomain: "gongtamcom.firebaseapp.com",
    databaseURL: "https://gongtamcom-default-rtdb.firebaseio.com",
    projectId: "gongtamcom",
    storageBucket: "gongtamcom.firebasestorage.app",
    messagingSenderId: "378137903214",
    appId: "1:378137903214:web:33c7d0f64c4720b562a67f",
  };

  /* ── 상수 ── */
  const MAX_MSG_LEN = 20;
  const COOLDOWN_MS = 5000;
  const MAX_DISPLAY = 50;
  const MSG_EXPIRE_MS = 10 * 60 * 1000; // 10분
  const ADMIN_UID = "pVNCtNqzoGgmmUSnshkBIICaz452";

  /* ── 금칙어 ── */
  const BANNED_WORDS = [
    "씨발", "시발", "ㅅㅂ", "ㅂㅅ", "병신", "지랄",
    "카톡", "텔레그램", "오픈채팅", "http", "www",
    "미주갤", "디시", "dcinside", "갤러리",
  ];

  /* ── 닉네임 풀 ── */
  const ADJ = [
    "폭락하는","반토막난","손절하는","물타는","멸망한","나락가는","쪽박찬","멘붕온",
    "도망치는","떨리는","겁먹은","패닉온","떡락한","무서운","절망한","눈물나는",
    "횡보하는","관망하는","고민하는","눈치보는","불안한","걱정하는","헷갈리는",
    "올인한","영끌한","떡상한","풀매수한","레버리지탄","존버하는","텐배거친",
    "인생역전한","몰빵한","풀베팅한","매수하는","익절한","줍줍하는","가즈아외치는",
    "탑승한","양전한","수익난","돌파한","반등하는","희망찬","신난","든든한",
    "버티는","화이팅하는","돈복사하는",
  ];
  const ANIMALS = [
    "개미","황소","곰","독수리","여우","다람쥐","햄스터","펭귄","코끼리","거북이",
    "돌고래","올빼미","사자","판다","코알라","토끼","수달","원숭이","두더지","고래",
  ];

  /* ── 닉네임 색상 (12색) ── */
  const NICK_COLORS = [
    "#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD",
    "#98D8C8","#F7DC6F","#BB8FCE","#85C1E9","#F0B27A","#82E0AA",
  ];

  /* ── DOM 참조 ── */
  const $ = (s) => document.querySelector(s);
  const chatWrap = $("#chat-wrap");
  const chatBody = $("#chat-body");
  const chatMessages = $("#chat-messages");
  const chatInput = $("#chat-input");
  const chatSend = $("#chat-send");
  const chatNick = $("#chat-nick");
  const chatOnline = $("#chat-online");
  const chatToggle = $("#chat-toggle");
  const chatArrow = $("#chat-arrow");
  const chatBanned = $("#chat-banned");
  const chatInputRow = $("#chat-input-row");

  /* ── 상태 ── */
  let db = null;
  let myNick = "";
  let myIpHash = "";
  let isAdmin = false;
  let isBanned = false;
  let lastSendTime = 0;
  let msgCount = 0;
  let firebaseReady = false;

  /* ════════════════════════════════════════
     초기화
     ════════════════════════════════════════ */
  function init() {
    initToggle();
    myNick = getOrCreateNick();
    renderNick();

    // Firebase 초기화
    if (typeof firebase !== "undefined" && FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY") {
      try {
        firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.database();
        firebaseReady = true;
        checkAdmin();
        initPresence();
        checkBan().then(() => {
          if (!isBanned) listenMessages();
        });
      } catch (e) {
        console.warn("Firebase 초기화 실패:", e);
      }
    }

    // 이벤트
    chatSend.addEventListener("click", sendMessage);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }

  /* ════════════════════════════════════════
     접기 / 펼치기
     ════════════════════════════════════════ */
  function initToggle() {
    const saved = localStorage.getItem("chat_collapsed");
    const collapsed = saved === null ? true : saved === "true";
    setCollapsed(collapsed);

    chatToggle.addEventListener("click", () => {
      const isCollapsed = chatWrap.classList.contains("collapsed");
      setCollapsed(!isCollapsed);
    });
  }

  function setCollapsed(collapsed) {
    chatWrap.classList.toggle("collapsed", collapsed);
    chatWrap.classList.toggle("expanded", !collapsed);
    localStorage.setItem("chat_collapsed", collapsed);
    if (!collapsed) scrollToBottom();
  }

  /* ════════════════════════════════════════
     닉네임
     ════════════════════════════════════════ */
  function getOrCreateNick() {
    // 관리자 체크는 별도
    let nick = sessionStorage.getItem("chat_nick");
    if (nick) return nick;

    const adj = ADJ[Math.floor(Math.random() * ADJ.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const num = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    nick = adj + animal + num;
    sessionStorage.setItem("chat_nick", nick);
    return nick;
  }

  function renderNick() {
    chatNick.textContent = myNick;
    chatNick.style.color = isAdmin ? "#FF1744" : nickColor(myNick);
  }

  function nickColor(nick) {
    let hash = 0;
    for (let i = 0; i < nick.length; i++) {
      hash = nick.charCodeAt(i) + ((hash << 5) - hash);
    }
    return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length];
  }

  /* ════════════════════════════════════════
     관리자 모드 (Firebase Auth)
     ════════════════════════════════════════ */
  function checkAdmin() {
    if (!ADMIN_UID) return;
    // ?admin 파라미터 있으면 로그인 폼 먼저 표시
    if (new URLSearchParams(location.search).has("admin")) {
      showAdminLogin();
    }
    // Firebase Auth 상태 감지
    try {
      if (firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
          if (user && user.uid === ADMIN_UID) {
            isAdmin = true;
            myNick = "살충제";
            sessionStorage.setItem("chat_nick", myNick);
            renderNick();
          }
        });
      }
    } catch (e) {}
  }

  function showAdminLogin() {

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;";
    overlay.innerHTML = `<div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:24px;width:280px;text-align:center;">
      <div style="font-size:24px;margin-bottom:12px;">🪳 살충제 로그인</div>
      <input id="adm-email" type="email" placeholder="이메일" style="width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid #333;background:#0d1117;color:#e6edf3;box-sizing:border-box;">
      <input id="adm-pw" type="password" placeholder="비밀번호" style="width:100%;padding:10px;margin:6px 0;border-radius:8px;border:1px solid #333;background:#0d1117;color:#e6edf3;box-sizing:border-box;">
      <button id="adm-btn" style="width:100%;padding:10px;margin-top:8px;border-radius:8px;border:none;background:#FF1744;color:#fff;font-weight:700;cursor:pointer;">로그인</button>
      <div id="adm-msg" style="margin-top:8px;font-size:12px;color:#FF6D00;"></div>
      <button id="adm-close" style="margin-top:8px;background:none;border:none;color:#6e6e8a;cursor:pointer;font-size:12px;">닫기</button>
    </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector("#adm-close").onclick = () => overlay.remove();
    overlay.querySelector("#adm-btn").onclick = async () => {
      const email = overlay.querySelector("#adm-email").value;
      const pw = overlay.querySelector("#adm-pw").value;
      const msg = overlay.querySelector("#adm-msg");
      try {
        await firebase.auth().signInWithEmailAndPassword(email, pw);
        msg.style.color = "#00E676";
        msg.textContent = "살충 준비 완료. 새로고침합니다...";
        setTimeout(() => { location.href = location.pathname; }, 1000);
      } catch (e) {
        msg.textContent = "실패: " + e.message;
      }
    };
  }

  /* ════════════════════════════════════════
     IP 해시 (SHA-256)
     ════════════════════════════════════════ */
  async function getIpHash() {
    if (myIpHash) return myIpHash;
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      const ip = data.ip;
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
      myIpHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      return myIpHash;
    } catch {
      myIpHash = "unknown_" + Math.random().toString(36).slice(2);
      return myIpHash;
    }
  }

  /* ════════════════════════════════════════
     밴 체크
     ════════════════════════════════════════ */
  async function checkBan() {
    if (!firebaseReady) return;
    const hash = await getIpHash();
    try {
      const snap = await db.ref("bans/" + hash).once("value");
      if (snap.exists()) {
        isBanned = true;
        chatInputRow.style.display = "none";
        chatBanned.style.display = "flex";
      }
    } catch {}
  }

  async function banUser(ipHash) {
    if (!firebaseReady || !isAdmin) return;
    const user = firebase.auth().currentUser;
    if (!user || user.uid !== ADMIN_UID) return;
    await db.ref("bans/" + ipHash).set({
      banned_at: Date.now(),
      banned_by: user.uid,
    });
  }

  /* ════════════════════════════════════════
     접속자 수 (Presence)
     ════════════════════════════════════════ */
  async function initPresence() {
    if (!firebaseReady) return;
    const hash = await getIpHash();
    const presRef = db.ref("presence/" + hash);
    const connRef = db.ref(".info/connected");

    connRef.on("value", (snap) => {
      if (snap.val() === true) {
        presRef.onDisconnect().remove();
        presRef.set(true);
      }
    });

    // 접속자 수 리스너
    db.ref("presence").on("value", (snap) => {
      const count = snap.numChildren();
      chatOnline.textContent = count + "명";
    });
  }

  /* ════════════════════════════════════════
     금칙어 필터
     ════════════════════════════════════════ */
  function containsBannedWord(text) {
    const lower = text.toLowerCase();
    return BANNED_WORDS.some((w) => lower.includes(w.toLowerCase()));
  }

  /* ════════════════════════════════════════
     메시지 전송
     ════════════════════════════════════════ */
  async function sendMessage() {
    if (isBanned) return;
    const text = chatInput.value.trim();
    if (!text) return;
    if (text.length > MAX_MSG_LEN) return;

    // 쿨다운 (관리자 면제)
    if (!isAdmin) {
      const now = Date.now();
      if (now - lastSendTime < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastSendTime)) / 1000);
        chatInput.placeholder = remaining + "초 대기...";
        setTimeout(() => { chatInput.placeholder = "메시지 (20자)"; }, 1500);
        return;
      }
      lastSendTime = now;
    }

    // 금칙어
    if (containsBannedWord(text)) {
      chatInput.value = "";
      chatInput.placeholder = "부적절한 단어 포함";
      setTimeout(() => { chatInput.placeholder = "메시지 (20자)"; }, 1500);
      return;
    }

    const ipHash = await getIpHash();
    const msg = {
      nick: myNick,
      text: text,
      ts: Date.now(),
      ip: ipHash,
      admin: isAdmin || false,
    };

    chatInput.value = "";

    if (firebaseReady) {
      db.ref("messages").push(msg);
    } else {
      // Firebase 미연결 시 로컬 렌더만
      appendMessage(msg);
    }
  }

  /* ════════════════════════════════════════
     메시지 수신
     ════════════════════════════════════════ */
  function listenMessages() {
    if (!firebaseReady) return;
    const now = Date.now();

    db.ref("messages")
      .orderByChild("ts")
      .startAt(now - MSG_EXPIRE_MS)
      .limitToLast(MAX_DISPLAY)
      .on("child_added", (snap) => {
        const msg = snap.val();
        if (!msg || !msg.text || !msg.nick) return;
        // 10분 이상 된 메시지 무시
        if (Date.now() - msg.ts > MSG_EXPIRE_MS) return;
        appendMessage(msg);
      });
  }

  /* ════════════════════════════════════════
     메시지 렌더 (XSS 방지: textContent만 사용)
     ════════════════════════════════════════ */
  function appendMessage(msg) {
    // 최대 50건 유지
    while (chatMessages.children.length >= MAX_DISPLAY) {
      chatMessages.removeChild(chatMessages.firstChild);
    }

    const div = document.createElement("div");
    div.className = "chat-msg" + (msg.admin ? " chat-msg-admin" : "");

    // 닉네임
    const nickSpan = document.createElement("span");
    nickSpan.className = "chat-msg-nick";
    nickSpan.textContent = msg.nick;
    nickSpan.style.color = msg.admin ? "#FF1744" : nickColor(msg.nick);

    // 관리자: 닉 클릭 시 살충 버튼
    if (isAdmin && !msg.admin && msg.ip) {
      nickSpan.addEventListener("click", () => {
        // 이미 살충 버튼이 있으면 제거
        const existing = div.querySelector(".chat-admin-action");
        if (existing) { existing.remove(); return; }

        const btn = document.createElement("button");
        btn.className = "chat-admin-action";
        btn.textContent = "🚫 살충하기";
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await banUser(msg.ip);
          btn.textContent = "살충 완료";
          btn.disabled = true;
        });
        div.appendChild(btn);
      });
    }

    // 메시지 텍스트
    const textSpan = document.createElement("span");
    textSpan.className = "chat-msg-text";
    textSpan.textContent = msg.text;

    // 시간
    const timeSpan = document.createElement("span");
    timeSpan.className = "chat-msg-time";
    const d = new Date(msg.ts);
    timeSpan.textContent = d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");

    div.appendChild(nickSpan);
    div.appendChild(textSpan);
    div.appendChild(timeSpan);
    chatMessages.appendChild(div);
    scrollToBottom();

    msgCount++;
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  /* ── 시작 ── */
  init();

})();
