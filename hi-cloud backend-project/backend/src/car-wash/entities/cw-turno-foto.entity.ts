import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/** Mismo patrón que SoporteTicketAdjunto: solo se guarda la key de S3 (nunca
 *  la URL); las URLs se firman on-demand. */
@Entity('cw_turno_fotos')
export class CwTurnoFoto {
  @PrimaryGeneratedColumn() id!: number;
  @Column() empresaId!: number;
  @Column() turnoId!: number;

  @Column({ type: 'text' }) ruta!: string;
  @Column({ length: 50 }) tipoMime!: string;
  @Column() tamanioBytes!: number;

  @CreateDateColumn() createdAt!: Date;
}
