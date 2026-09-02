import { Templates } from './email.templates';

const base = {
  plan: 'Plus', emitidos: 6_412, cupo: 6_000, excedente: 412, porcentaje: 107,
  cicloInicio: '2026-08-05', cicloFin: '2026-09-05', precioExcedente: 3,
};
/** El texto visible, sin marcado ni estilos. */
const texto = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('el rango del ciclo que ve el cliente', () => {
  it('se pinta en formato dominicano, no en ISO', () => {
    expect(texto(Templates.ecfCuota80(base).html)).toContain('05/08/2026');
  });

  it('el último día es el que SÍ es suyo: cicloFin es exclusivo', () => {
    // Si esto dijera 05/09 le estaríamos atribuyendo un día que ya se le cuenta
    // en el ciclo siguiente — y el cargo se calcula sobre el rango real.
    const t = texto(Templates.ecfCuotaExcedida(base).html);
    expect(t).toContain('05/08/2026 al 04/09/2026');
    expect(t).not.toContain('al 05/09/2026');
  });

  it('no pierde un día por la zona horaria', () => {
    // new Date('2026-08-05') es medianoche UTC, que en RD es el día 4 a las 8pm.
    // Es la trampa que documenta fecha-local.util.ts.
    expect(texto(Templates.ecfCuota80({ ...base, cicloInicio: '2026-08-01' }).html))
      .toContain('01/08/2026');
  });

  it('un corte 31 que pasa por un mes de 30 cierra el 29, no el 30', () => {
    const t = texto(Templates.ecfCuota80({
      ...base, cicloInicio: '2026-03-31', cicloFin: '2026-04-30',
    }).html);
    expect(t).toContain('31/03/2026 al 29/04/2026');
  });

  it('cruza el fin de año hacia atrás sin romperse', () => {
    const t = texto(Templates.ecfCuota80({
      ...base, cicloInicio: '2026-12-15', cicloFin: '2027-01-15',
    }).html);
    expect(t).toContain('15/12/2026 al 14/01/2027');
  });
});

describe('qué dice cada aviso', () => {
  it('el del 80% deja claro que no bloquea nada', () => {
    const t = texto(Templates.ecfCuota80(base).html);
    expect(t).toContain('Puedes seguir facturando con normalidad');
    expect(t).toContain('no se bloquea nada');
  });

  it('el de excedida también deja claro que la facturación sigue', () => {
    expect(texto(Templates.ecfCuotaExcedida(base).html)).toContain('Tu facturación no se detiene');
  });

  it('el de excedida lleva el precio: enterarse con el cargo es enterarse tarde', () => {
    expect(texto(Templates.ecfCuotaExcedida(base).html)).toContain('RD$3.00');
  });

  it('sin precio configurado NO se inventa un número', () => {
    const t = texto(Templates.ecfCuotaExcedida({ ...base, precioExcedente: 0 }).html);
    expect(t).not.toMatch(/RD\$\s*0/);
    expect(t).toContain('te contactaremos para coordinarlo');
  });

  it('el asunto nombra el plan y, en el del 80%, el porcentaje', () => {
    expect(Templates.ecfCuota80({ ...base, porcentaje: 84 }).asunto).toContain('84%');
    expect(Templates.ecfCuota80(base).asunto).toContain('Plus');
    expect(Templates.ecfCuotaExcedida(base).asunto).toContain('Plus');
  });

  it('los miles van separados: 6412 se lee 6,412', () => {
    expect(texto(Templates.ecfCuotaExcedida(base).html)).toContain('6,412');
  });
});
