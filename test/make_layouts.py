# Made-up statements that copy the column layout of other banks (from public notes on their formats), to test the reader.
# Every name and amount is invented. Usage: python3 test/make_layouts.py  ->  test/layouts/*.pdf + expected.json
# Each layout is written twice: whole strings, and one character at a time (as some report engines draw text).
import random, json, os, sys
from reportlab.pdfbase.pdfmetrics import stringWidth
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'layouts')
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
W, H = A4
def ar(v, trail=False):
    s = f"{abs(v):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    if v < 0: return s + '-' if trail else '-' + s
    return s
DESCS = ['TRANSFERENCIA RECIBIDA', 'PAGO SERVICIOS', 'COMPRA DEBITO SUPERMERCADO', 'EXTRACCION CAJERO', 'ACREDITACION HABERES', 'DEBITO AUTOMATICO SEGURO', 'IMPUESTO LEY 25413', 'COMISION MANTENIMIENTO']
def movements(n, seed, start=150000.0):
    rnd = random.Random(seed); bal = start; out = []
    for i in range(n):
        d = 1 + i * 28 // n
        credit = rnd.random() < 0.35
        amt = round(rnd.uniform(500, 90000), 2)
        bal = round(bal + (amt if credit else -amt), 2)
        out.append((f"{d:02d}/09/26", rnd.choice(DESCS), str(rnd.randint(1000, 99999)), None if credit else amt, amt if credit else None, bal))
    return out

CHARWISE = False

class CharCanvas(canvas.Canvas):
    def drawString(self, x, y, s, *a, **k):
        if not CHARWISE: return super().drawString(x, y, s, *a, **k)
        f, sz = self._fontname, self._fontsize
        for ch in s:
            if ch != ' ': super().drawString(x, y, ch)
            x += stringWidth(ch, f, sz)
    def drawRightString(self, x, y, s, *a, **k):
        if not CHARWISE: return super().drawRightString(x, y, s, *a, **k)
        self.drawString(x - stringWidth(s, self._fontname, self._fontsize), y, s)

def table(path, title, heads, cols, rows, opening, *, trail=False, dollar=False, two_line_date=False, upper=False, transporte=None, closing_label='SALDO FINAL', opening_label='SALDO ANTERIOR', per_page=22):
    """heads: list of (label, x, align) ; cols: dict role -> (x, align) for values"""
    c = CharCanvas(os.path.join(OUT, path), pagesize=A4)
    def header(y):
        c.setFont('Helvetica-Bold', 8)
        for lab, x, al in heads:
            (c.drawRightString if al == 'r' else c.drawString)(x, y, lab)
        return y - 14
    def money(x, v, y):
        if v is None: return
        s = ar(v, trail)
        if dollar:
            s = ('-$ ' + ar(-v)) if v < 0 else ('$ ' + s)
        c.drawRightString(x, y, s)
    c.setFont('Helvetica-Bold', 11); c.drawString(40, H - 50, title)
    c.setFont('Helvetica', 8); c.drawString(40, H - 64, 'Resumen sintético para pruebas - datos inventados')
    y = header(H - 110); c.setFont('Helvetica', 8)
    c.drawString(cols['desc'][0], y, opening_label); money(cols['balance'][0], opening, y); y -= 13
    bal = opening
    for i, (d, desc, ref, deb, cred, b) in enumerate(rows):
        if i and i % per_page == 0:
            if transporte: c.drawString(cols['desc'][0], y, transporte); money(cols['balance'][0], bal, y)
            c.showPage(); c.setFont('Helvetica', 8); y = header(H - 60); c.setFont('Helvetica', 8)
            if transporte: c.drawString(cols['desc'][0], y, transporte); money(cols['balance'][0], bal, y); y -= 13
        if two_line_date:
            # description on one line, date centred between it and a second detail line (Santander style)
            c.drawString(cols['ref'][0], y, ref); c.drawString(cols['desc'][0], y, desc.capitalize() if not upper else desc)
            money(cols['debit'][0], deb, y); money(cols['credit'][0], cred, y); money(cols['balance'][0], b, y)
            c.drawString(cols['date'][0], y - 6.5, d)
            c.setFont('Helvetica', 7); c.drawString(cols['desc'][0], y - 13, 'Detalle de la operacion ' + ref); c.setFont('Helvetica', 8)
            y -= 26
        else:
            c.drawString(cols['date'][0], y, d); c.drawString(cols['desc'][0], y, desc)
            if 'ref' in cols: c.drawString(cols['ref'][0], y, ref)
            money(cols['debit'][0], deb, y); money(cols['credit'][0], cred, y); money(cols['balance'][0], b, y)
            y -= 13
        bal = b
    c.drawString(cols['desc'][0], y, closing_label); money(cols['balance'][0], bal, y)
    c.save()
    return {'rows': len(rows), 'opening': opening, 'closing': bal}

def build(suffix):
    out = {}
    # Banco Nación: uppercase, COMPROB., trailing minus, TRANSPORTE, SALDO FINAL
    rows = movements(30, 1, -20000.0)
    out['nacion'] = table('nacion' + suffix + '.pdf', 'BANCO DE LA NACION ARGENTINA', [('FECHA', 40, 'l'), ('MOVIMIENTOS', 90, 'l'), ('COMPROB.', 300, 'l'), ('DEBITOS', 420, 'r'), ('CREDITOS', 490, 'r'), ('SALDO', 560, 'r')],
        {'date': (40, 'l'), 'desc': (90, 'l'), 'ref': (300, 'l'), 'debit': (420, 'r'), 'credit': (490, 'r'), 'balance': (560, 'r')}, rows, -20000.0, trail=True, transporte='TRANSPORTE')
    # Comafi: Conceptos / Referencias, Transporte, Saldo Anterior, Saldo al:
    rows = movements(30, 2)
    out['comafi'] = table('comafi' + suffix + '.pdf', 'Banco Comafi', [('Fecha', 40, 'l'), ('Conceptos', 90, 'l'), ('Referencias', 300, 'l'), ('Débitos', 420, 'r'), ('Créditos', 490, 'r'), ('Saldo', 560, 'r')],
        {'date': (40, 'l'), 'desc': (90, 'l'), 'ref': (300, 'l'), 'debit': (420, 'r'), 'credit': (490, 'r'), 'balance': (560, 'r')}, rows, 150000.0, transporte='Transporte', opening_label='Saldo Anterior', closing_label='Saldo al: 30/09/2026')
    # Santander: $ apart, -$ negatives, date centred on a two-line cell, Saldo Inicial
    rows = movements(20, 3, 30000.0)
    out['santander'] = table('santander' + suffix + '.pdf', 'Santander - Resumen de cuenta', [('Fecha', 40, 'l'), ('Comprobante', 90, 'l'), ('Movimiento', 160, 'l'), ('Débito', 400, 'r'), ('Crédito', 470, 'r'), ('Saldo en cuenta', 560, 'r')],
        {'date': (40, 'l'), 'ref': (90, 'l'), 'desc': (160, 'l'), 'debit': (400, 'r'), 'credit': (470, 'r'), 'balance': (560, 'r')}, rows, 30000.0, dollar=True, two_line_date=True, opening_label='Saldo Inicial', closing_label='Saldo total', per_page=14)
    # Macro
    rows = movements(30, 4)
    out['macro'] = table('macro' + suffix + '.pdf', 'Banco Macro', [('FECHA', 40, 'l'), ('DESCRIPCION', 90, 'l'), ('REFERENCIA', 300, 'l'), ('DEBITOS', 420, 'r'), ('CREDITOS', 490, 'r'), ('SALDO', 560, 'r')],
        {'date': (40, 'l'), 'desc': (90, 'l'), 'ref': (300, 'l'), 'debit': (420, 'r'), 'credit': (490, 'r'), 'balance': (560, 'r')}, rows, 150000.0)
    # Patagonia: two date columns, REFER., trailing minus
    rows = movements(30, 5)
    out['patagonia'] = table('patagonia' + suffix + '.pdf', 'Banco Patagonia', [('FECHA', 40, 'l'), ('CONCEPTO', 90, 'l'), ('REFER.', 260, 'l'), ('FECHA VALOR', 310, 'l'), ('DEBITOS', 430, 'r'), ('CREDITOS', 495, 'r'), ('SALDO', 560, 'r')],
        {'date': (40, 'l'), 'desc': (90, 'l'), 'ref': (260, 'l'), 'debit': (430, 'r'), 'credit': (495, 'r'), 'balance': (560, 'r')}, rows, 150000.0, trail=True)
    # Hipotecario (Naranja): SUC.
    rows = movements(30, 6)
    out['hipotecario'] = table('hipotecario' + suffix + '.pdf', 'Banco Hipotecario', [('FECHA', 40, 'l'), ('DESCRIPCION', 90, 'l'), ('SUC.', 270, 'l'), ('REFERENCIA', 300, 'l'), ('DEBITOS', 420, 'r'), ('CREDITOS', 490, 'r'), ('SALDO', 560, 'r')],
        {'date': (40, 'l'), 'desc': (90, 'l'), 'ref': (300, 'l'), 'debit': (420, 'r'), 'credit': (490, 'r'), 'balance': (560, 'r')}, rows, 150000.0)
    return out

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    exp = {k: v for k, v in json.load(open(os.path.join(OUT, 'expected.json'))).items() if k.startswith('../')} if os.path.exists(os.path.join(OUT, 'expected.json')) else {}
    for cw, suf in ((False, ''), (True, '_chars')):
        CHARWISE = cw
        for k, v in build(suf).items(): exp[k + suf] = v
    json.dump(exp, open(os.path.join(OUT, 'expected.json'), 'w'), indent=1)
    print(len(exp), 'layouts')


def wallet(path):
    """Dollar wallet statement (ARQ style): summary above the table in US format, month-first dates without a year,
    signed amounts with 0-2 decimals ("+ 35.2", "- 100"), and a local-currency amount under a heading that is not a money column."""
    c = CharCanvas(os.path.join(OUT, path), pagesize=A4); rnd = random.Random(7)
    rows, total_in, total_out = [], 0.0, 0.0
    for i in range(24):
        amt = round(rnd.uniform(2, 60), rnd.choice([0, 1, 2]))
        sign = 1 if i % 3 != 2 else -1
        if sign < 0: amt = rows[-1][1]   # spend what was just bought
        rows.append((f"Oct {3 + i:02d}", amt * sign)); total_in += amt if sign > 0 else 0; total_out += amt if sign < 0 else 0
    c.setFont('Helvetica', 9)
    c.drawString(40, H - 60, 'Billetera Ejemplo - Estado de Cuenta (datos inventados)')
    c.drawString(40, H - 120, 'Fecha de inicio'); c.drawString(160, H - 120, '1 October 2026')
    c.drawString(330, H - 120, 'Balance de inicio'); c.drawString(450, H - 120, '$ 0.00')
    c.drawString(330, H - 134, 'Ingresos'); c.drawString(450, H - 134, '$ ' + f'{total_in:,.2f}')
    c.drawString(330, H - 148, 'Balance Final'); c.drawString(450, H - 148, '$ ' + f'{total_in - total_out:,.2f}')
    y = H - 200
    c.drawString(330, y + 22, 'Moneda'); c.drawString(400, y + 11, 'Monto Local')
    for lab, x in (('Fecha', 40), ('Tipo', 100), ('Monto', 250), ('Equivalente', 330), ('Equivalente', 400), ('Descripción', 480)): c.drawString(x, y, lab)
    y -= 18
    for d, v in rows:
        c.drawString(40, y, d); c.drawString(100, y, 'Compra' if v > 0 else 'Venta')
        c.drawString(250, y, ('+ ' if v > 0 else '- ') + (f'{abs(v):g}'))
        c.drawString(330, y, 'ARS'); c.drawString(400, y, ('+ ' if v > 0 else '- ') + f'{abs(v) * 1650:,.2f}'.rstrip('0').rstrip('.'))
        c.drawString(480, y, 'Conversion de ejemplo'); y -= 16
    c.save()
    return {'rows': len(rows), 'opening': 0.0, 'closing': round(total_in - total_out, 2)}

if __name__ == '__main__':
    e = json.load(open(os.path.join(OUT, 'expected.json')))
    for cw, suf in ((False, ''), (True, '_chars')):
        CHARWISE = cw
        e['billetera' + suf] = wallet('billetera' + suf + '.pdf')
    json.dump(e, open(os.path.join(OUT, 'expected.json'), 'w'), indent=1)


MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiem.', 'Octubre', 'Noviem.', 'Diciem.']
COMERCIOS = ['SUPERMERCADO EJEMPLO', 'FARMACIA DEL BARRIO', 'MERPAGO*ALMACEN', 'COMBUSTIBLES SUR', 'LIBRERIA CENTRAL', 'RESTAURANTE LA ESQUINA', 'TIENDA DE ROPA', 'GIMNASIO FORMA']

def ar2(v):
    return f"{abs(v):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')

def card(path, style):
    """Credit card statements with the layouts of other issuers (invented data).
    style: santander (year-month-day date, then day only), prisma (02-09-26, C.06/12 before the voucher), mastercard (05 Oct 26),
    amex (Importe en $ / Importe en U$S), naranja (one pesos column, "Total a pagar")."""
    rnd = random.Random(hash(style) % 1000)
    c = CharCanvas(os.path.join(OUT, path), pagesize=A4); c.setFont('Helvetica', 8)
    c.drawString(40, H - 50, 'Tarjeta Ejemplo - resumen inventado para pruebas')
    op_ars, op_usd = round(rnd.uniform(50000, 300000), 2), 0.0
    pay = op_ars
    buys = [(i + 2, rnd.choice(COMERCIOS), round(rnd.uniform(1500, 90000), 2), (f"{rnd.randint(1, 3):02d}/{rnd.choice([3, 6, 12]):02d}" if rnd.random() < 0.3 else '')) for i in range(18)]
    usd_buys = [(21, 'STREAMING EJEMPLO USD 9,99', 9.99), (24, 'NUBE ALMACENAMIENTO USD 2,99', 2.99)]
    taxes = [('IMPUESTO DE SELLOS', 1830.0), ('DB IVA $ 21%', 2520.0), ('COMISION MANTENIMIENTO', 12000.0)]
    cons_ars = round(sum(b[2] for b in buys), 2); cons_usd = round(sum(u[2] for u in usd_buys), 2)
    close_ars = round(op_ars - pay + cons_ars + sum(t[1] for t in taxes), 2); close_usd = round(op_usd + cons_usd, 2)
    y = H - 110
    if style == 'amex':
        heads = [('Fecha', 40, 'l'), ('Detalle', 100, 'l'), ('Importe en $', 470, 'r'), ('Importe en U$S', 560, 'r')]
    elif style == 'naranja':
        heads = [('Fecha', 40, 'l'), ('Comercio', 100, 'l'), ('Cuota', 380, 'l'), ('Importe', 500, 'r')]
    elif style == 'santander':
        heads = [('FECHA', 40, 'l'), ('COMPROBANTE', 110, 'l'), ('DETALLE DE TRANSACCION', 170, 'l'), ('PESOS', 480, 'r'), ('DOLARES', 560, 'r')]
    else:
        heads = [('FECHA', 40, 'l'), ('NRO. CUPON' if style == 'mastercard' else 'COMPROBANTE', 100, 'l'), ('DETALLE DE TRANSACCION', 170, 'l'), ('PESOS', 480, 'r'), ('DOLARES', 560, 'r')]
    pesos_x = 470 if style == 'amex' else 500 if style == 'naranja' else 480
    c.setFont('Helvetica-Bold', 8)
    for lab, x, al in heads: (c.drawRightString if al == 'r' else c.drawString)(x, y, lab)
    c.setFont('Helvetica', 8); y -= 16
    def date_cell(day, first):
        if style == 'santander': return (f"26 {MONTHS_ES[9]} {day:02d}" if first else f"{day:02d}")
        if style == 'prisma': return f"{day:02d}-10-26"
        if style == 'mastercard': return f"{day:02d} Oct 26"
        return f"{day:02d}/10/26"
    def money(v, x, yy, trail=True):
        if v is None: return
        c.drawRightString(x, yy, ar2(v) + ('-' if v < 0 and trail else '') if trail or v >= 0 else '-' + ar2(v))
    def line(day, first, desc, ars=None, usd=None, ref='', cuota=''):
        nonlocal y
        c.drawString(40, y, date_cell(day, first))
        if style == 'prisma':
            c.drawString(170, y, desc)
            if cuota: c.drawString(330, y, 'C.' + cuota)
            if ref: c.drawString(380, y, ref)
        elif style == 'naranja':
            c.drawString(100, y, desc)
            if cuota: c.drawString(380, y, cuota)
        elif style == 'amex':
            c.drawString(100, y, desc + (f' C.{cuota}' if cuota else ''))
        else:
            if ref: c.drawString(110 if style == 'santander' else 100, y, ref)
            c.drawString(170, y, ('* ' if style == 'santander' else '') + desc + (f'  C.{cuota}' if cuota else ''))
        money(ars, pesos_x, y, style != 'naranja')
        if style != 'naranja': money(usd, 560, y)
        y -= 13
    # previous balance and payment
    c.drawString(170 if style not in ('naranja', 'amex') else 100, y, 'SALDO ANTERIOR'); money(op_ars, pesos_x, y)
    if style != 'naranja': money(op_usd, 560, y)
    y -= 13
    line(1, True, 'SU PAGO EN PESOS', ars=-pay)
    for i, (day, desc, amt, cuota) in enumerate(buys):
        line(day, False, desc, ars=amt, ref=f"{rnd.randint(1, 999999):06d}", cuota=cuota)
    if style != 'naranja':
        for day, desc, amt in usd_buys: line(day, False, desc, usd=amt, ref=f"{rnd.randint(1, 999999):06d}")
    c.drawString(170 if style not in ('naranja', 'amex') else 100, y, 'TARJETA 1234 Total Consumos de NOMBRE EJEMPLO'); money(cons_ars + (0 if style != 'naranja' else 0), pesos_x, y)
    if style != 'naranja': money(cons_usd, 560, y)
    y -= 16
    for desc, amt in taxes: line(28, False, desc, ars=amt)
    y -= 6
    c.drawString(170 if style not in ('naranja', 'amex') else 100, y, 'TOTAL A PAGAR' if style == 'naranja' else 'SALDO ACTUAL'); money(close_ars, pesos_x, y)
    if style != 'naranja': money(close_usd, 560, y)
    c.drawString(40, y - 30, 'Pago minimo $ ' + ar2(round(close_ars * 0.1, 2)))
    c.save()
    n = 1 + len(buys) + (0 if style == 'naranja' else len(usd_buys)) + len(taxes)
    return {'rows': n, 'card': True, 'ars': {'opening': op_ars, 'closing': close_ars}, 'usd': None if style == 'naranja' else {'opening': op_usd, 'closing': close_usd}}

if __name__ == '__main__':
    e = json.load(open(os.path.join(OUT, 'expected.json')))
    for cw, suf in ((False, ''), (True, '_chars')):
        CHARWISE = cw
        for st in ('santander', 'prisma', 'mastercard', 'amex', 'naranja'):
            e['tarjeta_' + st + suf] = card('tarjeta_' + st + suf + '.pdf', st)
    json.dump(e, open(os.path.join(OUT, 'expected.json'), 'w'), indent=1)
