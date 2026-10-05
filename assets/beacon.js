/* first-party 방문 통계 (2026-08-15) — 무쿠키, IP는 수집 서버가 SHA-256 해시로만 저장 (privacy.html §1).
   sessionStorage dedupe: 과거 SW 자가정리(sw.js)가 강제 새로고침하는 1회 방문의 이중 집계 방지.
   2026-10-05: index.html 끝의 인라인 <script> 에서 이 파일로 분리 (CSP script-src 'unsafe-inline' 제거 — boot.js 참조).
   수신단 https://redalert.red/api/beacon 은 CSP connect-src 에 허용돼 있어야 한다(_headers). */
(function(){
  try{
    if(/bot|crawl|spider|preview|headless|lighthouse/i.test(navigator.userAgent))return;
    var now=Date.now(),KEY='gt_beacon_last';
    try{
      var s=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(s&&now-s.t<10000)return;
      sessionStorage.setItem(KEY,JSON.stringify({t:now}));
    }catch(e){}
    var p=JSON.stringify({site:'gongtam',path:location.pathname+(location.hash||''),ref:document.referrer||''});
    var u='https://redalert.red/api/beacon';
    if(navigator.sendBeacon){navigator.sendBeacon(u,new Blob([p],{type:'text/plain'}));}
    else if(window.fetch){fetch(u,{method:'POST',body:p,mode:'no-cors',keepalive:true}).catch(function(){});}
  }catch(e){}
})();
