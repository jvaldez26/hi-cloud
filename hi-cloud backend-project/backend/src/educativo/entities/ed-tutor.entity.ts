import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ed_tutores')
export class EdTutor {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column({ length: 200 }) nombres!: string;
  @Column({ length: 200, nullable: true }) apellidos?: string;
  @Column({ length: 20, nullable: true }) cedula?: string;
  @Column({ length: 50, nullable: true }) parentesco?: string;
  @Column({ length: 20, nullable: true }) telefono?: string;
  @Column({ length: 20, nullable: true }) telefonoTrabajo?: string;
  @Column({ length: 100, nullable: true }) email?: string;
  @Column({ type: 'text', nullable: true }) direccion?: string;
  @Column({ length: 100, nullable: true }) ocupacion?: string;
  @Column({ length: 200, nullable: true }) lugarTrabajo?: string;
  @Column({ default: false }) esResponsablePago!: boolean;
  @Column({ length: 100, nullable: true }) usuarioPortal?: string;
  @Column({ nullable: true }) clienteId?: number;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}
