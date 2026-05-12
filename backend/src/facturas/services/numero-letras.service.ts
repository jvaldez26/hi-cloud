import { Injectable } from '@nestjs/common';

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS  = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

@Injectable()
export class NumeroLetrasService {

  private cientos(n: number): string {
    if (n === 0)   return '';
    if (n === 100) return 'CIEN';
    const c = Math.floor(n / 100);
    const r = n % 100;
    const sc = CENTENAS[c];
    if (r === 0) return sc;
    return sc + (sc ? ' ' : '') + this.decenas(r);
  }

  private decenas(n: number): string {
    if (n < 10)  return UNIDADES[n];
    if (n < 20)  return ESPECIALES[n - 10];
    if (n === 20) return 'VEINTE';
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (n >= 21 && n <= 29) return 'VEINTI' + UNIDADES[u];
    return DECENAS[d] + (u ? ' Y ' + UNIDADES[u] : '');
  }

  private miles(n: number): string {
    if (n === 0) return '';
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    let parteM = '';
    if (miles === 1)       parteM = 'MIL';
    else if (miles > 1)    parteM = this.cientos(miles) + ' MIL';
    const parteR = this.cientos(resto);
    if (!parteM) return parteR;
    if (!parteR) return parteM;
    return parteM + ' ' + parteR;
  }

  private millones(n: number): string {
    if (n === 0) return 'CERO';
    const millones = Math.floor(n / 1_000_000);
    const resto    = n % 1_000_000;
    let parteM = '';
    if (millones === 1)     parteM = 'UN MILLÓN';
    else if (millones > 1)  parteM = this.cientos(millones) + ' MILLONES';
    const parteR = this.miles(resto);
    if (!parteM) return parteR;
    if (!parteR) return parteM;
    return parteM + ' ' + parteR;
  }

  /**
   * Convierte un número a letras en español dominicano.
   * Ejemplo: 10000.50 → "DIEZ MIL PESOS CON 50/100"
   */
  numeroALetras(monto: number): string {
    if (isNaN(monto) || monto < 0) return 'CERO PESOS CON 00/100';

    const redondeado = Math.round(monto * 100) / 100;
    const entero     = Math.floor(redondeado);
    const centavos   = Math.round((redondeado - entero) * 100);

    const letrasEntero  = this.millones(entero);
    const letrasCentavo = String(centavos).padStart(2, '0');

    const pesos = entero === 1 ? 'PESO' : 'PESOS';
    return `${letrasEntero} ${pesos} CON ${letrasCentavo}/100`;
  }
}
