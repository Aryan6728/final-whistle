// Final Whistle — shared interactions

(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasViewTimeline = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');

  // Scroll reveal fallback — only needed where the browser can't do it in pure CSS
  if (!reduceMotion && !hasViewTimeline && 'IntersectionObserver' in window) {
    document.body.classList.add('js-reveal');
    var revealTargets = document.querySelectorAll('.feature, .step, .receipt');
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  }

  // Count-up animation for the stat strip (numbers are already correct in the HTML,
  // this only adds the counting motion — nothing breaks if it doesn't run)
  var stats = document.querySelectorAll('.stat .num');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var statObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.textContent.trim(), 10);
        if (isNaN(target)) return;
        var duration = 900;
        var startTime = null;

        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          el.textContent = Math.floor(progress * target);
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target;
        }
        requestAnimationFrame(step);
        statObserver.unobserve(el);
      });
    }, { threshold: 0.4 });
    stats.forEach(function (el) { statObserver.observe(el); });
  }
})();
