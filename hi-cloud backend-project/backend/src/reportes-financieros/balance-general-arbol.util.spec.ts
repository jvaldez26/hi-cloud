import {
  CuentaCatalogo, calcularSaldosAgregados, calcularTotalRaices, construirNodos, aplanarNodos,
} from './balance-general-arbol.util';

function cuenta(p: Partial<CuentaCatalogo> & { id: number; codigo: string }): CuentaCatalogo {
  return {
    nombre: p.codigo, tipo: 'activo', naturaleza: 'deudora', nivel: 1,
    permiteMovimientos: true, cuentaPadreId: null, ...p,
  };
}

describe('balance-general-arbol.util', () => {
  // Catálogo base: 1 ACTIVOS(raíz) → 1.1 Corriente → 1.1.1 Efectivo → 1.1.1.01 Caja / 1.1.1.02 Banco
  const raiz      = cuenta({ id: 1, codigo: '1',        nivel: 1, permiteMovimientos: false });
  const corriente = cuenta({ id: 2, codigo: '1.1',      nivel: 2, permiteMovimientos: false, cuentaPadreId: 1 });
  const efectivo  = cuenta({ id: 3, codigo: '1.1.1',    nivel: 3, permiteMovimientos: false, cuentaPadreId: 2 });
  const caja      = cuenta({ id: 4, codigo: '1.1.1.01', nivel: 4, permiteMovimientos: true,  cuentaPadreId: 3 });
  const banco     = cuenta({ id: 5, codigo: '1.1.1.02', nivel: 4, permiteMovimientos: true,  cuentaPadreId: 3 });

  const catalogo = [raiz, corriente, efectivo, caja, banco];

  describe('calcularSaldosAgregados', () => {
    it('suma cada cuenta con todos sus descendientes (postorder)', () => {
      const directos = new Map([['1.1.1.01', 1000], ['1.1.1.02', 500]]);
      const agregados = calcularSaldosAgregados(catalogo, directos);
      expect(agregados.get('1.1.1.01')).toBe(1000);
      expect(agregados.get('1.1.1.02')).toBe(500);
      expect(agregados.get('1.1.1')).toBe(1500);
      expect(agregados.get('1.1')).toBe(1500);
      expect(agregados.get('1')).toBe(1500);
    });

    it('cuenta huérfana (madre no existe en el catálogo) se agrega igual, sin romper nada', () => {
      const huerfana = cuenta({ id: 6, codigo: '1.1.1.03', nivel: 4, cuentaPadreId: 999 }); // 999 no existe
      const directos = new Map([['1.1.1.03', 700]]);
      const agregados = calcularSaldosAgregados([...catalogo, huerfana], directos);
      expect(agregados.get('1.1.1.03')).toBe(700);
      // La huérfana NO contamina a su "madre nominal" (no existe) ni a nadie más.
      expect(agregados.get('1')).toBe(0);
    });

    it('cuentas sin ningún movimiento (no vienen en saldosDirectos) agregan 0, no crashean', () => {
      const agregados = calcularSaldosAgregados(catalogo, new Map());
      expect(agregados.get('1')).toBe(0);
      expect(agregados.get('1.1.1.01')).toBe(0);
    });
  });

  describe('calcularTotalRaices', () => {
    it('suma las cuentas raíz de un tipo (sin madre, o con madre huérfana)', () => {
      const agregados = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 1000], ['1.1.1.02', 500]]));
      expect(calcularTotalRaices(catalogo, 'activo', agregados)).toBe(1500);
    });

    it('una cuenta huérfana de ese tipo también cuenta como raíz', () => {
      const huerfana = cuenta({ id: 6, codigo: '9', tipo: 'activo', nivel: 1, cuentaPadreId: 999 });
      const catalogoConHuerfana = [...catalogo, huerfana];
      const agregados = calcularSaldosAgregados(catalogoConHuerfana, new Map([['1.1.1.01', 1000], ['9', 300]]));
      // raíces del tipo activo: '1' (agregado 1000, vía la cadena de madres) y '9' (huérfana, 300)
      expect(calcularTotalRaices(catalogoConHuerfana, 'activo', agregados)).toBe(1300);
    });
  });

  describe('construirNodos — nivel de detalle', () => {
    const agregados = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 1000], ['1.1.1.02', 500]]));

    it('nivel 1 solo muestra la raíz, con el agregado completo aunque no se muestren las hojas', () => {
      const nodos = construirNodos(catalogo, 'activo', agregados, null, 1, false, 1500);
      expect(nodos).toHaveLength(1);
      expect(nodos[0].codigo).toBe('1');
      expect(nodos[0].monto).toBe(1500); // incluye TODO lo de abajo aunque no se despliegue
      expect(nodos[0].hijos).toHaveLength(0);
    });

    it('nivel 2 muestra el corte Corriente/No Corriente como hijos de la raíz', () => {
      const nodos = construirNodos(catalogo, 'activo', agregados, null, 2, false, 1500);
      expect(nodos[0].hijos.map(h => h.codigo)).toEqual(['1.1']);
      expect(nodos[0].hijos[0].monto).toBe(1500);
      expect(nodos[0].hijos[0].hijos).toHaveLength(0); // 1.1.1 (nivel 3) no se muestra
    });

    it("'todos' muestra la profundidad completa hasta las hojas", () => {
      const nodos = construirNodos(catalogo, 'activo', agregados, null, null, false, 1500);
      const hojas = nodos[0].hijos[0].hijos[0].hijos.map(h => h.codigo).sort();
      expect(hojas).toEqual(['1.1.1.01', '1.1.1.02']);
    });
  });

  describe('construirNodos — % vertical', () => {
    it('total de grupo en 0 → 0%, nunca NaN/Infinity', () => {
      const agregados = calcularSaldosAgregados(catalogo, new Map());
      const nodos = construirNodos(catalogo, 'activo', agregados, null, null, false, 0);
      const revisar = (ns: any[]): void => ns.forEach(n => { expect(n.porcentajeVertical).toBe(0); revisar(n.hijos); });
      revisar(nodos);
    });

    it('% vertical = monto del nodo / total del grupo', () => {
      const agregados = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 750], ['1.1.1.02', 250]]));
      const nodos = construirNodos(catalogo, 'activo', agregados, null, null, false, 1000);
      const caja = nodos[0].hijos[0].hijos[0].hijos.find(h => h.codigo === '1.1.1.01')!;
      expect(caja.porcentajeVertical).toBe(75);
    });
  });

  describe('construirNodos — ocultar cuentas en cero', () => {
    it('descarta un nodo con agregado 0 y sin hijos', () => {
      const soloBanco = calcularSaldosAgregados(catalogo, new Map([['1.1.1.02', 500]]));
      const nodos = construirNodos(catalogo, 'activo', soloBanco, null, null, true, 500);
      const hojas = nodos[0].hijos[0].hijos[0].hijos.map(h => h.codigo);
      expect(hojas).toEqual(['1.1.1.02']); // caja (0) se oculta, banco (500) queda
    });

    it('NO descarta un nodo cuyo neto cancela a 0 pero tiene un hijo individual distinto de 0', () => {
      // Caja +500, Banco -500 → 1.1.1 (Efectivo) agrega a 0, pero cada hoja individualmente no es 0.
      const cancelados = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 500], ['1.1.1.02', -500]]));
      const nodos = construirNodos(catalogo, 'activo', cancelados, null, null, true, 0);
      expect(nodos).toHaveLength(1); // la raíz sigue presente porque tiene hijos no vacíos
      const efectivo = nodos[0].hijos[0].hijos[0];
      expect(efectivo.monto).toBe(0);
      expect(efectivo.hijos.map((h: any) => h.codigo).sort()).toEqual(['1.1.1.01', '1.1.1.02']);
    });
  });

  describe('construirNodos — comparativo', () => {
    it('diferencia y diferenciaPct correctos', () => {
      const principal  = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 1200]]));
      const comparado  = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 1000]]));
      const nodos = construirNodos(catalogo, 'activo', principal, comparado, null, false, 1200);
      const caja = nodos[0].hijos[0].hijos[0].hijos.find((h: any) => h.codigo === '1.1.1.01')!;
      expect(caja.comparado).toBe(1000);
      expect(caja.diferencia).toBe(200);
      expect(caja.diferenciaPct).toBe(20);
    });

    it('período de comparación sin ningún dato → comparado=0 (no null/undefined) y diferencia = monto completo', () => {
      const principal = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 900]]));
      const comparadoVacio = calcularSaldosAgregados(catalogo, new Map()); // "año sin datos"
      const nodos = construirNodos(catalogo, 'activo', principal, comparadoVacio, null, false, 900);
      const caja = nodos[0].hijos[0].hijos[0].hijos.find((h: any) => h.codigo === '1.1.1.01')!;
      expect(caja.comparado).toBe(0);
      expect(caja.diferencia).toBe(900);
    });

    it('comparado=0 y monto también 0 → diferenciaPct = 0 (no NaN/Infinity)', () => {
      const principal  = calcularSaldosAgregados(catalogo, new Map());
      const comparado  = calcularSaldosAgregados(catalogo, new Map());
      const nodos = construirNodos(catalogo, 'activo', principal, comparado, 1, false, 0);
      expect(nodos[0].diferenciaPct).toBe(0);
    });

    it('comparado=0 y monto≠0 → diferenciaPct = null (no se puede expresar como %)', () => {
      const principal = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 500]]));
      const comparado = calcularSaldosAgregados(catalogo, new Map());
      const nodos = construirNodos(catalogo, 'activo', principal, comparado, 1, false, 500);
      expect(nodos[0].diferenciaPct).toBeNull();
    });
  });

  describe('aplanarNodos', () => {
    it('indenta el nombre según la profundidad y conserva la sección', () => {
      const agregados = calcularSaldosAgregados(catalogo, new Map([['1.1.1.01', 1000]]));
      const nodos = construirNodos(catalogo, 'activo', agregados, null, null, true, 1000);
      const filas = aplanarNodos(nodos, 'ACTIVO');
      expect(filas.map(f => f.nombre)).toEqual([
        raiz.nombre, '  ' + corriente.nombre, '    ' + efectivo.nombre, '      ' + caja.nombre,
      ]);
      expect(filas.every(f => f.seccion === 'ACTIVO')).toBe(true);
    });
  });
});
