/**
 * HiCloud ERP — Parser de extractos bancarios dominicanos
 * Soporta: Banreservas, BHD León, Banco Popular, Scotiabank, APAP
 */

import { Injectable } from '@nestjs/common';

export interface LineaExtracto {
  fecha:       string;   // YYYY-MM-DD
  descripcion: string;
  referencia:  string;
  monto:       number;   // positivo = crédito, negativo = débito
  tipo:        'credito' | 'debito';
}

export interface ResultadoExtracto {
  banco:       string;
  filas:       LineaExtracto[];
  totalCredito:number;
  totalDebito: number;
  errores:     string[];
}

@Injectable()
export class ExtractoParserService {

  parse(contenido: string, banco: string): ResultadoExtracto {
    const lines = contenido
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const result: ResultadoExtracto = {
      banco,
      filas:        [],
      totalCredito: 0,
      totalDebito:  0,
      errores:      [],
    };

    const parser = this.getParser(banco.toLowerCase());
    let fila = 0;

    for (const line of lines) {
      fila++;
      try {
        const parsed = parser(line, fila);
        if (parsed) {
          result.filas.push(parsed);
          if (parsed.tipo === 'credito') result.totalCredito += parsed.monto;
          else                           result.totalDebito  += Math.abs(parsed.monto);
        }
      } catch (e: any) {
        result.errores.push(`Fila ${fila}: ${e.message}`);
      }
    }

    result.totalCredito = +result.totalCredito.toFixed(2);
    result.totalDebito  = +result.totalDebito.toFixed(2);
    return result;
  }

  private getParser(banco: string): (line: string, fila: number) => LineaExtracto | null {
    if (banco.includes('banreservas') || banco.includes('reservas')) return this.parseBanreservas.bind(this);
    if (banco.includes('bhd'))         return this.parseBHD.bind(this);
    if (banco.includes('popular'))     return this.parsePopular.bind(this);
    if (banco.includes('scotiabank'))  return this.parseScotiabank.bind(this);
    if (banco.includes('apap'))        return this.parseAPAP.bind(this);
    return this.parseGenerico.bind(this);
  }

  // ── Banreservas CSV ──────────────────────────────────────────────────────────
  // Formato: Fecha;Descripcion;Referencia;Credito;Debito;Balance
  private parseBanreservas(line: string): LineaExtracto | null {
    if (line.startsWith('Fecha') || line.startsWith('"Fecha')) return null;
    const cols = this.splitCSV(line, ';');
    if (cols.length < 5) return null;
    const [fecha, desc, ref, credito, debito] = cols;
    const fecParsed = this.parseDate(fecha.trim());
    if (!fecParsed) return null;
    const cred = this.parseAmount(credito);
    const deb  = this.parseAmount(debito);
    if (cred === 0 && deb === 0) return null;
    return {
      fecha:       fecParsed,
      descripcion: this.cleanText(desc),
      referencia:  this.cleanText(ref),
      monto:       cred > 0 ? cred : -deb,
      tipo:        cred > 0 ? 'credito' : 'debito',
    };
  }

  // ── BHD León CSV ─────────────────────────────────────────────────────────────
  // Formato: Fecha,Descripcion,Documento,Debito,Credito,Saldo
  private parseBHD(line: string): LineaExtracto | null {
    if (line.startsWith('Fecha') || line.startsWith('"Fecha')) return null;
    const cols = this.splitCSV(line, ',');
    if (cols.length < 5) return null;
    const [fecha, desc, doc, debito, credito] = cols;
    const fecParsed = this.parseDate(fecha.trim());
    if (!fecParsed) return null;
    const cred = this.parseAmount(credito);
    const deb  = this.parseAmount(debito);
    if (cred === 0 && deb === 0) return null;
    return {
      fecha:       fecParsed,
      descripcion: this.cleanText(desc),
      referencia:  this.cleanText(doc),
      monto:       cred > 0 ? cred : -deb,
      tipo:        cred > 0 ? 'credito' : 'debito',
    };
  }

  // ── Banco Popular ─────────────────────────────────────────────────────────────
  // Formato: Fecha|Descripcion|Tipo|Monto|Balance
  private parsePopular(line: string): LineaExtracto | null {
    if (line.startsWith('Fecha') || line.startsWith('FECHA')) return null;
    const cols = line.split('|');
    if (cols.length < 4) return null;
    const [fecha, desc, tipo, monto] = cols;
    const fecParsed = this.parseDate(fecha.trim());
    if (!fecParsed) return null;
    const amt = this.parseAmount(monto);
    if (amt === 0) return null;
    const isCredito = tipo.trim().toLowerCase().includes('cr') || tipo.trim().toLowerCase().includes('credito');
    return {
      fecha:       fecParsed,
      descripcion: this.cleanText(desc),
      referencia:  '',
      monto:       isCredito ? amt : -amt,
      tipo:        isCredito ? 'credito' : 'debito',
    };
  }

  // ── Scotiabank ────────────────────────────────────────────────────────────────
  // Formato: Date,Description,Amount,Type,Balance
  private parseScotiabank(line: string): LineaExtracto | null {
    if (line.startsWith('Date') || line.startsWith('"Date')) return null;
    const cols = this.splitCSV(line, ',');
    if (cols.length < 4) return null;
    const [fecha, desc, amount, tipo] = cols;
    const fecParsed = this.parseDate(fecha.trim());
    if (!fecParsed) return null;
    const amt = this.parseAmount(amount);
    if (amt === 0) return null;
    const isCredito = tipo.trim().toLowerCase() === 'cr' || tipo.trim().toLowerCase() === 'credit';
    return {
      fecha:       fecParsed,
      descripcion: this.cleanText(desc),
      referencia:  '',
      monto:       isCredito ? amt : -amt,
      tipo:        isCredito ? 'credito' : 'debito',
    };
  }

  // ── APAP ──────────────────────────────────────────────────────────────────────
  // Formato: Fecha;Concepto;Nro.Doc;Debito;Credito;Saldo
  private parseAPAP(line: string): LineaExtracto | null {
    if (line.startsWith('Fecha') || line.startsWith('"Fecha')) return null;
    const cols = this.splitCSV(line, ';');
    if (cols.length < 5) return null;
    const [fecha, desc, doc, debito, credito] = cols;
    const fecParsed = this.parseDate(fecha.trim());
    if (!fecParsed) return null;
    const cred = this.parseAmount(credito);
    const deb  = this.parseAmount(debito);
    if (cred === 0 && deb === 0) return null;
    return {
      fecha:       fecParsed,
      descripcion: this.cleanText(desc),
      referencia:  this.cleanText(doc),
      monto:       cred > 0 ? cred : -deb,
      tipo:        cred > 0 ? 'credito' : 'debito',
    };
  }

  // ── Genérico — intenta detectar columnas automáticamente ─────────────────────
  private parseGenerico(line: string): LineaExtracto | null {
    // Intentar separadores: ; , | \t
    for (const sep of [';', ',', '|', '\t']) {
      const cols = this.splitCSV(line, sep);
      if (cols.length < 3) continue;
      // Buscar columna de fecha
      const fechaIdx = cols.findIndex(c => this.parseDate(c.trim()));
      if (fechaIdx < 0) continue;
      const fecha = this.parseDate(cols[fechaIdx].trim())!;
      // Buscar columnas numéricas
      const nums = cols
        .map((c, i) => ({ i, v: this.parseAmount(c) }))
        .filter(x => x.v !== 0 && x.i !== fechaIdx);
      if (nums.length === 0) continue;
      const monto = nums[nums.length - 1].v; // último número
      const desc  = cols.find((c, i) => i !== fechaIdx && isNaN(this.parseAmount(c)) && c.trim().length > 2) ?? '';
      return {
        fecha,
        descripcion: this.cleanText(desc),
        referencia:  '',
        monto:       monto,
        tipo:        monto >= 0 ? 'credito' : 'debito',
      };
    }
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private parseDate(s: string): string | null {
    s = s.replace(/['"]/g, '').trim();
    // DD/MM/YYYY o DD-MM-YYYY
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    // MM/DD/YYYY
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    // YYYY-MM-DD
    m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    return null;
  }

  private parseAmount(s: string): number {
    const clean = s.replace(/['"$,\s]/g, '').replace(/\(([^)]+)\)/, '-$1');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : +n.toFixed(2);
  }

  private cleanText(s: string): string {
    return s.replace(/^["']|["']$/g, '').trim().substring(0, 200);
  }

  private splitCSV(line: string, sep: string): string[] {
    const result: string[] = [];
    let cur = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === sep && !inQuote) { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur);
    return result;
  }
}
