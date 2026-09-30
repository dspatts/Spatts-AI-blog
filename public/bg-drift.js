(function () {
  var el = document.getElementById("bg-drift");
  if (!el) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Always animate unless the user explicitly wants reduced motion.
  if (reduce) return;
  var t0 = performance.now();
  function frame(now) {
    var t = (now - t0) / 1000;
    var x = Math.sin(t * 0.35) * 4.5;
    var y = Math.cos(t * 0.28) * 3.5;
    var s = 1.06 + Math.sin(t * 0.22) * 0.04;
    var x2 = Math.cos(t * 0.31) * -5;
    var y2 = Math.sin(t * 0.27) * 4;
    el.style.transform = "translate3d(" + x + "%, " + y + "%, 0) scale(" + s + ")";
    el.style.setProperty("--drift-x", x2 + "%");
    el.style.setProperty("--drift-y", y2 + "%");
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
