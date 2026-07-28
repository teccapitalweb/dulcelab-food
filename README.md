# DulceLab Food

Sitio web informativo oficial de **DULCELAB FOOD**, consultora mexicana de capacitación
gastronómica y emprendimiento (TEC CAPITAL Group).

> Aprende, crea y convierte tu talento en un negocio.

## Estado

**Fase 2** — al hero y el navbar de la Fase 1 se suman Quiénes Somos, Líneas de
Capacitación, Cursos en Vivo (con lightbox de flyers) y la franja Por Qué DulceLab.
El navbar tiene scrollspy y todas las anclas apuntan a secciones reales.

## Stack

Sitio 100% estático: HTML + CSS + JavaScript vanilla. Sin frameworks ni build step.
Se publica en GitHub Pages desde la rama `main`.

## Estructura

```
index.html          Marcado + sprite de iconos SVG
css/styles.css      Paleta oficial, temas claro/oscuro, layout responsive
js/main.js          Tema, menú móvil, partículas canvas, tilt 3D
assets/             Logo, imagen Open Graph
```

## Identidad

| Token         | Hex       | Uso                                   |
|---------------|-----------|---------------------------------------|
| `--chocolate` | `#3B2420` | Títulos en claro, fondo en oscuro     |
| `--frambuesa` | `#C94B68` | CTAs, acentos, hovers                 |
| `--crema`     | `#FFF3E5` | Fondo principal en claro              |
| `--dorado`    | `#D5A13D` | Detalles premium, bordes, glow        |
| `--salvia`    | `#849D83` | Acentos secundarios sutiles           |

Tipografía: Montserrat 800/900 (títulos) y Poppins 300/400/600 (cuerpo).

## Desarrollo local

```bash
python -m http.server 8899
```

## Imágenes pendientes

El sitio ya referencia estas rutas. Mientras el archivo no exista se muestra un
fallback con gradiente de marca, icono e identificación del contenido; al subir el
archivo con el nombre exacto aparece solo, sin tocar código.

```
assets/hero-bg.png          Textura opcional del hero (si no existe, el hero queda igual)
assets/quienes-somos.png    Foto de la sección Quiénes Somos (vertical, ~4:5)
assets/og-image.png         Open Graph definitiva (1200x630) — hoy hay una provisional
assets/logo.png             Logo oficial — hoy hay uno provisional
assets/flyers/diseno-menus.png
assets/flyers/pan-artesanal.png
assets/flyers/catering-profesional.png
assets/flyers/cocina-mexicana.png
assets/flyers/control-costos.png
assets/flyers/decoracion-pasteles.png
```

Los flyers se muestran en formato cuadrado; el lightbox sólo se activa en las cards
cuyo flyer ya existe.

## Pendiente

- Enlaces reales de Facebook e Instagram en el footer.
- Activar "Enforce HTTPS" en Settings › Pages (el certificado del dominio ya emitió).
