/* dsh-startup — client half (best-effort enhancement only).
 *
 * 这里没有一件事是"必须发生"的：
 *   - 开屏的消失由 splash.html 里的 dsh-sp-hide 纯 CSS 动画保证；
 *   - 视频播不出来，就保持只有文字/深度尺的版本；
 *   - 本脚本抛错，页面照常。
 */
(function () {
  'use strict';
  if (window.__dshSplashBoot) return;
  window.__dshSplashBoot = true;

  var root = document.getElementById('dsh-splash');
  if (!root) return;

  /* ── 1) 角色视频：出场段播到 2.55 秒 → 切到无缝循环段，之后一直动 ── */
  var video = document.getElementById('dsh-sp-video');
  var idle = document.getElementById('dsh-sp-idle');
  var SWITCH_AT = 2.55;      /* 与 idle.webm 的第一帧对齐 */
  var switched = false;

  if (video) {
    video.addEventListener('playing', function () {
      root.classList.add('has-video');
    }, { once: true });
    video.addEventListener('error', function () {
      try { video.remove(); } catch (e) { /* ignore */ }
      /* 出场段挂了：如果循环段还能播，就直接上循环段 */
      if (idle) { try { idle.play(); root.classList.add('has-idle'); } catch (e2) {} }
    }, { once: true });
    try {
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { /* ignore */ }
  }

  if (idle) {
    idle.addEventListener('error', function () {
      try { idle.remove(); } catch (e) { /* ignore */ }
      root.classList.remove('has-idle');
    }, { once: true });
  }

  function switchToIdle() {
    if (switched || !idle) return;
    switched = true;
    try { idle.currentTime = 0; } catch (e) { /* ignore */ }
    try {
      var q = idle.play();
      if (q && typeof q.catch === 'function') q.catch(function () {});
    } catch (e) { /* ignore */ }
    root.classList.add('has-idle');
    /* 出场段继续播完（已经不可见），播完就停掉，省解码 */
    setTimeout(function () {
      try { if (video) video.pause(); } catch (e) {}
    }, 900);
  }

  if (video) {
    video.addEventListener('timeupdate', function () {
      if (!switched && video.currentTime >= SWITCH_AT) switchToIdle();
    });
  }

  /* ── 2) 深度尺：节奏跟着文字出现走 ─────────────────────────────── */
  var fill = document.getElementById('dsh-sp-fill');
  var box = document.getElementById('dsh-sp-ruler');
  var num = document.getElementById('dsh-sp-depthnum');

  /* [开始毫秒, 持续毫秒] —— 与 splash.html 里的三行读数一一对应，**必须升序**。
     4 个落点 = 每个 250m：一行字出现，探测器往下走 250m；字停它也停。
     （上一版是 7 个乱序落点 + 遇到未到时间就 break，于是 3 秒附近从 2 个落点
       跳到 6 个 —— 那正是"250 瞬间跳到 750"。） */
  // 四段首尾相接（1000/1000/1000/900ms），深度从 1.6s 连续下潜到 5.5s。
  // 原来每段 620ms，段间留 380ms 空档 —— 探测器会"刹停 380ms 再起步"三次，
  // 与画面其他连续运动对比很突兀。相接后近乎静止的时间从 1300ms 降到 250ms。
  var DROPS = [
    [1600, 1000],  /* 声呐阵列校准 */
    [2600, 1000],  /* 相位锁定 */
    [3600, 1000],  /* 全部就绪 */
    [4600, 900]    /* 收尾：到 5500ms 正好 1000m */
  ];

  function smooth(p) { return p * p * (3 - 2 * p); }

  function progress(ms) {
    var done = 0;
    for (var i = 0; i < DROPS.length; i++) {
      var st = DROPS[i][0], du = DROPS[i][1];
      var local = (ms - st) / du;
      if (local <= 0) continue;   /* 没到时间：不贡献，但不打断后面 */
      done += smooth(Math.min(1, local));
    }
    return done / DROPS.length;
  }

  /* 深度带：0–250 光合带 / 250–600 微光带 / 600–1000 深渊带。
     生物的显隐由这三个 class 决定 —— 探测器下到哪一层，就出现哪一层的生物。 */
  var lastZone = 0;
  function setZone(pr) {
    var z = pr < 0.25 ? 1 : (pr < 0.6 ? 2 : 3);
    if (z === lastZone) return;
    lastZone = z;
    root.classList.remove('zone1', 'zone2', 'zone3');
    root.classList.add('zone' + z);
  }

  // ── 数据脊：读数随下潜真的在变（压力 = 深度 × 0.1 bar；温度随深度下降）──
  var hudTc    = document.getElementById('dsh-sp-tc');
  var hudPress = document.getElementById('dsh-sp-press');
  var hudTemp  = document.getElementById('dsh-sp-temp');
  var hudPing  = document.getElementById('dsh-sp-ping');
  var hudLast  = -999;
  var slugEl   = document.querySelector('#dsh-splash .sp-slug');

  function pad2(n, w) {
    var s2 = String(n);
    while (s2.length < w) { s2 = '0' + s2; }
    return s2;
  }

  function paintHud(ms, depthM, pr0) {
    if (ms - hudLast < 90) { return; }   // 约 11 次/秒，够读又不浪费帧
    hudLast = ms;
    if (hudTc) {
      hudTc.textContent = pad2(Math.floor(ms / 60000), 2) + ':' +
                          pad2(Math.floor(ms / 1000) % 60, 2) + '.' +
                          pad2(Math.floor((ms % 1000) / 10), 2);
    }
    if (hudPress) { hudPress.textContent = (depthM / 10).toFixed(1); }
    if (hudTemp)  { hudTemp.textContent  = (18 - depthM * 0.014).toFixed(1); }
    if (hudPing)  { hudPing.textContent  = String(126 + Math.round((Math.sin(depthM * 0.7) + 1) * 3)); }
    if (slugEl)   { slugEl.style.setProperty('--pr', pr0.toFixed(4)); }
  }

  function paint(pr, ms) {
    if (fill && box) fill.style.height = (pr * box.clientHeight).toFixed(1) + 'px';
    var depthM = pr * 1000;
    if (num) num.textContent = String(Math.round(depthM)).padStart(4, '0');
    paintHud(ms, depthM, pr);
    setZone(pr);
  }

  var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
  var alive = true;

  function tick() {
    if (!alive) return;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    paint(progress(now - t0), now - t0);
    requestAnimationFrame(tick);
  }
  if (fill && box) requestAnimationFrame(tick);

  /* ── 3) 收尾：CSS 已经会隐藏它，这里只负责把节点摘掉、别留解码器 ── */
  function teardown() {
    alive = false;
    try { if (video) video.pause(); } catch (e) { /* ignore */ }
    try { if (idle) idle.pause(); } catch (e) { /* ignore */ }
    try {
      if (root && root.parentNode) {
        root.style.transition = 'opacity .4s ease';
        root.style.opacity = '0';
        setTimeout(function () {
          try { if (root && root.parentNode) root.parentNode.removeChild(root); } catch (e) {}
        }, 450);
      }
    } catch (e) { /* ignore */ }
  }

  // 收尾：左侧已由 CSS 淡完，这里切换状态 + 给飞行动画量出起点
  function launchLetters() {
    try {
      var slugTitle = document.querySelector('#dsh-splash .sp-slug > b');
      var letters   = document.querySelectorAll('#dsh-splash .sp-endmark > b');
      if (!slugTitle || !letters.length) { return; }
      var sb = slugTitle.getBoundingClientRect();
      var n  = letters.length;
      var chars = slugTitle.textContent.replace(/\s/g, '').length;  // 14? 见下
      for (var i = 0; i < n; i++) {
        var el = letters[i];
        if (!el.textContent.trim()) { continue; }        // 跳过词间空格
        var rb = el.getBoundingClientRect();
        if (!rb.width) { continue; }
        // 该字母在底部那行里的大致横向位置（按序号在整行里均分）
        var slot = (i + 0.5) / n;
        var sx = sb.left + sb.width * slot;
        var sy = sb.top + sb.height * 0.5;
        var ex = rb.left + rb.width * 0.5;
        var ey = rb.top + rb.height * 0.5;
        var sc = Math.max(0.1, sb.height / rb.height);
        el.style.setProperty('--dx', (sx - ex).toFixed(1) + 'px');
        el.style.setProperty('--dy', (sy - ey).toFixed(1) + 'px');
        el.style.setProperty('--s', sc.toFixed(3));
      }
    } catch (e) { /* ignore */ }
  }

  setTimeout(function () {
    try {
      root.classList.add('sp-cut');
      launchLetters();
    } catch (e) { /* ignore */ }
  }, 8450);
  setTimeout(teardown, 10900);
  root.addEventListener('click', function (e) {
    if (e && e.target && e.target.classList && e.target.classList.contains('sp-skip')) teardown();
  }, true);
})();
