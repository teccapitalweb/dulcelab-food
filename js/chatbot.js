/* =========================================================
   DULCELAB FOOD — Asistente virtual ("Tu guía")
   Chat de respuestas guiadas (botones + una caja para escribir una palabra).
   No es IA: busca en el catálogo real (cursos del Club VIP que se leen de
   Firestore y cursos en vivo que están en esta misma página) y responde
   preguntas frecuentes con texto escrito aquí. Si no sabe, manda a WhatsApp.
   ========================================================= */
(function () {
  'use strict';

  var WA = '522361223226';
  var CLUB = 'https://club.dulcelabfood.com';
  var CONFIG_URL = 'https://firestore.googleapis.com/v1/projects/dulcelab-club/databases/(default)/documents/config/club';
  var CHEF = 'assets/chef-guia.webp';

  /* ---------- utilidades ---------- */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function waLink(texto) { return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(texto); }
  function dinero(n) { return '$' + Number(n).toLocaleString('es-MX'); }

  /* ---------- datos reales ---------- */
  var cursosClub = null; // promesa (la comparte la encuesta)
  function cargarClub() {
    if (!cursosClub) cursosClub = (window.dlfCursos ? window.dlfCursos() : Promise.resolve([])).catch(function () { return []; });
    return cursosClub;
  }

  var precios = null;
  function cargarPrecios() {
    if (precios) return precios;
    precios = fetch(CONFIG_URL).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var f = (d && d.fields) || {};
      var mes = f.precioMes && Number(f.precioMes.integerValue || f.precioMes.doubleValue);
      var ano = f.precioAno && Number(f.precioAno.integerValue || f.precioAno.doubleValue);
      return { mes: mes || null, ano: ano || null };
    }).catch(function () { return { mes: null, ano: null }; });
    return precios;
  }

  // Cursos en vivo: se leen de las tarjetas que ya están en la página, así
  // el asistente nunca queda desfasado de lo que se ve en "Cursos en Vivo".
  function cursosVivo() {
    return [].slice.call(document.querySelectorAll('#coursesGrid .card--course')).map(function (c) {
      var t = c.querySelector('.card__title--course'), ch = c.querySelector('.course__chef'), p = c.querySelector('.course__price'), a = c.querySelector('a.btn');
      return { titulo: t ? t.textContent.trim() : '', chef: ch ? ch.textContent.trim() : '', precio: p ? p.textContent.replace(/\s+/g, ' ').trim() : '', href: a ? a.getAttribute('href') : waLink('Hola, quiero informes de los cursos en vivo de DulceLab Food') };
    }).filter(function (c) { return c.titulo; });
  }

  /* ---------- búsqueda ---------- */
  // k = palabras que se buscan en el catálogo; a = lo que la persona suele escribir
  var AREAS = [
    { t: 'Costos y precios', k: ['costo', 'costeo', 'precio', 'fijacion', 'rentab'], a: ['costo', 'costeo', 'precio', 'rentab', 'ganancia', 'cobrar'] },
    { t: 'Inventarios y mermas', k: ['inventario', 'compras', 'insumo', 'merma', 'desperdicio'], a: ['inventario', 'compra', 'insumo', 'merma', 'desperdicio'] },
    { t: 'Producción y calidad', k: ['estandariz', 'proceso', 'inocuidad', 'calidad', 'higiene', 'produccion'], a: ['produccion', 'proceso', 'calidad', 'inocuidad', 'higiene', 'estandar'] },
    { t: 'Repostería', k: ['reposter', 'postre', 'pastel', 'decoracion'], a: ['reposter', 'postre', 'pastel', 'torta', 'galleta', 'cupcake', 'decoracion', 'betun'] },
    { t: 'Panadería', k: ['panader', 'masa madre', 'pan artesanal'], a: ['panader', 'pan', 'masa', 'hornear', 'fermentacion'] },
    { t: 'Cocina', k: ['cocina', 'platillo', 'menu', 'mexicana', 'catering'], a: ['cocin', 'chef', 'platillo', 'guiso', 'mexicana', 'menu', 'catering', 'comida'] },
    { t: 'Emprendimiento', k: ['negocio', 'emprend', 'rentab', 'ventas'], a: ['negocio', 'emprend', 'vender', 'venta', 'empresa'] }
  ];
  var STOP = ['quiero', 'curso', 'cursos', 'sobre', 'para', 'como', 'algo', 'tienen', 'hay', 'una', 'uno', 'los', 'las', 'del', 'que', 'con', 'por', 'mas', 'aprender', 'buscar', 'necesito', 'me', 'de', 'la', 'el', 'en', 'un', 'y', 'o'];

  function puntaje(texto, claves) { var t = norm(texto), n = 0; claves.forEach(function (k) { if (t.indexOf(k) !== -1) n += 1; }); return n; }

  function buscar(claves, clubLista) {
    var club = clubLista.map(function (c) {
      var p = puntaje(c.titulo, claves) * 3 + puntaje(c.area, claves) * 2 + puntaje(c.descripcion, claves) + puntaje(c.modulos.concat(c.materiales).join(' '), claves);
      return { c: c, p: p };
    }).filter(function (x) { return x.p > 0; }).sort(function (a, b) { return b.p - a.p; }).map(function (x) { return x.c; });
    var vivo = cursosVivo().map(function (c) { return { c: c, p: puntaje(c.titulo, claves) * 2 + puntaje(c.chef, claves) }; })
      .filter(function (x) { return x.p > 0; }).sort(function (x, y) { return y.p - x.p; }).map(function (x) { return x.c; });
    return { club: club, vivo: vivo };
  }
  function clavesDeTexto(texto) {
    var tokens = norm(texto).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 3 && STOP.indexOf(w) === -1; })
      .map(function (w) { return w.length > 4 ? w.replace(/(es|s)$/, '') : w; });
    // si lo escrito se parece a un área ("pan", "pasteles", "chef"), se busca con las palabras de esa área
    var extra = [];
    tokens.forEach(function (w) {
      AREAS.forEach(function (ar) {
        if (ar.a.some(function (x) { return w.indexOf(x) === 0 || x.indexOf(w) === 0; })) extra = extra.concat(ar.k);
      });
    });
    return tokens.concat(extra);
  }

  /* ---------- interfaz ---------- */
  var launcher = el('div', 'dlfbot-launcher');
  var tip = el('div', 'dlfbot-tip', 'Tu asistente virtual');
  var btn = el('button', 'dlfbot-btn'); btn.type = 'button'; btn.setAttribute('aria-label', 'Abrir el asistente virtual');
  btn.innerHTML = '<img src="' + CHEF + '" width="1086" height="1448" alt=""><span class="dlfbot-btn__dot" aria-hidden="true"></span>';
  launcher.appendChild(tip); launcher.appendChild(btn);

  var panel = el('section', 'dlfbot-panel');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Asistente virtual de DulceLab Food');
  panel.innerHTML =
    '<header class="dlfbot-head">' +
      '<span class="dlfbot-avatar"><img src="' + CHEF + '" width="1086" height="1448" alt=""></span>' +
      '<div class="dlfbot-head__txt"><small>DULCELAB FOOD</small><strong>Tu guía</strong><span>Guía virtual de cursos</span></div>' +
      '<button type="button" class="dlfbot-icon" id="dlfbotReiniciar" aria-label="Empezar de nuevo" title="Empezar de nuevo">↻</button>' +
      '<button type="button" class="dlfbot-icon" id="dlfbotCerrar" aria-label="Minimizar" title="Minimizar">—</button>' +
    '</header>' +
    '<p class="dlfbot-aviso">Respuestas guiadas con nuestro catálogo. No hay una persona conectada; si lo prefieres, escribe al equipo.</p>' +
    '<div class="dlfbot-msgs" id="dlfbotMsgs" role="log" aria-live="polite"></div>' +
    '<form class="dlfbot-form" id="dlfbotForm" autocomplete="off">' +
      '<input type="text" id="dlfbotInput" maxlength="120" placeholder="¿Qué te gustaría aprender?" aria-label="Escribe tu pregunta">' +
      '<button type="submit" class="dlfbot-send" aria-label="Enviar">↑</button>' +
    '</form>' +
    '<div class="dlfbot-pie"><a href="' + waLink('Hola, quiero hablar con un asesor de DulceLab Food') + '" target="_blank" rel="noopener">Hablar con un asesor</a><button type="button" id="dlfbotReiniciar2">Empezar de nuevo</button></div>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var msgs = panel.querySelector('#dlfbotMsgs');
  var input = panel.querySelector('#dlfbotInput');
  var abierto = false, iniciado = false, token = 0, cola = Promise.resolve();

  function bajar() { msgs.scrollTop = msgs.scrollHeight; }
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Todo lo que dice el bot pasa por una cola: así nada se mezcla ni se
  // pisa si la persona toca botones rápido, y "empezar de nuevo" la cancela.
  function encolar(fn) { var t = token; cola = cola.then(function () { if (t === token) return fn(t); }); return cola; }

  function decir(html) {
    return encolar(function (t) {
      var typing = el('div', 'dlfbot-msg dlfbot-msg--bot dlfbot-typing', '<i></i><i></i><i></i>');
      msgs.appendChild(typing); bajar();
      return espera(380 + Math.min(html.length * 2, 500)).then(function () {
        if (t !== token) return;
        typing.className = 'dlfbot-msg dlfbot-msg--bot';
        typing.innerHTML = html;
        bajar();
      });
    });
  }
  function usuario(texto) {
    var m = el('div', 'dlfbot-msg dlfbot-msg--user'); m.textContent = texto; msgs.appendChild(m); bajar();
  }
  function opciones(lista) {
    return encolar(function () {
      var grupo = el('div', 'dlfbot-chips');
      lista.forEach(function (o) {
        var b = el('button', 'dlfbot-chip'); b.type = 'button'; b.textContent = o.t;
        b.addEventListener('click', function () {
          if (grupo.classList.contains('is-usado')) return;
          grupo.classList.add('is-usado'); b.classList.add('is-elegido');
          usuario(o.t); o.fn();
        });
        grupo.appendChild(b);
      });
      msgs.appendChild(grupo); bajar();
    });
  }
  function tarjetas(items) {
    return encolar(function () {
      var caja = el('div', 'dlfbot-cards');
      items.forEach(function (it) {
        var a = el('a', 'dlfbot-card', '<span><b>' + esc(it.titulo) + '</b><small>' + esc(it.sub) + '</small></span><em>' + esc(it.cta) + ' →</em>');
        a.href = it.href; a.target = '_blank'; a.rel = 'noopener';
        caja.appendChild(a);
      });
      msgs.appendChild(caja); bajar();
    });
  }

  /* ---------- conversación ---------- */
  function menu(saludo) {
    if (typeof saludo === 'string') decir(saludo);
    else decir('¿Qué te gustaría hacer?');
    return opciones([
      { t: 'Buscar un curso', fn: elegirArea },
      { t: 'Conocer la membresía', fn: membresia },
      { t: 'Ver cursos en vivo', fn: enVivo },
      { t: 'Resolver una duda', fn: dudas },
      { t: 'Descubrir mi ruta', fn: ruta },
      { t: 'Hablar con un asesor', fn: asesor }
    ]);
  }

  function elegirArea() {
    decir('¡Genial! ¿De qué área te interesa aprender?<br><span class="dlfbot-peque">También puedes escribir una palabra abajo, por ejemplo «costos» o «pan».</span>');
    return opciones(AREAS.map(function (a) { return { t: a.t, fn: function () { mostrarResultados(a.k, a.t); } }; }).concat([{ t: 'Ver todos', fn: verTodos }]));
  }

  function mostrarResultados(claves, etiqueta) {
    return cargarClub().then(function (club) {
      var r = buscar(claves, club);
      if (!r.club.length && !r.vivo.length) {
        decir('Por ahora no tenemos un curso de <b>' + esc(etiqueta) + '</b> en el catálogo, pero tu interés nos sirve para decidir qué grabar después. 💛<br>Un asesor puede orientarte con lo que sí hay.');
        return opciones([{ t: 'Hablar con un asesor', fn: asesor }, { t: 'Buscar otra área', fn: elegirArea }, { t: 'Menú principal', fn: menu }]);
      }
      decir('Esto encontré de <b>' + esc(etiqueta) + '</b>:');
      if (r.club.length) {
        tarjetas(r.club.slice(0, 3).map(function (c) { return { titulo: c.titulo, sub: 'Club VIP' + (c.area ? ' · ' + c.area : '') + (c.tieneGratis ? ' · clases de muestra gratis' : ''), cta: 'Ver', href: CLUB }; }));
      }
      if (r.vivo.length) {
        decir('Y en vivo:');
        tarjetas(r.vivo.slice(0, 3).map(function (c) { return { titulo: c.titulo, sub: c.chef + ' · ' + c.precio, cta: 'Inscribirme', href: c.href }; }));
      }
      return opciones([{ t: 'Buscar otra área', fn: elegirArea }, { t: 'Hablar con un asesor', fn: asesor }, { t: 'Menú principal', fn: menu }]);
    });
  }

  function verTodos() {
    return cargarClub().then(function (club) {
      decir('Estos son los cursos disponibles ahora:');
      var items = club.map(function (c) { return { titulo: c.titulo, sub: 'Club VIP' + (c.tieneGratis ? ' · clases de muestra gratis' : ''), cta: 'Ver', href: CLUB }; })
        .concat(cursosVivo().map(function (c) { return { titulo: c.titulo, sub: 'En vivo · ' + c.precio, cta: 'Inscribirme', href: c.href }; }));
      if (items.length) tarjetas(items);
      return opciones([{ t: 'Menú principal', fn: menu }, { t: 'Hablar con un asesor', fn: asesor }]);
    });
  }

  function enVivo() {
    var v = cursosVivo();
    if (!v.length) {
      decir('Los cursos en vivo se anuncian en la sección «Cursos en Vivo» de esta página. Un asesor te da fechas y lugares disponibles.');
      return opciones([{ t: 'Hablar con un asesor', fn: asesor }, { t: 'Menú principal', fn: menu }]);
    }
    decir('Estos son nuestros <b>cursos en vivo</b> (por Google Meet, con certificado digital con QR y folio):');
    tarjetas(v.map(function (c) { return { titulo: c.titulo, sub: c.chef + ' · ' + c.precio, cta: 'Inscribirme', href: c.href }; }));
    decir('Para fechas y horarios exactos, un asesor te los confirma por WhatsApp.');
    return opciones([{ t: 'Hablar con un asesor', fn: asesor }, { t: 'Menú principal', fn: menu }]);
  }

  function membresia() {
    return cargarPrecios().then(function (p) {
      var precio = (p.mes && p.ano) ? '<br><br>Registrarte y probar las primeras clases es <b>gratis y sin tarjeta</b>. Para desbloquearlo todo activas la membresía: <b>' + dinero(p.mes) + ' al mes</b> o <b>' + dinero(p.ano) + ' al año</b>, sin permanencia.'
        : '<br><br>Registrarte y probar las primeras clases es <b>gratis y sin tarjeta</b>; la membresía la activas cuando quieras, sin permanencia.';
      decir('<b>El Club VIP incluye:</b><br>• Biblioteca de cursos de gastronomía y alimentos<br>• Clases en vivo con chefs y expertos<br>• Herramientas pro: calculadora de costos, control de mermas, checklist NOM-251, producción y rendimientos, recetario estandarizado, inventario y precio de venta<br>• Certificados con folio verificable<br>• Asesoría personalizada y canal VIP' + precio);
      tarjetas([{ titulo: 'Crear mi cuenta gratis', sub: 'Club VIP · sin tarjeta', cta: 'Entrar', href: CLUB }]);
      return opciones([{ t: 'Buscar un curso', fn: elegirArea }, { t: 'Resolver una duda', fn: dudas }, { t: 'Menú principal', fn: menu }]);
    });
  }

  var DUDAS = {
    prueba: { t: '¿Cómo funciona la prueba gratuita?', r: function () { return Promise.resolve('Creas tu cuenta en el Club VIP <b>sin tarjeta</b> y puedes ver las primeras clases de los cursos sin costo. Activas tu membresía cuando quieras.'); } },
    precio: { t: '¿Cuánto cuesta?', r: function () {
      return cargarPrecios().then(function (p) {
        var v = cursosVivo(), min = null;
        v.forEach(function (c) { var n = Number((c.precio.match(/[\d,]+/) || [''])[0].replace(/,/g, '')); if (n && (min === null || n < min)) min = n; });
        return (p.mes && p.ano ? '<b>Club VIP:</b> ' + dinero(p.mes) + ' al mes o ' + dinero(p.ano) + ' al año, sin permanencia. Registrarte y probar las primeras clases es gratis.<br>' : '<b>Club VIP:</b> registrarte y probar las primeras clases es gratis; un asesor te confirma los planes.<br>') +
          (min ? '<b>Cursos en vivo:</b> desde ' + dinero(min) + ' MXN cada uno.' : '');
      });
    } },
    certificado: { t: '¿Dan certificado?', r: function () { return Promise.resolve('Sí. Al terminar cada curso recibes un <b>certificado digital con código QR y folio único</b>, verificable en línea y listo para compartir con clientes o empleadores.'); } },
    clases: { t: '¿Cómo tomo las clases?', r: function () { return Promise.resolve('Los cursos en vivo son por <b>Google Meet</b> con chefs y expertos, y tienes acceso a las grabaciones. En el Club VIP ves los cursos a tu ritmo y descargas materiales y fichas técnicas.'); } },
    cancelar: { t: '¿Puedo cancelar?', r: function () { return Promise.resolve('Sí, cuando quieras desde tu panel; <b>no hay permanencia</b>. Conservas el acceso hasta que termina el periodo que ya pagaste (no hay reembolso por el tiempo restante).'); } }
  };

  function dudas() {
    decir('Claro, ¿cuál es tu duda?');
    return opciones(Object.keys(DUDAS).map(function (k) { return { t: DUDAS[k].t, fn: function () { responderDuda(k); } }; }));
  }
  function responderDuda(k) {
    return DUDAS[k].r().then(function (html) {
      decir(html);
      return opciones([{ t: 'Otra duda', fn: dudas }, { t: 'Buscar un curso', fn: elegirArea }, { t: 'Hablar con un asesor', fn: asesor }]);
    });
  }

  function asesor() {
    decir('Con gusto. Una persona del equipo te atiende por WhatsApp; toca el botón y se abre la conversación.');
    return encolar(function () {
      var a = el('a', 'dlfbot-wa', 'Abrir WhatsApp'); a.href = waLink('Hola, vengo del asistente virtual de DulceLab Food y quiero hablar con un asesor.'); a.target = '_blank'; a.rel = 'noopener';
      var caja = el('div', 'dlfbot-chips'); caja.appendChild(a);
      var m = el('button', 'dlfbot-chip'); m.type = 'button'; m.textContent = 'Menú principal'; m.addEventListener('click', function () { if (caja.classList.contains('is-usado')) return; caja.classList.add('is-usado'); usuario('Menú principal'); menu(); });
      caja.appendChild(m); msgs.appendChild(caja); bajar();
    });
  }

  function ruta() {
    decir('¡Va! Son 6 preguntas rápidas y te armo una ruta con los cursos que sí tenemos. Te llevo a la encuesta. 👇');
    return encolar(function () {
      return espera(500).then(function () { cerrarPanel(); if (window.dlfAbrirEncuesta) window.dlfAbrirEncuesta(); });
    });
  }

  /* texto escrito por la persona */
  function entender(texto) {
    var t = norm(texto);
    if (/^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hey|que tal)\b/.test(t)) return menu('¡Hola! ¿En qué te puedo ayudar?');
    if (/asesor|persona|humano|whats|contacto|contactar|hablar con/.test(t)) return asesor();
    if (/certific|diploma|constancia/.test(t)) return responderDuda('certificado');
    if (/cancel/.test(t)) return responderDuda('cancelar');
    if (/gratis|gratuit|prueba/.test(t)) return responderDuda('prueba');
    if (/cuanto (cuesta|cobran|es|vale|pago)|cuanto sale|mensual|anual|pagar/.test(t) || /^precio(s)?( de)?( la)?( membresia| curso| cursos)?$/.test(t)) return responderDuda('precio');
    if (/membres|club|vip|suscri/.test(t)) return membresia();
    if (/en vivo|clase|meet|horario|fecha|cuando (inicia|empieza|es)|modalidad/.test(t)) return /como/.test(t) ? responderDuda('clases') : enVivo();
    if (/ruta|encuesta|recomiend/.test(t)) return ruta();
    var claves = clavesDeTexto(texto);
    if (!claves.length) { decir('No te entendí del todo. Elige una opción o escribe una palabra, por ejemplo «costos» o «panadería».'); return menu(); }
    return mostrarResultados(claves, texto.trim());
  }

  /* ---------- abrir / cerrar / reiniciar ---------- */
  function iniciar() {
    token += 1; cola = Promise.resolve(); msgs.innerHTML = ''; iniciado = true;
    decir('¡Hola! Soy tu guía virtual. 👩‍🍳 Te ayudo a encontrar el curso que de verdad te sirva y a resolver tus dudas.');
    menu('¿Qué te gustaría hacer?');
  }
  function abrirPanel() {
    abierto = true; panel.classList.add('is-open'); launcher.classList.add('is-oculto');
    try { sessionStorage.setItem('dlf-bot-tip', '1'); } catch (e) {}
    if (!iniciado) iniciar();
    cargarClub(); cargarPrecios();
    setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (e) {} }, 200);
  }
  function cerrarPanel() { abierto = false; panel.classList.remove('is-open'); launcher.classList.remove('is-oculto'); tip.hidden = true; }

  btn.addEventListener('click', abrirPanel);
  tip.addEventListener('click', abrirPanel);
  panel.querySelector('#dlfbotCerrar').addEventListener('click', cerrarPanel);
  panel.querySelector('#dlfbotReiniciar').addEventListener('click', iniciar);
  panel.querySelector('#dlfbotReiniciar2').addEventListener('click', iniciar);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && abierto) cerrarPanel(); });
  panel.querySelector('#dlfbotForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value.trim(); if (!v) return;
    input.value = ''; usuario(v);
    // lo anterior queda atrás: se desactivan las opciones viejas
    [].forEach.call(msgs.querySelectorAll('.dlfbot-chips'), function (g) { g.classList.add('is-usado'); });
    entender(v);
  });

  // invitación: la burbuja "Tu asistente virtual" aparece un momento después
  var yaVio = false; try { yaVio = sessionStorage.getItem('dlf-bot-tip') === '1'; } catch (e) {}
  tip.hidden = true;
  if (!yaVio) setTimeout(function () { if (!abierto) tip.hidden = false; }, 2500);

  // El aviso de cookies (fijo abajo) no debe tapar el botón del asistente:
  // se mide su altura y el botón se acomoda encima.
  function ajustarCookies() {
    var b = document.getElementById('dlf-cookie-banner');
    var h = (b && getComputedStyle(b).display !== 'none') ? b.offsetHeight + 8 : 0;
    document.documentElement.style.setProperty('--cookie-h', h + 'px');
  }
  var cb = document.getElementById('dlf-cookie-banner');
  if (cb && window.MutationObserver) new MutationObserver(ajustarCookies).observe(cb, { attributes: true, attributeFilter: ['style'] });
  window.addEventListener('resize', ajustarCookies);
  setTimeout(ajustarCookies, 300);
})();
