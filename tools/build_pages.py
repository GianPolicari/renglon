"""Builds every HTML page of the site from one template, so the head, header and footer stay identical.
Run: python3 tools/build_pages.py"""
import html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public'
UPDATED = '17 de noviembre de 2026'
CONTACT = 'gianfrancopolicari@gmail.com'
SITE = 'https://renglon.com.ar'
NAME = 'Renglón'

HEADER = f'''<header class="mast"><div class="in">
  <a class="logo" href="/"><b>{NAME}</b><small>Resúmenes bancarios y de tarjeta, sin subir tu archivo</small></a>
  <nav class="nav" aria-label="Secciones"><a href="/">Convertir</a><a href="/preguntas/">Preguntas frecuentes</a></nav>
</div></header>'''
FOOTER = f'''<footer class="foot"><div class="in">
  <nav aria-label="Más"><a href="/preguntas/">Preguntas frecuentes</a><a href="/privacidad/">Privacidad</a><a href="/terminos/">Términos</a><a href="mailto:{CONTACT}">Contacto</a></nav>
  <p>{NAME} convierte datos; no es asesoramiento contable ni impositivo. Revisá el resultado contra tu resumen.</p>
</div></footer>'''

BASE_SCRIPTS = ['/assets/chrome.js', '/telemetry.js']

def page(path, title, desc, body, page_id, kind='other', scripts=(), prose=True, index=True):
    url = f'{SITE}/{path}/' if path else f'{SITE}/'
    tags = '\n'.join(f'<script src="{src}"></script>' for src in BASE_SCRIPTS + list(scripts))
    robots = '' if index else '<meta name="robots" content="noindex">\n'
    canon = f'<link rel="canonical" href="{url}">\n<meta property="og:url" content="{url}">\n' if index else ''
    out = f'''<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
{robots}{canon}<meta property="og:type" content="website">
<meta property="og:site_name" content="{NAME}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:locale" content="es_AR">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/plex-sans-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/source-serif-4-latin-wght.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body data-software="{kind}" data-page="{page_id}"{' class="prose"' if prose else ''}>
{HEADER}
<div class="wrap">
  <main>
{body}
  </main>
</div>
{FOOTER}
{tags}
</body>
</html>
'''
    if path == '404':
        (ROOT / '404.html').write_text(out); return
    d = ROOT / path if path else ROOT
    d.mkdir(parents=True, exist_ok=True)
    (d / 'index.html').write_text(out)

def home():
    body = f'''  <div class="hero">
    <div>
      <h1>Tu resumen del banco o de la tarjeta, en Excel</h1>
      <p class="lede">Un movimiento por fila, con los saldos controlados. El PDF se lee en tu navegador y nunca se sube a ningún servidor.</p>
      <dl class="facts">
        <div><dt>Privado</dt><dd>El archivo no sale de tu computadora ni de tu celular.</dd></div>
        <div><dt>Controlado</dt><dd>Saldo anterior más movimientos tiene que dar el saldo final. Si no da, te marcamos dónde.</dd></div>
        <div><dt>Listo para usar</dt><dd>Fechas como fechas e importes como números. Cuotas, pesos y dólares por separado.</dd></div>
      </dl>
    </div>
    <div class="panel">
      <h2>Convertir un resumen</h2>
      <p>Cuentas en pesos o en dólares y tarjetas de crédito. Gratis y sin registrarte.</p>
      <label class="drop" id="drop" tabindex="0">
        <input type="file" id="file" accept="application/pdf">
        <strong>Arrastrá el PDF acá</strong>
        <small>El original del home banking, no una foto ni un escaneo. Hasta 25 MB.</small>
        <span class="btn primary">Elegir archivo</span>
      </label>
      <p class="samples">¿No tenés uno a mano? Probá un ejemplo inventado: <button class="linkbtn" id="demo1">cuenta con débitos y créditos</button>, <button class="linkbtn" id="demo2">cuenta con importe y saldo</button> o <button class="linkbtn" id="demo3">tarjeta de crédito</button>.</p>
    </div>
  </div>
  <div id="status" role="status" aria-live="polite"></div>
  <p class="notice" id="sampleNote" hidden></p>

  <section class="step" id="results" hidden>
    <h2>Conciliación</h2>
    <div class="sum" id="sum"></div>
    <div class="feedback" id="tfb" hidden><span class="fbq">¿Los saldos coinciden con tu resumen?</span><button data-tfb="totals_match">Sí</button><button data-tfb="totals_differ">No</button></div>
  </section>

  <section class="step" id="warnCard" hidden>
    <h2>Revisá antes de usarlo</h2>
    <ul class="warn" id="warns"></ul>
  </section>

  <section class="step" id="layoutCard" hidden>
    <h2>Ayudanos a leer este resumen</h2>
    <p><span id="layoutWhy">Este formato no se pudo leer completo. Podés mandarnos </span><b>solo su diseño</b>: las palabras de los títulos de las columnas (como "Fecha" o "Saldo"), cada otra palabra cambiada por T y cada número por 9, y dónde está cada valor en la página. Nada de nombres, CBU, números de cuenta ni importes.</p>
    <div class="row"><button class="primary" id="layoutSend">Mandar el diseño</button><button class="linkbtn" id="layoutShow">Ver exactamente qué se manda</button></div>
    <p class="notice" id="layoutMsg" role="status"></p>
    <pre class="layoutpre" id="layoutPreview" hidden></pre>
  </section>

  <section class="step" id="dlCard" hidden>
    <h2>Bajalo</h2>
    <div class="row"><button class="primary" id="dlX">Bajar en Excel (.xlsx)</button><button id="dlC">.csv en su lugar</button></div>
    <p class="notice">El Excel trae las fechas como fechas y los importes como números, listos para sumar o filtrar. El .csv usa punto y coma y coma decimal, como lo espera Excel en español.</p>
    <p class="notice"><span class="badge warn">Beta</span> Por ahora está probado con resúmenes de ejemplo. Compará los saldos con tu resumen antes de usarlo.</p>
  </section>

  <details class="more step-gap" id="rowsCard" hidden>
    <summary><span>Movimientos leídos del PDF <span class="tag" id="rowCount"></span></span></summary>
    <div class="in">
      <div class="rowshead"><label class="tag"><input type="checkbox" id="onlyFlag"> Mostrar solo los que hay que revisar</label></div>
      <div class="tablewrap" tabindex="0" role="region" aria-label="Movimientos leídos del PDF"><table><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
    </div>
  </details>

  <section class="step how">
    <h2>Cómo funciona</h2>
    <ol>
      <li><b>Bajá el PDF del home banking</b>El resumen mensual de tu cuenta o de tu tarjeta, tal como lo da el banco.</li>
      <li><b>Soltalo en esta página</b>Se lee en tu navegador: no hay servidor que reciba el archivo.</li>
      <li><b>Revisá la conciliación y bajá el Excel</b>Si los saldos cierran, el Excel está completo. Si no, te marcamos qué fila revisar.</li>
    </ol>
  </section>'''
    page('', f'{NAME}: tu resumen bancario o de tarjeta en PDF a Excel, gratis',
         'Pasá el resumen PDF de tu banco o tarjeta de crédito a Excel, con un movimiento por fila y control de saldos. Gratis y sin subir el archivo: se lee en tu navegador.',
         body, '/', prose=False, scripts=['/resumen.js', '/xlsx-lite.js', '/app.js'])

FAQ = [
 ('¿Qué hace?', 'Lee el PDF del resumen de tu cuenta bancaria o de tu tarjeta de crédito, arma una fila por cada movimiento y controla que el saldo anterior más los movimientos dé el saldo final del resumen. Después lo bajás en Excel (.xlsx) o en .csv.'),
 ('¿Mi resumen se sube a algún lado?', 'No. El PDF se abre y se convierte dentro de tu navegador. Nunca llega a nuestro servidor y no vemos nombres, números de cuenta, CBU ni importes. Para comprobarlo: cargá la página, cortá internet (modo avión) y convertí un resumen: funciona igual. Además, la página le prohíbe al navegador conectarse a otros sitios (su política de seguridad solo permite renglon.com.ar). Con conexión, lo único que se envía son contadores anónimos de uso: qué banco, cuántas filas y si el saldo cerró.'),
 ('¿Qué bancos y tarjetas lee?', 'Lee los títulos de las columnas del resumen (Fecha, Concepto, Débitos, Créditos, Saldo, Pesos, Dólares) en lugar de usar una plantilla fija, así que muchos formatos deberían andar. Todavía está en prueba. Lo probamos con resúmenes reales de Visa de Banco Galicia y de ARQ, y con resúmenes inventados que copian el diseño de Nación, Comafi, Santander, Macro, Patagonia, Hipotecario y de tarjetas Visa, Mastercard, Cabal y American Express. Si el tuyo no sale bien, podés mandarnos su diseño sin tus datos desde la misma página.'),
 ('¿Qué pasa si los saldos no coinciden?', 'Te mostramos en qué movimiento se corta la cuenta. Suele pasar cuando una línea del PDF tiene un formato distinto. No uses ese Excel sin revisar: compará esas filas con el resumen.'),
 ('¿Sirve para la tarjeta de crédito?', 'Sí. Separa pesos y dólares, detecta las cuotas (por ejemplo 03/06), incluye pagos, impuestos y cargos, y controla que el saldo anterior más todo eso dé el saldo actual en cada moneda.'),
 ('¿Lee resúmenes escaneados o fotos?', 'No. Hace falta el PDF original que baja el home banking, que trae el texto adentro. Un escaneo o una foto no se pueden leer sin reconocimiento de imágenes.'),
 ('¿Cuesta algo?', 'No. Es gratis y no hace falta crear una cuenta.'),
 ('¿Es asesoramiento contable?', 'No. Es una herramienta para pasar datos de un formato a otro. Revisá siempre el resultado contra el resumen original.'),
]

def faq():
    items = '\n'.join(f'    <details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>' for q, a in FAQ)
    body = f'''  <h1>Preguntas frecuentes</h1>
  <section class="faq">
{items}
  </section>'''
    page('preguntas', f'Preguntas frecuentes | {NAME}', 'Cómo funciona el conversor de resúmenes bancarios y de tarjeta a Excel, qué lee y por qué tu archivo no se sube.', body, '/preguntas')

def privacy():
    body = f'''  <h1>Política de privacidad</h1>
  <p class="notice">Última actualización: {UPDATED}</p>
  <section>
  <h2>Tu resumen no sale de tu equipo</h2>
  <p>Los PDF se abren y se convierten en tu navegador. Nunca se suben a nuestros servidores. No recibimos nombres, documentos, CUIT, números de cuenta, CBU, descripciones de movimientos ni importes.</p>
  <h2>Datos anónimos de uso que sí guardamos</h2>
  <ul>
    <li>País, que deduce nuestro proveedor a partir de la conexión. La dirección IP se usa unos segundos para limitar abusos y no se guarda.</li>
    <li>Hora, página visitada, tipo de navegador y de dispositivo (computadora, tablet o celular).</li>
    <li>De dónde llegaste, como categoría (por ejemplo buscador, redes o directo) y la etiqueta de campaña del link, si la tiene.</li>
    <li>Por cada conversión: si salió bien o el tipo de error, el banco o tarjeta detectado, la cantidad de páginas y de movimientos, si los saldos cerraron, el tamaño del archivo y el tiempo que tardó.</li>
    <li>Si bajaste el resultado, en qué formato, y tu respuesta a "¿Los saldos coinciden con tu resumen?".</li>
    <li>Un identificador al azar para cada archivo que convertís, para unir los pasos de una misma conversión. No sale del archivo.</li>
    <li>Un identificador al azar de la pestaña del navegador, que se borra al cerrarla, y una marca de "ya visitó" sin identificador.</li>
    <li>Si la página tiene un error: solo el tipo de error, nunca su mensaje ni tus datos.</li>
    <li>Si elegís mandar el diseño de un resumen que no se pudo leer: las palabras de los títulos de las columnas, todas las demás palabras cambiadas por T y todos los números por 9, y la posición de cada valor en la página. Nunca nombres, descripciones ni importes. Antes de mandarlo ves exactamente qué se manda.</li>
  </ul>
  <h2>Cómo no participar</h2>
  <p>Si tu navegador envía Global Privacy Control o No rastrear (Do Not Track), la página no manda ningún dato de uso.</p>
  <h2>Dónde y por cuánto tiempo</h2>
  <p>Los datos de uso se guardan en Cloudflare (Workers y D1). Los que tienen más de 24 meses se borran solos. Los usamos solo para arreglar problemas, decidir qué bancos priorizar y medir el uso. No los vendemos ni los compartimos con anunciantes. No usamos cookies de seguimiento.</p>
  <h2>Contacto</h2>
  <p>Escribinos a <a href="mailto:{CONTACT}">{CONTACT}</a>. También podés pedir que borremos cualquier dato que creas vinculado a vos.</p>
  </section>'''
    page('privacidad', f'Privacidad | {NAME}', 'Cómo trata el conversor tus archivos y los datos anónimos de uso.', body, '/privacidad')

def terms():
    body = f'''  <h1>Términos de uso</h1>
  <p class="notice">Última actualización: {UPDATED}</p>
  <section>
  <h2>1. Qué es</h2>
  <p>{NAME} es una herramienta gratuita, en etapa de prueba, que convierte resúmenes bancarios y de tarjeta en PDF a planillas. Funciona en tu navegador.</p>
  <h2>2. No es asesoramiento</h2>
  <p>No damos asesoramiento contable, impositivo ni legal. Sos responsable de revisar el resultado contra el resumen original antes de usarlo.</p>
  <h2>3. Sin garantías</h2>
  <p>La herramienta se ofrece tal como está. Puede tener errores, sobre todo con formatos que todavía no probamos. No respondemos por daños derivados de su uso.</p>
  <h2>4. Uso permitido</h2>
  <p>Usala con resúmenes propios o que tengas derecho a procesar. No intentes dañar el servicio ni usarlo para automatizar envíos masivos.</p>
  <h2>5. Marcas</h2>
  <p>Los nombres de bancos y tarjetas se mencionan solo para describir compatibilidad. {NAME} no está vinculado con ningún banco, tarjeta ni con ARCA.</p>
  <h2>6. Cambios</h2>
  <p>Podemos cambiar estos términos o el servicio. Los cambios importantes se anuncian en el sitio antes de aplicarse.</p>
  <h2>7. Contacto</h2>
  <p>Escribinos a <a href="mailto:{CONTACT}">{CONTACT}</a>.</p>
  </section>'''
    page('terminos', f'Términos de uso | {NAME}', 'Términos de uso del conversor de resúmenes bancarios y de tarjeta.', body, '/terminos')

def not_found():
    page('404', f'Página no encontrada | {NAME}', 'Esta página no existe.', '''  <h1>Página no encontrada</h1>
  <p class="lede">Esta página no existe o cambió de lugar. Volvé al <a href="/">conversor</a>.</p>''', '/404', index=False)

def sitemap():
    urls = ['/', '/preguntas/', '/privacidad/', '/terminos/']
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{SITE}{u}</loc></url>\n' for u in urls) + '</urlset>\n'
    (ROOT / 'sitemap.xml').write_text(xml)
    (ROOT / 'robots.txt').write_text(f'User-agent: *\nDisallow: /api/\n\nSitemap: {SITE}/sitemap.xml\n')

home(); faq(); privacy(); terms(); not_found(); sitemap()
print('pages built')
