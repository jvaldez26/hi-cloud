import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El «PENDIENTE RESTANTE» del recibo de pago no descuenta el cobro dos veces.
 *
 * ── El caso real ────────────────────────────────────────────────────────────
 * FAC-1161 de FERRETERÍA PAVEL: total RD$117,300.06, cobro de RD$37,000. Cuentas
 * por Cobrar y el historial decían RD$80,300.06 —correcto— y el recibo impreso
 * que se llevó el cliente decía RD$43,300.06.
 *
 *     117,300.06 − 37,000 = 80,300.06   ← lo real
 *      80,300.06 − 37,000 = 43,300.06   ← lo impreso
 *
 * La causa: el PDF hacía `cxc.montoPendiente - pago.monto`, pero
 * registrarPago() ya había dejado `montoPendiente` descontado dentro de su
 * transacción. Restarlo otra vez lo contaba dos veces.
 *
 * Es un documento con membrete que se le entrega al cliente diciéndole que debe
 * RD$37,000 menos de lo que debe. Por eso esto se vigila y no se deja al
 * cuidado de quien toque el archivo la próxima vez.
 */
describe('Recibo de pago — pendiente restante', () => {
  const ruta   = join(__dirname, 'cxc.service.ts');
  const codigo = readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('no vuelve a restar el monto del pago al pendiente de la CxC', () => {
    // El patrón exacto del bug, en cualquiera de sus formas de escribirlo.
    const doblesDescuentos = [
      /montoPendiente\s*\)?\s*-\s*Number\(\s*r\.monto\s*\)/,
      /Number\(\s*r\.montoPendiente\s*\)\s*-\s*Number\(\s*r\.monto\s*\)/,
      /r\.montoPendiente\s*-\s*r\.monto/,
    ];
    for (const patron of doblesDescuentos) {
      expect(codigo).not.toMatch(patron);
    }
  });

  it('el pendiente del recibo se calcula desde montoOriginal, no desde el saldo de hoy', () => {
    // Un recibo se reimprime. Si tomara el pendiente actual, el mismo RDP
    // enseñaría un número distinto según los cobros posteriores — y un recibo
    // entregado tiene que decir siempre lo que decía el día que se entregó.
    expect(codigo).toMatch(/montoOriginal"?\s*-\s*COALESCE/);
    expect(codigo).toMatch(/pendienteTrasCobro/);
  });

  it('la suma histórica excluye los pagos anulados', () => {
    // anularPago() marca isActive=false; sin este filtro un pago revertido
    // seguiría bajando el pendiente impreso.
    expect(codigo).toMatch(/p2\."isActive"\s*=\s*true/);
  });
});
