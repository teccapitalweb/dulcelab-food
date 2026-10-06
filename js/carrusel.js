/* =========================================================
   DULCELAB FOOD — Carrusel de "Cursos en Vivo"
   Sin librerías: es una fila con desplazamiento horizontal y "snap" (se desliza
   con el dedo o el mouse), más flechas, puntos y teclado. Muestra 1, 2 o 3
   cursos según el ancho de la pantalla.
   ========================================================= */
(function () {
  'use strict';

  var root = document.getElementById('carruselCursos');
  if (!root) return;

  var vp = root.querySelector('.carrusel__viewport');
  var track = root.querySelector('.carrusel__track');
  var cards = [].slice.call(track.children);
  var btnPrev = root.querySelector('[data-dir="-1"]');
  var btnNext = root.querySelector('[data-dir="1"]');
  var puntos = root.querySelector('.carrusel__puntos');
  var estado = root.querySelector('.carrusel__estado');
  if (!cards.length) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var porVista = 1, paginas = 1, actual = 0, ticking = false;

  function paso() {
    return cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : cards[0].offsetWidth;
  }
  function maxScroll() { return Math.max(0, vp.scrollWidth - vp.clientWidth); }
  function irA(izq) {
    vp.scrollTo({ left: Math.max(0, Math.min(izq, maxScroll())), behavior: reduce ? 'auto' : 'smooth' });
  }
  function irAPagina(p) { irA(p * porVista * paso()); }

  function medir() {
    var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    var p = paso() || 1;
    porVista = Math.max(1, Math.round((track.clientWidth + gap) / p));
    var nuevas = Math.max(1, Math.ceil(cards.length / porVista));
    if (nuevas !== paginas || !puntos.children.length) {
      paginas = nuevas;
      puntos.innerHTML = '';
      for (var i = 0; i < paginas; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'carrusel__punto';
        b.setAttribute('aria-label', 'Ir al grupo ' + (i + 1) + ' de ' + paginas);
        (function (n) { b.addEventListener('click', function () { irAPagina(n); }); })(i);
        puntos.appendChild(b);
      }
    }
    root.classList.toggle('carrusel--sin-nav', paginas <= 1);
  }

  function actualizar() {
    ticking = false;
    var x = vp.scrollLeft, fin = maxScroll();
    var p = Math.round(x / (porVista * paso() || 1));
    if (x >= fin - 2) p = paginas - 1;
    actual = Math.max(0, Math.min(paginas - 1, p));
    [].forEach.call(puntos.children, function (b, i) {
      b.classList.toggle('is-activo', i === actual);
      if (i === actual) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    btnPrev.disabled = x <= 2;
    btnNext.disabled = x >= fin - 2;
    if (estado) {
      var desde = Math.min(cards.length, Math.round(x / (paso() || 1)) + 1);
      var hasta = Math.min(cards.length, desde + porVista - 1);
      estado.textContent = 'Mostrando cursos ' + desde + (hasta > desde ? ' a ' + hasta : '') + ' de ' + cards.length;
    }
  }

  vp.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(actualizar); }
  }, { passive: true });

  btnPrev.addEventListener('click', function () { irAPagina(actual - 1 < 0 ? 0 : actual - 1); });
  btnNext.addEventListener('click', function () { irAPagina(Math.min(paginas - 1, actual + 1)); });

  // Teclado: con el carrusel enfocado, ← y → cambian de grupo
  vp.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); btnNext.click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); btnPrev.click(); }
  });

  /* ---------- arrastrar con el mouse (en el celular ya se desliza solo) ---------- */
  var arrastre = null, movio = false;
  vp.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    arrastre = { x: e.clientX, left: vp.scrollLeft, id: e.pointerId, activo: false };
    movio = false;
  });
  vp.addEventListener('pointermove', function (e) {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    var dx = e.clientX - arrastre.x;
    if (!arrastre.activo && Math.abs(dx) > 6) {
      arrastre.activo = true; movio = true;
      vp.classList.add('is-arrastrando');
      vp.style.scrollSnapType = 'none';
      try { vp.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (arrastre.activo) vp.scrollLeft = arrastre.left - dx;
  });
  function soltar(e) {
    if (!arrastre) return;
    var activo = arrastre.activo;
    arrastre = null;
    if (!activo) return;
    vp.classList.remove('is-arrastrando');
    var destino = Math.round(vp.scrollLeft / (paso() || 1)) * paso();
    vp.style.scrollSnapType = '';
    irA(destino);
  }
  vp.addEventListener('pointerup', soltar);
  vp.addEventListener('pointercancel', soltar);
  // Si se arrastró, no se debe abrir el flyer ni el enlace que quedó bajo el mouse
  vp.addEventListener('click', function (e) {
    if (movio) { e.preventDefault(); e.stopPropagation(); movio = false; }
  }, true);
  vp.addEventListener('dragstart', function (e) { e.preventDefault(); });

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { medir(); actualizar(); }, 120);
  });

  // Las tarjetas que quedan fuera de la vista no deben esperar su animación de entrada:
  // cuando el carrusel aparece, todas se muestran (así no "aparecen de golpe" al deslizar).
  function mostrarTodas() { cards.forEach(function (c) { c.classList.add('is-in'); }); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entradas) {
      if (entradas[0].isIntersecting) { mostrarTodas(); io.disconnect(); }
    }, { threshold: 0.05 });
    io.observe(root);
  } else {
    mostrarTodas();
  }

  medir();
  actualizar();
  // las imágenes y fuentes pueden cambiar el ancho al cargar
  window.addEventListener('load', function () { medir(); actualizar(); });
})();
