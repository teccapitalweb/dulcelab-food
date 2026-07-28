# DulceLab Food

Sitio web informativo oficial de **DULCELAB FOOD**, consultora mexicana de capacitación
gastronómica y emprendimiento (TEC CAPITAL Group).

> Aprende, crea y convierte tu talento en un negocio.

## Estado

**Fase 1** — estructura base, navbar glassmorphism con toggle día/noche, hero 3D con
partículas y footer. Las secciones Quiénes Somos, Cursos y Líneas de Capacitación
llegan en la Fase 2 (por ahora los links del navbar son anclas).

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

## Pendiente

`assets/logo.png` y `assets/og-image.png` son provisionales: reemplazar por los
oficiales de la marca conservando los mismos nombres de archivo.
