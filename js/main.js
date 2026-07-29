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
  var fab = document.getElementById('waFab');
  var heroEl = document.querySelector('.hero');
  var ticking = false;

  function fabThreshold() {
    return heroEl ? heroEl.offsetHeight * 0.6 : window.innerHeight * 0.6;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 12);
      if (fab) fab.classList.toggle('is-on', window.scrollY > fabThreshold());
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

  /* ---------- 6. Tilt 3D (hero y cards de curso) ---------- */
  var canTilt = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function attachTilt(el, opts) {
    var maxDeg = opts.maxDeg;
    var depth = opts.depth;
    var persp = opts.perspective || 0;
    var frame = null;

    function reset() {
      // Hay que cancelar el frame pendiente: si el puntero sale antes de que
      // corra, el callback vuelve a pintar el tilt y la card queda torcida.
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      el.classList.remove('is-tilting');
      el.style.transform = '';
    }

    el.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = null;
        var rect = el.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        el.classList.add('is-tilting');
        el.style.transform =
          (persp ? 'perspective(' + persp + 'px) ' : '') +
          'rotateY(' + (px * maxDeg * 2).toFixed(2) + 'deg) ' +
          'rotateX(' + (-py * maxDeg * 2).toFixed(2) + 'deg) ' +
          'translateZ(' + depth + 'px)';
      });
    });

    el.addEventListener('pointerleave', reset);
    el.addEventListener('blur', reset, true);
  }

  if (canTilt && !reduceMotion.matches) {
    var heroCard = document.getElementById('heroCard');
    if (heroCard) attachTilt(heroCard, { maxDeg: 7, depth: 12 });

    var tiltCards = document.querySelectorAll('.tilt-card');
    for (var ti = 0; ti < tiltCards.length; ti++) {
      attachTilt(tiltCards[ti], { maxDeg: 4.5, depth: 8, perspective: 900 });
    }
  }

  /* ---------- 7. Textura opcional del hero ---------- */
  var heroTexture = document.getElementById('heroTexture');
  if (heroTexture) {
    var probe = new Image();
    probe.onload = function () {
      heroTexture.style.backgroundImage = 'url("assets/hero-bg.png")';
      heroTexture.classList.add('is-on');
    };
    probe.src = 'assets/hero-bg.png';
  }

  /* ---------- 8. Entrada al hacer scroll ---------- */
  var revealables = document.querySelectorAll('.rv');

  function revealAll() {
    for (var i = 0; i < revealables.length; i++) revealables[i].classList.add('is-in');
  }

  if ('IntersectionObserver' in window) {
    var rvObserver = new IntersectionObserver(function (entries) {
      // El escalonado se cuenta sobre lo que entra junto, no sobre el indice
      // dentro del grupo: si no, las ultimas cards de una reja arrastran un
      // retardo fijo grande y parecen animarse mas que las primeras.
      var shown = 0;
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        entries[i].target.style.transitionDelay = Math.min(shown * 80, 320) + 'ms';
        entries[i].target.classList.add('is-in');
        rvObserver.unobserve(entries[i].target);
        shown++;
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    for (var ri = 0; ri < revealables.length; ri++) rvObserver.observe(revealables[ri]);
  } else {
    revealAll();
  }

  /* ---------- 9. Scrollspy ---------- */
  var spy = [];
  navLinks.forEach(function (link) {
    var href = link.getAttribute('href') || '';
    if (href.charAt(0) !== '#' || href.length < 2) return;
    var target = document.querySelector(href);
    if (target) spy.push({ link: link, el: target });
  });

  function docTop(el) {
    return el.getBoundingClientRect().top + window.scrollY;
  }

  spy.sort(function (a, b) { return docTop(a.el) - docTop(b.el); });

  function updateSpy() {
    if (!spy.length) return;
    var navH = nav ? nav.offsetHeight : 80;
    var pos = window.scrollY + navH + 32;
    var current = spy[0];

    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
      current = spy[spy.length - 1];
    } else {
      for (var i = 0; i < spy.length; i++) {
        if (docTop(spy[i].el) <= pos) current = spy[i];
      }
    }

    for (var j = 0; j < spy.length; j++) {
      spy[j].link.classList.toggle('is-active', spy[j] === current);
    }
  }

  var spyTicking = false;
  window.addEventListener('scroll', function () {
    if (spyTicking) return;
    spyTicking = true;
    requestAnimationFrame(function () { spyTicking = false; updateSpy(); });
  }, { passive: true });
  updateSpy();

  /* ---------- 10. Lightbox de flyers ---------- */
  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lightboxImg');
  var lbCaption = document.getElementById('lightboxCaption');

  if (lb && lbImg) {
    var lbPrev = lb.querySelector('[data-lb="prev"]');
    var lbNext = lb.querySelector('[data-lb="next"]');
    var lbItems = [];
    var lbIndex = 0;
    var lbLastFocus = null;

    function courseTitle(flyer) {
      var host = flyer.closest('.card--course');
      var h = host && host.querySelector('.card__title--course');
      return h ? h.textContent.trim() : 'Flyer del curso';
    }

    function lbRender() {
      var flyer = lbItems[lbIndex];
      if (!flyer) return;
      var title = courseTitle(flyer);
      lbImg.src = flyer.getAttribute('data-lightbox');
      lbImg.alt = 'Flyer del curso ' + title;
      lbCaption.textContent = title;
      var many = lbItems.length > 1;
      if (lbPrev) lbPrev.hidden = !many;
      if (lbNext) lbNext.hidden = !many;
    }

    function lbOpen(flyer) {
      lbItems = [].slice.call(document.querySelectorAll('.course__flyer.is-loaded[data-lightbox]'));
      lbIndex = lbItems.indexOf(flyer);
      if (lbIndex < 0) return;
      lbLastFocus = document.activeElement;
      lbRender();
      lb.hidden = false;
      document.body.style.overflow = 'hidden';
      if (fab) fab.classList.add('is-muted');
      requestAnimationFrame(function () { lb.classList.add('is-open'); });
      var closeBtn = lb.querySelector('[data-lb="close"]');
      if (closeBtn) closeBtn.focus();
    }

    function lbClose() {
      lb.classList.remove('is-open');
      document.body.style.overflow = '';
      if (fab) fab.classList.remove('is-muted');
      window.setTimeout(function () {
        lb.hidden = true;
        lbImg.src = '';
      }, 300);
      if (lbLastFocus && lbLastFocus.focus) lbLastFocus.focus();
    }

    function lbStep(delta) {
      if (lbItems.length < 2) return;
      lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
      lbRender();
    }

    document.addEventListener('click', function (e) {
      var flyer = e.target.closest ? e.target.closest('.course__flyer') : null;
      if (flyer && flyer.classList.contains('is-loaded')) lbOpen(flyer);
    });

    lb.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lb]');
      if (btn) {
        var role = btn.getAttribute('data-lb');
        if (role === 'close') lbClose();
        if (role === 'prev') lbStep(-1);
        if (role === 'next') lbStep(1);
        return;
      }
      // Clic fuera de la imagen
      if (!e.target.closest('.lightbox__img')) lbClose();
    });

    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') lbClose();
      if (e.key === 'ArrowLeft') lbStep(-1);
      if (e.key === 'ArrowRight') lbStep(1);
    });
  }
})();
