(function () {
  var el = document.getElementById("bg-drift");
  if (!el) return;
  var t0 = performance.now();
  function frame(now) {
    var t = (now - t0) / 1000;
    var x = Math.sin(t * 0.45) * 5.5;
    var y = Math.cos(t * 0.36) * 4.2;
    var s = 1.07 + Math.sin(t * 0.28) * 0.05;
    var x2 = Math.cos(t * 0.4) * -6;
    var y2 = Math.sin(t * 0.34) * 5;
    el.style.transform = "translate3d(" + x + "%, " + y + "%, 0) scale(" + s + ")";
    el.style.setProperty("--drift-x", x2 + "%");
    el.style.setProperty("--drift-y", y2 + "%");
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
