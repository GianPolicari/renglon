"""Builds every HTML page of the site from one template, so the head, header and footer stay identical.
Run: python3 tools/build_pages.py"""
import html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public'
UPDATED = '19 de noviembre de 2026'
CONTACT = 'gianfrancopolicari@gmail.com'
SITE = 'https://renglon.com.ar'
NAME = 'Renglón'

HEADER = f'''<header class="mast"><div class="in">
  <a class="logo" href="/"><b>{NAME}</b><small>Resúmenes bancarios y de tarjeta, sin subir tu archivo</small></a>
  <nav class="nav" aria-label="Secciones"><a href="/">Convertir</a><a href="/bancos/">Bancos</a><a href="/preguntas/">Preguntas</a></nav>
</div></header>'''
FOOTER = f'''<footer class="foot"><div class="in">
  <nav aria-label="Más"><a href="/bancos/">Bancos y tarjetas</a><a href="/preguntas/">Preguntas frecuentes</a><a href="/privacidad/">Privacidad</a><a href="/terminos/">Términos</a><a href="mailto:{CONTACT}">Contacto</a></nav>
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
<meta property="og:image" content="{SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Renglón: tu resumen bancario o de tarjeta, de PDF a Excel">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#102a43">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
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

# Bank pages: only what was actually tested. 'real' = real statements; 'shape' = invented statements with that bank's layout.
BANKS = [
 dict(slug='galicia', line='Tarjeta Visa y cuentas', name='Banco Galicia', short='Galicia', level='real',
      tested=['Tarjeta Visa: probado con resúmenes reales.', 'Caja de ahorro y cuenta corriente: probado con resúmenes inventados con el diseño de Galicia y de Galicia Plus.'],
      reads=['Crédito antes que Débito y la columna Origen, como los trae la cuenta.', 'Fechas como "05/SEP" sin año: el año sale de otras fechas del resumen.', 'En la tarjeta: cuotas (03/06), pesos y dólares por separado, impuestos y el pago del mes.']),
 dict(slug='santander', line='Cuentas en pesos y dólares, y tarjeta', name='Santander', short='Santander', level='shape',
      tested=['Cuenta y tarjeta: probado con resúmenes inventados con el diseño de Santander.'],
      reads=['La fecha centrada entre dos renglones de un mismo movimiento.', 'Importes escritos con su signo de moneda, como "$ 1.234,56" o "-U$S 59,64".', 'Pesos y dólares en el mismo resumen: cada parte se controla con sus propios saldos.', 'Columnas separadas para caja de ahorro y cuenta corriente, con un solo saldo.', 'En la tarjeta: fechas como "26 Octubre 05" seguidas solo del día.']),
 dict(slug='bbva', line='Varias cuentas en un mismo resumen', name='BBVA', short='BBVA', level='shape',
      tested=['Cuenta: probado con resúmenes inventados con el diseño de BBVA.', 'Tarjetas Visa y Mastercard procesadas por Prisma: probado con resúmenes inventados de ese diseño.'],
      reads=['Varias cuentas en el mismo resumen (pesos, dólares, euros), cada una con su control.', 'Débitos escritos con signo menos dentro de la columna Débito.', 'El cierre como "SALDO AL 30 DE SEPTIEMBRE".', 'Cuentas sin movimientos ("SIN MOVIMIENTOS"), que se saltean.']),
 dict(slug='macro', line='Caja de ahorro en pesos y en dólares', name='Banco Macro', short='Macro', level='shape',
      tested=['Cuenta: probado con resúmenes inventados con el diseño de Macro.'],
      reads=['Un "Detalle de movimiento" por cuenta (pesos y dólares), cada uno controlado aparte.', 'El saldo inicial como "SALDO ULTIMO EXTRACTO AL" y el final como "SALDO FINAL AL DIA".', 'La columna Referencia separada de la descripción.']),
 dict(slug='nacion', line='Cuenta corriente y caja de ahorro', name='Banco Nación', short='Nación', level='shape',
      tested=['Cuenta: probado con resúmenes inventados con el diseño de Banco Nación.'],
      reads=['Las filas "TRANSPORTE" del corte de página, que no son movimientos.', 'Saldos negativos con el signo menos al final ("1.234,56-").', 'La columna COMPROB. como referencia.']),
 dict(slug='comafi', line='Varias cuentas en un mismo resumen', name='Banco Comafi', short='Comafi', level='shape',
      tested=['Cuenta: probado con resúmenes inventados con el diseño de Comafi.'],
      reads=['Varias cuentas en el mismo resumen, con los títulos de las columnas repetidos en cada una.', 'Las filas "Transporte" y "SIN MOVIMIENTOS".', 'Descripciones que siguen en el renglón de abajo (por ejemplo el CUIT de una transferencia).', '"Saldo Anterior" y "Saldo al:" para el control.']),
 dict(slug='hipotecario', line='Tres diseños de cuenta', name='Banco Hipotecario', short='Hipotecario', level='shape',
      tested=['Cuenta: probado con resúmenes inventados con tres diseños distintos de Banco Hipotecario.'],
      reads=['Resúmenes que listan del movimiento más nuevo al más viejo: en el Excel quedan ordenados por fecha.', 'Saldo solo al cierre de cada día ("SALDO FINAL DEL DIA"): se usa como control.', 'Títulos de columna escritos en dos renglones, como "IMPORTE / MONEDA".', 'El destinatario de una transferencia en renglones aparte.']),
 dict(slug='patagonia', line='Cuenta corriente', name='Banco Patagonia', short='Patagonia', level='shape',
      tested=['Cuenta: probado con resúmenes inventados con el diseño de Banco Patagonia.'],
      reads=['Dos columnas de fecha (FECHA y FECHA VALOR): se usa la primera.', 'Saldos negativos con el signo menos al final.']),
 dict(slug='hsbc', line='Cuenta corriente', name='HSBC', short='HSBC', level='shape',
      tested=['Cuenta corriente: probado con resúmenes inventados con el diseño de HSBC.'],
      reads=['Importes con punto decimal ("1,234.56") en lugar de coma.', 'El signo menos al final del número.', 'Fechas como "05/SEP" sin año.']),
 dict(slug='mercado-pago', line='Resumen en dólares', name='Mercado Pago', short='Mercado Pago', level='shape',
      tested=['Resumen de dólares: probado con resúmenes inventados con su diseño.', 'Resumen de la cuenta en pesos: todavía no lo probamos.'],
      reads=['Fechas como "05-09-2026".', 'Cuántos pesos se usaron en cada compra o venta de dólares, en la columna "Monto local" del Excel.', 'La cotización del dólar de cada fila, que no se mezcla con los importes.']),
 dict(slug='arq', line='Billetera en dólares', name='ARQ', short='ARQ', level='real',
      tested=['Billetera en dólares: probado con resúmenes reales.'],
      reads=['Fechas en inglés como "Oct 09" y números con punto decimal.', 'Montos de 0 a 2 decimales con su signo ("+ 35.2", "- 100").', 'El equivalente en moneda local de cada movimiento, en "Moneda local" y "Monto local".', 'El saldo de cada fila, calculado desde el balance de inicio porque el resumen no lo trae.']),
 dict(slug='visa', line='De cualquier banco', name='Visa', short='Visa', level='real', card=True,
      tested=['Probado con resúmenes reales de Visa de Banco Galicia y con ejemplos inventados de otros proyectos y de Prisma.'],
      reads=['Consumos, cuotas (03/06), impuestos, cargos y el pago del mes, cada uno con su tipo.', 'Pesos y dólares en columnas separadas, cada moneda con su control.', 'El total de consumos de cada tarjeta adicional.']),
 dict(slug='mastercard', line='De cualquier banco', name='Mastercard', short='Mastercard', level='shape', card=True,
      tested=['Probado con resúmenes inventados con el diseño de Prisma y de Fiserv.'],
      reads=['Fechas como "05 Oct 26".', 'El número de cupón separado de la descripción.', 'Pesos y dólares por separado, con el control de cada moneda.']),
 dict(slug='american-express', line='Pesos y dólares', name='American Express', short='American Express', level='shape', card=True,
      tested=['Probado con resúmenes inventados con el diseño de American Express.'],
      reads=['Las columnas "Importe en $" e "Importe en U$S".', 'Cuotas escritas dentro de la descripción.']),
 dict(slug='cabal', line='De cualquier banco', name='Cabal', short='Cabal', level='shape', card=True,
      tested=['Probado con un resumen de ejemplo de otro proyecto de código abierto.'],
      reads=['Consumos, cuotas, impuestos y pagos en pesos y en dólares.']),
 dict(slug='provincia', line='Cuentas y tarjetas', name='Banco Provincia', short='Provincia', level='pending', tested=[], reads=[]),
 dict(slug='ciudad', line='Cuentas y tarjetas', name='Banco Ciudad', short='Ciudad', level='pending', tested=[], reads=[]),
 dict(slug='icbc', line='Cuentas y tarjetas', name='ICBC', short='ICBC', level='pending', tested=[], reads=[]),
 dict(slug='supervielle', line='Cuentas y tarjetas', name='Supervielle', short='Supervielle', level='pending', tested=[], reads=[]),
 dict(slug='credicoop', line='Cuentas y tarjetas', name='Banco Credicoop', short='Credicoop', level='pending', tested=[], reads=[]),
 dict(slug='bancor', line='Cuentas y tarjetas', name='Bancor', short='Bancor', level='pending', tested=[], reads=[]),
 dict(slug='santa-fe', line='Cuentas y tarjetas', name='Banco Santa Fe', short='Santa Fe', level='pending', tested=[], reads=[]),
 dict(slug='brubank', line='Cuenta digital y tarjeta', name='Brubank', short='Brubank', level='pending', tested=[], reads=[]),
 dict(slug='uala', line='Cuenta digital y tarjeta', name='Ualá', short='Ualá', level='pending', tested=[], reads=[]),
 dict(slug='naranja-x', line='Cuenta digital y tarjeta', name='Naranja X', short='Naranja X', level='pending', tested=[], reads=[]),
]

BADGE = {'real': ('ok', 'Resúmenes reales'), 'shape': ('warn', 'Ejemplos inventados'), 'pending': ('none', 'Sin probar todavía')}

def bank_card(b, compact=False):
    cls, txt = BADGE[b['level']]
    badge = '' if compact else f'<span class="badge {cls}">{txt}</span>'
    return f'<a class="bcard" href="/bancos/{b["slug"]}/"><b>{b["name"]}</b><span>{b["line"]}</span>{badge}</a>'

def bank_grid(items, compact=False):
    return f'<div class="bgrid{" compact" if compact else ""}">' + ''.join(bank_card(b, compact) for b in items) + '</div>'

CARDS_NOTE = 'El resumen de la tarjeta lo arma la procesadora (Prisma, Fiserv o la propia marca), no el banco: una Visa de un banco se parece mucho a la de otro. Si tu banco no está, entrá por tu tarjeta.'

def bank_pages():
    for b in BANKS:
        what = 'tarjeta' if b.get('card') else 'resumen'
        noun = f'tarjeta {b["name"]}' if b.get('card') else b['name']
        h1 = f'Resumen de {"la " if b.get("card") else ""}{noun} a Excel'
        lede = (f'Pasá el resumen PDF de tu {noun} a Excel, con un movimiento por fila y los saldos controlados. '
                'Gratis, y el archivo se lee en tu navegador: nunca se sube a ningún servidor.')
        status = {'real': '<span class="badge ok">Probado con resúmenes reales</span>', 'shape': '<span class="badge warn">Probado con ejemplos inventados</span>',
                  'pending': '<span class="badge none">Sin probar todavía</span>'}[b['level']]
        if b['level'] == 'pending':
            b = dict(b, tested=[f'Todavía no tuvimos un resumen de {b["name"]} para probar. {NAME} lee los títulos de las columnas (Fecha, Concepto, Débitos, Créditos, Saldo) en lugar de usar una plantilla fija, así que puede funcionar igual: probalo.'],
                     reads=['Si es el resumen de una tarjeta Visa o Mastercard de este banco, suele tener el mismo diseño que las de otros bancos: mirá las páginas de esas tarjetas.',
                            'Si trae varias cuentas (pesos, dólares, cuenta corriente), cada una se controla por separado.',
                            'Si no se puede leer, mandanos solo su diseño desde esta página y lo sumamos.'])
        same = [o for o in BANKS if o['slug'] != b['slug'] and bool(o.get('card')) == bool(b.get('card'))]
        extra = f'''
  <section class="step bank">
    <h2>El resumen de {b["short"]}</h2>
    <p>{status}</p>
    {f'<p>{html.escape(b["tested"][0])}</p>' if b['level'] == 'pending' else '<ul>' + ''.join(f'<li>{html.escape(t)}</li>' for t in b['tested']) + '</ul>'}
    <h3>{'Qué tener en cuenta' if b['level'] == 'pending' else 'Qué tiene en cuenta'}</h3>
    <ul>{''.join(f'<li>{html.escape(t)}</li>' for t in b['reads'])}</ul>
    <p>{'' if b['level'] == 'pending' else 'Los resúmenes cambian de diseño con el tiempo. Si el tuyo no sale bien, podés mandarnos solo su diseño, sin tus datos, desde esta misma página. '}{NAME} no está vinculado con {b["name"]}.</p>
  </section>
  <section class="step">
    <h2>{'Otras tarjetas' if b.get('card') else 'Otros bancos y billeteras'}</h2>
    {bank_grid(same, compact=True)}
    <p class="more-link"><a href="/bancos/">{'Ver los bancos' if b.get('card') else 'Ver también las tarjetas de crédito'}</a></p>
  </section>'''
        page(f'bancos/{b["slug"]}', f'Resumen de {noun} a Excel, gratis | {NAME}',
             f'Pasá el resumen PDF de tu {noun} a Excel con un movimiento por fila y control de saldos. Gratis y sin subir el archivo.',
             converter(h1, lede, extra), f'/bancos/{b["slug"]}', prose=False, scripts=['/resumen.js', '/xlsx-lite.js', '/app.js'])
    banks = [b for b in BANKS if not b.get('card') and b['level'] != 'pending']; cards = [b for b in BANKS if b.get('card')]; pending = [b for b in BANKS if b['level'] == 'pending']
    body = f'''  <h1>Bancos y tarjetas</h1>
  <p class="lede">{NAME} lee los títulos de las columnas del resumen en lugar de usar una plantilla fija, así que también puede andar con bancos que no están acá. Esto es lo que probamos.</p>
  <section class="step">
    <h2>Bancos y billeteras</h2>
    {bank_grid(banks)}
  </section>
  <section class="step">
    <h2>Tarjetas de crédito</h2>
    <p>{CARDS_NOTE}</p>
    {bank_grid(cards)}
  </section>
  <section class="step">
    <h2>Todavía sin probar</h2>
    <p>No tuvimos todavía un resumen de estos para probar. Pueden funcionar igual: probalo, y si no sale, mandanos solo su diseño, sin tus datos, desde la misma página.</p>
    {bank_grid(pending)}
  </section>
  <p class="notice">"Resúmenes reales": probado con resúmenes de verdad. "Ejemplos inventados": probado con resúmenes armados con el diseño de ese banco y datos inventados. ¿El tuyo no sale bien? <a href="/">Probalo igual</a>: si no se puede leer, podés mandarnos solo su diseño, sin tus datos.</p>'''
    page('bancos', f'Bancos y tarjetas que lee | {NAME}', 'Qué bancos y tarjetas de Argentina probamos para pasar el resumen PDF a Excel, y con qué resúmenes.', body, '/bancos')

def converter(h1, lede, extra=''):
    """The converter (home page and every bank page): heading, upload panel, results, then `extra` before "Cómo funciona"."""
    return f'''  <div class="hero">
    <div>
      <h1>{h1}</h1>
      <p class="lede">{lede}</p>
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
    <p class="notice"><span class="badge warn">Beta</span> Está probado con resúmenes reales de algunos bancos y con ejemplos inventados del diseño de otros. Compará los saldos con tu resumen antes de usarlo.</p>
  </section>

  <details class="more step-gap" id="rowsCard" hidden>
    <summary><span>Movimientos leídos del PDF <span class="tag" id="rowCount"></span></span></summary>
    <div class="in">
      <div class="rowshead"><label class="tag"><input type="checkbox" id="onlyFlag"> Mostrar solo los que hay que revisar</label></div>
      <div class="tablewrap" tabindex="0" role="region" aria-label="Movimientos leídos del PDF"><table><thead id="thead"></thead><tbody id="tbody"></tbody></table></div>
    </div>
  </details>
{extra}
  <section class="step how">
    <h2>Cómo funciona</h2>
    <ol>
      <li><b>Bajá el PDF del home banking</b>El resumen mensual de tu cuenta o de tu tarjeta, tal como lo da el banco.</li>
      <li><b>Soltalo en esta página</b>Se lee en tu navegador: no hay servidor que reciba el archivo.</li>
      <li><b>Revisá la conciliación y bajá el Excel</b>Si los saldos cierran, el Excel está completo. Si no, te marcamos qué fila revisar.</li>
    </ol>
  </section>'''

def home():
    extra = f'''
  <section class="step">
    <h2>Bancos y tarjetas probados</h2>
    {bank_grid([b for b in BANKS if not b.get('card') and b['level'] != 'pending'], compact=True)}
    <p>{CARDS_NOTE}</p>
    {bank_grid([b for b in BANKS if b.get('card')], compact=True)}
    <p class="more-link"><a href="/bancos/">Qué probamos con cada uno, y los que todavía no: Provincia, Ciudad, ICBC, Supervielle, Brubank, Ualá y más</a></p>
  </section>'''
    body = converter('Tu resumen del banco o de la tarjeta, en Excel',
                     'Un movimiento por fila, con los saldos controlados. El PDF se lee en tu navegador y nunca se sube a ningún servidor.', extra)
    page('', f'{NAME}: tu resumen bancario o de tarjeta en PDF a Excel, gratis',
         'Pasá el resumen PDF de tu banco o tarjeta de crédito a Excel, con un movimiento por fila y control de saldos. Gratis y sin subir el archivo: se lee en tu navegador.',
         body, '/', prose=False, scripts=['/resumen.js', '/xlsx-lite.js', '/app.js'])

FAQ = [
 ('¿Qué hace?', 'Lee el PDF del resumen de tu cuenta bancaria o de tu tarjeta de crédito, arma una fila por cada movimiento y controla que el saldo anterior más los movimientos dé el saldo final del resumen. Después lo bajás en Excel (.xlsx) o en .csv.'),
 ('¿Mi resumen se sube a algún lado?', 'No. El PDF se abre y se convierte dentro de tu navegador. Nunca llega a nuestro servidor y no vemos nombres, números de cuenta, CBU ni importes. Para comprobarlo: cargá la página, cortá internet (modo avión) y convertí un resumen: funciona igual. Además, la página le prohíbe al navegador conectarse a otros sitios (su política de seguridad solo permite renglon.com.ar). Con conexión, lo único que se envía son contadores anónimos de uso: qué banco, cuántas filas y si el saldo cerró.'),
 ('¿Qué bancos y tarjetas lee?', 'Lee los títulos de las columnas del resumen (Fecha, Concepto, Débitos, Créditos, Saldo, Pesos, Dólares) en lugar de usar una plantilla fija, así que muchos formatos deberían andar. Todavía está en prueba. Lo probamos con resúmenes reales de Visa de Banco Galicia y de ARQ, y con resúmenes inventados que copian el diseño de Nación, Comafi, Santander, Macro, Patagonia, Hipotecario, BBVA, HSBC, Mercado Pago en dólares y de tarjetas Visa, Mastercard, Cabal y American Express. Si el resumen trae varias cuentas (pesos, dólares, cuenta corriente), controla cada una por separado. Si el tuyo no sale bien, podés mandarnos su diseño sin tus datos desde la misma página.'),
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
    <li>Si la visita parece hecha por un programa automático (un robot) y por qué: el navegador avisa que lo controla un programa, se presenta como robot o se conecta desde una red de servidores. El nombre de esa red se mira en el momento y no se guarda.</li>
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
    page('privacidad', f'Privacidad | {NAME}', 'Cómo trata Renglón tus resúmenes (no se suben: se leen en tu navegador) y qué datos anónimos de uso guarda, dónde y por cuánto tiempo.', body, '/privacidad')

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
    page('terminos', f'Términos de uso | {NAME}', 'Términos de uso de Renglón, el conversor gratuito de resúmenes bancarios y de tarjeta de crédito en PDF a Excel.', body, '/terminos')

def not_found():
    page('404', f'Página no encontrada | {NAME}', 'Esta página no existe.', '''  <h1>Página no encontrada</h1>
  <p class="lede">Esta página no existe o cambió de lugar. Volvé al <a href="/">conversor</a>.</p>''', '/404', index=False)

def sitemap():
    urls = ['/', '/bancos/', *[f'/bancos/{b["slug"]}/' for b in BANKS], '/preguntas/', '/privacidad/', '/terminos/']
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{SITE}{u}</loc></url>\n' for u in urls) + '</urlset>\n'
    (ROOT / 'sitemap.xml').write_text(xml)
    (ROOT / 'robots.txt').write_text(f'User-agent: *\nDisallow: /api/\n\nSitemap: {SITE}/sitemap.xml\n')

home(); bank_pages(); faq(); privacy(); terms(); not_found(); sitemap()
print('pages built')
