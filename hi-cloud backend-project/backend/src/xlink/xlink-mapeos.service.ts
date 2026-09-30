import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { ProductosService } from '../productos/productos.service';
import { XlinkMapeoTipo } from './entities/xlink-mapeo.entity';
import { GuardarMapeosXlinkDto } from './dto/guardar-mapeos-xlink.dto';

/**
 * Resolución y persistencia de mapeos por contraparte (Fase 4).
 *
 * Solo 'producto' tiene resolución real hoy: es el único de los 5 tipos
 * con un catálogo interno por empresa (Producto) al que un código externo
 * (SKU) necesita traducirse. 'unidad'/'impuesto'/'termino_pago'/'retencion'
 * quedan soportados en el esquema (por si algún día hace falta un catálogo
 * propio para ellos) pero hoy pasan directo desde el snapshot sin
 * necesitar traducción — no generan faltantes.
 */
@Injectable()
export class XlinkMapeosService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    private tenantService: TenantService,
    private productosService: ProductosService,
  ) {}

  /** Clave estable para una línea sin SKU — determinística por nombre, para que la misma "línea sin código" siempre resuelva igual. */
  claveExterna(sku: string | null, nombre: string): string {
    return sku ?? `__sin_sku__:${nombre}`;
  }

  /**
   * Resuelve un productoId para (contraparte, sku/nombre):
   * 1. Mapeo ya guardado.
   * 2. Si `intentarAutoMatch`, busca por producto_proveedor.codigoProveedor.
   * 3. Si el auto-match resolvió, lo guarda como mapeo para la próxima vez.
   * Devuelve null si no se pudo resolver por ningún camino (falta).
   */
  async resolverProducto(
    manager: EntityManager,
    contraparteXlinkId: string,
    proveedorId: number | null,
    intentarAutoMatch: boolean,
    sku: string | null,
    nombre: string,
  ): Promise<number | null> {
    const empresaId = this.tenantService.getEmpresaId();
    const valorExterno = this.claveExterna(sku, nombre);

    const [existente] = await manager.query(
      `SELECT "valorInternoId" FROM xlink_mapeos
       WHERE "empresaId" = $1 AND "contraparteXlinkId" = $2 AND tipo = 'producto' AND "valorExterno" = $3
         AND "isActive" = true
       LIMIT 1`,
      [empresaId, contraparteXlinkId, valorExterno],
    );
    if (existente) return existente.valorInternoId;

    if (intentarAutoMatch && sku && proveedorId) {
      const [autoMatch] = await manager.query(
        `SELECT "productoId" FROM producto_proveedor
         WHERE "empresaId" = $1 AND "proveedorId" = $2 AND "codigoProveedor" = $3 AND "isActive" = true
         LIMIT 1`,
        [empresaId, proveedorId, sku],
      );
      if (autoMatch) {
        await manager.query(
          `INSERT INTO xlink_mapeos ("empresaId", "contraparteXlinkId", tipo, "valorExterno", "valorInternoId")
           VALUES ($1, $2, 'producto', $3, $4)
           ON CONFLICT ("empresaId", "contraparteXlinkId", tipo, "valorExterno") DO NOTHING`,
          [empresaId, contraparteXlinkId, valorExterno, autoMatch.productoId],
        );
        return autoMatch.productoId;
      }
    }

    return null;
  }

  /**
   * Guarda mapeos elegidos/creados desde el modal de homologación. Para
   * 'producto' + `crearProducto`, crea el Producto primero y guarda el
   * mapeo con su id resultante. Upsert: si ya existía el mapeo para esa
   * (contraparte, tipo, valorExterno), lo reemplaza — el usuario está
   * corrigiendo una elección anterior a propósito.
   */
  async guardarMapeos(dto: GuardarMapeosXlinkDto): Promise<void> {
    const empresaId = this.tenantService.getEmpresaId();

    for (const m of dto.mapeos) {
      let valorInternoId = m.valorInternoId;

      if (m.tipo === XlinkMapeoTipo.PRODUCTO && m.crearProducto) {
        const producto = await this.productosService.create({
          nombre: m.crearProducto.nombre,
          unidadMedida: m.crearProducto.unidadMedida,
          porcentajeIva: m.crearProducto.porcentajeIva,
        } as any);
        valorInternoId = (producto as any).id;
      }

      if (!valorInternoId) continue; // nada que guardar sin id resuelto

      await this.ds.query(
        `INSERT INTO xlink_mapeos ("empresaId", "contraparteXlinkId", tipo, "valorExterno", "valorInternoId")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("empresaId", "contraparteXlinkId", tipo, "valorExterno")
         DO UPDATE SET "valorInternoId" = EXCLUDED."valorInternoId", "isActive" = true, "updatedAt" = now()`,
        [empresaId, dto.contraparteXlinkId, m.tipo, m.valorExterno, valorInternoId],
      );
    }
  }
}
