/* =========================================================
   DULCELAB FOOD — Descubre tu perfil DulceLab
   Encuesta adaptativa presentada como una experiencia guiada: la chef
   acompaña cada paso y el avance es una receta que se completa. Son 6
   preguntas encadenadas: cada una sale de la anterior (quién es → su
   contexto → su reto → el detalle de ESE reto → formato → qué lo detiene)
   y todas sirven para decidir qué producir. Al final recomienda los cursos
   que de verdad están en la membresía (se leen de Firestore) según lo que
   contestó.
   ========================================================= */
(function () {
  'use strict';

  var WEBHOOK_URL = 'https://dulcelab-webhook-production.up.railway.app';
  var STORAGE_DONE = 'dlf-encuesta';          // localStorage: ya la contestó o dijo "ahora no" definitivo
  var STORAGE_SKIP = 'dlf-encuesta-cerrada';  // sessionStorage: no insistir en esta misma visita
  var STEP_EMOJIS = ['👤', '🧭', '🎯', '🔎', '🎬', '🚧'];

  var modal = document.getElementById('encuesta');
  if (!modal) return;
  var body = document.getElementById('encuestaBody');
  var progressWrap = document.getElementById('encuestaProgressWrap');
  var btnClose = document.getElementById('encuestaClose');
  var btnAbrir = document.getElementById('encuestaTrigger');

  /* ---------- 1. Textos base ---------- */
  var TIPO_TXT = { estudiante: 'Estudiante', aficionado: 'Aprende por gusto', profesional: 'Profesional', emprendedor: 'Emprendedor' };
  var TIPO_ICONO = { estudiante: '🎓', aficionado: '🍰', profesional: '👩‍🍳', emprendedor: '🚀' };
  var RETO_ID = { estudiante: 'objetivo_estudiante', aficionado: 'objetivo_aficionado', profesional: 'reto_profesional', emprendedor: 'problema_emprendedor' };

  // Aplica el mismo "siguiente" a todas las opciones de una pregunta.
  function sig(opciones, siguiente) {
    return opciones.map(function (o) { o.siguiente = siguiente; return o; });
  }

  /* ---------- 2. Árbol de preguntas: 6 pasos encadenados ---------- */
  // 1) quién es → 2) su contexto → 3) su reto principal → 4) el detalle de
  // ESE reto (cada reto tiene su propia pregunta de seguimiento) → 5) formato
  // que prefiere → 6) qué lo detiene. Todo sirve para decidir qué producir.
  var PREGUNTAS = {
    inicio: {
      id: 'tipo', multi: false,
      guia: '👩‍🍳 Primero quiero conocerte…',
      texto: '¿Qué te describe mejor?',
      opciones: [
        { valor: 'estudiante', texto: '🎓 Estoy estudiando', sub: 'Gastronomía o una carrera afín.', siguiente: 'contexto_estudiante', reaccion: '¡Qué bien! 🎓 Vamos a ver cómo seguir construyendo tu camino.' },
        { valor: 'aficionado', texto: '❤️ Aprendo por gusto', sub: 'Me apasiona cocinar y hornear.', siguiente: 'contexto_aficionado', reaccion: '¡Me encanta! ❤️ Vamos a ver qué te late más.' },
        { valor: 'profesional', texto: '👩‍🍳 Trabajo en gastronomía', sub: 'Quiero crecer profesionalmente.', siguiente: 'contexto_profesional', reaccion: '¡Excelente! 👩‍🍳 Hablemos de tu trabajo.' },
        { valor: 'emprendedor', texto: '🚀 Tengo o quiero un negocio', sub: 'Quiero que lo que hago sea rentable.', siguiente: 'contexto_emprendedor', reaccion: '¡Excelente! 🚀 Entonces vamos a hablar de tu negocio.' }
      ]
    },

    // ── Paso 2: contexto (cambia según quién es) ──
    contexto_estudiante: {
      id: 'contexto_estudiante', multi: false,
      texto: '¿Qué estás estudiando?',
      opciones: sig([
        { valor: 'cocina', texto: 'Cocina y gastronomía' },
        { valor: 'dulce', texto: 'Repostería y panadería' },
        { valor: 'otra', texto: 'Otra carrera o curso técnico' }
      ], 'objetivo_estudiante')
    },
    contexto_aficionado: {
      id: 'contexto_aficionado', multi: false,
      texto: '¿Cuánta experiencia tienes?',
      opciones: sig([
        { valor: 'nada', texto: 'Casi ninguna, apenas empiezo' },
        { valor: 'basico', texto: 'Lo básico' },
        { valor: 'confianza', texto: 'Ya cocino con confianza' }
      ], 'objetivo_aficionado')
    },
    contexto_profesional: {
      id: 'contexto_profesional', multi: false,
      texto: '¿En qué área trabajas?',
      opciones: sig([
        { valor: 'dulce', texto: 'Repostería y panadería' },
        { valor: 'cocina', texto: 'Cocina y restaurante' },
        { valor: 'produccion', texto: 'Producción de alimentos' },
        { valor: 'calidad', texto: 'Calidad e inocuidad' },
        { valor: 'otra', texto: 'Otra área' }
      ], 'reto_profesional')
    },
    contexto_emprendedor: {
      id: 'contexto_emprendedor', multi: false,
      texto: '¿Qué tipo de negocio tienes o quieres crear?',
      opciones: sig([
        { valor: 'reposteria', texto: 'Repostería' },
        { valor: 'panaderia', texto: 'Panadería' },
        { valor: 'restaurante', texto: 'Restaurante' },
        { valor: 'cafeteria', texto: 'Cafetería' },
        { valor: 'catering', texto: 'Catering y eventos' },
        { valor: 'casa', texto: 'Venta desde casa' },
        { valor: 'otro', texto: 'Otro negocio' }
      ], 'problema_emprendedor')
    },

    // ── Paso 3: reto principal (cada opción lleva a SU pregunta de detalle) ──
    objetivo_estudiante: {
      id: 'objetivo_estudiante', multi: false,
      texto: '¿Qué quieres lograr?',
      opciones: [
        { valor: 'desde_cero', texto: 'Aprender desde cero', siguiente: 'det_desde_cero' },
        { valor: 'tecnica', texto: 'Mejorar mi técnica', siguiente: 'det_tecnica' },
        { valor: 'empleo', texto: 'Prepararme para trabajar', siguiente: 'det_empleo' }
      ]
    },
    objetivo_aficionado: {
      id: 'objetivo_aficionado', multi: false,
      texto: '¿Qué te gustaría lograr?',
      opciones: [
        { valor: 'cocinar_mejor', texto: 'Cocinar mejor en casa', siguiente: 'det_cocinar_mejor' },
        { valor: 'postres', texto: 'Hacer postres y pasteles', siguiente: 'det_postres' },
        { valor: 'explorar', texto: 'Ver si me quiero dedicar a esto', siguiente: 'det_explorar' }
      ]
    },
    reto_profesional: {
      id: 'reto_profesional', multi: false,
      texto: '🎯 ¿Qué es lo que más te complica en tu trabajo?',
      opciones: [
        { valor: 'actualizar', texto: 'Actualizarme o especializarme', siguiente: 'det_actualizar' },
        { valor: 'costos', texto: 'Reducir costos y mermas', siguiente: 'det_prof_costos' },
        { valor: 'procesos', texto: 'Ordenar procesos y calidad', siguiente: 'det_prof_procesos' }
      ]
    },
    problema_emprendedor: {
      id: 'problema_emprendedor', multi: false,
      texto: '🎯 ¿Qué es lo que más te complica en tu negocio?',
      opciones: [
        { valor: 'precios', texto: '💰 No sé cuánto cobrar', siguiente: 'det_emp_precios' },
        { valor: 'costos', texto: '📊 No controlo mis costos, inventario y merma', siguiente: 'det_emp_costos' },
        { valor: 'produccion', texto: '⚙️ Necesito ordenar mi producción y calidad', siguiente: 'det_emp_produccion' },
        { valor: 'ventas', texto: '📣 Necesito vender más', siguiente: 'det_emp_ventas' }
      ]
    },

    // ── Paso 4: detalle del reto elegido ──
    det_desde_cero: {
      id: 'det_desde_cero', multi: false,
      texto: '¿Qué te gustaría aprender primero?',
      opciones: sig([
        { valor: 'cocina_base', texto: 'Técnicas básicas de cocina' },
        { valor: 'reposteria', texto: 'Repostería y postres' },
        { valor: 'panaderia', texto: 'Panadería y masas' },
        { valor: 'higiene', texto: 'Higiene y seguridad en la cocina' }
      ], 'formato')
    },
    det_tecnica: {
      id: 'det_tecnica', multi: false,
      texto: '¿Qué técnica quieres perfeccionar?',
      opciones: sig([
        { valor: 'cortes', texto: 'Cortes y cocciones' },
        { valor: 'masas', texto: 'Masas, hornos y panes' },
        { valor: 'decoracion', texto: 'Decoración y emplatado' },
        { valor: 'salsas', texto: 'Salsas y fondos' }
      ], 'formato')
    },
    det_empleo: {
      id: 'det_empleo', multi: false,
      texto: '¿A qué te quieres dedicar?',
      opciones: sig([
        { valor: 'restaurante', texto: 'Cocina de restaurante u hotel' },
        { valor: 'pasteleria', texto: 'Pastelería y panadería' },
        { valor: 'produccion', texto: 'Producción de alimentos' },
        { valor: 'emprender', texto: 'Tener mi propio negocio' }
      ], 'formato')
    },
    det_cocinar_mejor: {
      id: 'det_cocinar_mejor', multi: false,
      texto: '¿Qué te gustaría dominar?',
      opciones: sig([
        { valor: 'diario', texto: 'Platillos del día a día' },
        { valor: 'especiales', texto: 'Comidas para ocasiones especiales' },
        { valor: 'basicas', texto: 'Técnicas básicas para cocinar mejor' }
      ], 'formato')
    },
    det_postres: {
      id: 'det_postres', multi: false,
      texto: '¿Qué te gustaría preparar?',
      opciones: sig([
        { valor: 'pasteles', texto: 'Pasteles y cupcakes' },
        { valor: 'individuales', texto: 'Postres individuales y de vaso' },
        { valor: 'galletas', texto: 'Galletas y panes dulces' }
      ], 'formato')
    },
    det_explorar: {
      id: 'det_explorar', multi: false,
      texto: '¿Qué te gustaría vender?',
      opciones: sig([
        { valor: 'dulces', texto: 'Pasteles y postres' },
        { valor: 'panes', texto: 'Pan y panadería' },
        { valor: 'comida', texto: 'Platillos y botanas' },
        { valor: 'no_se', texto: 'Todavía no lo sé' }
      ], 'formato')
    },
    det_actualizar: {
      id: 'det_actualizar', multi: false,
      texto: '¿Qué quieres actualizar?',
      opciones: sig([
        { valor: 'tecnicas', texto: 'Técnicas de mi área' },
        { valor: 'normativas', texto: 'Normativas e inocuidad' },
        { valor: 'tendencias', texto: 'Tendencias y productos nuevos' },
        { valor: 'liderazgo', texto: 'Liderazgo de equipos' }
      ], 'formato')
    },
    det_prof_costos: {
      id: 'det_prof_costos', multi: false,
      texto: '¿Qué te cuesta más trabajo controlar?',
      opciones: sig([
        { valor: 'costeo', texto: 'Costear recetas' },
        { valor: 'inventario', texto: 'Inventarios y compras' },
        { valor: 'merma', texto: 'Mermas y desperdicio' }
      ], 'formato')
    },
    det_prof_procesos: {
      id: 'det_prof_procesos', multi: false,
      texto: '¿Qué necesitas ordenar primero?',
      opciones: sig([
        { valor: 'estandarizar', texto: 'Estandarizar recetas y procesos' },
        { valor: 'planear', texto: 'Planear la producción' },
        { valor: 'calidad', texto: 'Calidad e inocuidad' }
      ], 'formato')
    },
    det_emp_precios: {
      id: 'det_emp_precios', multi: false,
      texto: '¿Qué te hace falta para poner tu precio?',
      opciones: sig([
        { valor: 'costo_real', texto: 'Saber cuánto me cuesta cada producto' },
        { valor: 'precio_venta', texto: 'Fijar mi precio de venta' },
        { valor: 'ganancia', texto: 'Saber cuánto gano realmente' }
      ], 'formato')
    },
    det_emp_costos: {
      id: 'det_emp_costos', multi: false,
      texto: '¿Qué parte de tus costos te preocupa más?',
      opciones: sig([
        { valor: 'costeo', texto: 'Costear mis recetas' },
        { valor: 'inventario', texto: 'Inventarios y compras' },
        { valor: 'merma', texto: 'Mermas y desperdicio' }
      ], 'formato')
    },
    det_emp_produccion: {
      id: 'det_emp_produccion', multi: false,
      texto: '¿Qué necesitas ordenar primero?',
      opciones: sig([
        { valor: 'estandarizar', texto: 'Estandarizar recetas y procesos' },
        { valor: 'planear', texto: 'Planear la producción' },
        { valor: 'calidad', texto: 'Calidad e inocuidad' }
      ], 'formato')
    },
    det_emp_ventas: {
      id: 'det_emp_ventas', multi: false,
      texto: '¿Cómo quieres vender más?',
      opciones: sig([
        { valor: 'redes', texto: 'Más clientes por redes sociales' },
        { valor: 'mayoreo', texto: 'Vender a restaurantes y cafeterías' },
        { valor: 'pedidos', texto: 'Eventos y pedidos especiales' }
      ], 'formato')
    },

    // ── Pasos 5 y 6: comunes a todos ──
    formato: {
      id: 'formato', multi: false,
      texto: '¿Cómo te gustaría aprenderlo?',
      opciones: sig([
        { valor: 'grabados', texto: 'Cursos grabados', sub: 'Los veo a mi ritmo, cuando puedo.' },
        { valor: 'vivo', texto: 'Clases en vivo', sub: 'Con chefs y preguntas en tiempo real.' },
        { valor: 'herramientas', texto: 'Plantillas y calculadoras', sub: 'Formatos listos para usar en mi cocina.' },
        { valor: 'asesoria', texto: 'Asesoría personalizada', sub: 'Orientación para mi caso.' }
      ], 'freno')
    },
    freno: {
      id: 'freno', multi: false,
      texto: '¿Qué te detiene hoy?',
      opciones: sig([
        { valor: 'precio', texto: 'El precio' },
        { valor: 'tiempo', texto: 'El tiempo' },
        { valor: 'tema', texto: 'No encuentro el tema que busco' },
        { valor: 'dudas', texto: 'No estoy seguro de que sea para mí' },
        { valor: 'listo', texto: 'Nada, estoy listo para empezar' }
      ], 'fin')
    }
  };

  var TOTAL_PASOS = 6; // tipo + contexto + reto + detalle + formato + freno, siempre

  var ICONOS_OPCION = {
    estudiante:'🎓', aficionado:'❤️', profesional:'👩‍🍳', emprendedor:'🚀',
    cocina:'🍳', dulce:'🧁', otra:'✳️', otro:'✳️', nada:'🌱', basico:'🥄', confianza:'😎',
    produccion:'⚙️', calidad:'🛡️', reposteria:'🧁', panaderia:'🥖', restaurante:'🍽️', cafeteria:'☕', catering:'🍱', casa:'🏠',
    desde_cero:'🌱', tecnica:'✨', empleo:'💼', cocinar_mejor:'🍳', postres:'🍰', explorar:'🧭',
    actualizar:'🔄', costos:'📊', procesos:'🧩', precios:'🏷️', ventas:'📣',
    cocina_base:'🔪', higiene:'🧼', cortes:'🔪', masas:'🥐', decoracion:'🎨', salsas:'🥣', pasteleria:'🥧', emprender:'🚀',
    diario:'🍲', especiales:'🎉', basicas:'📘', pasteles:'🎂', individuales:'🧁', galletas:'🍪',
    dulces:'🍰', panes:'🥖', comida:'🥘', no_se:'🤔',
    tecnicas:'🛠️', normativas:'📋', tendencias:'📈', liderazgo:'🧑‍🤝‍🧑',
    costeo:'🧾', inventario:'📦', merma:'♻️', estandarizar:'📐', planear:'🗓️',
    costo_real:'🧮', precio_venta:'🏷️', ganancia:'💵', redes:'📱', mayoreo:'🏪', pedidos:'🎁',
    grabados:'▶️', vivo:'🔴', herramientas:'🧮', asesoria:'💬',
    precio:'💰', tiempo:'⏳', tema:'🔎', dudas:'🤔', listo:'✅'
  };

  function iconoOpcion(valor) { return ICONOS_OPCION[valor] || '✦'; }
  function pistaPregunta(id) {
    var pistas = {
      tipo:'Elige la opción que más se parece a tu momento actual.',
      formato:'Así sabemos si te conviene más un curso, una clase o una herramienta.',
      freno:'Sé sincero: así sabemos cómo ayudarte mejor.'
    };
    if (id.indexOf('det_') === 0) return 'Ahora algo más concreto sobre lo que elegiste.';
    if (id.indexOf('contexto_') === 0) return 'Esto nos ayuda a ubicarte.';
    return pistas[id] || 'Elige la respuesta que mejor describe tu situación.';
  }
  function imagenGuiaPaso(id) {
    if (id === 'tipo') return 'assets/chef-guia-senala.png';
    if (id === 'freno') return 'assets/chef-guia-celebra.png';
    return 'assets/chef-guia-planea.png';
  }

  /* ---------- 3. Estado ---------- */
  var estado = { paso: 0, tipo: null, respuestas: {} };

  function preguntaPorId(id) {
    return id === 'tipo' ? PREGUNTAS.inicio : PREGUNTAS[id];
  }
  function opTexto(preguntaId, valor) {
    var p = preguntaPorId(preguntaId);
    var o = p && p.opciones.filter(function (x) { return x.valor === valor; })[0];
    return o ? o.texto.replace(/^[^\wÁÉÍÓÚÑáéíóúñ¿]+/, '') : '';
  }
  function idDetalle() {
    return Object.keys(estado.respuestas).filter(function (k) { return k.indexOf('det_') === 0; })[0];
  }

  /* ---------- 4. Reglas de recomendación (sin IA, Fase 1) ---------- */
  var ICONOS = { curso: '🎓', linea: '📚', reto: '⚡', club: '👑' };

  function recomendar() {
    var t = estado.tipo, r = estado.respuestas;
    var ctx = opTexto('contexto_' + t, r['contexto_' + t]);
    var reto = opTexto(RETO_ID[t], r[RETO_ID[t]]);
    var dId = idDetalle();
    var det = dId ? opTexto(dId, r[dId]) : '';

    var items = [{ icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: det || reto }];
    if (t === 'emprendedor') {
      items.push({ icono: ICONOS.reto, categoria: 'Reto', titulo: 'Calcula la rentabilidad de uno de tus productos' });
      items.push({ icono: ICONOS.club, categoria: 'Club VIP', titulo: 'Comunidad de emprendedores gastronómicos' });
    } else if (t === 'profesional') {
      items.push({ icono: ICONOS.club, categoria: 'Club VIP', titulo: 'Comunidad y recursos para profesionales' });
    } else if (r[RETO_ID[t]] === 'empleo') {
      items.push({ icono: ICONOS.club, categoria: 'Certificado', titulo: 'Certificado con QR al terminar' });
    } else {
      items.push({ icono: ICONOS.reto, categoria: 'Reto', titulo: 'Reto de práctica semanal' });
    }
    var porFormato = {
      grabados: 'Cursos grabados para ver a tu ritmo',
      vivo: 'Clases en vivo con chefs',
      herramientas: 'Plantillas y calculadoras listas para usar',
      asesoria: 'Asesoría personalizada'
    };
    if (porFormato[r.formato]) items.push({ icono: ICONOS.club, categoria: 'Lo que pediste', titulo: porFormato[r.formato] });

    return {
      perfil: { icono: TIPO_ICONO[t], texto: TIPO_TXT[t] + (t === 'aficionado' || !ctx ? '' : ' · ' + ctx) },
      objetivo: reto + '.',
      foco: det ? det + '.' : reto + '.',
      ruta: items
    };
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
    // retos
    costos: ['costo', 'food cost', 'rentab', 'merma', 'inventario', 'insumo'],
    precios: ['precio', 'fijacion', 'rentab'], ventas: ['precio', 'rentab', 'negocio'],
    produccion: ['estandariz', 'proceso', 'receta', 'inocuidad', 'calidad'],
    procesos: ['estandariz', 'proceso', 'inocuidad', 'calidad'],
    actualizar: ['tecnica'], tecnica: ['tecnica'],
    desde_cero: ['fundamento', 'basic', 'introduccion'], empleo: ['certific', 'inocuidad', 'negocio'],
    cocinar_mejor: ['cocina', 'tecnica'], postres: ['reposter', 'postre'], explorar: ['negocio', 'emprend'],
    // detalles
    cocina_base: ['cocina', 'tecnica', 'fundamento'], reposteria: ['reposter', 'postre'], panaderia: ['panader', 'masa'],
    higiene: ['higiene', 'inocuidad'], cortes: ['cocina', 'tecnica'], masas: ['panader', 'masa', 'reposter'],
    decoracion: ['decoraci', 'reposter'], salsas: ['salsa', 'cocina'], restaurante: ['cocina', 'restaurante'],
    pasteleria: ['reposter', 'panader'], emprender: ['negocio', 'emprend', 'rentab'],
    diario: ['cocina'], especiales: ['cocina'], basicas: ['cocina', 'tecnica'],
    pasteles: ['reposter', 'pastel'], individuales: ['reposter', 'postre'], galletas: ['galleta', 'panader'],
    dulces: ['reposter', 'postre'], panes: ['panader'], comida: ['cocina'],
    tecnicas: ['tecnica'], normativas: ['norma', 'inocuidad'], tendencias: ['tendencia', 'innovacion', 'producto'],
    liderazgo: ['liderazgo', 'equipo'], costeo: ['costeo', 'costo', 'receta'], inventario: ['inventario', 'compras', 'insumo'],
    merma: ['merma', 'desperdicio'], estandarizar: ['estandariz', 'receta', 'proceso'], planear: ['produccion', 'planeaci', 'planificaci'],
    calidad: ['inocuidad', 'calidad', 'higiene'], costo_real: ['costo', 'costeo'], precio_venta: ['precio', 'fijacion'],
    ganancia: ['rentab', 'utilidad'], redes: ['venta', 'negocio'], mayoreo: ['venta', 'negocio'], pedidos: ['venta', 'negocio'],
    // contexto
    dulce: ['reposter', 'panader'], cocina: ['cocina'], cafeteria: ['cafeter'], catering: ['catering', 'evento']
  };

  // Peso de cada respuesta: el detalle es lo más específico (3), luego el
  // reto (2) y al final el contexto (1).
  function pesoDe(preguntaId) {
    if (preguntaId.indexOf('det_') === 0) return 3;
    if (preguntaId.indexOf('contexto_') === 0) return 1;
    if (preguntaId === 'tipo' || preguntaId === 'formato' || preguntaId === 'freno') return 0;
    return 2;
  }

  function perfilPalabras() {
    var r = estado.respuestas, pesos = {};
    Object.keys(r).forEach(function (id) {
      var peso = pesoDe(id);
      if (!peso) return;
      (PALABRAS[r[id]] || []).forEach(function (w) { pesos[w] = Math.max(pesos[w] || 0, peso); });
    });
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
    }).filter(function (x) { return x.p >= 3; }) // coincidencia mínima: mejor "próximamente" que recomendar algo que no es
      .sort(function (a, b) { return b.p - a.p; })
      .slice(0, 2)
      .forEach(function (x) {
        var detalle = (x.modulo ? 'Empieza por: ' + limpiarModulo(x.modulo) : '') + (x.c.tieneGratis ? (x.modulo ? ' · ' : '') + 'Incluye clases de muestra gratis' : '');
        items.push({ icono: ICONOS.curso, categoria: 'Curso en la membresía', titulo: x.c.titulo, detalle: detalle });
      });
    if (!items.length) {
      var dId = idDetalle(); var tema = (dId && opTexto(dId, estado.respuestas[dId])) || 'tu tema';
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
