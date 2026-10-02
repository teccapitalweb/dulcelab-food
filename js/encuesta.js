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

  // El contexto (paso 2) decide qué variante del detalle (paso 4) ve cada
  // persona: un repostero y un restaurantero no necesitan lo mismo aunque
  // ambos digan "no controlo mis costos". '_' es la variante general.
  var GRUPO_TXT = { dulce: 'Repostería', cocina: 'Cocina', catering: 'Catering', casa: 'Casa', produccion: 'Producción', calidad: 'Calidad', _: 'Otro' };
  var GRUPO_DE = {
    emprendedor: { reposteria: 'dulce', panaderia: 'dulce', restaurante: 'cocina', cafeteria: 'cocina', catering: 'catering', casa: 'casa', otro: '_' },
    profesional: { dulce: 'dulce', cocina: 'cocina', produccion: 'produccion', calidad: 'calidad', otra: '_' },
    estudiante: { cocina: 'cocina', dulce: 'dulce', otra: '_' },
    aficionado: { nada: 'nada', basico: 'basico', confianza: 'confianza' }
  };
  var GRUPOS_RE = /^(.*)_(dulce|cocina|catering|casa|produccion|calidad)$/;
  // def: { grupo: [[base, texto], ...] }. Cada valor guardado lleva el grupo
  // (costeo_dulce) para saber QUIÉN pidió QUÉ sin cruzar datos aparte.
  function detalleGrupos(id, texto, def) {
    var porGrupo = {}, todas = [];
    Object.keys(def).forEach(function (g) {
      porGrupo[g] = def[g].map(function (par) {
        var o = { valor: g === '_' ? par[0] : par[0] + '_' + g, texto: par[1], siguiente: 'formato', grupo: g };
        todas.push(o);
        return o;
      });
    });
    return { id: id, multi: false, texto: texto, porGrupo: porGrupo, opciones: todas };
  }
  // Pregunta de reto: las opciones y el título cambian según el contexto
  // (paso 2), pero los valores guardados son los mismos. 'base' es la variante
  // que usa el admin para nombrar las opciones.
  function retoGrupos(id, base, def) {
    var porGrupo = {};
    Object.keys(def).forEach(function (g) {
      porGrupo[g] = { texto: def[g].texto, opciones: def[g].ops.map(function (par) { return { valor: par[0], texto: par[1], siguiente: par[2] }; }) };
    });
    return { id: id, multi: false, texto: def[base].texto, base: base, porGrupo: porGrupo, opciones: porGrupo[base].opciones };
  }
  function grupoActual() {
    var m = GRUPO_DE[estado.tipo];
    return (m && m[estado.respuestas['contexto_' + estado.tipo]]) || '_';
  }
  // Devuelve la pregunta lista para mostrar (con las opciones de su grupo).
  function resolverPregunta(q) {
    if (!q) return q;
    if (q.variante) return Object.assign({}, q, q.variante(), { variante: null });
    if (!q.porGrupo) return q;
    var v = q.porGrupo[grupoActual()] || q.porGrupo[q.base] || q.porGrupo._;
    if (Array.isArray(v)) v = { opciones: v };
    return Object.assign({}, q, v, { porGrupo: null });
  }

  // Tipo de tema del detalle elegido (paso 4): decide cómo se le ofrece el
  // formato (paso 5). Los valores con grupo (costeo_dulce) se reducen a su base.
  var TEMAS_CALIDAD = ['higiene', 'normativas', 'calidad', 'sistemas', 'auditorias', 'bpm', 'auditar', 'capacitar'];
  var TEMAS_GESTION = ['costeo', 'inventario', 'merma', 'estandarizar', 'planear', 'costo_real', 'precio_venta', 'ganancia', 'reprocesos', 'trazabilidad', 'liderazgo', 'emprender', 'redes', 'mayoreo', 'pedidos'];
  function baseDe(valor) { var m = GRUPOS_RE.exec(valor || ''); return m ? m[1] : valor; }
  function categoriaTema() {
    var dId = idDetalle(), b = baseDe(estado.respuestas[dId]);
    if (TEMAS_CALIDAD.indexOf(b) !== -1) return 'calidad';
    if (TEMAS_GESTION.indexOf(b) !== -1) return 'gestion';
    return 'tecnica';
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
    objetivo_estudiante: retoGrupos('objetivo_estudiante', '_', {
      cocina: { texto: '¿Qué quieres lograr en cocina?', ops: [['desde_cero', 'Aprender cocina desde cero', 'det_desde_cero'], ['tecnica', 'Mejorar mi técnica en cocina', 'det_tecnica'], ['empleo', 'Prepararme para trabajar en cocinas', 'det_empleo']] },
      dulce: { texto: '¿Qué quieres lograr en repostería y panadería?', ops: [['desde_cero', 'Aprender repostería y panadería desde cero', 'det_desde_cero'], ['tecnica', 'Mejorar mi técnica de repostería y panadería', 'det_tecnica'], ['empleo', 'Prepararme para trabajar en pastelería o panadería', 'det_empleo']] },
      _: { texto: '¿Qué quieres lograr?', ops: [['desde_cero', 'Aprender desde cero', 'det_desde_cero'], ['tecnica', 'Mejorar mi técnica', 'det_tecnica'], ['empleo', 'Prepararme para trabajar', 'det_empleo']] }
    }),
    objetivo_aficionado: retoGrupos('objetivo_aficionado', 'basico', {
      nada: { texto: '¿Qué te gustaría lograr para empezar?', ops: [['cocinar_mejor', 'Aprender a cocinar desde lo básico', 'det_cocinar_mejor'], ['postres', 'Aprender postres fáciles para empezar', 'det_postres'], ['explorar', 'Ver si esto es para mí', 'det_explorar']] },
      basico: { texto: '¿Qué te gustaría lograr?', ops: [['cocinar_mejor', 'Cocinar mejor en casa', 'det_cocinar_mejor'], ['postres', 'Hacer postres y pasteles', 'det_postres'], ['explorar', 'Ver si me quiero dedicar a esto', 'det_explorar']] },
      confianza: { texto: '¿Qué te gustaría lograr ahora que ya cocinas con confianza?', ops: [['cocinar_mejor', 'Perfeccionar mis platillos', 'det_cocinar_mejor'], ['postres', 'Hacer postres y pasteles más elaborados', 'det_postres'], ['explorar', 'Convertir esto en un negocio', 'det_explorar']] }
    }),
    reto_profesional: retoGrupos('reto_profesional', '_', {
      dulce: { texto: '🎯 En repostería y panadería, ¿qué es lo que más te complica?', ops: [['actualizar', 'Actualizarme en repostería y panadería', 'det_actualizar'], ['costos', 'Reducir costos y mermas de producción', 'det_prof_costos'], ['procesos', 'Estandarizar mis recetas y procesos', 'det_prof_procesos']] },
      cocina: { texto: '🎯 En cocina y restaurante, ¿qué es lo que más te complica?', ops: [['actualizar', 'Actualizarme en técnicas y tendencias', 'det_actualizar'], ['costos', 'Controlar food cost y mermas', 'det_prof_costos'], ['procesos', 'Ordenar la operación de mi cocina', 'det_prof_procesos']] },
      produccion: { texto: '🎯 En producción de alimentos, ¿qué es lo que más te complica?', ops: [['actualizar', 'Actualizarme en procesos y normativas', 'det_actualizar'], ['costos', 'Reducir costos y mermas de línea', 'det_prof_costos'], ['procesos', 'Mejorar procesos y rendimientos', 'det_prof_procesos']] },
      calidad: { texto: '🎯 En calidad e inocuidad, ¿qué es lo que más te complica?', ops: [['actualizar', 'Actualizarme en sistemas de calidad', 'det_actualizar'], ['costos', 'Reducir reprocesos y rechazos', 'det_prof_costos'], ['procesos', 'Implementar y mantener procesos de calidad', 'det_prof_procesos']] },
      _: { texto: '🎯 ¿Qué es lo que más te complica en tu trabajo?', ops: [['actualizar', 'Actualizarme o especializarme', 'det_actualizar'], ['costos', 'Reducir costos y mermas', 'det_prof_costos'], ['procesos', 'Ordenar procesos y calidad', 'det_prof_procesos']] }
    }),
    problema_emprendedor: retoGrupos('problema_emprendedor', '_', {
      dulce: { texto: '🎯 En tu negocio de repostería o panadería, ¿qué es lo que más te complica?', ops: [['precios', '💰 No sé cuánto cobrar mis pasteles y postres', 'det_emp_precios'], ['costos', '📊 No controlo mis costos, insumos y mermas', 'det_emp_costos'], ['produccion', '⚙️ Me cuesta ordenar pedidos y producción', 'det_emp_produccion'], ['ventas', '📣 Necesito vender más', 'det_emp_ventas']] },
      cocina: { texto: '🎯 En tu restaurante o cafetería, ¿qué es lo que más te complica?', ops: [['precios', '💰 No sé cómo fijar los precios de mi menú', 'det_emp_precios'], ['costos', '📊 No controlo mi food cost, inventario y mermas', 'det_emp_costos'], ['produccion', '⚙️ Necesito ordenar mi cocina y mi servicio', 'det_emp_produccion'], ['ventas', '📣 Necesito más comensales', 'det_emp_ventas']] },
      catering: { texto: '🎯 En tu catering, ¿qué es lo que más te complica?', ops: [['precios', '💰 No sé cómo cotizar mis eventos', 'det_emp_precios'], ['costos', '📊 No controlo el costo de cada evento', 'det_emp_costos'], ['produccion', '⚙️ Necesito ordenar producción y logística', 'det_emp_produccion'], ['ventas', '📣 Necesito conseguir más eventos', 'det_emp_ventas']] },
      casa: { texto: '🎯 Vendiendo desde casa, ¿qué es lo que más te complica?', ops: [['precios', '💰 No sé cuánto cobrar por mis productos', 'det_emp_precios'], ['costos', '📊 No sé cuánto me cuesta hacer lo que vendo', 'det_emp_costos'], ['produccion', '⚙️ Necesito organizar mis pedidos y mi tiempo', 'det_emp_produccion'], ['ventas', '📣 Necesito más clientes', 'det_emp_ventas']] },
      _: { texto: '🎯 ¿Qué es lo que más te complica en tu negocio?', ops: [['precios', '💰 No sé cuánto cobrar', 'det_emp_precios'], ['costos', '📊 No controlo mis costos, inventario y merma', 'det_emp_costos'], ['produccion', '⚙️ Necesito ordenar mi producción y calidad', 'det_emp_produccion'], ['ventas', '📣 Necesito vender más', 'det_emp_ventas']] }
    }),

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
    det_actualizar: detalleGrupos('det_actualizar', '¿Qué quieres actualizar?', {
      dulce: [['tecnicas', 'Técnicas avanzadas de repostería y panadería'], ['normativas', 'Normativas e inocuidad'], ['tendencias', 'Productos y tendencias nuevas'], ['liderazgo', 'Liderazgo de equipos']],
      cocina: [['tecnicas', 'Técnicas y cocinas del mundo'], ['normativas', 'Normativas e inocuidad'], ['tendencias', 'Tendencias y menús nuevos'], ['liderazgo', 'Liderazgo de brigada']],
      produccion: [['tecnicas', 'Procesos y tecnología de producción'], ['normativas', 'Normativas (NOM, COFEPRIS)'], ['tendencias', 'Desarrollo de productos nuevos'], ['liderazgo', 'Liderazgo de líneas y turnos']],
      calidad: [['sistemas', 'Sistemas de calidad (HACCP, ISO 22000)'], ['normativas', 'Normativas (NOM, COFEPRIS)'], ['auditorias', 'Auditorías y certificaciones'], ['liderazgo', 'Liderazgo de equipos de calidad']],
      _: [['tecnicas', 'Nuevas técnicas culinarias y de producción'], ['normativas', 'Normativas e inocuidad'], ['tendencias', 'Tendencias y productos nuevos'], ['liderazgo', 'Liderazgo de equipos']]
    }),
    det_prof_costos: detalleGrupos('det_prof_costos', '¿Qué te cuesta más trabajo controlar?', {
      dulce: [['costeo', 'Costear recetas y rendimientos'], ['inventario', 'Inventarios y compras de insumos'], ['merma', 'Mermas de producción']],
      cocina: [['costeo', 'Food cost del menú'], ['inventario', 'Inventarios y almacén'], ['merma', 'Mermas y caducidades']],
      produccion: [['costeo', 'Costeo por lote'], ['inventario', 'Inventario de materia prima'], ['merma', 'Mermas de línea y rendimientos']],
      calidad: [['reprocesos', 'Costos de la mala calidad (reprocesos)'], ['trazabilidad', 'Control de insumos y trazabilidad'], ['merma', 'Mermas y rechazos']],
      _: [['costeo', 'Costear recetas'], ['inventario', 'Inventarios y compras'], ['merma', 'Mermas y desperdicio']]
    }),
    det_prof_procesos: detalleGrupos('det_prof_procesos', '¿Qué necesitas ordenar primero?', {
      dulce: [['estandarizar', 'Estandarizar recetas y procesos'], ['planear', 'Planear la producción'], ['calidad', 'Calidad e inocuidad']],
      cocina: [['estandarizar', 'Estandarizar menú y porciones'], ['planear', 'Organizar la operación de cocina'], ['calidad', 'Calidad e inocuidad']],
      produccion: [['estandarizar', 'Estandarizar procesos y rendimientos'], ['planear', 'Planear producción y líneas'], ['calidad', 'Calidad e inocuidad en planta']],
      calidad: [['bpm', 'Implementar BPM y HACCP'], ['auditar', 'Auditar y documentar'], ['capacitar', 'Capacitar al personal en inocuidad']],
      _: [['estandarizar', 'Estandarizar recetas y procesos'], ['planear', 'Planear la producción'], ['calidad', 'Calidad e inocuidad']]
    }),
    det_emp_precios: detalleGrupos('det_emp_precios', '¿Qué te hace falta para poner tu precio?', {
      dulce: [['costo_real', 'Saber cuánto me cuesta cada pastel o postre'], ['precio_venta', 'Fijar precio por porción, pieza o pedido'], ['ganancia', 'Saber cuánto gano después de decoración y mano de obra']],
      cocina: [['costo_real', 'Saber cuánto me cuesta cada platillo (food cost)'], ['precio_venta', 'Fijar precios de menú y combos'], ['ganancia', 'Saber cuánto gano por platillo']],
      catering: [['costo_real', 'Saber cuánto me cuesta cada evento y cada persona'], ['precio_venta', 'Cotizar un evento completo'], ['ganancia', 'Saber cuánto gano por evento']],
      casa: [['costo_real', 'Saber cuánto me cuesta cada producto'], ['precio_venta', 'Fijar un precio sin perder clientes'], ['ganancia', 'Separar lo que gano yo de los gastos del negocio']],
      _: [['costo_real', 'Saber cuánto me cuesta cada producto'], ['precio_venta', 'Fijar mi precio de venta'], ['ganancia', 'Saber cuánto gano realmente']]
    }),
    det_emp_costos: detalleGrupos('det_emp_costos', '¿Qué parte de tus costos te preocupa más?', {
      dulce: [['costeo', 'Costear recetas y rendimientos'], ['inventario', 'Controlar insumos (harina, mantequilla, chocolate)'], ['merma', 'Reducir mermas y sobrantes']],
      cocina: [['costeo', 'Costear platillos (food cost)'], ['inventario', 'Controlar inventario y almacén'], ['merma', 'Reducir mermas y caducidades']],
      catering: [['costeo', 'Costear por evento y por persona'], ['inventario', 'Calcular las compras de cada evento'], ['merma', 'Reducir sobrantes y desperdicio']],
      casa: [['costeo', 'Saber cuánto me cuesta cada producto'], ['inventario', 'Comprar mejor (mayoreo y proveedores)'], ['merma', 'Reducir lo que se me echa a perder']],
      _: [['costeo', 'Costear mis recetas'], ['inventario', 'Inventarios y compras'], ['merma', 'Mermas y desperdicio']]
    }),
    det_emp_produccion: detalleGrupos('det_emp_produccion', '¿Qué necesitas ordenar primero?', {
      dulce: [['estandarizar', 'Estandarizar recetas y rendimientos'], ['planear', 'Planear la producción por pedidos y fechas'], ['calidad', 'Calidad e inocuidad en mi cocina']],
      cocina: [['estandarizar', 'Estandarizar recetas y porciones del menú'], ['planear', 'Organizar la cocina (mise en place y turnos)'], ['calidad', 'Calidad e inocuidad']],
      catering: [['estandarizar', 'Estandarizar recetas para grandes cantidades'], ['planear', 'Planear producción y tiempos por evento'], ['calidad', 'Calidad e inocuidad al transportar']],
      casa: [['estandarizar', 'Estandarizar mis recetas'], ['planear', 'Ordenar mis pedidos de la semana'], ['calidad', 'Inocuidad y permisos para vender']],
      _: [['estandarizar', 'Estandarizar recetas y procesos'], ['planear', 'Planear la producción'], ['calidad', 'Calidad e inocuidad']]
    }),
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
    // Paso 5: depende del TEMA elegido en el paso 4 (no es lo mismo aprender
    // costeo que decoración o inocuidad). Los valores guardados no cambian.
    formato: {
      id: 'formato', multi: false,
      texto: '¿Cómo te gustaría aprenderlo?',
      opciones: sig([
        { valor: 'grabados', texto: 'Cursos grabados' },
        { valor: 'vivo', texto: 'Clases en vivo' },
        { valor: 'herramientas', texto: 'Plantillas, calculadoras, recetarios o formatos' },
        { valor: 'asesoria', texto: 'Asesoría personalizada' }
      ], 'freno'),
      variante: function () {
        var dId = idDetalle();
        var tema = (dId && opTexto(dId, estado.respuestas[dId])) || 'este tema';
        var t = {
          gestion: ['Curso grabado paso a paso', 'Clase en vivo resolviendo mi caso', 'Calculadoras y plantillas listas para usar', 'Asesoría para mi negocio o área'],
          tecnica: ['Videos paso a paso para repetir', 'Clase en vivo con chef', 'Recetario y guías descargables', 'Retroalimentación de mis preparaciones'],
          calidad: ['Curso grabado con ejemplos reales', 'Clase en vivo con especialista', 'Formatos y checklists listos (bitácoras, auditorías)', 'Asesoría para implementarlo']
        }[categoriaTema()];
        return {
          texto: '¿Cómo te gustaría aprender «' + tema + '»?',
          opciones: sig([
            { valor: 'grabados', texto: t[0] }, { valor: 'vivo', texto: t[1] },
            { valor: 'herramientas', texto: t[2] }, { valor: 'asesoria', texto: t[3] }
          ], 'freno')
        };
      }
    },
    // Paso 6: depende del FORMATO elegido en el paso 5.
    freno: {
      id: 'freno', multi: false,
      texto: '¿Qué te detiene hoy?',
      opciones: sig([
        { valor: 'precio', texto: 'El precio' },
        { valor: 'tiempo', texto: 'El tiempo' },
        { valor: 'tema', texto: 'No encuentro el tema que busco' },
        { valor: 'dudas', texto: 'No estoy seguro de que sea para mí' },
        { valor: 'listo', texto: 'Nada, estoy listo para empezar' }
      ], 'fin'),
      variante: function () {
        var f = estado.respuestas.formato;
        var nombres = { grabados: 'cursos grabados', vivo: 'clases en vivo', herramientas: 'plantillas y herramientas', asesoria: 'una asesoría' };
        var tiempo = { grabados: 'No me alcanza el tiempo para verlos', vivo: 'No puedo conectarme en horarios fijos', herramientas: 'No tengo tiempo de aprender a usarlas', asesoria: 'No tengo tiempo para sesiones' }[f];
        var dudas = { grabados: 'No sé si aprendería sin un chef que me guíe', vivo: 'No sé si me sirva si no puedo repetir la clase', herramientas: 'No sé si se adaptan a mi caso', asesoria: 'No sé si valdría lo que cuesta' }[f];
        return {
          texto: '¿Qué te detiene hoy para empezar con ' + (nombres[f] || 'esto') + '?',
          opciones: sig([
            { valor: 'precio', texto: f === 'asesoria' ? 'Me preocupa cuánto cuesta' : 'El precio' },
            { valor: 'tiempo', texto: tiempo || 'El tiempo' },
            { valor: 'tema', texto: 'No encuentro el tema que busco' },
            { valor: 'dudas', texto: dudas || 'No estoy seguro de que sea para mí' },
            { valor: 'listo', texto: 'Nada, estoy listo para empezar' }
          ], 'fin')
        };
      }
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
  // La chef cambia de pose según lo que la persona va eligiendo (nunca dos
  // iguales seguidas). Para sumar poses nuevas basta con agregarlas aquí.
  var POSES = {
    saluda: { src: 'assets/chef-guia-saluda.webp', w: 640, h: 853 },
    planea: { src: 'assets/chef-guia-planea.webp', w: 640, h: 960 },
    piensa: { src: 'assets/chef-guia.webp', w: 1086, h: 1448 },
    senala: { src: 'assets/chef-guia-senala.webp', w: 640, h: 960 },
    bascula: { src: 'assets/chef-guia-bascula.webp', w: 640, h: 853 },
    batidor: { src: 'assets/chef-guia-batidor.webp', w: 640, h: 853 },
    tablet: { src: 'assets/chef-guia-tablet.webp', w: 640, h: 853 },
    duda: { src: 'assets/chef-guia-duda.webp', w: 640, h: 853 },
    tarta: { src: 'assets/chef-guia-tarta.webp', w: 640, h: 853 },
    diploma: { src: 'assets/chef-guia-diploma.webp', w: 640, h: 853 },
    celebra: { src: 'assets/chef-guia-celebra.webp', w: 640, h: 960 }
  };
  var RETOS_GESTION = ['costos', 'precios', 'produccion', 'procesos', 'ventas'];
  // Inicio: saluda · 1 planea · 2 piensa · 3 señala · 4 báscula si habla de
  // costos/precios/procesos (batidor si es de técnica) · 5 tablet (cursos en
  // línea) · 6 duda ("¿qué te detiene?") · resultado: diploma / celebra / tarta.
  function poseDePaso(n) {
    var r = estado.respuestas, reto = r[RETO_ID[estado.tipo]];
    if (n === 0) return 'planea';
    if (n === 1) return 'piensa';
    if (n === 2) return 'senala';
    if (n === 3) return RETOS_GESTION.indexOf(reto) !== -1 ? 'bascula' : 'batidor';
    if (n === 4) return 'tablet';
    return 'duda';
  }
  function poseFinal() {
    var r = estado.respuestas;
    if (r[RETO_ID[estado.tipo]] === 'empleo' || categoriaTema() === 'calidad') return 'diploma';
    return r.freno === 'listo' ? 'celebra' : 'tarta';
  }
  function imgChef(nombre, clases, alt) {
    var p = POSES[nombre];
    return '<img' + (clases ? ' class="' + clases + '"' : '') + ' src="' + p.src + '" width="' + p.w + '" height="' + p.h + '" alt="' + alt + '">';
  }
  function precargarPoses() {
    Object.keys(POSES).forEach(function (k) { var i = new Image(); i.src = POSES[k].src; });
  }

  /* ---------- 3. Estado ---------- */
  var estado = { paso: 0, tipo: null, respuestas: {}, historial: [] };

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
    var ctxValor = r['contexto_' + t];
    var ctx = (ctxValor === 'otra' || ctxValor === 'otro') ? '' : opTexto('contexto_' + t, ctxValor);
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
      imgChef('saluda', 'encuesta__guia-img', 'Tu guía DulceLab') +
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
    estado = { paso: 0, tipo: null, respuestas: {}, historial: [] };
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
          imgChef(poseDePaso(estado.paso), estado.paso % 2 ? 'is-der' : 'is-izq', 'Chef Dulce, tu guía de aprendizaje') +
          '<div class="encuesta__mentor-talk"><span>Chef Dulce te guía</span><p>' + mensajeGuia + '</p></div>' +
        '</aside>' +
        '<div class="encuesta__question-panel">' +
          '<div class="encuesta__step"><span>Paso ' + (estado.paso + 1) + ' de ' + TOTAL_PASOS + '</span>' + (estado.historial.length ? '<button type="button" class="encuesta__atras" id="encuestaAtras">← Anterior</button>' : '<span>' + (esMulti ? (p.max ? 'Elige hasta ' + p.max : 'Puedes elegir varias') : 'Una respuesta') + '</span>') + '</div>' +
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

    var btnAtras = document.getElementById('encuestaAtras');
    if (btnAtras) btnAtras.addEventListener('click', volverAtras);

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

  // Regresa a la pregunta anterior (borra su respuesta para volver a elegir;
  // si cambia de camino, las preguntas siguientes se vuelven a calcular).
  function volverAtras() {
    var anterior = estado.historial.pop();
    if (!anterior) return;
    delete estado.respuestas[anterior.id];
    if (anterior.id === 'tipo') estado.tipo = null;
    estado.paso = Math.max(0, estado.paso - 1);
    transicion(function () { renderPregunta(anterior); });
  }

  function avanzar(pregunta, valor) {
    estado.historial.push(pregunta);
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
      var siguientePregunta = resolverPregunta(PREGUNTAS[siguienteId]);
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
      imgChef(poseFinal(), 'encuesta__guia-img encuesta__guia-img--chico', 'Tu guía DulceLab') +
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
    sistemas: ['haccp', 'iso', 'calidad', 'inocuidad'], auditorias: ['auditor', 'certific'],
    reprocesos: ['calidad', 'merma', 'costo'], trazabilidad: ['trazab', 'insumo', 'inventario'],
    bpm: ['bpm', 'buenas practicas', 'inocuidad', 'higiene'], auditar: ['auditor', 'inocuidad'],
    capacitar: ['inocuidad', 'higiene', 'capacit'],
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
      (PALABRAS[baseDe(r[id])] || []).forEach(function (w) { pesos[w] = Math.max(pesos[w] || 0, peso); });
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
      items.push({ icono: '🔜', categoria: 'Próximamente en la membresía', titulo: tema, detalle: 'Aún no tenemos un curso de este tema en la membresía. Tu interés ya quedó registrado para lo próximo que grabemos.' });
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
  // El aviso de cookies (fijo abajo, z-index altísimo) tapaba la parte baja de
  // la encuesta en celular: se mide su altura y la tarjeta se acomoda encima.
  function ajustarCookies() {
    var b = document.getElementById('dlf-cookie-banner');
    var h = (b && getComputedStyle(b).display !== 'none') ? b.offsetHeight : 0;
    modal.style.setProperty('--cookie-h', h + 'px');
  }
  (function vigilarCookies() {
    var b = document.getElementById('dlf-cookie-banner');
    if (b && window.MutationObserver) new MutationObserver(ajustarCookies).observe(b, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', ajustarCookies);
  })();

  function abrir() {
    precargarPoses();
    ajustarCookies();
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
