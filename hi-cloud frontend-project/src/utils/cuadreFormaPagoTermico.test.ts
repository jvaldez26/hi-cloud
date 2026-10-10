import { describe, it, expect } from 'vitest';
import { bloqueCuadreFormaPagoTermico } from './cuadreFormaPagoTermico';

/**
 * Bug real (2026-10-10): el cuadre por forma de pago se agregó al Drawer en
 * pantalla pero nunca a las plantillas de impresión (CajaPage.tsx, POSPage.tsx)
 * — reimprimir cualquier cierre, viejo o recién cerrado, seguía mostrando el
 * formato de solo-efectivo. Estos tests fijan que el bloque sale cuando el
 * cierre lo trae, y qué pasa en los casos borde que ya rompieron en producción.
 *
 * Segunda vuelta (mismo día, reimpresión del caso real): el neto salía
 * -295.06 en vez de -0.06, el aviso mostraba montos simétricos en vez de los
 * reales, faltaba la lista de facturas candidatas, y había un ⚠ que rompe en
 * ESC/POS.
 *
 * Tercera vuelta (mismo día, tras ver la primera tabla): ninguna línea del
 * bloque — tabla o no — puede pasar del ancho medido del papel; ni tildes ni
 * "·" en ningún dato (nombres de cliente/cajero); y un cierre recerrado
 * imprime el original anulado aparte, con la diferencia contra el conteo
 * vigente.
 */
function lineasDe(html: string): string[] {
  return Array.from(html.matchAll(/<div class="cf-linea">(.*?)<\/div>/g))
    .map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

describe('bloqueCuadreFormaPagoTermico', () => {
  const cierreReal = {
    cuadrePorFormaPago: [
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
      { forma: 'tarjeta',  esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    ],
    sospechasFormaPago: [
      {
        formaSobrante: 'efectivo', formaFaltante: 'tarjeta',
        montoSobrante: 829.94, montoFaltante: -830.00,
        facturasCandidatas: [{ id: 1803, folio: 'FAC-1803', total: 1080, formasPago: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }] }],
      },
    ],
    facturasSinFormaPago: [
      { id: 1807, folio: 'FAC-1807', total: 295.00, clienteNombre: 'Bellamar González' },
    ],
  };

  it('caso real (empresa 73): imprime la tabla, la sospecha con los montos REALES, la candidata y la factura sin forma de pago', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    expect(html).toContain('CUADRE POR FORMA DE PAGO');
    expect(html).toContain('5,608.06');
    expect(html).toContain('6,438.00');
    expect(html).toContain('2,605.00');
    expect(html).toContain('1,775.00');
    expect(html).toContain('+829.94');
    expect(html).toContain('-830.00');
    expect(html).toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).toContain('FAC-1803'); // candidata que explica la sospecha
    expect(html).toContain('Tarjeta 955.00'); // su desglose real — lo que explica la sospecha
    expect(html).toContain('Efectivo 125.00');
    expect(html).toContain('FACTURAS SIN FORMA DE PAGO');
    expect(html).toContain('FAC-1807');
    expect(html).toContain('Bellamar Gonzalez'); // sin tilde — ver describe('sin tildes...')
    // neto del caso real: 829.94 - 830.00 = -0.06
    expect(html).toContain('-0.06');
  });

  it('nunca imprime caracteres especiales (⚠) — texto plano para ESC/POS', () => {
    const html = bloqueCuadreFormaPagoTermico(cierreReal);
    expect(html).toContain('!! POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('⚠');
  });

  it('el aviso muestra los montos REALES de cada forma, no asume que sobrante y faltante son simétricos', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [
        { forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 },
      ],
      sospechasFormaPago: [{
        formaSobrante: 'efectivo', formaFaltante: 'tarjeta',
        montoSobrante: 829.94, montoFaltante: -830.00, // nunca -829.94
      }],
    });
    expect(html).toContain('+829.94');
    expect(html).toContain('-830.00');
    expect(html).not.toContain('-829.94');
  });

  it('sin cuadrePorFormaPago (ej. caja ABIERTA): no imprime nada — el llamador cae a su bloque viejo', () => {
    expect(bloqueCuadreFormaPagoTermico(undefined)).toBe('');
    expect(bloqueCuadreFormaPagoTermico({})).toBe('');
    expect(bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: [] })).toBe('');
  });

  it('cierre derivado (legacy, cuadreEstimado): lo marca "(estimado)" en el título', () => {
    const html = bloqueCuadreFormaPagoTermico({ ...cierreReal, cuadreEstimado: true });
    expect(html).toContain('CUADRE POR FORMA DE PAGO (estimado)');
  });

  it('sin sospechas ni facturas sin forma de pago: solo la tabla, sin avisos', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
    });
    expect(html).toContain('CUADRE POR FORMA DE PAGO');
    expect(html).not.toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('FACTURAS SIN FORMA DE PAGO');
  });

  it('sospecha sin facturas candidatas: no revienta, no imprime la sección de candidatas', () => {
    const html = bloqueCuadreFormaPagoTermico({
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 150, diferencia: 50 }],
      sospechasFormaPago: [{ formaSobrante: 'efectivo', formaFaltante: 'tarjeta', montoSobrante: 50, montoFaltante: -50 }],
    });
    expect(html).toContain('POSIBLE FORMA MAL REGISTRADA');
    expect(html).not.toContain('podrian explicarlo');
  });

  it('con un ajuste posterior (cuadreCorregido): muestra el original Y el corregido', () => {
    const html = bloqueCuadreFormaPagoTermico({
      ...cierreReal,
      cuadreCorregido: [
        { forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 },
        { forma: 'tarjeta',  esperado: 1775.00, declarado: 1775.00, diferencia: 0 },
      ],
    });
    expect(html).toContain('CUADRE CORREGIDO');
    expect(html).toContain('6,438.06');
    // el original sigue presente también
    expect(html).toContain('5,608.06');
  });

  // Requisito explícito (2026-10-10): la tabla FORMA|ESPERADO|CONTADO|DIFER.
  // reemplaza el viejo formato de 3 líneas por forma. Ancho medido con Chrome
  // headless (Courier New bold 8pt): 41 caracteres a 80mm/bluetooth/carta/
  // ninguna, 30 a 58mm — ver el comentario de ConfigTabla en el archivo.
  describe('tabla FORMA|ESPERADO|CONTADO|DIFER.', () => {
    const filas = [
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
      { forma: 'tarjeta',  esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    ];

    it('80mm (por defecto): encabezado y filas de 41 caracteres, con comas de miles y nombres completos', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filas });
      const lineas = lineasDe(html);
      const header = lineas.find(l => l.startsWith('FORMA'))!;
      const efectivo = lineas.find(l => l.includes('Efectivo'))!;
      const tarjeta = lineas.find(l => l.includes('Tarjeta') && !l.includes('explicarlo'))!;
      const total = lineas.find(l => l.startsWith('TOTAL'))!;
      for (const l of [header, efectivo, tarjeta, total]) expect(l.length).toBe(41);
      expect(header).toBe('FORMA       ESPERADO    CONTADO    DIFER.');
      expect(efectivo).toContain('5,608.06');
      expect(efectivo).toContain('+829.94');
      expect(tarjeta).toContain('2,605.00');
      expect(tarjeta).toContain('-830.00');
      expect(total).toContain('8,213.06');
      expect(total).toContain('8,213.00');
      expect(total).toContain('-0.06');
      expect(html).toContain('(+) sobra   (-) falta');
      expect(html).toContain('RESULTADO: FALTAN');
      expect(html).toContain('RD$0.06');
    });

    it('58mm: 30 caracteres, sin comas de miles, nombres cortos (Efect./Transf.)', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filas }, '58mm');
      const lineas = lineasDe(html);
      const header = lineas.find(l => l.startsWith('FORMA'))!;
      const efectivo = lineas.find(l => l.includes('Efect.'))!;
      const tarjeta = lineas.find(l => l.includes('Tarjeta') && !l.includes('explicarlo'))!;
      const total = lineas.find(l => l.startsWith('TOTAL'))!;
      for (const l of [header, efectivo, tarjeta, total]) expect(l.length).toBe(30);
      expect(header).toBe('FORMA    ESPER. CONTADO DIFER.');
      expect(efectivo).not.toContain('5,608.06'); // sin comas
      expect(efectivo).toContain('5608.06');
      expect(efectivo).toContain('6438.00');
      expect(efectivo).toContain('+829.94');
      expect(tarjeta).toContain('2605.00');
      expect(tarjeta).toContain('1775.00');
      expect(tarjeta).toContain('-830.00');
      expect(total).toContain('8213.06');
      expect(total).toContain('8213.00');
      expect(total).toContain('-0.06');
    });

    it('bluetooth usa el mismo ancho de 30 que 58mm (la BT-58UB es una impresora de 58mm)', () => {
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filas }, 'bluetooth');
      const header = lineasDe(html).find(l => l.startsWith('FORMA'))!;
      expect(header.length).toBe(30);
    });

    it('un monto que no entra en su columna pasa a una línea aparte — nunca se corta ni se pega al vecino', () => {
      const filasGrandes = [
        { forma: 'efectivo', esperado: 15608.06, declarado: 6438.00, diferencia: -9170.06 },
      ];
      const html = bloqueCuadreFormaPagoTermico({ cuadrePorFormaPago: filasGrandes }, '58mm');
      expect(html).toContain('Esperado: 15608.06');
      expect(html).toContain('Difer.: -9170.06');
      // la línea principal de la fila no quedó con el monto pegado a Contado
      expect(html).not.toContain('15608.066438.00');
    });

    it('cuadrado: el resultado dice CUADRA, no "SOBRAN RD$0.00" ni "FALTAN RD$0.00"', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
      });
      expect(html).toContain('RESULTADO: CUADRA');
      expect(html).not.toContain('SOBRAN');
      expect(html).not.toContain('FALTAN');
    });

    it('una forma sin movimiento ni declaración (0/0/0) no aparece como fila de la tabla', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [
          { forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 },
          { forma: 'transferencia', esperado: 0, declarado: 0, diferencia: 0 },
        ],
      });
      expect(lineasDe(html).some(l => l.includes('Transfer'))).toBe(false);
    });
  });

  // Requisito explícito (2026-10-10): sin tildes ni caracteres especiales en
  // NINGÚN dato (no solo en el texto fijo), y sin "·" en ningún canal — no
  // solo camino Bluetooth, también el HTML que renderiza el navegador.
  describe('sin tildes ni caracteres especiales en los datos', () => {
    it('nombre de cliente con tildes sale sin tildes, en facturas sin forma de pago y en candidatas', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
        sospechasFormaPago: [{
          formaSobrante: 'efectivo', formaFaltante: 'tarjeta', montoSobrante: 50, montoFaltante: -50,
          facturasCandidatas: [{ id: 1, folio: 'FAC-ÑOÑO', total: 50, formasPago: [{ tipo: 1, monto: 50 }] }],
        }],
        facturasSinFormaPago: [{ id: 2, folio: 'FAC-2', total: 30, clienteNombre: 'José Ñúñez Peña' }],
      });
      expect(html).not.toMatch(/[áéíóúÁÉÍÓÚñÑ]/);
      expect(html).toContain('Jose Nunez Pena');
      expect(html).toContain('FAC-NONO');
    });

    it('un "·" en cualquier dato se reemplaza, nunca llega intacto al HTML', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
        facturasSinFormaPago: [{ id: 1, folio: 'FAC-1', total: 10, clienteNombre: 'Cliente · Con Punto' }],
      });
      expect(html).not.toContain('·');
    });
  });

  // Requisito explícito (2026-10-10): un cierre anulado y re-cerrado imprime
  // el vigente arriba y, aparte, "CIERRE ORIGINAL ANULADO" con el conteo y
  // la declaración del original y la diferencia contra el conteo vigente.
  // Caso real: Beatriz Riva recerró la caja de Bellamar González y la
  // tarjeta esperada del primer cierre se perdió sin dejar rastro.
  describe('CIERRE ORIGINAL ANULADO (recierre)', () => {
    const recierre = {
      cuadrePorFormaPago: [
        { forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 },
      ],
      saldoFisico: 6438.00,
      contadoOriginal: 6200.00,
      cuadrePorFormaPagoOriginal: [
        { forma: 'efectivo', esperado: 5000.00, declarado: 6200.00, diferencia: 1200.00 },
      ],
      facturasSinFormaPagoOriginal: [
        { id: 1700, folio: 'FAC-1700', total: 50.00, clienteNombre: 'José Pérez' },
      ],
    };

    it('sin contadoOriginal (cierre nunca recerrado): no imprime el bloque', () => {
      const html = bloqueCuadreFormaPagoTermico({
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }],
      });
      expect(html).not.toContain('CIERRE ORIGINAL ANULADO');
    });

    it('con contadoOriginal: imprime el bloque con el conteo original, el recierre y la diferencia entre ambos', () => {
      const html = bloqueCuadreFormaPagoTermico(recierre);
      expect(html).toContain('CIERRE ORIGINAL ANULADO');
      expect(html).toContain('6,200.00'); // contado original
      expect(html).toContain('6,438.00'); // contado del recierre (vigente)
      expect(html).toContain('+238.00');  // diferencia: 6438.00 - 6200.00
      // la declaración original también se imprime, con su propia tabla
      expect(html).toContain('5,000.00');
      expect(html).toContain('1,200.00');
      expect(html).toContain('FAC-1700');
      expect(html).toContain('Jose Perez'); // sin tilde
    });

    it('58mm: el bloque de recierre también respeta el ancho de 30 y no lleva comas', () => {
      const html = bloqueCuadreFormaPagoTermico(recierre, '58mm');
      expect(html).toContain('CIERRE ORIGINAL ANULADO');
      expect(html).toContain('6200.00');
      expect(html).toContain('6438.00');
      for (const l of lineasDe(html)) expect(l.length).toBeLessThanOrEqual(30);
    });
  });

  // Requisito explícito (2026-10-10): "ninguna línea fuera de la tabla puede
  // pasar del ancho medido" — se extiende a TODO el bloque (tabla, aviso,
  // candidatas, facturas sin forma, recierre), para cualquier dato.
  describe('ninguna línea supera el ancho medido del papel, para cualquier dato', () => {
    const ANCHOS: Record<string, number> = { '58mm': 30, '80mm': 41, bluetooth: 30, carta: 41, ninguna: 41 };

    // Escenarios variados: nombres largos y con tildes, folios largos, varias
    // candidatas, montos grandes y negativos, varias formas, con y sin
    // recierre — el tipo de datos reales que ya rompió este bloque antes.
    const escenarios: any[] = [
      {
        cuadrePorFormaPago: [
          { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
          { forma: 'tarjeta', esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
          { forma: 'transferencia', esperado: 1234567.89, declarado: 1, diferencia: -1234566.89 },
          { forma: 'otros', esperado: 12.5, declarado: 12.5, diferencia: 0 },
        ],
        sospechasFormaPago: [
          {
            formaSobrante: 'efectivo', formaFaltante: 'tarjeta', montoSobrante: 829.94, montoFaltante: -830.00,
            facturasCandidatas: [
              { id: 1, folio: 'FAC-00001803-MUY-LARGO', total: 1080, formasPago: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }] },
              { id: 2, folio: 'FAC-2', total: 99999.99, formasPago: [{ tipo: 2, monto: 50000 }, { tipo: 4, monto: 49999.99 }] },
            ],
          },
          { formaSobrante: 'otros', formaFaltante: 'transferencia', montoSobrante: 1, montoFaltante: -1 },
        ],
        facturasSinFormaPago: [
          { id: 1, folio: 'FAC-1807', total: 295.00, clienteNombre: 'María José Rodríguez De La Cruz Peña Núñez' },
          { id: 2, folio: 'FAC-LARGUISIMO-NUMERO-0000000001807', total: -99999.99 },
        ],
        cuadreCorregido: [
          { forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 },
        ],
        saldoFisico: 6438.00,
        contadoOriginal: 6200.00,
        cuadrePorFormaPagoOriginal: [
          { forma: 'efectivo', esperado: 5000.00, declarado: 6200.00, diferencia: 1200.00 },
          { forma: 'tarjeta', esperado: -50000, declarado: 50000.5, diferencia: 100000.5 },
        ],
        facturasSinFormaPagoOriginal: [
          { id: 3, folio: 'FAC-1700', total: 50.00, clienteNombre: 'José Ñúñez Peña De Óyanguren' },
        ],
      },
      {
        cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 0.01, declarado: 0.02, diferencia: 0.01 }],
      },
      {
        cuadrePorFormaPago: [{ forma: 'tarjeta', esperado: -0.5, declarado: -0.5, diferencia: 0 }],
        facturasSinFormaPago: [{ id: 9, folio: 'X', total: 0 }],
      },
    ];

    for (const tipoImpresora of Object.keys(ANCHOS)) {
      it(`tipoImpresora="${tipoImpresora}" (ancho ${ANCHOS[tipoImpresora]})`, () => {
        const ancho = ANCHOS[tipoImpresora];
        for (const r of escenarios) {
          const html = bloqueCuadreFormaPagoTermico(r, tipoImpresora);
          for (const l of lineasDe(html)) {
            expect(l.length, `línea "${l}" (${l.length} > ${ancho}) en ${tipoImpresora}`).toBeLessThanOrEqual(ancho);
          }
        }
      });
    }
  });
});
