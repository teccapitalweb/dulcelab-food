/* =========================================================
   DULCELAB FOOD — Fase 1
   Tema día/noche · menú móvil · partículas canvas · tilt 3D
   ========================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- 1. Tema día / noche ---------- */
  var STORAGE_KEY = 'dlf-theme';
  var toggle = document.getElementById('themeToggle');
  var themeColor = document.querySelector('meta[name="theme-color"]');

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    if (toggle) toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#2A1815' : '#FFF3E5');
    document.dispatchEvent(new CustomEvent('dlf:theme', { detail: theme }));
  }

  applyTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    });
  }

  /* ---------- 2. Navbar: sombra al hacer scroll ---------- */
  var nav = document.getElementById('nav');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 12);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 3. Menú hamburguesa ---------- */
  var burger = document.getElementById('burger');
  var links = document.getElementById('navLinks');
  var scrim = document.getElementById('navScrim');

  function setMenu(open) {
    if (!burger || !links) return;
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    links.classList.toggle('is-open', open);
    if (scrim) scrim.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  }

  if (burger) {
    burger.addEventListener('click', function () {
      setMenu(!burger.classList.contains('is-open'));
    });
  }
  if (scrim) scrim.addEventListener('click', function () { setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });
  if (links) {
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
  }
  window.addEventListener('resize', function () {
    if (window.innerWidth >= 768) setMenu(false);
  });

  /* ---------- 4. Link activo ---------- */
  var navLinks = document.querySelectorAll('.nav__link');
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.forEach(function (l) { l.classList.remove('is-active'); });
      link.classList.add('is-active');
    });
  });

  /* ---------- 5. Partículas "harina / azúcar" ---------- */
  var canvas = document.getElementById('particles');

  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var hero = document.querySelector('.hero');
    var MAX = 40;
    var particles = [];
    var w = 0, h = 0, dpr = 1;
    var rafId = null;
    var visible = true;
    var color = '255,243,229';
    var alpha = 0.4;

    function readThemeColors() {
      var cs = getComputedStyle(root);
      color = (cs.getPropertyValue('--particle') || '255,243,229').trim();
      alpha = parseFloat(cs.getPropertyValue('--particle-alpha')) || 0.4;
    }

    function resize() {
      if (!hero) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = hero.clientWidth;
      h = hero.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      particles = [];
      var count = Math.min(MAX, Math.round(w / 26));
      for (var i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.7 + Math.random() * 2.1,
          vx: (Math.random() - 0.5) * 0.16,
          vy: 0.12 + Math.random() * 0.34,
          a: 0.25 + Math.random() * 0.75,
          drift: Math.random() * Math.PI * 2,
          speed: 0.004 + Math.random() * 0.008
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + color + ',' + (p.a * alpha).toFixed(3) + ')';
        ctx.fill();
      }
    }

    function step() {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.drift += p.speed;
        p.x += p.vx + Math.sin(p.drift) * 0.22;
        p.y += p.vy;
        if (p.y - p.r > h) { p.y = -p.r; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
      }
      draw();
      rafId = requestAnimationFrame(step);
    }

    function start() {
      if (rafId !== null || reduceMotion.matches || !visible) return;
      rafId = requestAnimationFrame(step);
    }
    function stop() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function boot() {
      readThemeColors();
      resize();
      seed();
      if (reduceMotion.matches) { stop(); draw(); }
      else { stop(); start(); }
    }

    boot();

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(boot, 180);
    });

    document.addEventListener('dlf:theme', function () {
      readThemeColors();
      if (reduceMotion.matches) draw();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    if ('IntersectionObserver' in window && hero) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0 }).observe(hero);
    }

    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener('change', boot);
    }
  }

  /* ---------- 6. Tilt 3D de la card del hero ---------- */
  var card = document.getElementById('heroCard');
  var canTilt = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (card && canTilt && !reduceMotion.matches) {
    var MAX_DEG = 7;
    var frame = null;

    function reset() {
      card.classList.remove('is-tilting');
      card.style.transform = '';
    }

    card.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = null;
        var rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        card.classList.add('is-tilting');
        card.style.transform =
          'rotateY(' + (px * MAX_DEG * 2).toFixed(2) + 'deg) ' +
          'rotateX(' + (-py * MAX_DEG * 2).toFixed(2) + 'deg) ' +
          'translateZ(12px)';
      });
    });

    card.addEventListener('pointerleave', reset);
    card.addEventListener('blur', reset, true);
  }
})();
