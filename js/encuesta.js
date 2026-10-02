/* =========================================================
   DULCELAB FOOD — Descubre tu perfil DulceLab
   Encuesta adaptativa presentada como una experiencia guiada: la chef
   acompaña cada paso y el avance es una receta que se completa. Son 5
   preguntas con 3 opciones cada una (el reto cambia según el tipo de
   persona) y todas sirven para decidir qué producir. Al final recomienda
   los cursos que de verdad están en la membresía (se leen de Firestore)
   según lo que contestó.
   ========================================================= */
(function () {
  'use strict';

  var WEBHOOK_URL = 'https://dulcelab-webhook-production.up.railway.app';
  var STORAGE_DONE = 'dlf-encuesta';          // localStorage: ya la contestó o dijo "ahora no" definitivo
  var STORAGE_SKIP = 'dlf-encuesta-cerrada';  // sessionStorage: no insistir en esta misma visita
  var STEP_EMOJIS = ['👤', '🎯', '🍰', '🎬', '⏰'];

  var modal = document.getElementById('encuesta');
  if (!modal) return;
  var body = document.getElementById('encuestaBody');
  var progressWrap = document.getElementById('encuestaProgressWrap');
  var btnClose = document.getElementById('encuestaClose');
  var btnAbrir = document.getElementById('encuestaTrigger');

  /* ---------- 1. Textos para el resultado ---------- */
  var AREA_TXT = { dulce: 'Repostería y panadería', cocina: 'Cocina', negocio: 'Negocio y calidad' };

  /* ---------- 2. Árbol de preguntas: 5 pasos, 3 opciones cada uno ---------- */
  // 1) quién es → 2) su reto principal (cambia según quién es)
  // → 3) área → 4) formato que preferiría → 5) tiempo semanal.
  // Todo lo que se pregunta sirve para decidir QUÉ producir.
  var PREGUNTAS = {
    inicio: {
      id: 'tipo', multi: false,
      guia: '👩‍🍳 Primero quiero conocerte…',
      texto: '¿En qué momento de tu camino gastronómico estás?',
      opciones: [
        { valor: 'estudiante', texto: '🎓 Estoy aprendiendo', sub: 'Estudio o aprendo por gusto.', siguiente: 'objetivo_estudiante', reaccion: '¡Qué bien! 🎓 Vamos a ver cómo seguir construyendo tu camino.' },
        { valor: 'profesional', texto: '👩‍🍳 Trabajo en gastronomía', sub: 'Quiero crecer profesionalmente.', siguiente: 'reto_profesional', reaccion: '¡Excelente! 👩‍🍳 Hablemos de tu trabajo.' },
        { valor: 'emprendedor', texto: '🚀 Tengo o quiero un negocio', sub: 'Quiero que lo que hago sea rentable.', siguiente: 'problema_emprendedor', reaccion: '¡Excelente! 🚀 Entonces vamos a hablar de tu negocio.' }
      ]
    },

    // ── Reto principal (una pregunta distinta por tipo de persona) ──
    objetivo_estudiante: {
      id: 'objetivo_estudiante', multi: false,
      texto: '¿Qué quieres lograr?',
      opciones: [
        { valor: 'desde_cero', texto: 'Aprender desde cero', siguiente: 'area_interes' },
        { valor: 'tecnica', texto: 'Mejorar mi técnica', siguiente: 'area_interes' },
        { valor: 'empleo', texto: 'Prepararme para trabajar o emprender', siguiente: 'area_interes' }
      ]
    },
    reto_profesional: {
      id: 'reto_profesional', multi: false,
      texto: '🎯 ¿Qué es lo que más te complica en tu trabajo?',
      opciones: [
        { valor: 'actualizar', texto: 'Actualizarme o especializarme', siguiente: 'area_interes' },
        { valor: 'costos', texto: 'Reducir costos y mermas', siguiente: 'area_interes' },
        { valor: 'procesos', texto: 'Ordenar procesos y calidad', siguiente: 'area_interes' }
      ]
    },
    problema_emprendedor: {
      id: 'problema_emprendedor', multi: false,
      texto: '🎯 ¿Qué es lo que más te complica en tu negocio?',
      opciones: [
        { valor: 'precios', texto: '💰 No sé cuánto cobrar', siguiente: 'area_interes' },
        { valor: 'costos', texto: '📊 No controlo costos, inventario y merma', siguiente: 'area_interes' },
        { valor: 'produccion', texto: '⚙️ Necesito ordenar mi producción y calidad', siguiente: 'area_interes' }
      ]
    },

    // ── Común a todos ──
    area_interes: {
      id: 'area_interes', multi: false,
      texto: '¿Por dónde te gustaría empezar?',
      nota: 'En el Club hay más temas; esto solo nos ayuda a recomendarte tu primer paso.',
      opciones: [
        { valor: 'dulce', texto: 'Repostería y panadería', siguiente: 'formato' },
        { valor: 'cocina', texto: 'Cocina', siguiente: 'formato' },
        { valor: 'negocio', texto: 'Negocio y calidad', sub: 'Costos, precios, inventarios, inocuidad.', siguiente: 'formato' }
      ]
    },
    formato: {
      id: 'formato', multi: false,
      texto: '¿Qué te ayudaría más para aprender?',
      opciones: [
        { valor: 'grabados', texto: 'Cursos grabados', sub: 'Los veo a mi ritmo, cuando puedo.', siguiente: 'tiempo_disponible' },
        { valor: 'vivo', texto: 'Clases en vivo', sub: 'Con chefs y preguntas en tiempo real.', siguiente: 'tiempo_disponible' },
        { valor: 'herramientas', texto: 'Plantillas y calculadoras', sub: 'Formatos listos para usar en mi cocina.', siguiente: 'tiempo_disponible' }
      ]
    },
    tiempo_disponible: {
      id: 'tiempo_disponible', multi: false,
      texto: '⏰ ¿Cuánto tiempo tienes en realidad a la semana para aprender?',
      opciones: [
        { valor: 'menos1', texto: 'Menos de 1 hora', siguiente: 'fin' },
        { valor: 'uno_tres', texto: 'De 1 a 3 horas', siguiente: 'fin' },
        { valor: 'mas3', texto: 'Más de 3 horas', siguiente: 'fin' }
      ]
    }
  };

  var TOTAL_PASOS = 5; // tipo + reto + área + formato + tiempo, siempre

  var ICONOS_OPCION = {
    estudiante:'🎓', profesional:'👩‍🍳', emprendedor:'🚀',
    desde_cero:'🌱', tecnica:'✨', empleo:'💼',
    actualizar:'🔄', costos:'📊', procesos:'🧩', precios:'🏷️', produccion:'⚙️',
    dulce:'🧁', cocina:'🍳', negocio:'📊',
    grabados:'▶️', vivo:'🔴', herramientas:'🧮',
    menos1:'⏳', uno_tres:'🕐', mas3:'🔥'
  };

  function iconoOpcion(valor) { return ICONOS_OPCION[valor] || '✦'; }
  function pistaPregunta(id) {
    var pistas = {
      tipo:'Elige la opción que más se parece a tu momento actual.',
      area_interes:'Elige por dónde quieres dar tu primer paso.',
      formato:'Así sabemos si te conviene más un curso, una clase o una herramienta.',
      tiempo_disponible:'Una ruta realista se adapta al tiempo que sí tienes.'
    };
    return pistas[id] || 'Elige la respuesta que mejor describe tu situación.';
  }
  function imagenGuiaPaso(id) {
    if (id === 'tipo') return 'assets/chef-guia-senala.png';
    if (id === 'tiempo_disponible') return 'assets/chef-guia-celebra.png';
    return 'assets/chef-guia-planea.png';
  }

  /* ---------- 3. Estado ---------- */
  var estado = { paso: 0, tipo: null, respuestas: {} };

  /* ---------- 4. Reglas de recomendación (sin IA, Fase 1) ---------- */
  var ICONOS = { curso: '🎓', linea: '📚', reto: '⚡', club: '👑' };

  function recomendar() {
    var t = estado.tipo, r = estado.respuestas;
    var area = AREA_TXT[r.area_interes] || 'gastronomía';
    var linea = function (titulo) { return { icono: ICONOS.linea, categoria: 'Línea', titulo: titulo }; };
    var perfil, objetivo, foco, items;

    if (t === 'estudiante') {
      var objs = {
        desde_cero: { o: 'Aprender desde cero.', f: 'Dominar los fundamentos de ' + area.toLowerCase() + ' y practicar seguido.' },
        tecnica: { o: 'Mejorar tu técnica.', f: 'Pulir la técnica de ' + area.toLowerCase() + ' con práctica guiada.' },
        empleo: { o: 'Prepararte para trabajar o emprender.', f: 'Tener práctica demostrable y bases de negocio en ' + area.toLowerCase() + '.' }
      };
      var oe = objs[r.objetivo_estudiante] || objs.desde_cero;
      perfil = { icono: '🎓', texto: 'Aprendiz · ' + area };
      objetivo = oe.o; foco = oe.f;
      items = [{ icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: 'Fundamentos de ' + area }];
      if (r.objetivo_estudiante === 'empleo') items.push({ icono: ICONOS.club, categoria: 'Certificado', titulo: 'Certificado con QR al terminar' });
      else items.push({ icono: ICONOS.reto, categoria: 'Reto', titulo: 'Reto de práctica semanal' });
    } else if (t === 'profesional') {
      var retos = {
        actualizar: { o: 'Actualizarte y especializarte en ' + area.toLowerCase() + '.', f: 'Actualizar tus conocimientos.', i: { icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: 'Especialización en ' + area } },
        costos: { o: 'Reducir costos y mermas.', f: 'Controlar costos y mermas.', i: linea('Control Estratégico de Costos y Costeo de Recetas') },
        procesos: { o: 'Ordenar tus procesos y calidad.', f: 'Estandarizar procesos y calidad.', i: linea('Compras, Inventarios y Control de Insumos') }
      };
      var rp = retos[r.reto_profesional] || retos.actualizar;
      perfil = { icono: '👩‍🍳', texto: 'Profesional · ' + area };
      objetivo = rp.o; foco = rp.f;
      items = [rp.i, { icono: ICONOS.club, categoria: 'Club VIP', titulo: 'Comunidad y recursos para profesionales' }];
    } else {
      var probs = {
        precios: { o: 'Ponerle precio correcto a tus productos.', f: 'No sabes cuánto cobrar.', i: linea('Fijación de Precios y Rentabilidad Operativa') },
        costos: { o: 'Controlar tus costos, inventario y merma.', f: 'Costos, inventario y merma sin control.', i: linea('Control Estratégico de Costos y Costeo de Recetas') },
        produccion: { o: 'Ordenar tu producción y calidad.', f: 'Producción y calidad sin un proceso claro.', i: linea('Compras, Inventarios y Control de Insumos') }
      };
      var pe = probs[r.problema_emprendedor] || probs.costos;
      perfil = { icono: '🚀', texto: 'Emprendedor · ' + area };
      objetivo = pe.o; foco = pe.f;
      items = [pe.i, { icono: ICONOS.reto, categoria: 'Reto', titulo: 'Calcula la rentabilidad de uno de tus productos' }];
    }

    var porFormato = {
      grabados: 'Cursos grabados para ver a tu ritmo',
      vivo: 'Clases en vivo con chefs',
      herramientas: 'Plantillas y calculadoras listas para usar'
    };
    if (porFormato[r.formato]) items.push({ icono: ICONOS.club, categoria: 'Lo que pediste', titulo: porFormato[r.formato] });
    return { perfil: perfil, objetivo: objetivo, foco: foco, ruta: items };
  }

  /* ---------- 5. "Receta" en vez de barra de progreso ---------- */
  function renderProgreso() {
    var puntos = '';
    for (var i = 0; i < TOTAL_PASOS; i++) {
      puntos += '<span class="encuesta__punto' + (i < estado.paso ? ' is-lleno' : '') + '"></span>';
    }
    var ingredientes = STEP_EMOJIS.slice(0, estado.paso).join(' ');
    progressWrap.innerHTML =
      '<p class="encuesta__receta-txt">🍲 Preparando tu receta de aprendizaje · ' + estado.paso + ' de ' + TOTAL_PASOS + ' ingredientes</p>' +
      '<div class="encuesta__puntos">' + puntos + '</div>' +
      (ingredientes ? '<p class="encuesta__ingredientes">🥣 ' + ingredientes + '</p>' : '');
  }

  /* ---------- 6. Render: consentimiento, pregunta, swipe, perfil final ---------- */
  function renderConsentimiento() {
    progressWrap.hidden = true;
    body.innerHTML =
      '<img class="encuesta__guia-img" src="assets/chef-guia.webp" width="1086" height="1448" alt="Tu guía DulceLab">' +
      '<p class="encuesta__eyebrow">👩‍🍳 Tu guía DulceLab</p>' +
      '<h2 class="encuesta__pregunta">¡Hola! Voy a conocerte un poquito para prepararte una experiencia a tu medida.</h2>' +
      '<p class="encuesta__nota">¿Comenzamos? Toma menos de 2 minutos.</p>' +
      '<div class="encuesta__ctas">' +
      '<button type="button" class="btn btn--primary" id="encuestaIniciar">Preparar mi ruta</button>' +
      '<button type="button" class="btn btn--ghost" id="encuestaAhoraNo">Ahora no</button>' +
      '</div>';
    document.getElementById('encuestaIniciar').addEventListener('click', iniciarPreguntas);
    document.getElementById('encuestaAhoraNo').addEventListener('click', cerrarDefinitivo);
  }

  function iniciarPreguntas() {
    progressWrap.hidden = false;
    estado = { paso: 0, tipo: null, respuestas: {} };
    renderProgreso();
    transicion(function () { renderPregunta(PREGUNTAS.inicio); });
  }

  function renderPregunta(p) {
    renderProgreso();

    var esMulti = p.multi;
    var mensajeGuia = p.guia || pistaPregunta(p.id);
    body.innerHTML =
      '<div class="encuesta__lesson">' +
        '<aside class="encuesta__mentor">' +
          '<img src="' + imagenGuiaPaso(p.id) + '" width="1024" height="1536" alt="Chef Dulce, tu guía de aprendizaje">' +
          '<div class="encuesta__mentor-talk"><span>Chef Dulce te guía</span><p>' + mensajeGuia + '</p></div>' +
        '</aside>' +
        '<div class="encuesta__question-panel">' +
          '<div class="encuesta__step"><span>Paso ' + (estado.paso + 1) + ' de ' + TOTAL_PASOS + '</span><span>' + (esMulti ? (p.max ? 'Elige hasta ' + p.max : 'Puedes elegir varias') : 'Una respuesta') + '</span></div>' +
          '<h2 class="encuesta__pregunta">' + p.texto + '</h2>' +
          (p.nota ? '<p class="encuesta__nota">' + p.nota + '</p>' : '') +
          '<div class="encuesta__opciones' + (esMulti ? ' encuesta__opciones--multi' : '') + '">' +
          p.opciones.map(function (o) {
            return '<button type="button" class="encuesta__opcion" data-valor="' + o.valor + '">' +
              '<span class="encuesta__opcion-icon">' + iconoOpcion(o.valor) + '</span>' +
              '<span class="encuesta__check">✓</span>' +
              '<span class="encuesta__opcion-txt">' + o.texto + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</span>' +
              '</button>';
          }).join('') +
          '</div>' +
          (esMulti ? '<button type="button" class="btn btn--primary encuesta__continuar" id="encuestaContinuar" disabled>Continuar con mi ruta</button>' : '') +
        '</div>' +
      '</div>';

    var seleccionMulti = [];
    var max = p.max || Infinity;
    var botones = body.querySelectorAll('.encuesta__opcion');
    for (var i = 0; i < botones.length; i++) {
      botones[i].addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var valor = btn.getAttribute('data-valor');
        if (!esMulti) {
          btn.classList.add('is-chosen');
          avanzar(p, valor);
          return;
        }
        var yaElegida = btn.classList.contains('is-selected');
        if (!yaElegida && seleccionMulti.length >= max) {
          btn.classList.add('is-shake');
          setTimeout(function () { btn.classList.remove('is-shake'); }, 400);
          return;
        }
        btn.classList.toggle('is-selected');
        var idx = seleccionMulti.indexOf(valor);
        if (idx === -1) seleccionMulti.push(valor); else seleccionMulti.splice(idx, 1);
        var continuarBtn = document.getElementById('encuestaContinuar');
        if (continuarBtn) continuarBtn.disabled = seleccionMulti.length === 0;
      });
    }
    if (esMulti) {
      document.getElementById('encuestaContinuar').addEventListener('click', function () {
        avanzar(p, seleccionMulti.slice());
      });
    }
  }

  function avanzar(pregunta, valor) {
    estado.respuestas[pregunta.id] = valor;
    if (pregunta.id === 'tipo') estado.tipo = Array.isArray(valor) ? valor[0] : valor;
    estado.paso += 1;

    var siguienteId = pregunta.siguiente;
    var reaccion = null;
    if (!siguienteId) {
      // preguntas de opción única del árbol de ramas: el "siguiente" vive en la opción elegida
      var opcion = pregunta.opciones.filter(function (o) { return o.valor === valor; })[0];
      siguienteId = opcion && opcion.siguiente;
      reaccion = opcion && opcion.reaccion;
    }

    transicion(function () {
      if (siguienteId === 'fin') { renderFin(); return; }
      var siguientePregunta = PREGUNTAS[siguienteId];
      if (reaccion) siguientePregunta = Object.assign({}, siguientePregunta, { guia: reaccion });
      renderPregunta(siguientePregunta);
    });
  }

  function transicion(cb) {
    body.classList.add('is-leaving');
    setTimeout(function () {
      body.classList.remove('is-leaving');
      cb();
    }, 260);
  }

  // El sitio todavía no tiene forma de llevar a cada quien directo al curso
  // exacto de su ruta (la sección #cursos es la misma lista para todos), así
  // que en vez de mandar a algo genérico que no coincide con lo que se le
  // prometió, el CTA abre WhatsApp con su perfil y ruta ya escritos, para
  // que el equipo le dé seguimiento personal.
  function linkWhatsApp(r) {
    var items = r.ruta.map(function (item) { return item.categoria + ': ' + item.titulo; }).join(' · ');
    var texto = 'Hola, acabo de contestar la encuesta de DulceLab Food.\n' +
      'Mi perfil: ' + r.perfil.texto + '\n' +
      'Me recomendaron: ' + items + '\n' +
      '¿Me ayudan a empezar?';
    return 'https://wa.me/522361223226?text=' + encodeURIComponent(texto);
  }

  function htmlRuta(ruta) {
    return '<span class="encuesta__ruta-label">Tu ruta DulceLab</span>' +
      ruta.map(function (item) {
        return '<div class="encuesta__ruta-item"><span class="encuesta__ruta-icono">' + item.icono + '</span><div><span class="encuesta__ruta-cat">' + item.categoria + '</span><p>' + item.titulo + '</p>' + (item.detalle ? '<small>' + item.detalle + '</small>' : '') + '</div></div>';
      }).join('');
  }

  function renderFin() {
    renderProgreso();
    var r = recomendar();
    body.innerHTML =
      '<img class="encuesta__guia-img encuesta__guia-img--chico" src="assets/chef-guia-celebra.png" width="1024" height="1536" alt="Tu guía DulceLab">' +
      '<p class="encuesta__eyebrow">✨ ¡Tu receta está lista!</p>' +
      '<h2 class="encuesta__pregunta">' + r.perfil.icono + ' ' + r.perfil.texto + '</h2>' +
      '<div class="encuesta__perfil-bloque"><span>Tu principal objetivo</span><p>' + r.objetivo + '</p></div>' +
      '<div class="encuesta__perfil-bloque"><span>Lo que más necesitas trabajar</span><p>' + r.foco + '</p></div>' +
      '<div class="encuesta__ruta" id="encuestaRuta">' + htmlRuta(r.ruta) + '</div>' +
      '<div class="encuesta__ctas">' +
      '<a class="btn btn--primary" href="https://club.dulcelabfood.com" target="_blank" rel="noopener" id="encuestaCtaCursos">Ver los cursos del Club VIP</a>' +
      '<a class="btn btn--ghost" href="' + linkWhatsApp(r) + '" target="_blank" rel="noopener" id="encuestaCtaWa">Platicar mi ruta por WhatsApp</a>' +
      '</div>';

    document.getElementById('encuestaCtaCursos').addEventListener('click', cerrar);
    document.getElementById('encuestaCtaWa').addEventListener('click', cerrar);
    enviarRespuesta();
    try { localStorage.setItem(STORAGE_DONE, 'completada'); } catch (e) {}

    // Cambia la ruta genérica por los cursos reales de la membresía (si ya
    // se pudieron leer; si falla la red se queda la de reglas de arriba).
    cargarCursos().then(function (cursos) {
      if (!cursos.length) return;
      var extras = r.ruta.filter(function (it) { return it.categoria === 'Reto' || it.categoria === 'Club VIP' || it.categoria === 'Certificado' || it.categoria === 'Lo que pediste'; });
      r.ruta = rutaDeMembresia(cursos).concat(extras);
      var caja = document.getElementById('encuestaRuta');
      if (caja) caja.innerHTML = htmlRuta(r.ruta);
      var wa = document.getElementById('encuestaCtaWa');
      if (wa) wa.setAttribute('href', linkWhatsApp(r));
    });
  }

  /* ---------- 6b. Cursos reales de la membresía (lectura pública) ---------- */
  var CURSOS_URL = 'https://firestore.googleapis.com/v1/projects/dulcelab-club/databases/(default)/documents/cursos?pageSize=50';
  var cursosPromesa = null;

  function valFs(v) {
    if (!v) return null;
    var k = Object.keys(v)[0], x = v[k];
    if (k === 'arrayValue') return (x.values || []).map(valFs);
    if (k === 'mapValue') { var o = {}; Object.keys(x.fields || {}).forEach(function (f) { o[f] = valFs(x.fields[f]); }); return o; }
    return x;
  }
  function cargarCursos() {
    if (cursosPromesa) return cursosPromesa;
    cursosPromesa = fetch(CURSOS_URL)
      .then(function (r) { return r.ok ? r.json() : { documents: [] }; })
      .then(function (d) {
        return (d.documents || []).map(function (doc) {
          var f = {}; Object.keys(doc.fields || {}).forEach(function (k) { f[k] = valFs(doc.fields[k]); });
          return f;
        }).filter(function (c) { return c.titulo && c.activo !== false && c.disponible !== false; })
          .map(function (c) {
            return {
              titulo: c.titulo, area: c.area || '', descripcion: c.descripcion || '',
              modulos: (c.sesiones || []).map(function (x) { return x.titulo || ''; }),
              materiales: (c.materiales || []).map(function (x) { return x.titulo || ''; }),
              tieneGratis: (c.sesiones || []).some(function (x) { return x.gratis === true; })
            };
          });
      })
      .catch(function () { return []; });
    return cursosPromesa;
  }

  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  // Palabras que, si aparecen en un curso o módulo, lo hacen relevante para
  // cada respuesta. El peso 3 es para lo que dijo que más le urge.
  var PALABRAS = {
    costos: ['costo', 'food cost', 'rentab', 'merma', 'inventario', 'insumo'],
    precios: ['precio', 'fijacion', 'rentab'],
    produccion: ['estandariz', 'proceso', 'receta', 'inocuidad', 'calidad'],
    procesos: ['estandariz', 'proceso', 'inocuidad', 'calidad'],
    actualizar: ['tecnica', 'receta'], tecnica: ['tecnica', 'receta'],
    desde_cero: ['fundamento', 'basic', 'introduccion'], empleo: ['certific', 'inocuidad', 'negocio'],
    dulce: ['reposter', 'postre', 'panader'], cocina: ['cocina'],
    negocio: ['costo', 'precio', 'rentab', 'inventario', 'inocuidad', 'negocio']
  };

  function perfilPalabras() {
    var r = estado.respuestas, pesos = {};
    function sumar(valor, peso) { (PALABRAS[valor] || []).forEach(function (w) { pesos[w] = Math.max(pesos[w] || 0, peso); }); }
    [r.problema_emprendedor, r.reto_profesional, r.objetivo_estudiante].forEach(function (v) { if (v) sumar(v, 3); });
    if (r.area_interes) sumar(r.area_interes, 2);
    return pesos;
  }
  function puntaje(texto, pesos) {
    var t = norm(texto), n = 0;
    Object.keys(pesos).forEach(function (w) { if (t.indexOf(w) !== -1) n += pesos[w]; });
    return n;
  }
  function limpiarModulo(t) {
    t = String(t).replace(/^\s*m[oó]dulo\s*\d+(\s*y\s*\d+)?\s*/i, '').replace(/[.\s]+$/, '').toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Devuelve los items de ruta que salen de los cursos que de verdad están
  // en la membresía, según lo que contestó la persona.
  function rutaDeMembresia(cursos) {
    var pesos = perfilPalabras(), items = [];
    cursos.map(function (c) {
      var mejor = null, mejorP = 0;
      c.modulos.concat(c.materiales).forEach(function (m) { var pm = puntaje(m, pesos); if (pm > mejorP) { mejorP = pm; mejor = m; } });
      return { c: c, p: puntaje([c.titulo, c.area, c.descripcion].join(' '), pesos) + mejorP, modulo: mejor };
    }).filter(function (x) { return x.p > 0; })
      .sort(function (a, b) { return b.p - a.p; })
      .slice(0, 2)
      .forEach(function (x) {
        var detalle = (x.modulo ? 'Empieza por: ' + limpiarModulo(x.modulo) : '') + (x.c.tieneGratis ? (x.modulo ? ' · ' : '') + 'Incluye clases de muestra gratis' : '');
        items.push({ icono: ICONOS.curso, categoria: 'Curso en la membresía', titulo: x.c.titulo, detalle: detalle });
      });
    if (!items.length) {
      var tema = AREA_TXT[estado.respuestas.area_interes] || 'tu tema';
      items.push({ icono: '🔜', categoria: 'Próximamente en la membresía', titulo: tema, detalle: 'Todavía no hay un curso de este tema en la membresía; tu interés ya quedó registrado.' });
    }
    return items;
  }

  /* ---------- 7. Enviar a Firestore vía webhook ---------- */
  function enviarRespuesta() {
    fetch(WEBHOOK_URL + '/api/encuesta/responder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: estado.tipo, respuestas: estado.respuestas })
    }).catch(function () { /* silencioso: no interrumpir al visitante si falla */ });
  }

  /* ---------- 8. Abrir / cerrar ---------- */
  function abrir() {
    cargarCursos();
    renderConsentimiento();
    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
  }

  function cerrar() {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { modal.hidden = true; }, 250);
    try {
      if (localStorage.getItem(STORAGE_DONE) !== 'completada') {
        sessionStorage.setItem(STORAGE_SKIP, '1');
      }
    } catch (e) {}
  }

  function cerrarDefinitivo() {
    try { localStorage.setItem(STORAGE_DONE, 'completada'); } catch (e) {}
    cerrar();
  }

  btnClose.addEventListener('click', cerrar);
  modal.addEventListener('click', function (e) { if (e.target === modal) cerrar(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) cerrar();
  });
  if (btnAbrir) btnAbrir.addEventListener('click', function () { disparar(true); });

  /* ---------- 9. Disparo: solo por el botón manual ---------- */
  var yaDisparada = false;
  function disparar(manual) {
    // El botón manual ("🍰 Descubre…") siempre debe poder reabrirla, ya
    // la haya contestado o cerrado antes; esas banderas solo frenan los
    // disparos AUTOMÁTICOS (tiempo en página / scroll) para no insistir.
    if (!manual) {
      if (yaDisparada) return;
      var completada, cerradaEstaVisita;
      try { completada = localStorage.getItem(STORAGE_DONE) === 'completada'; } catch (e) { completada = false; }
      try { cerradaEstaVisita = sessionStorage.getItem(STORAGE_SKIP) === '1'; } catch (e) { cerradaEstaVisita = false; }
      if (completada || cerradaEstaVisita) return;
      yaDisparada = true;
    }
    if (modal.classList.contains('is-open')) return;
    abrir();
  }

})();
