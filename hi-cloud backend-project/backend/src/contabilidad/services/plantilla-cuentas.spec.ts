import * as XLSX from 'xlsx';
import { ImportacionCuentasService } from './importacion-cuentas.service';

/**
 * getPlantilla() — el .xlsx que se descarga tiene que ser exactamente lo
 * que el parser de la propia importación sabe leer (mismo COLUMNAS interno):
 * dos hojas, Código como texto (nunca numérico), y las filas de ejemplo
 * pasan la validación real, no solo "se generó algo".
 */
describe('ImportacionCuentasService.getPlantilla()', () => {
  const svc: any = Object.create(ImportacionCuentasService.prototype);
  const buf = svc.getPlantilla();
  const wb = XLSX.read(buf, { type: 'buffer' });

  it('genera dos hojas: Cuentas e Instrucciones', () => {
    expect(wb.SheetNames).toEqual(['Cuentas', 'Instrucciones']);
  });

  it('la hoja Cuentas trae el encabezado esperado y al menos 8 filas de ejemplo', () => {
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Cuentas'], { header: 1, raw: false });
    expect(filas[0]).toEqual([
      'Código', 'Nombre', 'Tipo', 'Naturaleza', 'Código cuenta madre',
      'Es cuenta grupo', 'Anexo IR-2', 'Activa', 'Moneda', 'Clasificación resultado',
    ]);
    expect(filas.length - 1).toBeGreaterThanOrEqual(8);
  });

  it('el Código se guarda como TEXTO — "1.1" no se lee como el número 1.1', () => {
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Cuentas'], { header: 1, raw: false });
    // raw:false ya fuerza texto formateado, pero lo que importa es que el
    // valor sobreviva intacto — un código mal leído como número perdería el
    // segundo punto o los ceros a la izquierda.
    expect(filas[1][0]).toBe('1.1');
    const conCeroALaIzquierda = filas.find(f => String(f[0]).startsWith('6.1.1.0'));
    expect(conCeroALaIzquierda?.[0]).toBe('6.1.1.05');
  });

  it('las filas de ejemplo pasan la validación real del parser (parsearFila)', () => {
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Cuentas'], { header: 1, raw: false });
    const headerRow = filas[0].map(String);
    const { idx, faltantes } = svc.mapearEncabezados(headerRow);
    expect(faltantes).toEqual([]);

    for (let i = 1; i < filas.length; i++) {
      const { error } = svc.parsearFila(i + 1, filas[i], idx);
      expect(error).toBeUndefined();
    }
  });

  it('la hoja Instrucciones documenta las 10 columnas y las reglas de negocio', () => {
    const filas = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Instrucciones'], { header: 1, raw: false });
    const texto = filas.flat().join(' ').toLowerCase();
    expect(texto).toContain('código');
    expect(texto).toContain('movimientos');
    expect(texto).toContain('intactas');
  });
});
