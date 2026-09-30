(function () {
  var canvas = document.getElementById("bg-field");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BASE_W = 1400;
  var BASE_H = 900;
  var bars = [];
  var seed = 0xa15eed;
  function rnd() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (var y = 0; y < BASE_H; y += 2.6) {
    for (var x = 0; x < BASE_W; ) {
      var nx = (x / BASE_W) * 2 - 1;
      var ny = (y / BASE_H) * 2 - 1;
      var blob =
        Math.exp(-(nx * nx * 0.95 + ny * ny * 0.85)) +
        0.55 * Math.exp(-((nx - 0.5) * (nx - 0.5) + (ny + 0.15) * (ny + 0.15)) / 0.28) +
        0.4 * Math.exp(-((nx + 0.45) * (nx + 0.45) + (ny - 0.25) * (ny - 0.25)) / 0.32);
      if (rnd() > Math.min(0.95, blob * 0.95)) {
        x += 6 + rnd() * 22;
        continue;
      }
      var w = 5 + rnd() * rnd() * 48;
      bars.push({ x: x, y: y, w: w, h: 2 });
      x += w + 2 + rnd() * 10;
    }
  }

  var W = 0;
  var H = 0;
  var dpr = 1;
  var scale = 1;
  var ox = 0;
  var oy = 0;
  var pointer = null;
  var pointerTarget = null;
  var force = 0;
  var raf = 0;
  var REPEL_R = 180;
  var REPEL_PUSH = 22;
  var COLOR_A = "#f74904";
  var COLOR_B = "#7a3cff";

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.max(W / BASE_W, H / BASE_H) * 1.05;
    ox = (W - BASE_W * scale) / 2;
    oy = (H - BASE_H * scale) / 2 - 30;
  }

  function drawFrame() {
    if (isLight()) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    if (pointerTarget) {
      if (!pointer) pointer = { x: pointerTarget.x, y: pointerTarget.y };
      else {
        pointer.x += (pointerTarget.x - pointer.x) * 0.18;
        pointer.y += (pointerTarget.y - pointer.y) * 0.18;
      }
      force += (1 - force) * 0.14;
    } else {
      force += (0 - force) * 0.1;
      if (pointer && force < 0.002) pointer = null;
    }

    ctx.clearRect(0, 0, W, H);
    var g = ctx.createLinearGradient(W * 0.25, H * 0.8, W * 0.75, H * 0.15);
    g.addColorStop(0, COLOR_A);
    g.addColorStop(1, COLOR_B);
    ctx.fillStyle = g;

    var alphaBase = reduceMotion ? 0.2 : 0.3;
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i];
      var x = ox + b.x * scale;
      var y = oy + b.y * scale;
      var bw = b.w * scale;
      var bh = Math.max(1.15, b.h * scale);
      var cx = x + bw / 2;
      var cy = y + bh / 2;
      var boost = 0;
      if (!reduceMotion && pointer && force > 0.001) {
        var dx = cx - pointer.x;
        var dy = cy - pointer.y;
        var dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < REPEL_R) {
          var a = Math.exp(-((dist / REPEL_R) * (dist / REPEL_R))) * force;
          boost = a;
          x += (dx / dist) * a * REPEL_PUSH;
          y += (dy / dist) * a * (REPEL_PUSH * 0.9);
        }
      }
      ctx.globalAlpha = alphaBase + boost * 0.45;
      ctx.fillRect(x, y, bw, bh);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    drawFrame();
    if (!reduceMotion && !isLight()) raf = requestAnimationFrame(loop);
    else raf = 0;
  }

  function kick() {
    if (isLight()) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      drawFrame();
      return;
    }
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function onPointer(e) {
    if (reduceMotion || isLight()) return;
    pointerTarget = { x: e.clientX, y: e.clientY };
    kick();
  }

  function clearPointer() {
    pointerTarget = null;
    kick();
  }

  layout();
  drawFrame();
  if (!reduceMotion) kick();

  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerleave", clearPointer);
  window.addEventListener("blur", clearPointer);
  window.addEventListener("resize", function () {
    layout();
    kick();
  });
  var themeObs = new MutationObserver(function () {
    kick();
  });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
