"""Builds synthetic statements (made-up bank, made-up data) used as samples on the site and in the tests.
Run: python3 tools/make_samples.py   ->  public/samples/*.pdf and test/expected.json
The layouts imitate the general shape of Argentine statements; they are NOT copies of any real bank's design."""
import json, pathlib, random
from datetime import date, timedelta
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'samples'; OUT.mkdir(parents=True, exist_ok=True)
W, H = A4

def ar(v, trailing_minus=False):
    s = f'{abs(v):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
    if v < 0: return s + '-' if trailing_minus else '-' + s
    return s

CREDITOS = ['TRANSFERENCIA RECIBIDA', 'ACREDITACION DE HABERES', 'DEPOSITO EN EFECTIVO', 'DEBIN RECIBIDO']
DEBITOS = ['DEBITO AUTOMATICO EDENOR', 'COMPRA CON TARJETA DE DEBITO', 'PAGO DE SERVICIOS AYSA', 'EXTRACCION CAJERO AUTOMATICO',
           'TRANSFERENCIA ENVIADA', 'IMPUESTO LEY 25.413 DEBITO', 'COMISION MANTENIMIENTO CUENTA', 'PAGO TARJETA DE CREDITO']
LONG_CRED = 'TRANSFERENCIA RECIBIDA DE PEREZ JUAN CUIT 20-12345678-9'
LONG_DEB = 'COMPRA CON TARJETA DE DEBITO SUPERMERCADO EJEMPLO SUC 123'

def header_block(c, title, sub):
    c.setFont('Helvetica-Bold', 13); c.drawString(40, H - 50, 'Banco Ejemplo S.A.')
    c.setFont('Helvetica', 9); c.drawString(40, H - 64, 'Resumen sintético para pruebas. Datos inventados.')
    c.setFont('Helvetica-Bold', 11); c.drawString(40, H - 86, title)
    c.setFont('Helvetica', 9); c.drawString(40, H - 100, sub)

def cuenta_debcred(path, seed=1, n=70):
    """Fecha | Concepto | Referencia | Débitos | Créditos | Saldo. Some descriptions wrap to a second line."""
    rnd = random.Random(seed)
    c = canvas.Canvas(str(path), pagesize=A4)
    opening = 152340.55; bal = opening; d = date(2026, 10, 1)
    rows = []
    for i in range(n):
        d += timedelta(days=rnd.choice([0, 0, 1, 1, 2]))
        if d.month != 10: d = date(2026, 10, 31)
        credit = rnd.random() < 0.35
        amt = round(rnd.uniform(500, 250000 if credit else 90000), 2)
        desc = (LONG_CRED if credit else LONG_DEB) if rnd.random() < 0.15 else rnd.choice(CREDITOS if credit else DEBITOS)
        bal = round(bal + (amt if credit else -amt), 2)
        rows.append((d, desc, str(rnd.randint(100000, 999999)), None if credit else amt, amt if credit else None, bal))
    cols = [(40, 'Fecha', 'l'), (95, 'Concepto', 'l'), (330, 'Referencia', 'l'), (440, 'Débitos', 'r'), (505, 'Créditos', 'r'), (565, 'Saldo', 'r')]
    def head():
        header_block(c, 'Caja de Ahorro en Pesos  Nº 0000-XXXX', 'Período: 01/10/2026 al 31/10/2026')
        c.setFont('Helvetica-Bold', 9)
        for x, t, a in cols: (c.drawRightString if a == 'r' else c.drawString)(x, H - 130, t)
        return H - 148
    y = head(); c.setFont('Helvetica', 9)
    c.drawString(95, y, 'SALDO ANTERIOR'); c.drawRightString(565, y, ar(opening)); y -= 14
    for (d, desc, ref, deb, cre, b) in rows:
        if y < 70: c.showPage(); y = head(); c.setFont('Helvetica', 9)
        c.drawString(40, y, d.strftime('%d/%m/%y'))
        if len(desc) > 38:
            cut = desc.rfind(' ', 0, 38)
            c.drawString(95, y, desc[:cut]); c.drawString(95, y - 11, desc[cut + 1:])
        else: c.drawString(95, y, desc)
        c.drawString(330, y, ref)
        if deb is not None: c.drawRightString(440, y, ar(deb))
        if cre is not None: c.drawRightString(505, y, ar(cre))
        c.drawRightString(565, y, ar(b))
        y -= 25 if len(desc) > 38 else 14
    if y < 90: c.showPage(); y = head(); c.setFont('Helvetica', 9)
    y -= 6; c.setFont('Helvetica-Bold', 9)
    c.drawString(95, y, 'SALDO FINAL'); c.drawRightString(565, y, ar(bal))
    c.save()
    return {'kind': 'cuenta', 'rows': len(rows), 'opening': opening, 'closing': bal,
            'debits': round(sum(r[3] or 0 for r in rows), 2), 'credits': round(sum(r[4] or 0 for r in rows), 2)}

def cuenta_importe(path, seed=2, n=45):
    """Fecha | Descripción | Importe | Saldo, debits with a trailing minus, totals of debits and credits at the end."""
    rnd = random.Random(seed)
    c = canvas.Canvas(str(path), pagesize=A4)
    opening = 8400.10; bal = opening; d = date(2026, 9, 30)
    rows = []
    for i in range(n):
        d += timedelta(days=rnd.choice([0, 1, 1, 2]))
        if d > date(2026, 10, 31): d = date(2026, 10, 31)
        credit = rnd.random() < 0.4
        amt = round(rnd.uniform(100, 400000 if credit else 120000), 2)
        bal = round(bal + (amt if credit else -amt), 2)
        rows.append((d, rnd.choice(CREDITOS if credit else DEBITOS), amt if credit else -amt, bal))
    def head():
        header_block(c, 'Cuenta Corriente en Pesos', 'Movimientos del 01/10/2026 al 31/10/2026')
        c.setFont('Helvetica-Bold', 9)
        c.drawString(40, H - 130, 'Fecha'); c.drawString(110, H - 130, 'Descripción'); c.drawRightString(470, H - 130, 'Importe'); c.drawRightString(560, H - 130, 'Saldo')
        return H - 148
    y = head(); c.setFont('Helvetica', 9)
    c.drawString(110, y, 'Saldo inicial'); c.drawRightString(560, y, ar(opening)); y -= 14
    for (d, desc, amt, b) in rows:
        if y < 70: c.showPage(); y = head(); c.setFont('Helvetica', 9)
        c.drawString(40, y, d.strftime('%d/%m/%Y')); c.drawString(110, y, desc)
        c.drawRightString(470, y, ar(amt, trailing_minus=True)); c.drawRightString(560, y, ar(b)); y -= 14
    if y < 110: c.showPage(); y = head(); c.setFont('Helvetica', 9)
    deb = round(-sum(a for _, _, a, _ in rows if a < 0), 2); cre = round(sum(a for _, _, a, _ in rows if a > 0), 2)
    y -= 8; c.drawString(110, y, 'Total débitos'); c.drawRightString(470, y, ar(deb)); y -= 14
    c.drawString(110, y, 'Total créditos'); c.drawRightString(470, y, ar(cre)); y -= 14
    c.setFont('Helvetica-Bold', 9); c.drawString(110, y, 'Saldo final'); c.drawRightString(560, y, ar(bal))
    c.save()
    return {'kind': 'cuenta', 'rows': len(rows), 'opening': opening, 'closing': bal, 'debits': deb, 'credits': cre}

MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
COMERCIOS = ['SUPERMERCADO EJEMPLO', 'FARMACIA DEL BARRIO', 'COMBUSTIBLES SUR', 'LIBRERIA CENTRAL', 'RESTAURANTE LA ESQUINA',
             'TIENDA DE ROPA NORTE', 'ELECTRODOMESTICOS DEL SUR', 'MERPAGO*COMERCIO', 'GIMNASIO FORMA']
EXTERIOR = ['NETFLIX.COM', 'SPOTIFY', 'GOOGLE *YOUTUBE', 'AMAZON WEB SERVICES', 'STEAM PURCHASE']

def tarjeta(path, seed=3):
    """FECHA | COMPROBANTE | DETALLE DE TRANSACCION | PESOS | DOLARES; installments; payments; taxes without a date."""
    rnd = random.Random(seed)
    c = canvas.Canvas(str(path), pagesize=A4)
    op_ars, op_usd = 245780.40, 35.20
    rows = []
    rows.append((date(2026, 10, 2), '', 'SU PAGO EN PESOS', '', -op_ars, None))
    rows.append((date(2026, 10, 2), '', 'SU PAGO EN USD', '', None, -op_usd))
    d = date(2026, 9, 25)
    for i in range(38):
        d += timedelta(days=rnd.choice([0, 1, 1]))
        if rnd.random() < 0.18:
            rows.append((d, str(rnd.randint(100000, 999999)), rnd.choice(EXTERIOR), '', None, round(rnd.uniform(2, 60), 2)))
        else:
            cuota = ''
            if rnd.random() < 0.3:
                tot = rnd.choice([3, 6, 12]); cuota = f'C.{rnd.randint(1, tot):02d}/{tot:02d}'
            rows.append((d, str(rnd.randint(100000, 999999)), rnd.choice(COMERCIOS), cuota, round(rnd.uniform(1500, 95000), 2), None))
    tax_rows = [('IVA RG 4240 21% ( 1.234,50)', 259.25), ('IMP. DE SELLOS', 812.33), ('COMISION MANTENIMIENTO DE CUENTA', 1234.50)]
    def head():
        header_block(c, 'Tarjeta de crédito VISA EJEMPLO', 'Cierre actual: 23-Oct-26    Vencimiento actual: 05-Nov-26')
        c.setFont('Helvetica-Bold', 9)
        c.drawString(40, H - 130, 'FECHA'); c.drawString(100, H - 130, 'COMPROBANTE'); c.drawString(180, H - 130, 'DETALLE DE TRANSACCION')
        c.drawRightString(480, H - 130, 'PESOS'); c.drawRightString(560, H - 130, 'DÓLARES')
        return H - 148
    y = head(); c.setFont('Helvetica', 9)
    c.drawString(180, y, 'SALDO ANTERIOR'); c.drawRightString(480, y, ar(op_ars)); c.drawRightString(560, y, ar(op_usd)); y -= 14
    for (d, comp, det, cuota, ars, usd) in rows:
        if y < 70: c.showPage(); y = head(); c.setFont('Helvetica', 9)
        c.drawString(40, y, f'{d.day:02d}-{MESES[d.month - 1]}-{d.year % 100:02d}'); c.drawString(100, y, comp)
        c.drawString(180, y, det + ('  ' + cuota if cuota else ''))
        if ars is not None: c.drawRightString(480, y, ar(ars))
        if usd is not None: c.drawRightString(560, y, ar(usd))
        y -= 14
    # taxes and charges: no date of their own
    for det, ars in tax_rows:
        if y < 70: c.showPage(); y = head(); c.setFont('Helvetica', 9)
        c.drawString(180, y, det); c.drawRightString(480, y, ar(ars)); y -= 14
    sum_ars = round(sum(r[4] or 0 for r in rows) + sum(a for _, a in tax_rows), 2)
    sum_usd = round(sum(r[5] or 0 for r in rows), 2)
    cl_ars, cl_usd = round(op_ars + sum_ars, 2), round(op_usd + sum_usd, 2)
    if y < 100: c.showPage(); y = head(); c.setFont('Helvetica', 9)
    y -= 8; c.setFont('Helvetica-Bold', 9)
    c.drawString(180, y, 'SALDO ACTUAL'); c.drawRightString(480, y, '$ ' + ar(cl_ars)); c.drawRightString(560, y, 'U$S ' + ar(cl_usd)); y -= 14
    c.setFont('Helvetica', 9); c.drawString(180, y, 'PAGO MINIMO'); c.drawRightString(480, y, '$ ' + ar(round(cl_ars * 0.1, 2)))
    c.save()
    n = len(rows) + len(tax_rows)
    return {'kind': 'tarjeta', 'rows': n, 'ars': {'opening': op_ars, 'closing': cl_ars}, 'usd': {'opening': op_usd, 'closing': cl_usd},
            'cuotas': sum(1 for r in rows if r[3])}

def tarjeta_consolidado(path, seed=4):
    """Layout seen on a real Argentine Visa statement (rebuilt with made-up data): a CONSOLIDADO block with the previous
    balance and the payments BEFORE the detail heading, the description column titled REFERENCIA, a COMPROBANTE column,
    dollar amounts repeated inside the description ("USD 7,45"), a "Total Consumos" subtotal, taxes with dates on the
    next page, TOTAL A PAGAR, then pages of legal text with rates and amounts."""
    rnd = random.Random(seed)
    c = canvas.Canvas(str(path), pagesize=A4)
    def top():
        c.setFont('Helvetica-Bold', 11); c.drawString(76, H - 60, 'Resumen N° VI0000000000000001  Banco Ejemplo S.A.')
        c.setFont('Helvetica', 8); c.drawString(34, H - 110, 'NOMBRE DE EJEMPLO  Resumen sintético para pruebas')
    op_ars, op_usd = 523480.15, 12.40
    top(); y = H - 460
    c.setFont('Helvetica-Bold', 8); c.drawString(39, y, 'CONSOLIDADO'); c.drawRightString(494, y, 'PESOS'); c.drawRightString(580, y, 'DÓLARES'); y -= 19
    c.setFont('Helvetica', 8)
    c.drawString(86, y, 'SALDO ANTERIOR'); c.drawRightString(494, y, ar(op_ars)); c.drawRightString(580, y, ar(op_usd)); y -= 16
    pre = [('03-09-26', 'SU PAGO EN PESOS', -515000.00, None), ('03-09-26', 'SU PAGO EN USD', None, -12.40), ('07-09-26', 'DEV.IMP. RG 5617 30%( 8200,00)', -2460.00, None)]
    for d, det, a, u in pre:
        c.drawString(23, y, d); c.drawString(86, y, det)
        if a is not None: c.drawRightString(494, y, ar(a))
        if u is not None: c.drawRightString(580, y, ar(u))
        y -= 16
    y -= 9; c.setFont('Helvetica-Bold', 8); c.drawString(23, y, 'DETALLE DEL CONSUMO'); y -= 16
    c.drawString(23, y, 'FECHA'); c.drawString(88, y, 'REFERENCIA'); c.drawString(320, y, 'CUOTA'); c.drawString(365, y, 'COMPROBANTE'); c.drawRightString(494, y, 'PESOS'); c.drawRightString(580, y, 'DÓLARES'); y -= 15
    c.setFont('Helvetica', 8)
    rows = [('11-06-26', '* COMERCIO DEPORTES', '04/06', 18750.00, None), ('20-07-26', '* TIENDA DE ROPA', '02/03', 29400.50, None),
            ('02-09-26', 'K SERVICIO*JUEGOS USD 7,45', '', None, 7.45), ('06-09-26', '* DLO*DELIVERY PRO', '', 5120.00, None),
            ('12-09-26', 'K VIDEO *STREAMING USD 5,99', '', None, 5.99), ('15-09-26', 'K PEDIDOS*RESTAURANTE', '', 11250.00, None),
            ('19-09-26', 'NUBE *ALMACENAMIENTO USD 2,99', '', None, 2.99), ('23-09-26', 'K HELADERIA DEL CENTRO', '', 8400.00, None)]
    for d, det, cuota, a, u in rows:
        c.drawString(23, y, d); c.drawString(74 if det[0] in '*K' else 86, y, det)
        if cuota: c.drawString(325, y, cuota)
        c.drawString(365, y, f'{rnd.randint(1, 999999):06d}')
        if a is not None: c.drawRightString(494, y, ar(a))
        if u is not None: c.drawRightString(580, y, ar(u))
        y -= 16
    cons_ars = round(sum(r[3] or 0 for r in rows), 2); cons_usd = round(sum(r[4] or 0 for r in rows), 2)
    c.drawString(86, y, 'TARJETA 1234 Total Consumos de NOMBRE DE EJEMPLO'); c.drawRightString(494, y, ar(cons_ars)); c.drawRightString(580, y, ar(cons_usd))
    c.showPage(); top(); y = H - 196; c.setFont('Helvetica', 8)
    taxes = [('07-09-26', 'SERVICIO CUENTA PAQUETE', 30500.00), ('28-09-26', 'INTERESES FINANCIACION $', 250.00),
             ('28-09-26', 'DB IVA $ 21% 30.750,00', 6457.50), ('28-09-26', 'IIBB PERCEP-CABA 2,00%( 20000,00)', 400.00),
             ('28-09-26', 'IVA RG 4240 21%( 20000,00)', 4200.00), ('28-09-26', 'DB.RG 5617 30% ( 35000,00 )', 10500.00)]
    for d, det, a in taxes:
        c.drawString(23, y, d); c.drawString(86, y, det); c.drawRightString(494, y, ar(a)); y -= 16
    cl_ars = round(op_ars + sum(p[2] or 0 for p in pre) + cons_ars + sum(t[2] for t in taxes), 2)
    cl_usd = round(op_usd + sum(p[3] or 0 for p in pre) + cons_usd, 2)
    y -= 4; c.setFont('Helvetica-Bold', 8); c.drawString(38, y, 'TOTAL A PAGAR'); c.drawRightString(494, y, ar(cl_ars)); c.drawRightString(580, y, ar(cl_usd)); y -= 38
    c.setFont('Helvetica', 8)
    for line in ['Plan de pagos: abonando el pago mínimo de $ 15000,00 usted puede cancelar en cuotas', '3 cuotas de 12000,00 (TNA Fija: 70,000% - TEA: 100,000%) *',
                 'Cuotas a vencer:', '$48.150,50 $18.750,00 $0,00 $0,00', 'Tasa Nominal Anual (TNA) PESOS 80,00%']:
        c.drawString(67, y, line); y -= 15
    c.showPage(); top(); y = H - 196; c.setFont('Helvetica', 8)
    for line in ['Fecha Vencimiento : 10/10/26 Saldo Total en $: ' + ar(cl_ars), 'Saldo Total en U$S: ' + ar(cl_usd) + ' Pago Mínimo en $: 15.000,00']:
        c.drawString(67, y, line); y -= 15
    c.save()
    return {'kind': 'tarjeta', 'rows': len(pre) + len(rows) + len(taxes), 'ars': {'opening': op_ars, 'closing': cl_ars}, 'usd': {'opening': op_usd, 'closing': cl_usd}, 'cuotas': 2}

expected = {
    'sample_cuenta.pdf': cuenta_debcred(OUT / 'sample_cuenta.pdf'),
    'sample_cuenta_importe.pdf': cuenta_importe(OUT / 'sample_cuenta_importe.pdf'),
    'sample_tarjeta.pdf': tarjeta(OUT / 'sample_tarjeta.pdf'),
    'sample_tarjeta_consolidado.pdf': tarjeta_consolidado(OUT / 'sample_tarjeta_consolidado.pdf'),
}
(ROOT / 'test').mkdir(exist_ok=True)
(ROOT / 'test' / 'expected.json').write_text(json.dumps(expected, indent=1, ensure_ascii=False))
print(json.dumps(expected, ensure_ascii=False))
