import { Entity, Column, Index } from 'typeorm';
import { TenantBaseEntity } from '../../common/entities/tenant-base.entity';
import { TenantScoped } from '../../tenant/decorators/tenant-scoped.decorator';

/** Descriptor de una columna en el archivo de exportación */
export interface ColumnaExportacion {
  campo:  'plu' | 'nombre' | 'precio' | 'iva' | 'categoria' | 'codigo' | 'codigoBarras';
  titulo: string;
  ancho?: number;
}

/**
 * Formato de exportación de catálogo hacia la balanza.
 *
 * El campo `columnas` define qué datos incluir y en qué orden.
 * El campo `limiteNombre` trunca el nombre del producto antes de exportar.
 */
@TenantScoped()
@Entity('balanza_formatos_exportacion')
@Index(['empresaId', 'isActive'])
export class BalanzaFormatoExportacion extends TenantBaseEntity {
  /** Nombre descriptivo: "Formato Mettler Toledo CSV" */
  @Column({ length: 100 })
  nombre!: string;

  /** 'CSV' | 'TXT' | 'XLS' */
  @Column({ length: 20, default: 'CSV' })
  formato!: string;

  /** Separador de columnas (solo relevante para CSV/TXT) */
  @Column({ length: 5, nullable: true })
  separador?: string;

  /** Máximo de caracteres permitidos para el nombre del producto */
  @Column({ type: 'smallint', default: 20, name: 'limiteNombre' })
  limiteNombre!: number;

  /** Codificación del archivo: 'UTF-8' | 'ISO-8859-1' | 'Windows-1252' */
  @Column({ length: 20, default: 'UTF-8' })
  codificacion!: string;

  /** Definición de columnas a exportar (array de ColumnaExportacion) */
  @Column({ type: 'jsonb', default: '[]' })
  columnas!: ColumnaExportacion[];
}
