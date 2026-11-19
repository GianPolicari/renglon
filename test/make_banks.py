# More made-up statements, shaped after the per-bank format notes in extractos-ar-claude-plugin
# (MIT, Javier Gradiche: https://github.com/javiergradiche/extractos-ar-claude-plugin, formats/*.json).
# Only the shape comes from there (column headings, date and number styles, section markers); every name and amount is invented.
# Usage: python3 test/make_banks.py  ->  test/layouts/<bank>[_chars].pdf, merged into test/layouts/expected.json
import json, os, random
import make_layouts as ML
from make_layouts import CharCanvas, OUT, A4, H

MON = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
DESCS = ['TRANSFERENCIA RECIBIDA', 'PAGO SERVICIOS', 'COMPRA DEBITO SUPERMERCADO', 'EXTRACCION CAJERO', 'ACREDITACION HABERES',
         'DEBITO AUTOMATICO SEGURO', 'IMPUESTO LEY 25413', 'COMISION MANTENIMIENTO']

def num(v, style='comma', neg='prefix'):
    s = f"{abs(v):,.2f}"
    if style == 'comma': s = s.replace(',', 'X').replace('.', ',').replace('X', '.')
    if v < 0: return s + '-' if neg == 'suffix' else '-' + s
    return s

def moves(n, seed, start, lo=500, hi=90000):
    rnd = random.Random(seed); bal = start; out = []
    for i in range(n):
        credit = rnd.random() < 0.35
        amt = round(rnd.uniform(lo, hi), 2)
        bal = round(bal + (amt if credit else -amt), 2)
        out.append(dict(day=1 + i * 28 // n, desc=rnd.choice(DESCS), ref=str(rnd.randint(1000, 99999)), amt=amt if credit else -amt, bal=bal))
    return out

def statement(path, title, accounts, heads, *, date, numstyle='comma', neg='prefix', debit_signed=False, amount_col=None,
              opening='SALDO ANTERIOR', closing='SALDO FINAL', per_page=24, reverse=False, extra_lines=None,
              carry=None, row_balance=True, daily_close=None, local=None):
    """accounts: list of (subtitle, opening balance, movements). heads: (label, x, align[, second line]).
    The value columns are the heads whose label is a key of `at` below, found by role."""
    c = CharCanvas(os.path.join(OUT, path), pagesize=A4)
    role_x = {}
    for h in heads:
        if h[3:] and h[3] in ('date', 'desc', 'ref', 'debit', 'credit', 'amount', 'balance', 'local', 'rate'): role_x[h[3]] = h[1]
    page_y = [H - 60]
    def text(x, y, s, right=False): (c.drawRightString if right else c.drawString)(x, y, s)
    def header(y):
        c.setFont('Helvetica-Bold', 8)
        for h in heads:
            lab, x, al = h[:3]
            parts = lab.split('\n')
            if len(parts) == 2: text(x, y + 9, parts[0], al == 'r'); text(x, y, parts[1], al == 'r')
            else: text(x, y, lab, al == 'r')
        c.setFont('Helvetica', 8)
        return y - 14
    def money(role, v, y):
        if v is None or role not in role_x: return
        text(role_x[role], y, num(v, numstyle, neg), True)
    y = H - 50
    c.setFont('Helvetica-Bold', 11); text(40, y, title); c.setFont('Helvetica', 8)
    text(40, y - 14, 'Resumen sintetico para pruebas - datos inventados'); y -= 50
    exp = []
    for subtitle, open_bal, mv in accounts:
        if y < 160: c.showPage(); y = H - 60
        c.setFont('Helvetica-Bold', 9); text(40, y, subtitle); y -= 18
        y = header(y)
        if not mv:
            text(role_x['desc'], y, 'SIN MOVIMIENTOS'); y -= 20
            exp.append(None); continue
        if opening: text(role_x['desc'], y, opening); money('balance', open_bal, y); y -= 13
        seq = list(reversed(mv)) if reverse else mv
        bal = open_bal if not reverse else mv[-1]['bal']
        for i, m in enumerate(seq):
            if i and i % per_page == 0:
                prev = seq[i - 1]['bal'] if not reverse else seq[i - 1]['bal']
                if carry: text(role_x['desc'], y, carry); money('balance', prev, y)
                c.showPage(); y = header(H - 60)
                if carry: text(role_x['desc'], y, carry); money('balance', prev, y); y -= 13
            text(role_x['date'], y, date(m['day']))
            text(role_x['desc'], y, m['desc'])
            if 'ref' in role_x: text(role_x['ref'], y, m['ref'])
            if amount_col: money('amount', m['amt'], y)
            elif m['amt'] < 0: money('debit', m['amt'] if debit_signed else -m['amt'], y)
            else: money('credit', m['amt'], y)
            if local:
                text(role_x['local'], y, num(m['amt'] * local, numstyle, neg), True); text(role_x['rate'], y, num(local, numstyle), True)
            if row_balance: money('balance', m['bal'], y)
            y -= 11
            for extra in (extra_lines(m) if extra_lines else []):
                c.setFont('Helvetica', 7); text(role_x['desc'], y, extra); c.setFont('Helvetica', 8); y -= 10
            if daily_close and (i + 1 == len(seq) or seq[i + 1]['day'] != m['day']):
                text(role_x['desc'], y, daily_close); money('balance', m['bal'], y); y -= 13
            y -= 2
        last = mv[-1]['bal']
        if closing: text(role_x['desc'], y, closing); money('balance', last, y); y -= 13
        y -= 24
        exp.append({'opening': open_bal, 'closing': last, 'rows': len(mv)})
    c.save()
    secs = [e for e in exp if e]
    out = {'rows': sum(e['rows'] for e in secs)}
    if len(secs) == 1: out.update(opening=secs[0]['opening'], closing=secs[0]['closing'])
    else: out['sections'] = [{'opening': e['opening'], 'closing': e['closing'], 'rows': e['rows']} for e in secs]
    return out

def build(suf):
    out = {}
    std = lambda d: f"{d:02d}/09/26"
    # Galicia Plus / HSBC: "05/SEP" dates, US-style numbers (1,234.56); HSBC puts the minus after the number
    heads = [('FECHA', 40, 'l', 'date'), ('REFERENCIA', 90, 'l', 'desc'), ('NRO', 300, 'l', 'ref'), ('DEBITO', 420, 'r', 'debit'), ('CREDITO', 490, 'r', 'credit'), ('SALDO', 560, 'r', 'balance')]
    out['galicia_plus'] = statement('galicia_plus' + suf + '.pdf', 'BANCO EJEMPLO PLUS', [('CUENTA CORRIENTE EN PESOS', 210000.0, moves(26, 11, 210000.0))],
                                    heads, date=lambda d: f"{d:02d}/{MON[8]}", numstyle='period')
    out['hsbc'] = statement('hsbc' + suf + '.pdf', 'BANCO EJEMPLO HS', [('CUENTA CORRIENTE', 5000.0, moves(26, 12, 5000.0))],
                            heads, date=lambda d: f"{d:02d}/{MON[8]}", numstyle='period', neg='suffix', closing=None)
    # BBVA multicuenta: pesos and dollars in one statement, debits printed with a minus, "SALDO AL 30 DE SEPTIEMBRE"
    heads = [('FECHA', 40, 'l', 'date'), ('ORIGEN', 85, 'l'), ('CONCEPTO', 130, 'l', 'desc'), ('DÉBITO', 410, 'r', 'debit'), ('CRÉDITO', 485, 'r', 'credit'), ('SALDO', 560, 'r', 'balance')]
    out['bbva_multi'] = statement('bbva_multi' + suf + '.pdf', 'BBVA EJEMPLO - RESUMEN DE CUENTAS', [
        ('CAJA DE AHORROS EN PESOS 123-456789/0', 320000.0, moves(18, 21, 320000.0)),
        ('CAJA DE AHORROS EN EUROS 123-456789/1', 0.0, []),
        ('CAJA DE AHORROS EN DOLARES U$S 123-456789/2', 1500.0, moves(6, 22, 1500.0, 10, 400))],
        heads, date=std, debit_signed=True, closing='SALDO AL 30 DE SEPTIEMBRE')
    # Macro: one "DETALLE DE MOVIMIENTO" table per account, "SALDO ULTIMO EXTRACTO AL ..." and "SALDO FINAL AL DIA ..."
    heads = [('FECHA', 40, 'l', 'date'), ('DESCRIPCION', 90, 'l', 'desc'), ('REFERENCIA', 300, 'l', 'ref'), ('DEBITOS', 420, 'r', 'debit'), ('CREDITOS', 490, 'r', 'credit'), ('SALDO', 560, 'r', 'balance')]
    out['macro_multi'] = statement('macro_multi' + suf + '.pdf', 'BANCO EJEMPLO DEL INTERIOR', [
        ('DETALLE DE MOVIMIENTO - CAJA DE AHORRO $', 98000.0, moves(20, 31, 98000.0)),
        ('DETALLE DE MOVIMIENTO - CAJA DE AHORRO U$S', 820.0, moves(5, 32, 820.0, 10, 300))],
        heads, date=std, opening='SALDO ULTIMO EXTRACTO AL 31/08/2026', closing='SALDO FINAL AL DIA 30/09/2026')
    # Comafi with two accounts, an empty one, page breaks with "Transporte" and descriptions on two lines
    heads = [('Fecha', 40, 'l', 'date'), ('Conceptos', 90, 'l', 'desc'), ('Referencias', 300, 'l', 'ref'), ('Débitos', 420, 'r', 'debit'), ('Créditos', 490, 'r', 'credit'), ('Saldo', 560, 'r', 'balance')]
    out['comafi_multi'] = statement('comafi_multi' + suf + '.pdf', 'Banco Ejemplo Comercial', [
        ('Cuenta Corriente Bancaria en Pesos Nro. 1234567', 450000.0, moves(34, 41, 450000.0)),
        ('Caja de Ahorros en Dolares Nro. 7654321', 0.0, []),
        ('Caja de Ahorros en Pesos Nro. 7654322', 12000.0, moves(7, 42, 12000.0, 100, 5000))],
        heads, date=std, opening='Saldo Anterior', closing='Saldo al: 30/09/26', carry='Transporte', per_page=30,
        extra_lines=lambda m: ['CUIT 20-12345678-9 NOMBRE EJEMPLO'] if m['desc'] == 'TRANSFERENCIA RECIBIDA' else [])
    # Hipotecario: newest first, DD/MM/YYYY, one signed column with a heading on two lines, payee on extra lines
    heads = [('FECHA', 40, 'l', 'date'), ('DESCRIPCIÓN', 110, 'l', 'desc'), ('IMPORTE\nMONEDA', 440, 'r', 'amount'), ('SALDO EN $', 530, 'r', 'balance'), ('EDA', 560, 'l')]
    out['hipotecario_cc'] = statement('hipotecario_cc' + suf + '.pdf', 'BANCO EJEMPLO HIPOTECARIO', [('CUENTA CORRIENTE EN PESOS', 75000.0, moves(24, 51, 75000.0))],
        heads, date=lambda d: f"{d:02d}/09/2026", amount_col=True, reverse=True, opening=None, closing=None,
        extra_lines=lambda m: ['CUIT 27-23456789-0', 'PROVEEDOR EJEMPLO SRL'] if m['desc'] == 'PAGO SERVICIOS' else [])
    # Hipotecario (Naranja): movements carry no balance; it only shows on SALDO INICIAL and on SALDO FINAL DEL DIA rows
    heads = [('FECHA', 40, 'l', 'date'), ('DESCRIPCION', 90, 'l', 'desc'), ('SUC.', 270, 'l'), ('REFERENCIA', 300, 'l', 'ref'), ('DEBITOS', 420, 'r', 'debit'), ('CREDITOS', 490, 'r', 'credit'), ('SALDO', 560, 'r', 'balance')]
    out['hipotecario_dia'] = statement('hipotecario_dia' + suf + '.pdf', 'BANCO EJEMPLO HIPOTECARIO', [('CAJA DE AHORROS EN PESOS', 60000.0, moves(22, 61, 60000.0))],
        heads, date=lambda d: f"{d:02d}/09/2026", opening='SALDO INICIAL', closing='SALDO FINAL', row_balance=False, daily_close='SALDO FINAL DEL DIA')
    # Santander (paquete): one signed column per account type, a single running balance
    heads = [('Fecha', 40, 'l', 'date'), ('Comprobante', 85, 'l', 'ref'), ('Movimiento', 150, 'l', 'desc'), ('Caja de Ahorro\nen pesos', 410, 'r', 'amount'), ('Cuenta Corriente\nen pesos', 485, 'r'), ('Saldo en cuenta', 560, 'r', 'balance')]
    out['santander_paquete'] = statement('santander_paquete' + suf + '.pdf', 'Banco Ejemplo Rojo', [('Movimientos en pesos', 44000.0, moves(20, 71, 44000.0))],
        heads, date=std, amount_col=True, opening='Saldo Inicial', closing='Saldo total')
    # Mercado Pago (dollars): DD-MM-YYYY, operation id, dollars received, pesos used and the exchange rate on every row
    heads = [('Fecha', 40, 'l', 'date'), ('Descripción', 100, 'l', 'desc'), ('ID de la operación', 230, 'l', 'ref'), ('Valor\nrecibidos', 360, 'r', 'amount'), ('Pesos usados/\nrecibidos', 430, 'r', 'local'), ('Cotización\ndel dólar', 495, 'r', 'rate'), ('Saldo', 560, 'r', 'balance')]
    mv = moves(16, 81, 300.0, 5, 120)
    for i, m in enumerate(mv): m['ref'] = str(80000000000 + i * 7919); m['desc'] = 'Compra de dólares' if m['amt'] > 0 else 'Venta de dólares'
    out['mercadopago_usd'] = statement('mercadopago_usd' + suf + '.pdf', 'Billetera Ejemplo - Resumen de dolares', [('DETALLE DE MOVIMIENTOS DEL PERIODO', 300.0, mv)],
        heads, date=lambda d: f"{d:02d}-09-2026", amount_col=True, local=1450.0, opening='Saldo inicial', closing='Saldo final')
    return out

if __name__ == '__main__':
    p = os.path.join(OUT, 'expected.json'); e = json.load(open(p))
    for cw, suf in ((False, ''), (True, '_chars')):
        ML.CHARWISE = cw
        for k, v in build(suf).items(): e[k + suf] = v
    json.dump(e, open(p, 'w'), indent=1)
    print(len(e), 'layouts')
