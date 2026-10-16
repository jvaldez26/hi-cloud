/**
 * Formulario único de producto (2026-10-16) — Inventario, POS, Compras
 * (modo rápido) y Xlink (modo rápido) crean/editan productos con el MISMO
 * componente de frontend (ProductoFormModal), que llama al MISMO endpoint
 * (POST/PATCH /productos) con el MISMO CreateProductoDto/UpdateProductoDto.
 * Esta suite cubre:
 *
 *   1. Contrato: el payload exacto que cada uno de los 4 entry points envía
 *      valida contra CreateProductoDto sin errores.
 *   2. VENDEDOR nunca ve ni edita costo/precio2/precio3 — el backend los
 *      ignora en silencio si llegan en el payload de ese rol, sin importar
 *      qué haya mostrado el frontend.
 *   3. Código de barras duplicado se rechaza igual en create() y update(),
 *      con el mismo criterio (scoped a empresa, isActive) que codigo/nombre.
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConflictException } from '@nestjs/common';
import { CreateProductoDto } from './dto/create-producto.dto';
import { ProductosService } from './productos.service';

function makeService(opts: { rol: string; cuentas?: any[] }) {
  const productoRepository: any = {
    findOne: jest.fn().mockResolvedValue(null), // sin duplicados por defecto
    create:  jest.fn((data: any) => data),
    save:    jest.fn(async (data: any) => ({ id: 1, codigo: 'X-1', ...data })),
    update:  jest.fn().mockResolvedValue({}),
    manager: { query: jest.fn().mockResolvedValue([]) },
    createQueryBuilder: jest.fn(() => ({
      where: function () { return this; },
      andWhere: function () { return this; },
      getOne: jest.fn().mockResolvedValue(null), // sin duplicado de nombre por defecto
    })),
  };
  const svc: any = Object.create(ProductosService.prototype);
  svc.logger            = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  svc.productoRepository = productoRepository;
  svc.tenantService = {
    getEmpresaId: () => 53,
    getAlmacenId: () => undefined,
    getUserId:    () => 78,
    getRolEmpresa: () => opts.rol,
  };
  svc.limitesService = { verificarLimiteProductos: jest.fn().mockResolvedValue(undefined) };
  svc.movimientoRepository = { save: jest.fn().mockResolvedValue({}) };
  svc.valoracionService = { actualizarCostoPromedio: jest.fn().mockResolvedValue(undefined) };
  svc.realtimeService = { notify: jest.fn() };
  return { svc: svc as ProductosService, productoRepository };
}

describe('Contrato — payload de los 4 entry points valida contra CreateProductoDto', () => {
  const casos: Record<string, Record<string, unknown>> = {
    'Inventario (modo completo)': {
      tipo: 'producto', nombre: 'Aceite Motor 5W30 1L', codigo: 'ACE-001', codigoBarras: '7501234567890',
      precio: 450, precio2: 420, precio3: 400, costo: 300, porcentajeIva: 18, unidadMedida: 'PZA',
      stock: 10, stockMinimo: 2, categoria: 'Lubricantes', referencia: 'REF-1', marca: 'Castrol', modelo: '5W30',
      almacenId: 4, proveedorId: 9, codigoProveedor: 'PROV-55', esPesable: false,
    },
    'POS (modo completo, mismo payload que Inventario)': {
      tipo: 'producto', nombre: 'Refresco Cola 2L', codigoBarras: '7501112223334',
      precio: 120, porcentajeIva: 18, unidadMedida: 'PZA', stock: 24, stockMinimo: 6, categoria: 'Bebidas',
    },
    'Compras (modo rápido)': {
      tipo: 'producto', nombre: 'Filtro de aceite genérico', codigoBarras: '7509998887776',
      precio: 180, costo: 120, porcentajeIva: 18, unidadMedida: 'PZA', categoria: 'Filtros',
      proveedorId: 9, esCreacionRapida: true,
    },
    'Xlink (modo rápido, sin proveedor)': {
      tipo: 'producto', nombre: 'Correa de distribución', precio: 950, porcentajeIva: 16,
      unidadMedida: 'UND', esCreacionRapida: true,
    },
  };

  for (const [nombre, payload] of Object.entries(casos)) {
    it(`${nombre}: valida sin errores`, async () => {
      const dto = plainToInstance(CreateProductoDto, payload);
      const errores = await validate(dto);
      expect(errores).toEqual([]);
    });
  }
});

describe('ProductosService — VENDEDOR nunca ve ni edita costo/precio2/precio3', () => {
  it('create(): VENDEDOR manda costo/precio2/precio3 — el backend los ignora', async () => {
    const { svc, productoRepository } = makeService({ rol: 'vendedor' });
    const dto: any = { tipo: 'producto', nombre: 'Prod A', precio: 100, costo: 60, precio2: 90, precio3: 80 };

    await svc.create(dto);

    const creado = productoRepository.create.mock.calls[0][0];
    expect(creado.costo).toBeUndefined();
    expect(creado.precio2).toBeUndefined();
    expect(creado.precio3).toBeUndefined();
    expect(creado.precio).toBe(100); // el precio de venta normal SÍ lo puede fijar
  });

  it('create(): ADMIN sí puede fijar costo/precio2/precio3', async () => {
    const { svc, productoRepository } = makeService({ rol: 'admin' });
    const dto: any = { tipo: 'producto', nombre: 'Prod B', precio: 100, costo: 60, precio2: 90, precio3: 80 };

    await svc.create(dto);

    const creado = productoRepository.create.mock.calls[0][0];
    expect(creado.costo).toBe(60);
    expect(creado.precio2).toBe(90);
    expect(creado.precio3).toBe(80);
  });

  it('update(): VENDEDOR manda costo — el backend lo ignora (no sobrescribe el valor existente)', async () => {
    const { svc, productoRepository } = makeService({ rol: 'vendedor' });
    // findOne() se llama dos veces en update(): al leer el producto existente
    // y al devolver el resultado final — ambas deben resolver la misma fila.
    productoRepository.findOne.mockResolvedValue({ id: 5, empresaId: 53, nombre: 'Prod C', codigo: 'X', costo: 60 });
    const dto: any = { costo: 999, precio2: 999, precio3: 999, nombre: 'Prod C editado' };

    await svc.update(5, dto);

    const [, actualizado] = productoRepository.update.mock.calls.find(([id]: any[]) => id === 5) ?? [];
    expect(actualizado.costo).toBeUndefined();
    expect(actualizado.precio2).toBeUndefined();
    expect(actualizado.precio3).toBeUndefined();
  });
});

describe('ProductosService — código de barras duplicado se rechaza', () => {
  it('create(): código de barras ya usado por otro producto de la misma empresa → ConflictException', async () => {
    const { svc, productoRepository } = makeService({ rol: 'admin' });
    productoRepository.findOne.mockImplementation(({ where }: any) =>
      where?.codigoBarras === '7501234567890' ? Promise.resolve({ id: 99 }) : Promise.resolve(null),
    );
    const dto: any = { tipo: 'producto', nombre: 'Prod D', precio: 100, codigoBarras: '7501234567890' };

    await expect(svc.create(dto)).rejects.toThrow(ConflictException);
    await expect(svc.create(dto)).rejects.toThrow(/código de barras/);
  });

  it('update(): código de barras ya usado por OTRO producto → ConflictException', async () => {
    const { svc, productoRepository } = makeService({ rol: 'admin' });
    productoRepository.findOne.mockImplementation(({ where }: any) => {
      if (where?.id === 7) return Promise.resolve({ id: 7, empresaId: 53, nombre: 'Prod E', codigo: 'E-1', codigoBarras: '111' });
      if (where?.codigoBarras === '222') return Promise.resolve({ id: 8 }); // otro producto ya lo tiene
      return Promise.resolve(null);
    });

    await expect(svc.update(7, { codigoBarras: '222' } as any)).rejects.toThrow(ConflictException);
  });

  it('update(): mismo código de barras que ya tenía ese producto → no revienta (no es un duplicado real)', async () => {
    const { svc, productoRepository } = makeService({ rol: 'admin' });
    productoRepository.findOne.mockImplementation(({ where }: any) => {
      if (where?.id === 7) return Promise.resolve({ id: 7, empresaId: 53, nombre: 'Prod F', codigo: 'F-1', codigoBarras: '111' });
      return Promise.resolve(null);
    });

    await expect(svc.update(7, { codigoBarras: '111', nombre: 'Prod F' } as any)).resolves.toBeDefined();
  });
});
