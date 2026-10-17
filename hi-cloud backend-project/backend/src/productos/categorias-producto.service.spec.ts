import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriasProductoService } from './categorias-producto.service';

/**
 * Catálogo de categorías de producto — reemplaza el texto libre de
 * Producto.categoria. Cubre los 5 escenarios pedidos explícitamente: crear
 * categoría desde el catálogo (y que el producto la use), nombre duplicado
 * rechazado, desactivar con productos (siempre permitido — "no se borra: se
 * desactiva"), y fusionar (reasigna productos y subcategorías).
 */
const EMPRESA = 9;

function buildService(filas: any[] = []) {
  let nextId = (filas.at(-1)?.id ?? 0) + 1;
  const repo = {
    find: jest.fn(async ({ where }: any) => filas.filter(f =>
      f.empresaId === where.empresaId
      && (where.isActive === undefined || f.isActive === where.isActive)
      && (where.categoriaPadreId === undefined || f.categoriaPadreId === where.categoriaPadreId)
      && (where.id === undefined || f.id === where.id),
    )),
    findOne: jest.fn(async ({ where }: any) => filas.find(f =>
      f.empresaId === where.empresaId && f.id === where.id,
    ) ?? null),
    count: jest.fn(async ({ where }: any) => filas.filter(f =>
      f.empresaId === where.empresaId
      && (where.categoriaPadreId === undefined || f.categoriaPadreId === where.categoriaPadreId)
      && (where.isActive === undefined || f.isActive === where.isActive),
    ).length),
    create: jest.fn((d: any) => ({ id: nextId++, isActive: true, descripcion: null, categoriaPadreId: null, ...d })),
    save: jest.fn(async (d: any) => {
      const i = filas.findIndex(f => f.id === d.id);
      if (i >= 0) filas[i] = { ...filas[i], ...d }; else filas.push(d);
      return filas.find(f => f.id === d.id);
    }),
  };

  const productosPorCategoria = new Map<number, number>(); // categoriaId -> cantidad de productos activos
  const dataSource = {
    query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('SELECT COUNT(*)::text AS count FROM productos')) {
        const [, categoriaId] = params;
        return [{ count: String(productosPorCategoria.get(categoriaId) ?? 0) }];
      }
      return [];
    }),
    transaction: jest.fn(async (cb: (em: any) => Promise<any>) => {
      const em = {
        query: jest.fn(async (sql: string, params: any[]) => {
          if (sql.includes('UPDATE productos SET "categoriaId"')) {
            const [destino, , origen] = params;
            const n = productosPorCategoria.get(origen) ?? 0;
            productosPorCategoria.set(destino, (productosPorCategoria.get(destino) ?? 0) + n);
            productosPorCategoria.set(origen, 0);
            return [[], n];
          }
          if (sql.includes('UPDATE categorias_productos SET "categoriaPadreId"')) {
            const [destino, empresaId, origen] = params;
            const hijos = filas.filter(f => f.empresaId === empresaId && f.categoriaPadreId === origen);
            hijos.forEach(h => { h.categoriaPadreId = destino; });
            return [[], hijos.length];
          }
          return [[], 0];
        }),
        getRepository: jest.fn(() => ({
          update: jest.fn(async (where: any, patch: any) => {
            const fila = filas.find(f => f.id === where.id && f.empresaId === where.empresaId);
            if (fila) Object.assign(fila, patch);
          }),
        })),
      };
      return cb(em);
    }),
  };

  const tenantSvc = { getEmpresaId: () => EMPRESA };
  const svc = new CategoriasProductoService(repo as any, dataSource as any, tenantSvc as any);
  return { svc, repo, dataSource, filas, productosPorCategoria };
}

describe('CategoriasProductoService', () => {
  describe('crear', () => {
    it('crea una categoría nueva', async () => {
      const { svc, filas } = buildService();
      const c = await svc.crear({ nombre: 'Lácteos' });
      expect(c.nombre).toBe('Lácteos');
      expect(c.empresaId).toBe(EMPRESA);
      expect(filas).toHaveLength(1);
    });

    it('nombre duplicado (exacto) rechazado', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Bebidas', isActive: true, categoriaPadreId: null },
      ]);
      await expect(svc.crear({ nombre: 'Bebidas' })).rejects.toThrow(ConflictException);
    });

    it('nombre duplicado por mayúsculas/acentos/espacios también se rechaza', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Electrónicos', isActive: true, categoriaPadreId: null },
      ]);
      await expect(svc.crear({ nombre: '  electronicos  ' })).rejects.toThrow(ConflictException);
    });

    it('un nombre reutilizado de una categoría YA INACTIVA sí se permite', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Temporada', isActive: false, categoriaPadreId: null },
      ]);
      await expect(svc.crear({ nombre: 'Temporada' })).resolves.toMatchObject({ nombre: 'Temporada' });
    });

    it('subcategoría: el padre no puede tener padre propio (un solo nivel)', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Ropa', isActive: true, categoriaPadreId: null },
        { id: 2, empresaId: EMPRESA, nombre: 'Camisas', isActive: true, categoriaPadreId: 1 },
      ]);
      await expect(svc.crear({ nombre: 'Camisas manga corta', categoriaPadreId: 2 }))
        .rejects.toThrow(BadRequestException);
    });

    it('subcategoría válida: "Padre › Hija" en listar()', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Ropa', isActive: true, categoriaPadreId: null },
      ]);
      await svc.crear({ nombre: 'Camisas', categoriaPadreId: 1 });
      const lista = await svc.listar();
      const camisas = lista.find(c => c.nombre === 'Camisas');
      expect(camisas?.ruta).toBe('Ropa › Camisas');
    });
  });

  describe('actualizar', () => {
    it('categoría #no-existe: NotFoundException', async () => {
      const { svc } = buildService();
      await expect(svc.actualizar(99, { nombre: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('no puede ser su propio padre', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Ropa', isActive: true, categoriaPadreId: null },
      ]);
      await expect(svc.actualizar(1, { categoriaPadreId: 1 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('desactivar — "no se borra: se desactiva", con o sin productos', () => {
    it('categoría SIN productos: se desactiva igual', async () => {
      const { svc, filas } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Juguetes', isActive: true, categoriaPadreId: null },
      ]);
      const { categoria, productosAfectados } = await svc.desactivar(1);
      expect(categoria.isActive).toBe(false);
      expect(productosAfectados).toBe(0);
      expect(filas[0].isActive).toBe(false);
    });

    it('categoría CON productos: se desactiva de todas formas y avisa cuántos quedan afectados', async () => {
      const { svc, productosPorCategoria } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Herramientas', isActive: true, categoriaPadreId: null },
      ]);
      productosPorCategoria.set(1, 12);
      const { categoria, productosAfectados } = await svc.desactivar(1);
      expect(categoria.isActive).toBe(false);
      expect(productosAfectados).toBe(12);
    });
  });

  describe('fusionar', () => {
    it('reasigna productos y desactiva el origen', async () => {
      const { svc, filas, productosPorCategoria } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Herramientas', isActive: true, categoriaPadreId: null },
        { id: 2, empresaId: EMPRESA, nombre: 'herramientas ', isActive: true, categoriaPadreId: null },
      ]);
      productosPorCategoria.set(2, 7);

      const r = await svc.fusionar(2, 1);
      expect(r.productosReasignados).toBe(7);
      expect(filas.find(f => f.id === 2)!.isActive).toBe(false);
      expect(productosPorCategoria.get(1)).toBe(7);
    });

    it('reasigna subcategorías del origen al destino', async () => {
      const { svc, filas } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Bebidas', isActive: true, categoriaPadreId: null },
        { id: 2, empresaId: EMPRESA, nombre: 'Refrescos', isActive: true, categoriaPadreId: null },
        { id: 3, empresaId: EMPRESA, nombre: 'Gaseosas', isActive: true, categoriaPadreId: 2 },
      ]);
      const r = await svc.fusionar(2, 1);
      expect(r.subcategoriasReasignadas).toBe(1);
      expect(filas.find(f => f.id === 3)!.categoriaPadreId).toBe(1);
    });

    it('no se puede fusionar consigo misma', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Bebidas', isActive: true, categoriaPadreId: null },
      ]);
      await expect(svc.fusionar(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('no se puede fusionar hacia una categoría inactiva', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Bebidas', isActive: false, categoriaPadreId: null },
        { id: 2, empresaId: EMPRESA, nombre: 'Refrescos', isActive: true, categoriaPadreId: null },
      ]);
      await expect(svc.fusionar(2, 1)).rejects.toThrow(BadRequestException);
    });

    it('bloquea la fusión si dejaría dos niveles de subcategoría', async () => {
      const { svc } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Ropa', isActive: true, categoriaPadreId: null },
        { id: 2, empresaId: EMPRESA, nombre: 'Camisas', isActive: true, categoriaPadreId: 1 }, // destino: ya es subcategoría
        { id: 3, empresaId: EMPRESA, nombre: 'Blusas', isActive: true, categoriaPadreId: null },
        { id: 4, empresaId: EMPRESA, nombre: 'Blusas formales', isActive: true, categoriaPadreId: 3 }, // origen TIENE hijos
      ]);
      await expect(svc.fusionar(3, 2)).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolverOCrearPorNombre — usado por la importación de CSV', () => {
    it('nombre existente (insensible a mayúsculas/acentos): lo reutiliza, no crea otra', async () => {
      const { svc, filas } = buildService([
        { id: 1, empresaId: EMPRESA, nombre: 'Lácteos', isActive: true, categoriaPadreId: null },
      ]);
      const c = await svc.resolverOCrearPorNombre('lacteos', false);
      expect(c.id).toBe(1);
      expect(filas).toHaveLength(1);
    });

    it('nombre nuevo + puedeCrear=true: lo crea', async () => {
      const { svc, filas } = buildService();
      const c = await svc.resolverOCrearPorNombre('Congelados', true);
      expect(c.nombre).toBe('Congelados');
      expect(filas).toHaveLength(1);
    });

    it('nombre nuevo + puedeCrear=false (VENDEDOR importando): error claro, no crea nada', async () => {
      const { svc, filas } = buildService();
      await expect(svc.resolverOCrearPorNombre('Congelados', false)).rejects.toThrow(BadRequestException);
      expect(filas).toHaveLength(0);
    });
  });
});
