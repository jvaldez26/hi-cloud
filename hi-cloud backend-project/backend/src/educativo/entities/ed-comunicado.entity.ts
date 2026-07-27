import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_comunicados')
export class EdComunicado {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 300 }) titulo!: string;
  @Column({ type: 'text' }) contenido!: string;
  @Column({ length: 30, nullable: true }) tipo?: string;
  @Column({ length: 30, nullable: true }) destinatarioTipo?: string;
  @Column({ nullable: true }) gradoId?: number;
  @Column({ nullable: true }) seccionId?: number;
  @Column({ type: 'timestamp', default: () => 'NOW()' }) fechaEnvio!: Date;
  @Column({ default: false }) enviarWhatsapp!: boolean;
  @Column({ default: false }) enviarEmail!: boolean;
  @Column({ length: 200, nullable: true }) creadoPor?: string;
  @CreateDateColumn() createdAt!: Date;
}
