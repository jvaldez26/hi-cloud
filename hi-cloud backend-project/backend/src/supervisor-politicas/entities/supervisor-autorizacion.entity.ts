import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Autorización de un solo uso para políticas en modo 'cada_vez' — a
 * diferencia de la sesión de 8h (pos_supervisor_log), este token vale para
 * UNA sola llamada, ligado a empresa+cajero+clave, y expira a los pocos
 * minutos aunque nadie lo use.
 */
@Entity('supervisor_autorizaciones')
@Index(['empresaId', 'cajeroId', 'clave'])
export class SupervisorAutorizacion {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  empresaId!: number;

  @Column()
  cajeroId!: number;

  @Column()
  supervisorId!: number;

  @Column({ length: 60 })
  clave!: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  token!: string;

  @Column({ default: false })
  usado!: boolean;

  @Column({ type: 'timestamptz' })
  expiraEn!: Date;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;

  /**
   * Id de la fila de `pos_supervisor_log` de la MISMA autorización (ambas se
   * insertan en la misma llamada a `finalizarAutorizacionSupervisor()`, ver
   * auth.service.ts) — sin esto, el reporte de Modo Supervisor
   * (`listarSupervisorLog`) no puede encontrar las facturas autorizadas en
   * modo 'cada_vez': solo buscaba por `facturas.supervisorSessionId`, que
   * ese modo nunca llena (usa `supervisorToken` en su lugar). Caso real
   * (2026-10-14): dos ventas a crédito de Bellamar, autorizadas por
   * Beatriz, nunca aparecían en "Transacciones".
   */
  @Column({ type: 'int', nullable: true })
  posSupervisorLogId?: number | null;

  /** 'presencial' (clave/tarjeta en la caja) o 'remoto' (ADMIN/CONTADOR
   *  aprobó desde otro dispositivo vía solicitudes_autorizacion_remota) —
   *  distingue el tag "Remota" en el reporte de Modo Supervisor. */
  @Column({ type: 'varchar', length: 20, default: 'presencial' })
  origen!: 'presencial' | 'remoto';

  /**
   * Huella de la acción exacta que se autorizó — solo la llena una
   * autorización remota con ese dato disponible al pedirla (ver
   * AutorizacionRemotaService.crear). NULL = sin huella, no se valida ese
   * campo. Si el cajero cambia el carrito (monto/cliente/factura) después de
   * pedir la autorización, el valor real al consumir el token ya no
   * coincide y el guard rechaza — ver huella-autorizacion-remota.util.ts.
   */
  @Column({ type: 'int', nullable: true })
  facturaId?: number | null;

  @Column({ type: 'int', nullable: true })
  clienteId?: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  monto?: number | null;

  /** Solicitud de autorización remota que originó este token (NULL si es presencial). */
  @Column({ type: 'int', nullable: true })
  solicitudRemotaId?: number | null;
}
