import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

/**
 * Catálogo de categorías de producto — reemplaza el texto libre que tenía
 * `Producto.categoria` (sigue existiendo, de solo lectura, hasta que la
 * migración de datos confirme que todo quedó bien asignado; ver
 * src/migrations/*-CategoriasProductos.ts).
 *
 * Un nivel de subcategorías: `categoriaPadreId` apunta a OTRA fila de esta
 * misma tabla, nunca más de un nivel (no se valida recursividad porque el
 * formulario solo deja elegir un padre sin padre propio — ver
 * categorias-producto.service.ts::validarPadre).
 *
 * El nombre único por empresa (sin distinguir mayúsculas/acentos) se exige
 * en el servicio, no con un índice de expresión en Postgres — los acentos
 * necesitarían la extensión `unaccent`, que no está instalada, y el volumen
 * real (ver dry-run 2026-10-17: como mucho 1-2 categorías por empresa hoy)
 * hace innecesaria esa complejidad.
 */
@TenantScoped()
@Entity('categorias_productos')
@Index(['empresaId', 'isActive'])
export class CategoriaProducto extends TenantBaseEntity {
  @Column({ length: 100 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string | null;

  @ManyToOne(() => CategoriaProducto, { nullable: true })
  @JoinColumn({ name: 'categoriaPadreId' })
  categoriaPadre?: CategoriaProducto | null;

  @Column({ type: 'int', nullable: true })
  categoriaPadreId?: number | null;
}
