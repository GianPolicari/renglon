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
    exp = {}
    for cw, suf in ((False, ''), (True, '_chars')):
        CHARWISE = cw
        for k, v in build(suf).items(): exp[k + suf] = v
    json.dump(exp, open(os.path.join(OUT, 'expected.json'), 'w'), indent=1)
    print(len(exp), 'layouts')
