/* ══════════════════════════════════════════
   개미공탐지수 — app.js
   순수 Vanilla JS · SVG 게이지/차트 · Firebase 연동 준비
   ══════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  let DATA = null;
  let calendarMonth = null; // 현재 표시 중인 월 (YYYY-MM)

  /* ════════════════════════════════════════
     등급 / 시그널 판정
     ════════════════════════════════════════ */
  function getGrade(score) {
    if (score == null) return { label: "--", color: "#6e6e8a" };
    if (score <= 20) return { label: "극단적 공포", color: "#FF1744" };
    if (score <= 40) return { label: "공포", color: "#FF6D00" };
    if (score <= 60) return { label: "중립", color: "#FFD600" };
    if (score <= 80) return { label: "탐욕", color: "#00E676" };
    return { label: "극단적 탐욕", color: "#00C853" };
  }

  function getSignal(score) {
    if (score == null) return { text: "데이터 없음", color: "#6e6e8a", border: "#1e1e3a" };
    if (score <= 20) return { text: "🚨 강력 매수", color: "#FF1744", border: "#FF1744" };
    if (score <= 30) return { text: "📢 매수", color: "#00E676", border: "#00E676" };
    if (score <= 35) return { text: "👀 매수 대기", color: "#00E676", border: "#1e3a1e" };
    if (score >= 80) return { text: "⚠️ 극단적 과열", color: "#FF1744", border: "#FF1744" };
    if (score >= 65) return { text: "📊 경계", color: "#FF6D00", border: "#FF6D00" };
    return { text: "😐 관망", color: "#FFD600", border: "#3a3a1e" };
  }

  function scoreColor(score) {
    return getGrade(score).color;
  }

  /* ════════════════════════════════════════
     SVG 게이지
     ════════════════════════════════════════ */
  const GAUGE_CX = 140, GAUGE_CY = 155, GAUGE_R = 120;
  const START_ANGLE = Math.PI * 0.8;
  const END_ANGLE = Math.PI * 0.2;
  const ARC_SPAN = (2 * Math.PI) - (START_ANGLE - END_ANGLE);

  function polarToXY(cx, cy, r, angle) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToXY(cx, cy, r, startAngle);
    const end = polarToXY(cx, cy, r, endAngle);
    const sweep = endAngle - startAngle;
    const large = sweep > Math.PI ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
  }

  function initGauge() {
    const bgPath = describeArc(GAUGE_CX, GAUGE_CY, GAUGE_R, START_ANGLE, START_ANGLE + ARC_SPAN);
    $("#gauge-bg").setAttribute("d", bgPath);
    $("#gauge-arc").setAttribute("d", bgPath);
    // 니들 초기 위치
    const pos = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R, START_ANGLE);
    $("#gauge-needle").setAttribute("cx", pos.x);
    $("#gauge-needle").setAttribute("cy", pos.y);
    $("#gauge-needle-inner").setAttribute("cx", pos.x);
    $("#gauge-needle-inner").setAttribute("cy", pos.y);
  }

  function animateGauge(targetScore) {
    const grade = getGrade(targetScore);
    let current = 0;
    const duration = 1200;
    const startTime = performance.now();

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      current = targetScore * easeOut(progress);

      // 활성 아크
      const currentAngle = START_ANGLE + (current / 100) * ARC_SPAN;
      const activePath = describeArc(GAUGE_CX, GAUGE_CY, GAUGE_R, START_ANGLE, currentAngle);
      const activeEl = $("#gauge-active");
      activeEl.setAttribute("d", activePath);
      activeEl.setAttribute("stroke", scoreColor(current));

      // 니들
      const pos = polarToXY(GAUGE_CX, GAUGE_CY, GAUGE_R, currentAngle);
      $("#gauge-needle").setAttribute("cx", pos.x);
      $("#gauge-needle").setAttribute("cy", pos.y);
      $("#gauge-needle-inner").setAttribute("cx", pos.x);
      $("#gauge-needle-inner").setAttribute("cy", pos.y);
      $("#gauge-needle-inner").setAttribute("fill", scoreColor(current));

      // 숫자
      $("#gauge-score").textContent = Math.round(current);
      $("#gauge-score").style.color = scoreColor(current);

      if (progress < 1) requestAnimationFrame(step);
      else {
        $("#gauge-grade").textContent = grade.label;
        $("#gauge-grade").style.color = grade.color;
      }
    }

    requestAnimationFrame(step);
  }

  /* ════════════════════════════════════════
     데이터 로드 & 렌더
     ════════════════════════════════════════ */
  async function loadData() {
    try {
      const res = await fetch("data.json?v=" + Date.now());
      DATA = await res.json();
      render();
    } catch (e) {
      $("#updated").textContent = "데이터 로드 실패";
    }
  }

  function render() {
    const d = DATA;
    const c = d.current;

    // 헤더
    const ts = new Date(d.updated_at);
    const hm = ts.toTimeString().slice(0, 5);
    $("#updated").textContent = `${d.history_full.length}일 분석 · ${hm} 갱신`;

    // 게이지
    animateGauge(c.score ?? 0);
    $("#gauge-date").textContent = c.date;
    // 실시간 배지
    if (c.realtime && c.realtime_time) {
      const el = $("#realtime-badge");
      el.style.display = "flex";
      $("#rt-label").textContent = "실시간 · " + c.realtime_time.slice(11, 16);
    }

    // 24시간 스파크라인
    renderSparkline(d.realtime_24h);

    // 시그널
    renderSignal(c.score);

    // 스탯 카드
    renderStats(d);

    // 투표 (로컬 상태 복원)
    restoreVote();

    // 차트
    renderTrendChart(30);
    initChartTabs();

    // 백테스트
    renderBacktest(d.backtest, 20);
    initBtTabs();

    // 달력
    calendarMonth = c.date.slice(0, 7);
    renderCalendar();
    initCalendarNav();

    // CNN 비교 (실시간 점수 반영)
    renderCNN(d.cnn_comparison);

    // 일별 기록
    renderDayTable(d.history);
  }

  /* ── 24시간 스파크라인 ── */
  function renderSparkline(data) {
    if (!data || data.length < 3) return;
    const section = $("#spark-section");
    section.style.display = "block";

    const svg = $("#spark-svg");
    const W = svg.clientWidth || 520;
    const H = 60;
    const PAD = { left: 4, right: 4, top: 12, bottom: 12 };
    const cw = W - PAD.left - PAD.right;
    const ch = H - PAD.top - PAD.bottom;

    const scores = data.map((d) => d.score);
    const minS = Math.min(...scores);
    const maxS = Math.max(...scores);
    const minIdx = scores.indexOf(minS);
    const maxIdx = scores.indexOf(maxS);
    const range = maxS - minS || 1;
    const xStep = cw / (data.length - 1);

    const points = data.map((d, i) => {
      const x = PAD.left + i * xStep;
      const y = PAD.top + ch - ((d.score - minS) / range) * ch;
      return { x, y, score: d.score, time: d.time };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaPath = linePath + ` L${points[points.length - 1].x.toFixed(1)},${H} L${points[0].x.toFixed(1)},${H} Z`;

    let html = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    html += `<defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">`;
    html += `<stop offset="0%" stop-color="${scoreColor(scores[scores.length - 1])}" stop-opacity="0.3"/>`;
    html += `<stop offset="100%" stop-color="${scoreColor(scores[scores.length - 1])}" stop-opacity="0.02"/>`;
    html += `</linearGradient></defs>`;

    // 50점 기준선
    const y50 = PAD.top + ch - ((50 - minS) / range) * ch;
    if (y50 > PAD.top && y50 < H - PAD.bottom) {
      html += `<line x1="0" y1="${y50}" x2="${W}" y2="${y50}" stroke="#333" stroke-width="0.5" stroke-dasharray="3,3"/>`;
    }

    html += `<path d="${areaPath}" fill="url(#sparkGrad)"/>`;

    // 라인
    for (let i = 1; i < points.length; i++) {
      const color = scoreColor(points[i].score);
      html += `<line x1="${points[i - 1].x.toFixed(1)}" y1="${points[i - 1].y.toFixed(1)}" x2="${points[i].x.toFixed(1)}" y2="${points[i].y.toFixed(1)}" stroke="${color}" stroke-width="2"/>`;
    }

    // 최고점 표시
    const hi = points[maxIdx];
    const hiLabelY = hi.y - 6 < PAD.top ? hi.y + 12 : hi.y - 6;
    html += `<circle cx="${hi.x}" cy="${hi.y}" r="3" fill="${scoreColor(hi.score)}"/>`;
    html += `<text x="${hi.x}" y="${hiLabelY}" fill="${scoreColor(hi.score)}" font-size="9" font-weight="700" text-anchor="middle" font-family="JetBrains Mono">${Math.round(maxS)}</text>`;

    // 최저점 표시
    const lo = points[minIdx];
    const loLabelY = lo.y + 12 > H - PAD.bottom ? lo.y - 6 : lo.y + 12;
    html += `<circle cx="${lo.x}" cy="${lo.y}" r="3" fill="${scoreColor(lo.score)}"/>`;
    html += `<text x="${lo.x}" y="${loLabelY}" fill="${scoreColor(lo.score)}" font-size="9" font-weight="700" text-anchor="middle" font-family="JetBrains Mono">${Math.round(minS)}</text>`;

    // 마지막 점 (현재)
    const last = points[points.length - 1];
    if (points.length - 1 !== maxIdx && points.length - 1 !== minIdx) {
      html += `<circle cx="${last.x}" cy="${last.y}" r="3" fill="${scoreColor(last.score)}"/>`;
      html += `<circle cx="${last.x}" cy="${last.y}" r="6" fill="${scoreColor(last.score)}" opacity="0.25"/>`;
    }

    // 호버 영역
    points.forEach((p, i) => {
      html += `<rect x="${p.x - xStep / 2}" y="0" width="${xStep}" height="${H}" fill="transparent" class="spark-hit" data-idx="${i}"/>`;
    });

    html += `</svg>`;
    svg.innerHTML = html;

    // 범위 텍스트
    $("#spark-min").textContent = data[0].time;
    $("#spark-max").textContent = data[data.length - 1].time;

    // 호버 툴팁
    const tooltip = $("#spark-tooltip");
    svg.querySelectorAll(".spark-hit").forEach((rect) => {
      rect.addEventListener("mouseenter", () => {
        const i = +rect.dataset.idx;
        const p = points[i];
        tooltip.style.display = "block";
        tooltip.innerHTML = `<strong>${data[i].time}</strong> · ${Math.round(p.score)}점`;
      });
      rect.addEventListener("mousemove", (e) => {
        const r = section.getBoundingClientRect();
        tooltip.style.left = (e.clientX - r.left + 10) + "px";
        tooltip.style.top = "6px";
      });
      rect.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    });
  }

  /* ── 시그널 배지 ── */
  function renderSignal(score) {
    const s = getSignal(score);
    const el = $("#signal-badge");
    el.textContent = s.text;
    el.style.color = s.color;
    el.style.borderColor = s.border;
  }

  /* ── 스탯 카드 ── */
  function renderStats(d) {
    // 나스닥
    const nq = d.nasdaq;
    if (nq && nq.price) {
      $("#stat-nasdaq").textContent = Math.round(nq.price).toLocaleString();
      const pct = nq.change_pct || 0;
      const cls = pct >= 0 ? "up" : "down";
      const sign = pct >= 0 ? "+" : "";
      $("#stat-nasdaq-pct").className = `stat-sub ${cls}`;
      $("#stat-nasdaq-pct").textContent = `${sign}${pct.toFixed(2)}%`;
    }


    // CNN
    const cnn = d.cnn_comparison;
    if (cnn && cnn.cnn_score != null) {
      $("#stat-cnn").textContent = Math.round(cnn.cnn_score);
      const g = getGrade(cnn.cnn_score);
      $("#stat-cnn-grade").textContent = g.label;
      $("#stat-cnn-grade").style.color = g.color;
    }
  }

  /* ════════════════════════════════════════
     공통: IP 해시 (chat.js와 공유)
     ════════════════════════════════════════ */
  let _ipHash = "";
  async function getIpHash() {
    if (_ipHash) return _ipHash;
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.ip));
      _ipHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      _ipHash = "anon_" + Math.random().toString(36).slice(2, 10);
    }
    return _ipHash;
  }

  function getFirebaseDb() {
    if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0) {
      return firebase.database();
    }
    return null;
  }

  function getChatNick() {
    return sessionStorage.getItem("chat_nick") || "익명개미";
  }

  function yesterday(dateStr) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  /* ════════════════════════════════════════
     투표: 요일별 질문 + Firebase 연동
     ════════════════════════════════════════ */
  const VOTE_QUESTIONS = [
    "이번 주 나스닥 오를까?",       // 월 0→일요일 getDay, but we use 1=월
    "이번 주 나스닥 오를까?",       // 월
    "오늘 매수할 타이밍?",          // 화
    "이번 주 반등할까?",           // 수
    "오늘 시장 분위기는?",          // 목
    "주말 전에 정리해야 할까?",      // 금
    "다음 주 시장 전망은?",         // 토
    "다음 주 시장 전망은?",         // 일
  ];

  function getVoteQuestion() {
    const dow = new Date().getDay(); // 0=일
    return VOTE_QUESTIONS[dow] || "오늘 나스닥 오를까?";
  }

  function restoreVote() {
    // 질문 갱신
    const titleEl = $("#vote-section").querySelector(".section-title");
    if (titleEl) titleEl.textContent = getVoteQuestion();

    const today = DATA.current.date;
    const saved = localStorage.getItem("vote_" + today);
    if (saved) {
      showVoteResult(JSON.parse(saved));
    }

    // 이전 결과 표시
    renderYesterdayVote(today);
  }

  function initVote() {
    $$(".vote-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const vote = btn.dataset.vote;
        const today = DATA.current.date;

        // IP 해시로 중복 확인
        const ipHash = await getIpHash();
        const db = getFirebaseDb();

        if (db) {
          // Firebase 중복 체크
          const existing = await db.ref(`votes/${today}/${ipHash}`).once("value");
          if (existing.exists()) {
            // 이미 투표함 — 기존 데이터로 결과 표시
            await loadVoteResults(today);
            return;
          }
          // Firebase에 저장
          await db.ref(`votes/${today}/${ipHash}`).set({
            vote: vote,
            nick: getChatNick(),
            ts: Date.now(),
          });
          await loadVoteResults(today);
        } else {
          // Firebase 미연결: 로컬만
          const result = { up: vote === "up" ? 65 : 35, down: vote === "up" ? 35 : 65, my: vote };
          localStorage.setItem("vote_" + today, JSON.stringify(result));
          showVoteResult(result);
        }
      });
    });
  }

  async function loadVoteResults(dateStr) {
    const db = getFirebaseDb();
    if (!db) return;
    const snap = await db.ref(`votes/${dateStr}`).once("value");
    const data = snap.val();
    if (!data) return;

    let upCount = 0, downCount = 0;
    const myHash = await getIpHash();
    let myVote = null;
    Object.entries(data).forEach(([hash, v]) => {
      if (v.vote === "up") upCount++;
      else downCount++;
      if (hash === myHash) myVote = v.vote;
    });

    const total = upCount + downCount;
    const upPct = total > 0 ? Math.round((upCount / total) * 100) : 50;
    const result = { up: upPct, down: 100 - upPct, my: myVote, total: total };
    localStorage.setItem("vote_" + dateStr, JSON.stringify(result));
    showVoteResult(result);
  }

  function showVoteResult(result) {
    $("#vote-buttons").style.display = "none";
    $("#vote-result").style.display = "block";
    $("#vote-bar-up").style.width = result.up + "%";
    $("#vote-up-pct").textContent = `🟢 ${result.up}%`;
    $("#vote-down-pct").textContent = `🔴 ${result.down}%`;

    // 참여 수 표시
    if (result.total) {
      let note = $("#vote-result").querySelector(".vote-total");
      if (!note) {
        note = document.createElement("div");
        note.className = "vote-total";
        note.style.cssText = "font-size:11px;color:#6e6e8a;text-align:center;margin-top:4px;";
        $("#vote-result").appendChild(note);
      }
      note.textContent = `${result.total}명 참여`;
    }
  }

  async function renderYesterdayVote(today) {
    const prevDate = yesterday(today);
    const db = getFirebaseDb();

    // 어제 투표 결과 + 나스닥 등락으로 정답 여부
    let prevResult = null;
    if (db) {
      const snap = await db.ref(`votes/${prevDate}`).once("value");
      const data = snap.val();
      if (data) {
        let up = 0, down = 0;
        Object.values(data).forEach((v) => { if (v.vote === "up") up++; else down++; });
        const total = up + down;
        prevResult = { up: Math.round((up / total) * 100), down: Math.round((down / total) * 100), total };
      }
    }

    if (!prevResult) return;

    // 나스닥 등락으로 정답 판정
    const prevDay = DATA.history.find((h) => h.date === prevDate);
    let verdict = "";
    if (prevDay && prevDay.nasdaq_pct != null) {
      const nasdaqUp = prevDay.nasdaq_pct >= 0;
      const majorityUp = prevResult.up > 50;
      if (majorityUp === nasdaqUp) {
        verdict = `✅ 다수 의견 적중! (나스닥 ${prevDay.nasdaq_pct >= 0 ? "+" : ""}${prevDay.nasdaq_pct.toFixed(2)}%)`;
      } else {
        verdict = `❌ 다수 의견 빗나감 (나스닥 ${prevDay.nasdaq_pct >= 0 ? "+" : ""}${prevDay.nasdaq_pct.toFixed(2)}%)`;
      }
    }

    // 어제 결과 DOM 삽입
    let prevEl = $("#vote-prev");
    if (!prevEl) {
      prevEl = document.createElement("div");
      prevEl.id = "vote-prev";
      prevEl.style.cssText = "margin-top:10px;padding-top:10px;border-top:1px solid #1e1e3a;font-size:11px;color:#6e6e8a;";
      $("#vote-section").appendChild(prevEl);
    }
    prevEl.textContent = `어제 (${prevDate.slice(5)}): 🟢${prevResult.up}% 🔴${prevResult.down}% (${prevResult.total}명) ${verdict}`;
  }

  /* ════════════════════════════════════════
     SVG 추이 차트
     ════════════════════════════════════════ */
  function renderTrendChart(days) {
    const history = DATA.history;
    const data = history.slice(-days);
    if (!data.length) return;

    const svg = $("#trend-svg");
    const W = svg.clientWidth || 520;
    const H = 200;
    const PAD = { top: 10, right: 10, bottom: 24, left: 32 };
    const cw = W - PAD.left - PAD.right;
    const ch = H - PAD.top - PAD.bottom;

    // 점수 범위: 0~100
    const xStep = cw / (data.length - 1 || 1);

    // 구간 배경 밴드
    const bands = [
      { y1: 0, y2: 20, fill: "rgba(255,23,68,0.08)" },
      { y1: 20, y2: 40, fill: "rgba(255,109,0,0.06)" },
      { y1: 40, y2: 60, fill: "rgba(255,214,0,0.04)" },
      { y1: 60, y2: 80, fill: "rgba(0,230,118,0.06)" },
      { y1: 80, y2: 100, fill: "rgba(0,200,83,0.08)" },
    ];

    let html = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

    // 밴드
    bands.forEach((b) => {
      const ry1 = PAD.top + ch - (b.y2 / 100) * ch;
      const ry2 = PAD.top + ch - (b.y1 / 100) * ch;
      html += `<rect x="${PAD.left}" y="${ry1}" width="${cw}" height="${ry2 - ry1}" fill="${b.fill}"/>`;
    });

    // Y축 눈금
    [0, 25, 50, 75, 100].forEach((v) => {
      const y = PAD.top + ch - (v / 100) * ch;
      html += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#1e1e3a" stroke-width="0.5"/>`;
      html += `<text x="${PAD.left - 4}" y="${y + 3}" fill="#6e6e8a" font-size="9" text-anchor="end" font-family="JetBrains Mono">${v}</text>`;
    });

    // 데이터 포인트
    const points = data.map((d, i) => {
      const x = PAD.left + i * xStep;
      const score = d.score ?? 50;
      const y = PAD.top + ch - (score / 100) * ch;
      return { x, y, score, date: d.date, hybrid: d.hybrid };
    });

    // 키워드 라인
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    html += `<path d="${linePath}" fill="none" stroke="#448aff" stroke-width="2" stroke-linejoin="round"/>`;

    // AI보강 라인
    const hybridPoints = points.filter((p) => p.hybrid != null);
    if (hybridPoints.length > 1) {
      const hPath = data.map((d, i) => {
        if (d.hybrid == null) return null;
        const x = PAD.left + i * xStep;
        const y = PAD.top + ch - (d.hybrid / 100) * ch;
        return { x, y };
      }).filter(Boolean);
      const hLine = hPath.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
      html += `<path d="${hLine}" fill="none" stroke="#FF6D00" stroke-width="1.5" stroke-dasharray="4 2" stroke-linejoin="round" opacity="0.7"/>`;
    }

    // 인터랙션 영역 (투명 사각형)
    points.forEach((p, i) => {
      html += `<rect x="${p.x - xStep / 2}" y="${PAD.top}" width="${xStep}" height="${ch}" fill="transparent" class="chart-hit" data-idx="${i}"/>`;
      html += `<circle cx="${p.x}" cy="${p.y}" r="0" fill="${scoreColor(p.score)}" class="chart-dot" data-idx="${i}"/>`;
    });

    // X축 날짜 (5~7개)
    const labelInterval = Math.max(1, Math.floor(data.length / 6));
    data.forEach((d, i) => {
      if (i % labelInterval === 0 || i === data.length - 1) {
        const x = PAD.left + i * xStep;
        html += `<text x="${x}" y="${H - 4}" fill="#6e6e8a" font-size="9" text-anchor="middle" font-family="JetBrains Mono">${d.date.slice(5)}</text>`;
      }
    });

    html += `</svg>`;
    svg.innerHTML = html;

    // 호버 이벤트
    const tooltip = $("#chart-tooltip");
    svg.querySelectorAll(".chart-hit").forEach((rect) => {
      rect.addEventListener("mouseenter", (e) => {
        const idx = +rect.dataset.idx;
        const p = points[idx];
        const d = data[idx];
        tooltip.style.display = "block";
        tooltip.innerHTML = `<strong>${d.date}</strong><br>키워드: ${d.score ?? "—"} · AI: ${d.hybrid ?? "—"}`;
        // 점 표시
        const dot = svg.querySelector(`.chart-dot[data-idx="${idx}"]`);
        if (dot) dot.setAttribute("r", "4");
      });
      rect.addEventListener("mousemove", (e) => {
        const wrap = $(".svg-chart-wrap");
        const rect2 = wrap.getBoundingClientRect();
        tooltip.style.left = (e.clientX - rect2.left + 10) + "px";
        tooltip.style.top = (e.clientY - rect2.top - 30) + "px";
      });
      rect.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
        svg.querySelectorAll(".chart-dot").forEach((d) => d.setAttribute("r", "0"));
      });
    });

    // 터치 지원
    svg.addEventListener("touchmove", (e) => {
      const touch = e.touches[0];
      const wrap = $(".svg-chart-wrap");
      const rect2 = wrap.getBoundingClientRect();
      const x = touch.clientX - rect2.left;
      const idx = Math.round((x - PAD.left) / xStep);
      if (idx >= 0 && idx < points.length) {
        const d = data[idx];
        tooltip.style.display = "block";
        tooltip.innerHTML = `<strong>${d.date}</strong><br>키워드: ${d.score ?? "—"} · AI: ${d.hybrid ?? "—"}`;
        tooltip.style.left = (touch.clientX - rect2.left + 10) + "px";
        tooltip.style.top = (touch.clientY - rect2.top - 40) + "px";
      }
    });
    svg.addEventListener("touchend", () => { tooltip.style.display = "none"; });
  }

  function initChartTabs() {
    $$(".chart-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".chart-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderTrendChart(+btn.dataset.days);
      });
    });
  }

  /* ════════════════════════════════════════
     백테스트 카드
     ════════════════════════════════════════ */
  function renderBacktest(bt, holdDays) {
    if (!bt) return;
    holdDays = holdDays || 20;
    $("#bt-period").textContent = `${bt.period} (${bt.trading_days}거래일)`;

    const zoneNames = ["극공포 (<=20)", "공포 (<=30)", "공포 (<=35)"];
    const zones = (bt.zones || []).filter((z) => zoneNames.includes(z.name) && z.hold_days === holdDays);

    const el = $("#bt-cards");
    el.innerHTML = zones.map((z) => {
      const cls = z.return >= 0 ? "up" : "down";
      return `<div class="bt-card">
        <div class="bt-name">${z.name}</div>
        <div class="bt-return mono ${cls}">${z.return >= 0 ? "+" : ""}${z.return}%</div>
        <div class="bt-win">승률 ${z.win_rate}%</div>
        <div class="bt-trades">${z.trades}회</div>
      </div>`;
    }).join("");

    if (!zones.length) {
      el.innerHTML = '<div style="color:#6e6e8a;font-size:13px;text-align:center;padding:16px;">데이터 부족</div>';
    }
  }

  function initBtTabs() {
    $$(".bt-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".bt-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderBacktest(DATA.backtest, +btn.dataset.hold);
      });
    });
  }

  /* ════════════════════════════════════════
     달력 히트맵
     ════════════════════════════════════════ */
  function renderCalendar() {
    if (!DATA) return;
    const month = calendarMonth;
    $("#cal-month").textContent = month;

    const year = +month.slice(0, 4);
    const mon = +month.slice(5, 7);
    const firstDay = new Date(year, mon - 1, 1);
    const lastDay = new Date(year, mon, 0).getDate();
    let startDow = firstDay.getDay(); // 0=일
    startDow = startDow === 0 ? 6 : startDow - 1; // 월=0

    // 해당 월 점수 맵
    const scoreMap = {};
    DATA.history_full.forEach((d) => {
      if (d.date.startsWith(month)) scoreMap[d.date] = d.score;
    });

    const grid = $("#cal-grid");
    let html = "";

    // 앞쪽 빈칸
    for (let i = 0; i < startDow; i++) {
      html += `<div class="cal-cell empty"></div>`;
    }

    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${month}-${String(day).padStart(2, "0")}`;
      const score = scoreMap[dateStr];
      const bg = score != null ? scoreColor(score) : "#1a1a2e";
      const title = score != null ? `${dateStr}: ${Math.round(score)}점` : dateStr;
      html += `<div class="cal-cell" style="background:${bg}" data-date="${dateStr}" data-score="${score ?? ''}" title="${title}">${day}</div>`;
    }

    grid.innerHTML = html;

    // 클릭 툴팁
    const tooltip = $("#cal-tooltip");
    grid.querySelectorAll(".cal-cell:not(.empty)").forEach((cell) => {
      cell.addEventListener("click", (e) => {
        const date = cell.dataset.date;
        const score = cell.dataset.score;
        if (!score) { tooltip.style.display = "none"; return; }
        const g = getGrade(+score);
        tooltip.innerHTML = `<strong>${date}</strong><br>${Math.round(+score)}점 — ${g.label}`;
        tooltip.style.display = "block";
        tooltip.style.left = e.clientX + 10 + "px";
        tooltip.style.top = e.clientY - 40 + "px";
        setTimeout(() => { tooltip.style.display = "none"; }, 2000);
      });
    });
  }

  function initCalendarNav() {
    $("#cal-prev").addEventListener("click", () => {
      calendarMonth = shiftMonth(calendarMonth, -1);
      renderCalendar();
    });
    $("#cal-next").addEventListener("click", () => {
      calendarMonth = shiftMonth(calendarMonth, 1);
      renderCalendar();
    });
  }

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  /* ════════════════════════════════════════
     CNN 비교
     ════════════════════════════════════════ */
  function renderCNN(cnn) {
    if (!cnn) return;
    $("#cmp-our").textContent = cnn.our_score != null ? Math.round(cnn.our_score) : "--";
    $("#cmp-our").style.color = scoreColor(cnn.our_score);
    $("#cmp-our-grade").textContent = cnn.our_grade || "";
    $("#cmp-our-grade").style.color = scoreColor(cnn.our_score);

    if (cnn.cnn_score != null) {
      $("#cmp-cnn").textContent = Math.round(cnn.cnn_score);
      $("#cmp-cnn").style.color = scoreColor(cnn.cnn_score);
      $("#cmp-cnn-grade").textContent = cnn.cnn_grade || "";
      $("#cmp-cnn-grade").style.color = scoreColor(cnn.cnn_score);
      const diff = Math.round(cnn.our_score - cnn.cnn_score);
      const sign = diff >= 0 ? "+" : "";
      $("#cmp-note").textContent = `차이 ${sign}${diff}점 · 개미공탐이 CNN 대비 2~3일 선행 (r=0.59)`;
    } else {
      $("#cmp-cnn").textContent = "--";
      $("#cmp-note").textContent = "CNN 데이터 없음";
    }
  }

  /* ════════════════════════════════════════
     일별 기록
     ════════════════════════════════════════ */
  function renderDayTable(history) {
    if (!history) return;
    const tbody = $("#day-tbody");
    const recent = history.slice(-10).reverse();
    tbody.innerHTML = recent.map((d) => {
      const pctCls = d.nasdaq_pct > 0 ? "up" : d.nasdaq_pct < 0 ? "down" : "dim";
      const pctStr = d.nasdaq_pct != null ? `${d.nasdaq_pct > 0 ? "+" : ""}${d.nasdaq_pct.toFixed(2)}%` : "—";
      return `<tr>
        <td class="dim">${d.date.slice(5)}</td>
        <td style="color:${scoreColor(d.score)};font-weight:700;" class="mono">${d.score != null ? Math.round(d.score) : "—"}</td>
        <td class="dim mono">${d.nasdaq_close ? Math.round(d.nasdaq_close).toLocaleString() : "—"}</td>
        <td class="${pctCls} mono" style="font-weight:600;">${pctStr}</td>
      </tr>`;
    }).join("");
  }

  /* ════════════════════════════════════════
     초기화
     ════════════════════════════════════════ */
  initGauge();
  initVote();
  loadData();

})();
