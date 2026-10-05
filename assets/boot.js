/* 사용자 단말 강제 정리 — 옛 service worker / 캐시 / 깨진 PWA 상태가 화면을 빈 상태로 잡고
   있을 수 있어 페이지 로드 직후 1회만 자기 정리 후 새로고침. sessionStorage 마커로 무한 reload 방지.
   SW 없는 사용자에게는 무해 (regs.length===0이면 reload 안 함).
   2026-10-05: index.html <head> 인라인 <script> 에서 이 파일로 분리. CSP script-src 에서 'unsafe-inline' 을
   빼기 위해서다(인라인 스크립트가 하나라도 있으면 XSS 방어로서의 CSP 가 무력화된다). <head> 에서
   동기(blocking) 로드되므로 실행 시점은 인라인일 때와 같다. */
(function(){
  try {
    if (sessionStorage.getItem('_gt_clean')) return;
    var jobs = [];
    var hadSW = false;
    if ('serviceWorker' in navigator) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){
        hadSW = rs.length > 0;
        return Promise.all(rs.map(function(r){ return r.unregister(); }));
      }));
    }
    if (typeof caches !== 'undefined') {
      jobs.push(caches.keys().then(function(ks){
        return Promise.all(ks.map(function(k){ return caches.delete(k); }));
      }));
    }
    Promise.all(jobs).then(function(){
      if (hadSW) {
        sessionStorage.setItem('_gt_clean', '1');
        location.reload();
      }
    }).catch(function(){});
  } catch(_) {}
})();
