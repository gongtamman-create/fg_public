/* ══════════════════════════════════════════════════════════════════════════
   활동량 추이 차트 (activity-chart.js)

   거래량 막대처럼 일별 투자자 활동량을 보여준다. 단, 절대 건수가 아니라
   **평소 대비 지수**(100 = 같은 요일 최근 4주 중앙값)를 그린다.
   이유는 static_build.py의 _build_activity() 주석 참조 — 요약하면 원시 건수는
   커뮤니티 활동이 아니라 크롤러 설정 이력이 지배하고, 요일 효과가 2.5배라
   그대로 그리면 지표가 거짓말을 한다.

   사용법 (사이트 HTML에 이 한 줄):
     <script src="assets/activity-chart.js" defer></script>

   data-* 설정:
     data-src    data.json 경로 (기본 "data.json")
     data-mount  차트를 넣을 컨테이너 셀렉터 (기본: #app 안 footer 앞)

   의존성 없음. 사이트의 .card / .section-title / .chart-tooltip 클래스를
   그대로 재사용하므로 기존 카드들과 동일한 외형이 나온다.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const SCRIPT = document.currentScript;
  const DATA_SRC = (SCRIPT && SCRIPT.dataset.src) || "data.json";
  const MOUNT_SEL = (SCRIPT && SCRIPT.dataset.mount) || "";

  const DISPLAY_DAYS = 60;      // 막대가 뭉개지지 않는 상한
  const CLAMP_INDEX = 300;      // 이 이상은 막대 높이를 고정(데이터는 원값 유지)
  const HOT_INDEX = 150;        // 평소의 1.5배 = 이벤트성 폭증
  const QUIET_INDEX = 70;       // 평소의 0.7배 = 관심 소강

  const VIEW_W = 320;
  const VIEW_H = 90;

  const COLOR_HOT = "#E10600";
  const COLOR_WARM = "#FFAB00";
  const COLOR_NORMAL = "#45B7D1";
  const COLOR_QUIET = "#2a2a4a";

  const CSS = `
.act-wrap{position:relative;}
.act-svg{width:100%;height:100px;display:block;overflow:visible;}
.act-bar{transition:opacity .15s;cursor:pointer;}
.act-bar:hover{opacity:.75;}
.act-axis{display:flex;justify-content:space-between;font-size:10px;color:#666;margin-top:2px;}
.act-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:#777;margin-top:8px;}
.act-legend span{display:inline-flex;align-items:center;gap:4px;}
.act-dot{width:8px;height:8px;border-radius:2px;display:inline-block;}
.act-note{font-size:11px;color:#777;margin-top:8px;line-height:1.5;}
.act-tip{position:absolute;pointer-events:none;background:#1a1a2e;border:1px solid #2a2a4a;
  border-radius:6px;padding:5px 8px;font-size:11px;color:#e6edf3;white-space:nowrap;
  opacity:0;transition:opacity .12s;z-index:5;}
.act-tip.on{opacity:1;}
`;

  function barColor(index) {
    if (index >= HOT_INDEX) return COLOR_HOT;
    if (index >= 110) return COLOR_WARM;
    if (index >= QUIET_INDEX) return COLOR_NORMAL;
    return COLOR_QUIET;
  }

  function mountPoint() {
    if (MOUNT_SEL) {
      const el = document.querySelector(MOUNT_SEL);
      if (el) return { parent: el, before: null };
    }
    const app = document.querySelector("#app") || document.body;
    const footer = app.querySelector("footer");
    return { parent: app, before: footer };
  }

  function render(activity) {
    // 데이터가 없거나 너무 적으면 섹션 자체를 만들지 않는다 — 빈 카드는 고장으로 보인다.
    if (!Array.isArray(activity) || activity.length < 7) return;

    const rows = activity.slice(-DISPLAY_DAYS);

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const section = document.createElement("section");
    section.className = "card";
    section.id = "activity-section";
    section.innerHTML = `
      <h3 class="section-title">투자자 활동량 추이</h3>
      <p class="bt-sub" style="font-size:11px;color:#6e6e8a;margin-bottom:8px;">
        평소(같은 요일 최근 4주) 대비 게시 활동량. 100 = 평소 수준.
      </p>
      <div class="act-wrap">
        <svg class="act-svg" id="act-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="none"></svg>
        <div class="act-tip" id="act-tip"></div>
      </div>
      <div class="act-axis"><span id="act-from"></span><span id="act-to"></span></div>
      <div class="act-legend">
        <span><i class="act-dot" style="background:${COLOR_HOT}"></i>급증 (150%+)</span>
        <span><i class="act-dot" style="background:${COLOR_WARM}"></i>활발</span>
        <span><i class="act-dot" style="background:${COLOR_NORMAL}"></i>평소</span>
        <span><i class="act-dot" style="background:${COLOR_QUIET}"></i>한산</span>
      </div>
      <p class="act-note">
        급증은 대체로 급락·급등 같은 이벤트에 대한 반응입니다. 방향(공포/탐욕)은
        알려주지 않으므로 공탐지수와 함께 보세요.
      </p>`;

    const mp = mountPoint();
    if (mp.before) mp.parent.insertBefore(section, mp.before);
    else mp.parent.appendChild(section);

    const svg = section.querySelector("#act-svg");
    const tip = section.querySelector("#act-tip");
    const NS = "http://www.w3.org/2000/svg";

    const n = rows.length;
    const slot = VIEW_W / n;
    const barW = Math.max(1, slot * 0.7);
    const scale = (idx) => (Math.min(idx, CLAMP_INDEX) / CLAMP_INDEX) * VIEW_H;

    // 기준선(100 = 평소)
    const baseY = VIEW_H - scale(100);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", 0); line.setAttribute("x2", VIEW_W);
    line.setAttribute("y1", baseY); line.setAttribute("y2", baseY);
    line.setAttribute("stroke", "#3a3a5a");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("stroke-dasharray", "3 3");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(line);

    rows.forEach((row, i) => {
      const h = Math.max(1, scale(row.index));
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("class", "act-bar");
      rect.setAttribute("x", i * slot + (slot - barW) / 2);
      rect.setAttribute("y", VIEW_H - h);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", h);
      rect.setAttribute("fill", barColor(row.index));
      rect.setAttribute("rx", "1");
      svg.appendChild(rect);

      // 상한을 넘은 막대는 잘렸다는 표시를 남긴다 — 표시가 없으면 300%와 600%가
      // 같은 높이로 보여 값이 조용히 숨겨진다(정확한 값은 툴팁).
      if (row.index > CLAMP_INDEX) {
        const cut = document.createElementNS(NS, "rect");
        cut.setAttribute("x", i * slot + (slot - barW) / 2);
        cut.setAttribute("y", 0);
        cut.setAttribute("width", barW);
        cut.setAttribute("height", 2);
        cut.setAttribute("fill", "#fff");
        cut.setAttribute("opacity", "0.85");
        cut.setAttribute("pointer-events", "none");
        svg.appendChild(cut);
      }

      const show = (e) => {
        const wrap = section.querySelector(".act-wrap");
        const wr = wrap.getBoundingClientRect();
        const br = rect.getBoundingClientRect();
        // 클램프된 막대는 실제 값을 툴팁으로 알려준다 — 잘린 높이가 값을 숨기면 안 된다.
        tip.textContent = row.date + " · 평소의 " + row.index + "%";
        tip.classList.add("on");
        const x = br.left - wr.left + br.width / 2;
        tip.style.left = Math.max(0, Math.min(wr.width - tip.offsetWidth, x - tip.offsetWidth / 2)) + "px";
        tip.style.top = Math.max(0, br.top - wr.top - 26) + "px";
      };
      const hide = () => tip.classList.remove("on");

      rect.addEventListener("mouseenter", show);
      rect.addEventListener("mouseleave", hide);
      rect.addEventListener("touchstart", show, { passive: true });
      rect.addEventListener("touchend", hide);
    });

    section.querySelector("#act-from").textContent = rows[0].date;
    section.querySelector("#act-to").textContent = rows[n - 1].date;
  }

  function init() {
    fetch(DATA_SRC, { cache: "no-cache" })
      .then((r) => r.json())
      .then((d) => render(d && d.activity))
      .catch(() => {});   // 데이터 실패 시 조용히 미표시 — 페이지 나머지를 막지 않는다
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
