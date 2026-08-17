import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tabla GLOBAL (sin empresaId) — un video tutorial por módulo del ERP.
 * SuperAdmin gestiona el catálogo; todos los usuarios autenticados pueden leerlo.
 */
@Entity('videos_tutoriales')
export class VideoTutorial {
  @PrimaryGeneratedColumn()
  id: number;

  /** Clave única del módulo — coincide con el path de la ruta React (ej: "clientes", "facturas") */
  @Column({ unique: true })
  modulo: string;

  /** Título legible del video, mostrado en el modal del player */
  @Column()
  titulo: string;

  /** Descripción opcional (breve) del contenido del video */
  @Column({ nullable: true, type: 'text' })
  descripcion: string | null;

  /** Plataforma de hosting del video */
  @Column({ type: 'varchar', length: 20 })
  proveedor: 'youtube' | 'vimeo';

  /** ID del video en la plataforma (no la URL completa) */
  @Column()
  videoId: string;

  /** Duración en segundos — opcional, para mostrar en la UI */
  @Column({ nullable: true, type: 'int' })
  duracionSegundos: number | null;

  /** Orden de presentación en el panel SuperAdmin */
  @Column({ default: 0 })
  orden: number;

  /** Si está inactivo el botón se oculta aunque exista la fila */
  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
