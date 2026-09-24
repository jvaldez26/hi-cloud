import { ReportesService } from './reportes.service';

/**
 * Checklist de configuración inicial (página de Inicio) — cada ítem
 * consulta el estado REAL de la empresa (conteos), nunca un flag manual.
 * "completo" global exige los 6 ítems en verde.
 */

function servicio(counts: {
  vendedores?: number; secuencias?: number; clientes?: number;
  proveedores?: number; productos?: number; usuarios?: number;
} = {}) {
  const consultas: string[] = [];
  const cnt = (n = 0) => [{ cnt: String(n) }];
  const svc = new ReportesService(
    {
      query: async (sql: string) => {
        consultas.push(sql);
        if (/FROM vendedores/.test(sql))         return cnt(counts.vendedores);
        if (/FROM secuencias_ecf/.test(sql))     return cnt(counts.secuencias);
        if (/FROM clientes/.test(sql))           return cnt(counts.clientes);
        if (/FROM proveedores/.test(sql))        return cnt(counts.proveedores);
        if (/FROM productos/.test(sql))          return cnt(counts.productos);
        if (/FROM usuario_empresa/.test(sql))    return cnt(counts.usuarios);
        return [];
      },
    } as any,
    {} as any,
    { getEmpresaId: () => 42 } as any,
    {} as any,
  );
  return { svc, consultas };
}

describe('ReportesService.getChecklistConfiguracion', () => {
  it('empresa recién creada (sin vendedores, solo el dueño): todo pendiente', async () => {
    const { svc } = servicio({ vendedores: 0, secuencias: 0, clientes: 0, proveedores: 0, productos: 0, usuarios: 1 });
    const r = await svc.getChecklistConfiguracion();

    expect(r.items.vendedores.completo).toBe(false);
    expect(r.items.secuenciasEcf.completo).toBe(false);
    expect(r.items.clientes.completo).toBe(false);
    expect(r.items.proveedores.completo).toBe(false);
    expect(r.items.productos.completo).toBe(false);
    expect(r.items.usuarios.completo).toBe(false); // count=1 = solo el dueño
    expect(r.completo).toBe(false);
  });

  it('empresa totalmente configurada: todo en verde, completo=true', async () => {
    const { svc } = servicio({ vendedores: 2, secuencias: 2, clientes: 5, proveedores: 3, productos: 40, usuarios: 3 });
    const r = await svc.getChecklistConfiguracion();

    expect(r.items.vendedores.completo).toBe(true);
    expect(r.items.secuenciasEcf.completo).toBe(true);
    expect(r.items.clientes.completo).toBe(true);
    expect(r.items.proveedores.completo).toBe(true);
    expect(r.items.productos.completo).toBe(true);
    expect(r.items.usuarios.completo).toBe(true);
    expect(r.completo).toBe(true);
  });

  it('un solo ítem pendiente (Clientes) alcanza para completo=false', async () => {
    const { svc } = servicio({ vendedores: 2, secuencias: 2, clientes: 0, proveedores: 3, productos: 40, usuarios: 3 });
    const r = await svc.getChecklistConfiguracion();

    expect(r.items.clientes.completo).toBe(false);
    expect(r.completo).toBe(false);
  });

  it('cada ítem trae su ruta de frontend para completarlo', async () => {
    const { svc } = servicio();
    const r = await svc.getChecklistConfiguracion();

    expect(r.items.vendedores.ruta).toBe('/vendedores');
    expect(r.items.secuenciasEcf.ruta).toBe('/ecf/activar');
    expect(r.items.clientes.ruta).toBe('/clientes');
    expect(r.items.proveedores.ruta).toBe('/proveedores');
    expect(r.items.productos.ruta).toBe('/productos');
    expect(r.items.usuarios.ruta).toBe('/equipo');
  });

  it('cachea 2 minutos — una segunda llamada inmediata no repite las queries', async () => {
    const { svc, consultas } = servicio({ vendedores: 2, secuencias: 2, clientes: 5, proveedores: 3, productos: 40, usuarios: 3 });
    await svc.getChecklistConfiguracion();
    const consultasTrasPrimera = consultas.length;
    await svc.getChecklistConfiguracion();
    expect(consultas.length).toBe(consultasTrasPrimera); // la segunda vino del cache, cero queries nuevas
  });

  it('secuencia e-CF vencida o agotada no cuenta — el filtro SQL ya la excluye', async () => {
    // El mock de secuencias_ecf ignora el WHERE (siempre cnt=0 aquí), pero la
    // consulta real filtra isActiva/isAgotada/fechaVencimiento — se prueba
    // que la consulta se haga (y no un conteo ingenuo sin esos filtros).
    const { svc, consultas } = servicio({ secuencias: 0 });
    await svc.getChecklistConfiguracion();
    const sqlSecuencias = consultas.find(s => /FROM secuencias_ecf/.test(s));
    expect(sqlSecuencias).toMatch(/"isActiva"\s*=\s*true/);
    expect(sqlSecuencias).toMatch(/"isAgotada"\s*=\s*false/);
    expect(sqlSecuencias).toMatch(/"fechaVencimiento"\s*>\s*NOW\(\)/);
  });

  it('vendedor cuenta solo si isActive Y activo (dos banderas distintas) — la consulta filtra ambas', async () => {
    const { svc, consultas } = servicio({ vendedores: 0 });
    await svc.getChecklistConfiguracion();
    const sqlVendedores = consultas.find(s => /FROM vendedores/.test(s));
    expect(sqlVendedores).toMatch(/"isActive"\s*=\s*true/);
    expect(sqlVendedores).toMatch(/activo\s*=\s*true/);
  });
});
