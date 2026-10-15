import { obtenerDatosUnificadosCuentasBancarias, etiquetaCuentaBancaria } from './saldo-cuenta-bancaria.util';

/**
 * Incidente real (2026-10-15, empresa 53, LUBRI GOMAS PEÑA CASTILLO): el
 * widget de Inicio mostraba RD$0.00 / "SCOTIABANK" y "Cuentas Bancarias &
 * Conciliación" mostraba RD$16,202.56 / "S.R LUBRI-GOMAS PENA CASTILLO" —
 * dos módulos backend (bancos y tesorería) con columnas propias sobre la
 * MISMA tabla física `cuentas_bancarias`. Esta es la única fórmula de
 * lectura que debe usar cualquier pantalla.
 */
function makeDb(rows: any[]) {
  return { query: jest.fn().mockResolvedValue(rows) };
}

describe('obtenerDatosUnificadosCuentasBancarias', () => {
  it('cuenta con solo saldo inicial (creada desde Bancos): el saldo actual es exactamente ese', async () => {
    const db = makeDb([{ id: 7, nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851', saldoActual: '16202.56' }]);
    const r = await obtenerDatosUnificadosCuentasBancarias(db, 53);
    expect(r.get(7)).toEqual({
      saldoActual: 16202.56, nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851',
    });
    // La query real suma saldoInicial + saldo(tesorería) + movimientos de
    // conciliación en una sola expresión — se confirma que se llamó así
    // (sin mockear la base real, la cobertura de la fórmula vive en el SQL).
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('COALESCE(c."saldoInicial", 0) + COALESCE(c.saldo, 0) + COALESCE(mc.neto, 0)'), [53]);
  });

  it('cuenta con saldo inicial Y movimientos de conciliación: los suma (créditos − débitos)', async () => {
    // El JOIN que calcula "mc.neto" ya resuelve esto en SQL — esta prueba
    // confirma que el resultado del query se propaga tal cual al Map.
    const db = makeDb([{ id: 9, nombre: 'Cuenta con movimientos', banco: 'BHD', numeroCuenta: '1234567890', saldoActual: '18700.00' }]);
    const r = await obtenerDatosUnificadosCuentasBancarias(db, 53);
    expect(r.get(9)?.saldoActual).toBe(18700);
  });

  it('cuenta creada desde Tesorería (saldoInicial=0, saldo del libro vivo): el saldo actual es el del libro', async () => {
    const db = makeDb([{ id: 4, nombre: 'Fiordaliza Perez Ortiz', banco: 'Banreservas', numeroCuenta: '9600815928', saldoActual: '153777.00' }]);
    const r = await obtenerDatosUnificadosCuentasBancarias(db, 72);
    expect(r.get(4)?.saldoActual).toBe(153777);
  });

  it('varias cuentas: cada una en su propia entrada del Map, por id', async () => {
    const db = makeDb([
      { id: 1, nombre: 'A', banco: 'X', numeroCuenta: '111', saldoActual: '10.00' },
      { id: 2, nombre: 'B', banco: 'Y', numeroCuenta: '222', saldoActual: '20.00' },
    ]);
    const r = await obtenerDatosUnificadosCuentasBancarias(db, 1);
    expect(r.size).toBe(2);
    expect(r.get(1)?.saldoActual).toBe(10);
    expect(r.get(2)?.saldoActual).toBe(20);
  });
});

describe('etiquetaCuentaBancaria — mismo nombre en toda la app (widget, Bancos, Tesorería)', () => {
  it('con alias/nombre: "alias — banco ···últimos4"', () => {
    expect(etiquetaCuentaBancaria({ nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851' }))
      .toBe('S.R LUBRI-GOMAS PENA CASTILLO — SCOTIABANK ···1851');
  });

  it('sin nombre (fila nunca vista con nombre vacío en producción, pero por si acaso): cae a "banco ···últimos4"', () => {
    expect(etiquetaCuentaBancaria({ nombre: '', banco: 'Banreservas', numeroCuenta: '9600815928' }))
      .toBe('Banreservas ···5928');
  });

  it('sin número de cuenta: no agrega el sufijo "···"', () => {
    expect(etiquetaCuentaBancaria({ nombre: 'Cuenta sin número', banco: 'Popular', numeroCuenta: '' }))
      .toBe('Cuenta sin número — Popular');
  });

  it('nunca muestra solo el nombre del banco cuando hay alias — requisito explícito del incidente', () => {
    const etiqueta = etiquetaCuentaBancaria({ nombre: 'S.R LUBRI-GOMAS PENA CASTILLO', banco: 'SCOTIABANK', numeroCuenta: '63150001851' });
    expect(etiqueta).not.toBe('SCOTIABANK');
  });
});
