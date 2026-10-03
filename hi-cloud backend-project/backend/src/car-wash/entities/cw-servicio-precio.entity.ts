import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import type { TipoVehiculoCw } from './tipos';

@Entity('cw_servicio_precios')
export class CwServicioPrecio {
  @PrimaryGeneratedColumn() id!: number;

  @Column() servicioId!: number;
  @Column({ type: 'varchar', length: 20 }) tipoVehiculo!: TipoVehiculoCw;
  @Column() duracionMinutos!: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) precio!: number;

  /** Tarifa del lavador para este servicio+tipo — prioridad sobre
   *  lavador.valorModoPago cuando el lavador usa modoPago='por_servicio'. */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) tarifaLavador?: number;
}
