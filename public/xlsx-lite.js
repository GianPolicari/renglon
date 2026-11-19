// Minimal .xlsx writer for one sheet: strings as inline text, numbers as numbers.
// Replaces SheetJS (880 KB): the converter only needs one sheet of movements.
// An .xlsx is a ZIP of XML parts; files are stored uncompressed, which every spreadsheet reader accepts.
// Works in the browser (window.TaxDropXlsx) and in Node (tests).
(function (root) {
  'use strict';
  const enc = new TextEncoder();

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ZIP, "stored" method (no compression). files: [{ name, data: Uint8Array }]
  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
    const u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // fixed date keeps the output deterministic
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE),
        ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, f.data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE),
        ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + size;
    }
    const cdSize = central.reduce((a, p) => a + p.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const all = [...parts, ...central, end];
    const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
    let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }

  const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // characters XML 1.0 does not allow
  function colName(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }

  // Excel day number of an ISO date (yyyy-mm-dd), counted from 1899-12-30
  const serial = iso => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;

  // Named cell styles (index into cellXfs below).
  const STYLE = { plain: 0, date: 1, money: 2, head: 3, title: 4, sub: 5, label: 6, totalMoney: 7, totalLabel: 8, flag: 9, ok: 10, bad: 11,
    moneyBold: 12, section: 13, note: 14, headRight: 15, warn: 16 };
  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts>'
    + '<fonts count="10">'
    + '<font><sz val="11"/><color rgb="FF1F2933"/><name val="Calibri"/></font>'                 // 0 text
    + '<font><b/><sz val="11"/><color rgb="FF1F2933"/><name val="Calibri"/></font>'             // 1 bold
    + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'             // 2 bold white
    + '<font><b/><sz val="18"/><color rgb="FF102A43"/><name val="Calibri"/></font>'             // 3 title
    + '<font><sz val="10"/><color rgb="FF52606D"/><name val="Calibri"/></font>'                 // 4 quiet
    + '<font><b/><sz val="11"/><color rgb="FF1E7B34"/><name val="Calibri"/></font>'             // 5 green
    + '<font><b/><sz val="11"/><color rgb="FFB42318"/><name val="Calibri"/></font>'             // 6 red
    + '<font><b/><sz val="12"/><color rgb="FF102A43"/><name val="Calibri"/></font>'             // 7 section
    + '<font><i/><sz val="9"/><color rgb="FF52606D"/><name val="Calibri"/></font>'              // 8 note
    + '<font><b/><sz val="11"/><color rgb="FF8A5A00"/><name val="Calibri"/></font>'             // 9 amber
    + '</fonts>'
    + '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF102A43"/><bgColor indexed="64"/></patternFill></fill>'   // 2 navy
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CC"/><bgColor indexed="64"/></patternFill></fill>'   // 3 yellow
    + '</fills>'
    + '<borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border>'
    + '<border><left/><right/><top/><bottom style="medium"><color rgb="FFA3803E"/></bottom><diagonal/></border>'      // 1 brass rule
    + '<border><left/><right/><top style="thin"><color rgb="FF102A43"/></top><bottom style="double"><color rgb="FF102A43"/></bottom><diagonal/></border>' // 2 total
    + '<border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E2EC"/></bottom><diagonal/></border>'       // 3 hairline
    + '</borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="17">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'                                                         // 0 plain
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'                                 // 1 date
    + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'                                 // 2 money
    + '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' // 3 head
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                           // 4 title
    + '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                           // 5 sub
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1"/>'                           // 6 label
    + '<xf numFmtId="165" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>'   // 7 total money
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>'                           // 8 total label
    + '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>'                                           // 9 flag
    + '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                           // 10 ok
    + '<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                           // 11 bad
    + '<xf numFmtId="165" fontId="0" fillId="0" borderId="3" xfId="0" applyNumberFormat="1" applyBorder="1"/>'                 // 12 money in the summary
    + '<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>'                           // 13 section
    + '<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' // 14 note
    + '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 15 head, right
    + '<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1"/>'                                           // 16 warn
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  // A cell: '' | number | text | { date: 'yyyy-mm-dd' } | { money: n } | { v, s: styleName } | { f: 'SUM(D2:D9)', s }
  function cellXml(v, ref, rowStyle) {
    if (v === '' || v == null) return '';
    let s = rowStyle, val = v;
    if (typeof v === 'object' && !(v.date || 'money' in v)) { s = STYLE[v.s] != null ? STYLE[v.s] : s; val = v.v; if (v.f) return `<c r="${ref}"${s ? ` s="${s}"` : ''}><f>${xml(v.f)}</f></c>`; }
    if (val && typeof val === 'object' && val.date && /^\d{4}-\d{2}-\d{2}$/.test(val.date)) return `<c r="${ref}" s="${s || STYLE.date}"><v>${serial(val.date)}</v></c>`;
    if (val && typeof val === 'object' && typeof val.money === 'number' && isFinite(val.money)) return `<c r="${ref}" s="${s || STYLE.money}"><v>${val.money}</v></c>`;
    if (val === '' || val == null) return s ? `<c r="${ref}" s="${s}"/>` : '';
    if (typeof val === 'number' && isFinite(val)) return `<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${val}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${xml(val)}</t></is></c>`;
  }
  // sheet: { name, rows, widths, freeze (rows above the scroll), filter: 'A1:H40', merges: ['A1:F1'], heights: {1: 30}, headRow: 1-based }
  function sheetXml(sh, index) {
    const rows = sh.rows.map((r, ri) => {
      const rn = ri + 1, head = sh.headRow === rn;
      const cells = r.map((v, ci) => cellXml(v, colName(ci) + rn, head ? (sh.rightCols && sh.rightCols.includes(ci) ? STYLE.headRight : STYLE.head) : 0)).join('');
      const ht = sh.heights && sh.heights[rn] ? ` ht="${sh.heights[rn]}" customHeight="1"` : '';
      return `<row r="${rn}"${ht}>${cells}</row>`;
    }).join('');
    const cols = sh.widths ? '<cols>' + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
    const pane = sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : '';
    const views = `<sheetViews><sheetView workbookViewId="0" showGridLines="${sh.grid === false ? 0 : 1}"${index === 0 ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>`;
    const filter = sh.filter ? `<autoFilter ref="${sh.filter}"/>` : '';
    const merges = sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}<sheetFormatPr defaultRowHeight="16"/>${cols}<sheetData>${rows}</sheetData>${filter}${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
  function buildBook(sheets) {
    const names = sheets.map((sh, i) => xml(sh.name || `Hoja${i + 1}`).slice(0, 31));
    const defined = sheets.map((sh, i) => sh.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i]}'!$${sh.filter.replace(':', ':$').replace(/([A-Z]+)(\d+)/g, '$1$$$2')}</definedName>` : '').join('');
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': STYLES_XML,
    };
    sheets.forEach((sh, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sh, i); });
    return zip(Object.entries(files).map(([n, s]) => ({ name: n, data: enc.encode(s) })));
  }
  // one sheet, first row as a frozen heading (kept for older callers)
  function build(rows, sheetName, opts) {
    opts = opts || {};
    return buildBook([{ name: sheetName || 'Hoja1', rows, widths: opts.widths, freeze: opts.header ? 1 : 0, headRow: opts.header ? 1 : 0 }]);
  }

  const api = { build, buildBook, colName, crc32, zip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TaxDropXlsx = api;
})(typeof self !== 'undefined' ? self : this);
