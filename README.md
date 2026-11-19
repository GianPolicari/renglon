# Renglón

Conversor gratis de resúmenes bancarios y de tarjeta argentinos (PDF) a Excel o CSV: [renglon.com.ar](https://renglon.com.ar).
El PDF se lee en tu navegador y nunca se sube a ningún servidor.

El código está publicado para que puedas revisar qué hace con tu archivo. No es de código abierto: ver [Licencia](#licencia).

## Qué sale de tu navegador

- **El PDF, nunca.** Se abre con [PDF.js](https://mozilla.github.io/pdf.js/) dentro de la página (`public/app.js`) y se interpreta en `public/resumen.js`.
- **Contadores anónimos de uso** (`public/telemetry.js` → `/api/event`): qué pantalla se abrió, qué banco se detectó, cuántas páginas y filas, si el saldo cerró y, si no pudo leer nada, en qué paso falló (sin texto, sin títulos de columnas, sin fechas). Nunca nombres, CUIT, números de cuenta, descripciones ni importes. El servidor (`src/worker.js`) solo acepta esos campos, de listas cerradas.
- **El diseño de un resumen que no se pudo leer**, solo si apretás "Mandar el diseño" (`/api/layout`), y antes podés ver exactamente qué se manda: los títulos de las columnas y, de cada fila, solo el tipo de dato y su posición (fecha, importe, texto), nunca los valores.

## Cómo comprobarlo sin leer el código

1. Abrí [renglon.com.ar](https://renglon.com.ar) y esperá unos segundos a que cargue.
2. Cortá internet (modo avión o desenchufá el cable).
3. Convertí un resumen: funciona igual, porque todo pasa en tu navegador.

Además, la página le prohíbe al navegador conectarse a otros sitios (`Content-Security-Policy: connect-src 'self'` en `public/_headers` y `src/worker.js`).

## Estructura

- `public/resumen.js`: el lector del resumen (encabezados de columnas, fechas, importes argentinos, control de saldos).
- `public/app.js`: la página del conversor. `public/xlsx-lite.js`: el escritor de .xlsx.
- `src/worker.js`: Cloudflare Worker para `/api/*` (contadores anónimos en D1 y el panel de uso) y las direcciones:
  `renglon.com.ar` (el sitio, cuenta el uso), `admin.renglon.com.ar` (panel) y `test.renglon.com.ar` (copia que no guarda nada).
- `tools/build_pages.py`: arma las páginas HTML. `tools/make_samples.py`: resúmenes de ejemplo inventados.
- Pruebas: `cd test && npm install && node run.js && node layouts.js`. `test/make_layouts.py` arma resúmenes inventados con el diseño de otros bancos (Nación, Comafi, Santander, Macro, Patagonia, Hipotecario).

## Licencia

Copyright © 2026 Gianfranco Policari. Todos los derechos reservados.

Podés leer este código para entender o auditar cómo funciona Renglón. No está permitido copiarlo, modificarlo, redistribuirlo ni usarlo en otros productos o servicios sin permiso por escrito. Ver [LICENSE](LICENSE).

PDF.js (`public/vendor/pdfjs`, Apache 2.0) y las tipografías (`public/assets/fonts`, SIL Open Font License) tienen sus propias licencias, incluidas junto a cada uno.
