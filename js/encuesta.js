/* =========================================================
   DULCELAB FOOD — Descubre tu perfil DulceLab
   Encuesta adaptativa presentada como una experiencia guiada: la chef
   acompaña cada paso, el avance es una receta que se completa, la
   pregunta de contenidos es de tarjetas "me interesa / no es para mí"
   (botones o arrastrando) y se ramifica en 4 rutas según el tipo de
   visitante. Al final recomienda los cursos que de verdad están en la
   membresía (se leen de Firestore) según lo que contestó.
   ========================================================= */
(function () {
  'use strict';

  var WEBHOOK_URL = 'https://dulcelab-webhook-production.up.railway.app';
  var STORAGE_DONE = 'dlf-encuesta';          // localStorage: ya la contestó o dijo "ahora no" definitivo
  var STORAGE_SKIP = 'dlf-encuesta-cerrada';  // sessionStorage: no insistir en esta misma visita
  var STEP_EMOJIS = ['👤', '🎯', '🔥', '🍰', '🎮', '⏰'];

  var modal = document.getElementById('encuesta');
  if (!modal) return;
  var body = document.getElementById('encuestaBody');
  var progressWrap = document.getElementById('encuestaProgressWrap');
  var btnClose = document.getElementById('encuestaClose');
  var btnAbrir = document.getElementById('encuestaTrigger');

  /* ---------- 1. Opciones compartidas entre ramas ---------- */
  var TEMAS = [
    { valor: 'cocina', texto: 'Cocina' },
    { valor: 'reposteria', texto: 'Repostería' },
    { valor: 'panaderia', texto: 'Panadería' },
    { valor: 'inocuidad', texto: 'Inocuidad' },
    { valor: 'costos', texto: 'Costos' },
    { valor: 'produccion', texto: 'Producción' },
    { valor: 'emprendimiento', texto: 'Emprendimiento' }
  ];
  var FORMATO = [
    { valor: 'vivo', texto: 'Clases en vivo' },
    { valor: 'grabados', texto: 'Cursos grabados' },
    { valor: 'pdfs', texto: 'PDFs' },
    { valor: 'plantillas', texto: 'Plantillas' },
    { valor: 'herramientas', texto: 'Herramientas' },
    { valor: 'retos', texto: 'Retos' }
  ];
  var AREA_TXT = {
    cocina: 'Cocina', reposteria: 'Repostería', panaderia: 'Panadería',
    inocuidad: 'Inocuidad', costos: 'Costos', produccion: 'Producción', emprendimiento: 'Emprendimiento',
    restaurante: 'Restaurante', cafeteria: 'Cafetería', catering: 'Catering',
    procesados: 'Alimentos procesados', casa: 'Venta desde casa', otro: 'tu negocio', otra: 'tu área',
    calidad: 'Calidad e inocuidad', administracion: 'Administración'
  };

  /* ---------- 2. Árbol de preguntas ---------- */
  var PREGUNTAS = {
    inicio: {
      id: 'tipo', multi: false,
      guia: '👩‍🍳 Primero quiero conocerte…',
      texto: '¿En qué momento de tu camino gastronómico estás?',
      opciones: [
        { valor: 'estudiante', texto: '🎓 Estoy estudiando', sub: 'Estoy construyendo mis conocimientos.', siguiente: 'objetivo_estudiante', reaccion: '¡Qué bien! 🎓 Vamos a ver cómo seguir construyendo tu camino.' },
        { valor: 'profesional', texto: '👩‍🍳 Ya trabajo en gastronomía', sub: 'Quiero crecer profesionalmente.', siguiente: 'area_profesional', reaccion: '¡Excelente! 👩‍🍳 Hablemos de tu trabajo.' },
        { valor: 'emprendedor', texto: '🚀 Tengo o quiero un negocio', sub: 'Quiero convertir lo que hago en algo rentable.', siguiente: 'etapa_emprendedor', reaccion: '¡Excelente! 🚀 Entonces vamos a hablar de tu negocio.' },
        { valor: 'aficionado', texto: '❤️ Aprendo porque me apasiona', sub: 'Me encanta el mundo gastronómico.', siguiente: 'objetivo_aficionado', reaccion: '¡Me encanta! ❤️ Vamos a ver qué te late más.' }
      ]
    },

    // ── Estudiante ──
    objetivo_estudiante: {
      id: 'objetivo_estudiante', multi: false,
      texto: '¿Qué buscas conseguir principalmente?',
      opciones: [
        { valor: 'mejorar', texto: 'Mejorar mis habilidades', siguiente: 'intereses_estudiante' },
        { valor: 'trabajar', texto: 'Prepararme para trabajar', siguiente: 'intereses_estudiante' },
        { valor: 'emprender', texto: 'Emprender', siguiente: 'intereses_estudiante' },
        { valor: 'complementar', texto: 'Complementar mis estudios', siguiente: 'intereses_estudiante' }
      ]
    },
    intereses_estudiante: { id: 'intereses_estudiante', multi: true, max: 3, texto: '¿Qué te interesa aprender?', opciones: TEMAS, siguiente: 'formato_estudiante' },
    formato_estudiante: { id: 'formato_estudiante', multi: true, texto: '¿Qué tipo de recursos te ayudarían más?', opciones: FORMATO, siguiente: 'membresia' },

    // ── Profesional ──
    area_profesional: {
      id: 'area_profesional', multi: false,
      texto: '¿En qué área trabajas?',
      opciones: [
        { valor: 'cocina', texto: 'Cocina', siguiente: 'reto_profesional' },
        { valor: 'reposteria', texto: 'Repostería', siguiente: 'reto_profesional' },
        { valor: 'panaderia', texto: 'Panadería', siguiente: 'reto_profesional' },
        { valor: 'produccion', texto: 'Producción de alimentos', siguiente: 'reto_profesional' },
        { valor: 'calidad', texto: 'Calidad e inocuidad', siguiente: 'reto_profesional' },
        { valor: 'administracion', texto: 'Administración', siguiente: 'reto_profesional' },
        { valor: 'otra', texto: 'Otra área', siguiente: 'reto_profesional' }
      ]
    },
    reto_profesional: {
      id: 'reto_profesional', multi: false,
      texto: '🎯 Elige el reto que más te está complicando',
      opciones: [
        { valor: 'actualizar', texto: 'Actualizar mis conocimientos', siguiente: 'temas_profesional' },
        { valor: 'procesos', texto: 'Mejorar procesos', siguiente: 'temas_profesional' },
        { valor: 'costos', texto: 'Reducir costos', siguiente: 'temas_profesional' },
        { valor: 'inventarios', texto: 'Controlar inventarios y mermas', siguiente: 'temas_profesional' },
        { valor: 'normativas', texto: 'Aprender normativas', siguiente: 'temas_profesional' },
        { valor: 'especializarme', texto: 'Especializarme', siguiente: 'temas_profesional' },
        { valor: 'crecer', texto: 'Crecer profesionalmente', siguiente: 'temas_profesional' }
      ]
    },
    temas_profesional: { id: 'temas_profesional', multi: true, max: 3, texto: '¿Qué temas te gustaría profundizar?', opciones: TEMAS, siguiente: 'membresia' },

    // ── Emprendedor ──
    etapa_emprendedor: {
      id: 'etapa_emprendedor', multi: false,
      texto: '¿En qué etapa estás?',
      opciones: [
        { valor: 'idea', texto: '💡 Solo tengo la idea', siguiente: 'tipo_negocio_emprendedor' },
        { valor: 'comenzando', texto: '🌱 Estoy comenzando', siguiente: 'tipo_negocio_emprendedor' },
        { valor: 'activo', texto: '🏪 Ya tengo un negocio', siguiente: 'tipo_negocio_emprendedor' },
        { valor: 'creciendo', texto: '📈 Mi negocio está creciendo', siguiente: 'tipo_negocio_emprendedor' }
      ]
    },
    tipo_negocio_emprendedor: {
      id: 'tipo_negocio_emprendedor', multi: false,
      texto: '¿Qué tipo de negocio tienes o quieres crear?',
      opciones: [
        { valor: 'reposteria', texto: 'Repostería', siguiente: 'problema_emprendedor' },
        { valor: 'panaderia', texto: 'Panadería', siguiente: 'problema_emprendedor' },
        { valor: 'restaurante', texto: 'Restaurante', siguiente: 'problema_emprendedor' },
        { valor: 'cafeteria', texto: 'Cafetería', siguiente: 'problema_emprendedor' },
        { valor: 'catering', texto: 'Catering', siguiente: 'problema_emprendedor' },
        { valor: 'procesados', texto: 'Alimentos procesados', siguiente: 'problema_emprendedor' },
        { valor: 'casa', texto: 'Venta desde casa', siguiente: 'problema_emprendedor' },
        { valor: 'otro', texto: 'Otro', siguiente: 'problema_emprendedor' }
      ]
    },
    problema_emprendedor: {
      id: 'problema_emprendedor', multi: false,
      texto: '🎯 Elige el reto que más te está complicando',
      opciones: [
        { valor: 'precios', texto: '💰 No sé cuánto cobrar', siguiente: 'membresia' },
        { valor: 'costos', texto: '📊 No controlo bien mis costos', siguiente: 'membresia' },
        { valor: 'inventarios', texto: '📦 Tengo problemas con inventarios', siguiente: 'membresia' },
        { valor: 'merma', texto: '🗑️ Tengo mucha merma', siguiente: 'membresia' },
        { valor: 'ventas', texto: '📣 Necesito vender más', siguiente: 'membresia' },
        { valor: 'productos', texto: '🍽️ Quiero desarrollar mejores productos', siguiente: 'membresia' },
        { valor: 'produccion', texto: '⚙️ Necesito ordenar mi producción', siguiente: 'membresia' },
        { valor: 'inocuidad', texto: '🧪 Necesito mejorar inocuidad/calidad', siguiente: 'membresia' }
      ]
    },

    // ── Aficionado ──
    objetivo_aficionado: {
      id: 'objetivo_aficionado', multi: false,
      texto: '¿Qué te gustaría lograr?',
      opciones: [
        { valor: 'hobby', texto: 'Disfrutarlo como pasatiempo', siguiente: 'intereses_aficionado' },
        { valor: 'familia', texto: 'Sorprender a mi familia y amigos', siguiente: 'intereses_aficionado' },
        { valor: 'explorar', texto: 'Explorar si me quiero dedicar a esto', siguiente: 'intereses_aficionado' },
        { valor: 'ocasional', texto: 'Aprender para vender o regalar ocasionalmente', siguiente: 'intereses_aficionado' }
      ]
    },
    intereses_aficionado: { id: 'intereses_aficionado', multi: true, max: 3, texto: '¿Qué te gustaría aprender?', opciones: TEMAS, siguiente: 'formato_aficionado' },
    formato_aficionado: { id: 'formato_aficionado', multi: true, texto: '¿Qué tipo de recursos te ayudarían más?', opciones: FORMATO, siguiente: 'membresia' },

    // ── Común a todas las ramas ──
    membresia: {
      id: 'membresia', multi: true, swipe: true,
      texto: '¿Qué contenidos sí usarías?',
      opciones: [
        { valor: 'cursos', texto: 'Cursos completos', sub: 'Aprende paso a paso, a tu ritmo' },
        { valor: 'vivo', texto: 'Clases en vivo', sub: 'Con chefs y preguntas en tiempo real' },
        { valor: 'rapidos', texto: 'Videos rápidos', sub: 'Clips de 5 minutos para aprender al paso' },
        { valor: 'plantillas', texto: 'Plantillas de trabajo', sub: 'Formatos listos para usar en tu cocina' },
        { valor: 'calculadoras', texto: 'Calculadoras y herramientas', sub: 'Costos, rendimientos y precios al instante' },
        { valor: 'recetas', texto: 'Recetas', sub: 'Preparaciones probadas, paso a paso' },
        { valor: 'retos', texto: 'Retos prácticos', sub: 'Pon en práctica lo aprendido' },
        { valor: 'certificados', texto: 'Certificados', sub: 'Comprueba lo que aprendiste' },
        { valor: 'comunidad', texto: 'Comunidad', sub: 'Resuelve dudas y aprende con otros' },
        { valor: 'asesoria', texto: 'Asesoría', sub: 'Orientación personalizada para ti' }
      ],
      siguiente: 'tiempo_disponible'
    },
    tiempo_disponible: {
      id: 'tiempo_disponible', multi: false,
      texto: '⏰ Imagina que tienes una hora libre para aprender… ¿cuánto tiempo tienes en realidad a la semana?',
      opciones: [
        { valor: 'menos1', texto: 'Menos de 1 hora', siguiente: 'fin' },
        { valor: 'uno_dos', texto: '1 a 2 horas', siguiente: 'fin' },
        { valor: 'tres_cinco', texto: '3 a 5 horas', siguiente: 'fin' },
        { valor: 'mas5', texto: 'Más de 5 horas', siguiente: 'fin' }
      ]
    }
  };

  var TOTAL_PASOS = 6; // tipo + 3 de la rama + membresía + tiempo, siempre

  var ICONOS_OPCION = {
    estudiante:'🎓', profesional:'👩‍🍳', emprendedor:'🚀', aficionado:'❤️',
    cocina:'🍳', reposteria:'🧁', panaderia:'🥖', inocuidad:'🛡️', costos:'💰', produccion:'⚙️', emprendimiento:'📈',
    vivo:'🔴', grabados:'▶️', pdfs:'📄', plantillas:'🧾', herramientas:'🧰', retos:'⚡',
    cursos:'🎓', calculadoras:'🧮', comunidad:'🤝', certificados:'🏅', rapidos:'🎬', recetas:'🍰', asesoria:'💬',
    idea:'💡', comenzando:'🌱', activo:'🏪', creciendo:'📈', restaurante:'🍽️', cafeteria:'☕', catering:'🍱', procesados:'🏭', casa:'🏠',
    mejorar:'✨', trabajar:'💼', emprender:'🚀', complementar:'📚', hobby:'🎨', familia:'👨‍👩‍👧', explorar:'🧭', ocasional:'🎁',
    precios:'🏷️', inventarios:'📦', merma:'♻️', ventas:'📣', productos:'🍽️', procesos:'🧩', normativas:'📋', especializarme:'🎯', actualizar:'🔄', crecer:'📈',
    menos1:'⏳', uno_dos:'🕐', tres_cinco:'🗓️', mas5:'🔥', calidad:'🛡️', administracion:'📊', otra:'✳️', otro:'✳️'
  };

  function iconoOpcion(valor) { return ICONOS_OPCION[valor] || '✦'; }
  function pistaPregunta(id) {
    var pistas = {
      tipo:'Elige la opción que más se parece a tu momento actual.',
      intereses_estudiante:'No necesitas dominarlo todo: empieza por lo que más te entusiasma.',
      temas_profesional:'Tus elecciones nos ayudan a recomendar una ruta más útil para tu trabajo.',
      intereses_aficionado:'Elige lo que más ganas tienes de practicar primero.',
      membresia:'Selecciona los recursos que realmente aprovecharías.',
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

  function primero(valorOarray) {
    if (Array.isArray(valorOarray)) return valorOarray[0];
    return valorOarray;
  }

  /* ---------- 4. Reglas de recomendación (sin IA, Fase 1) ---------- */
  var ICONOS = { curso: '🎓', linea: '📚', reto: '⚡', club: '👑' };

  function ruta(items) { return items; }

  function recomendar() {
    var t = estado.tipo, r = estado.respuestas;

    if (t === 'estudiante') {
      var area = AREA_TXT[primero(r.intereses_estudiante)] || 'gastronomía';
      var objetivo = r.objetivo_estudiante;
      var perfil = { icono: '🎓', texto: 'Estudiante en formación' };
      var foco = 'Dominar la técnica de ' + area.toLowerCase() + ' y practicar seguido.';
      var items = [{ icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: 'Fundamentos de ' + area }];
      if (objetivo === 'trabajar') {
        perfil = { icono: '🎓', texto: 'Estudiante enfocado a emplearse' };
        foco = 'Certificarte y tener práctica demostrable en ' + area.toLowerCase() + '.';
        items.push({ icono: ICONOS.club, categoria: 'Certificado', titulo: 'Certificado con QR al terminar' });
      } else if (objetivo === 'emprender') {
        perfil = { icono: '🎓', texto: 'Estudiante con visión emprendedora' };
        foco = 'Combinar técnica con fundamentos de negocio.';
        items.push({ icono: ICONOS.linea, categoria: 'Línea', titulo: 'Línea de Emprendimiento' });
      } else {
        items.push({ icono: ICONOS.reto, categoria: 'Reto', titulo: 'Reto de práctica semanal' });
      }
      return { perfil: perfil, objetivo: tituloObjetivoEstudiante(objetivo), foco: foco, ruta: ruta(items) };
    }

    if (t === 'profesional') {
      var reto = r.reto_profesional;
      var areaProf = AREA_TXT[r.area_profesional] || 'tu área';
      var mapa = {
        costos: { texto: 'Reducir costos y mejorar tu rentabilidad.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Control Estratégico de Costos y Costeo de Recetas' } },
        inventarios: { texto: 'Controlar inventarios y reducir mermas.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Compras, Inventarios y Control de Insumos' } },
        crecer: { texto: 'Dar el siguiente paso profesional.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Fijación de Precios y Rentabilidad Operativa' } },
        procesos: { texto: 'Ordenar y estandarizar tus procesos.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Compras, Inventarios y Control de Insumos' } },
        normativas: { texto: 'Actualizarte en normativas de inocuidad.', item: { icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: 'Actualización en ' + areaProf } },
        especializarme: { texto: 'Especializarte en ' + areaProf.toLowerCase() + '.', item: { icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: 'Especialización en ' + areaProf } },
        actualizar: { texto: 'Actualizar tu técnica en ' + areaProf.toLowerCase() + '.', item: { icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: 'Actualización en ' + areaProf } }
      };
      var m = mapa[reto] || mapa.actualizar;
      return {
        perfil: { icono: '👩‍🍳', texto: 'Profesional de ' + areaProf },
        objetivo: m.texto,
        foco: 'Lo que más mencionaste: ' + (PREGUNTAS.reto_profesional.opciones.find(o => o.valor === reto) || {}).texto,
        ruta: ruta([m.item, { icono: ICONOS.club, categoria: 'Club VIP', titulo: 'Comunidad y recursos para profesionales' }])
      };
    }

    if (t === 'emprendedor') {
      var problema = r.problema_emprendedor;
      var negocio = AREA_TXT[r.tipo_negocio_emprendedor] || 'tu negocio';
      var mapaProb = {
        precios: { texto: 'No sabes cuánto cobrar por tus productos.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Fijación de Precios y Rentabilidad Operativa' } },
        costos: { texto: 'No tienes control claro de tus costos.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Control Estratégico de Costos y Costeo de Recetas' } },
        inventarios: { texto: 'Tus inventarios no están bajo control.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Compras, Inventarios y Control de Insumos' } },
        merma: { texto: 'Estás perdiendo dinero en merma.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Control de Mermas y Desperdicios' } },
        ventas: { texto: 'Necesitas vender más.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Fijación de Precios y Rentabilidad Operativa' } },
        productos: { texto: 'Quieres mejores productos para ' + negocio.toLowerCase() + '.', item: { icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: 'Desarrollo de productos para ' + negocio } },
        produccion: { texto: 'Tu producción necesita orden.', item: { icono: ICONOS.linea, categoria: 'Línea', titulo: 'Compras, Inventarios y Control de Insumos' } },
        inocuidad: { texto: 'Quieres mejorar inocuidad y calidad.', item: { icono: ICONOS.club, categoria: 'Club VIP', titulo: 'Recursos de inocuidad y calidad' } }
      };
      var mp = mapaProb[problema] || mapaProb.costos;
      return {
        perfil: { icono: '🚀', texto: 'Emprendedor de ' + negocio },
        objetivo: 'Hacer crecer y rentabilizar ' + negocio.toLowerCase() + '.',
        foco: mp.texto,
        ruta: ruta([mp.item, { icono: ICONOS.reto, categoria: 'Reto', titulo: 'Calcula la rentabilidad de uno de tus productos' }, { icono: ICONOS.club, categoria: 'Club VIP', titulo: 'Comunidad de emprendedores gastronómicos' }])
      };
    }

    // aficionado
    var objAfi = r.objetivo_aficionado;
    var areaAfi = AREA_TXT[primero(r.intereses_aficionado)] || 'gastronomía';
    var itemsAfi = [{ icono: ICONOS.curso, categoria: 'Ruta recomendada', titulo: 'Fundamentos de ' + areaAfi }];
    var focoAfi = 'Aprender lo básico de ' + areaAfi.toLowerCase() + ' sin presión.';
    if (objAfi === 'explorar') {
      focoAfi = 'Probar si la gastronomía puede ser algo más que un hobby.';
      itemsAfi.push({ icono: ICONOS.linea, categoria: 'Línea', titulo: 'Línea de Emprendimiento' });
    } else {
      itemsAfi.push({ icono: ICONOS.reto, categoria: 'Reto', titulo: 'Reto de práctica para principiantes' });
    }
    return {
      perfil: { icono: '🍰', texto: 'Aprende por gusto' },
      objetivo: focoAfi,
      foco: 'Área de mayor interés: ' + areaAfi,
      ruta: ruta(itemsAfi)
    };
  }

  function tituloObjetivoEstudiante(v) {
    var m = { mejorar: 'Mejorar tus habilidades.', trabajar: 'Prepararte para trabajar en el sector.', emprender: 'Aprender para emprender.', complementar: 'Complementar tus estudios.' };
    return m[v] || 'Aprender gastronomía.';
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
    if (p.swipe) { renderSwipe(p); return; }

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

  // Pregunta tipo "tarjetas": una opción a la vez, ❤️ Me interesa / ✕ No es
  // para mí (con botones o arrastrando la tarjeta). Las "aceptadas" quedan
  // como respuesta (mismo formato que una de opción múltiple). Si descarta
  // todas se guarda ['ninguno'] porque el backend no acepta arreglos vacíos.
  function renderSwipe(p) {
    var aceptadas = [], idx = 0, ocupado = false, n = p.opciones.length;
    var siMsgs = ['¡Anotado! ❤️', '¡Buena elección!', 'Eso suma a tu ruta ✨', '¡Me encanta! 🙌'];
    var noMsgs = ['Sin problema, seguimos 👉', 'Anotado, siguiente…', 'Va, a la que sigue'];
    function azar(a) { return a[Math.floor(Math.random() * a.length)]; }

    renderProgreso();
    body.innerHTML =
      '<div class="encuesta__lesson">' +
        '<aside class="encuesta__mentor">' +
          '<img src="' + imagenGuiaPaso(p.id) + '" width="1024" height="1536" alt="Chef Dulce, tu guía de aprendizaje">' +
          '<div class="encuesta__mentor-talk"><span>Chef Dulce te guía</span><p id="encuestaSwipeBurbuja">Toca ❤️ si lo usarías o ✕ si no. También puedes arrastrar la tarjeta.</p></div>' +
        '</aside>' +
        '<div class="encuesta__question-panel">' +
          '<div class="encuesta__step"><span>Paso ' + (estado.paso + 1) + ' de ' + TOTAL_PASOS + '</span><span id="encuestaSwipeContador"></span></div>' +
          '<h2 class="encuesta__pregunta">' + p.texto + '</h2>' +
          '<div class="encuesta__swipe-stage"><div class="encuesta__swipe-card" id="encuestaSwipeCard"></div></div>' +
          '<div class="encuesta__swipe-ctas">' +
            '<button type="button" class="encuesta__swipe-btn encuesta__swipe-btn--no" id="encuestaSwipeNo" aria-label="No es para mí">✕</button>' +
            '<button type="button" class="encuesta__swipe-btn encuesta__swipe-btn--si" id="encuestaSwipeSi" aria-label="Me interesa">❤️</button>' +
          '</div>' +
          '<div class="encuesta__swipe-barra"><div id="encuestaSwipeAvance"></div></div>' +
        '</div>' +
      '</div>';

    var card = document.getElementById('encuestaSwipeCard');
    var burbuja = document.getElementById('encuestaSwipeBurbuja');
    var contador = document.getElementById('encuestaSwipeContador');
    var avance = document.getElementById('encuestaSwipeAvance');

    function pintarCard() {
      if (idx >= n) { avanzar(p, aceptadas.length ? aceptadas : ['ninguno']); return; }
      var o = p.opciones[idx];
      card.className = 'encuesta__swipe-card is-entra';
      card.style.transform = '';
      card.innerHTML = '<span class="encuesta__swipe-icono">' + iconoOpcion(o.valor) + '</span><p>' + o.texto + '</p>' + (o.sub ? '<small>' + o.sub + '</small>' : '');
      contador.textContent = (idx + 1) + ' de ' + n;
      avance.style.width = Math.round(idx / n * 100) + '%';
    }

    function responder(si) {
      if (ocupado || idx >= n) return;
      ocupado = true;
      var o = p.opciones[idx];
      card.classList.remove('is-entra', 'is-arrastra', 'is-quiere-si', 'is-quiere-no');
      card.style.transform = '';
      card.classList.add(si ? 'is-si' : 'is-no');
      if (si) aceptadas.push(o.valor);
      burbuja.textContent = azar(si ? siMsgs : noMsgs);
      idx += 1;
      setTimeout(function () { ocupado = false; pintarCard(); }, 240);
    }

    document.getElementById('encuestaSwipeSi').addEventListener('click', function () { responder(true); });
    document.getElementById('encuestaSwipeNo').addEventListener('click', function () { responder(false); });

    var x0 = null;
    card.addEventListener('pointerdown', function (e) {
      if (ocupado) return;
      x0 = e.clientX;
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
      card.classList.add('is-arrastra');
    });
    card.addEventListener('pointermove', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0;
      card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18) + 'deg)';
      card.classList.toggle('is-quiere-si', dx > 40);
      card.classList.toggle('is-quiere-no', dx < -40);
    });
    function soltar(e) {
      if (x0 === null) return;
      var dx = e.clientX - x0;
      x0 = null;
      card.classList.remove('is-arrastra', 'is-quiere-si', 'is-quiere-no');
      if (Math.abs(dx) > 90) responder(dx > 0); else card.style.transform = '';
    }
    card.addEventListener('pointerup', soltar);
    card.addEventListener('pointercancel', soltar);

    pintarCard();
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
      var extras = r.ruta.filter(function (it) { return it.categoria === 'Reto' || it.categoria === 'Club VIP' || it.categoria === 'Certificado'; });
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
    costos: ['costo', 'food cost', 'rentab'], precios: ['precio', 'fijacion', 'rentab'],
    inventarios: ['inventario', 'compras', 'insumo'], merma: ['merma', 'desperdicio'],
    ventas: ['rentab', 'precio'], produccion: ['estandariz', 'proceso', 'receta'],
    procesos: ['estandariz', 'proceso'], crecer: ['rentab', 'precio'],
    emprendimiento: ['negocio', 'emprend', 'rentab', 'costo'], productos: ['receta', 'estandariz'],
    reposteria: ['reposter', 'postre'], panaderia: ['panader'], cocina: ['cocina'],
    inocuidad: ['inocuidad', 'higiene'], normativas: ['inocuidad', 'norma']
  };

  function perfilPalabras() {
    var r = estado.respuestas, pesos = {};
    function sumar(valor, peso) { (PALABRAS[valor] || []).forEach(function (w) { pesos[w] = Math.max(pesos[w] || 0, peso); }); }
    [r.problema_emprendedor, r.reto_profesional].forEach(function (v) { if (v) sumar(v, 3); });
    [r.intereses_estudiante, r.temas_profesional, r.intereses_aficionado].forEach(function (arr) { (arr || []).forEach(function (v) { sumar(v, 2); }); });
    [r.area_profesional, r.tipo_negocio_emprendedor].forEach(function (v) { if (v) sumar(v, 1); });
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
      var tema = AREA_TXT[primero(estado.respuestas.intereses_estudiante || estado.respuestas.temas_profesional || estado.respuestas.intereses_aficionado || estado.respuestas.tipo_negocio_emprendedor || estado.respuestas.area_profesional)] || 'tu tema';
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
