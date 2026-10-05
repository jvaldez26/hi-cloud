import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { AlertasSistemaService } from '../alertas-sistema/alertas-sistema.service';
import { NotificacionEnviada } from '../notificaciones/entities/notificacion-enviada.entity';
import { AlertaVista } from './entities/alerta-vista.entity';
import { User } from '../users/users.entity';
import {
  VISIBILIDAD_EVENTOS, VISIBILIDAD_ALERTAS,
  puedeVerEvento, puedeVerAlerta, prioridadEvento, prioridadAlerta,
} from './visibilidad.config';

export interface ItemCentro {
  id:          string;        // 'evento-123' | 'alerta-stock-bajo'
  origen:      'evento' | 'alerta';
  tipo:        string;
  prioridad:   number;
  titulo:      string;
  descripcion: string;
  ruta:        string;
  emoji:       string;
  fecha:       string;
  atendido:    boolean;       // leído (evento) o visto-sin-cambios (alerta) — no cuenta en el badge
  cantidad?:   number;
  monto?:      number;
}

const EVENTOS_LIMITE = 100;

@Injectable()
export class NotificacionesCentroService {
  constructor(
    @InjectRepository(NotificacionEnviada) private readonly eventoRepo: Repository<NotificacionEnviada>,
    @InjectRepository(AlertaVista) private readonly vistaRepo: Repository<AlertaVista>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly tenantSvc: TenantService,
    private readonly alertasSvc: AlertasSistemaService,
  ) {}

  /** "huella" barata del estado actual de una alerta — tipo + conteo, tal
   *  como lo pidió el usuario; si cualquiera cambia, la alerta vuelve a
   *  contar sin que nadie tenga que tocar nada. */
  private huellaAlerta(a: { cantidad?: number; monto?: number }): string {
    return `${a.cantidad ?? 0}:${a.monto ?? 0}`;
  }

  async obtener(opts: { soloNoAtendidas?: boolean } = {}): Promise<{
    items: ItemCentro[]; noLeidos: number; noVistas: number; total: number;
  }> {
    const eid = this.tenantSvc.getEmpresaId();
    const userId = this.tenantSvc.getUserId();
    const rol = this.tenantSvc.getRolEmpresa() ?? 'viewer';
    if (!userId) throw new ForbiddenException('Se requiere sesión de usuario');

    const [eventos, alertasRes, vistas, usuario] = await Promise.all([
      this.eventoRepo.find({
        where: [{ userId, empresaId: eid }, { userId, empresaId: IsNull() }],
        order: { createdAt: 'DESC' },
        take: EVENTOS_LIMITE,
      }),
      this.alertasSvc.getAlertas(),
      this.vistaRepo.find({ where: { empresaId: eid, userId } }),
      this.userRepo.findOne({ where: { id: userId }, select: ['id', 'preferenciasNotificaciones'] }),
    ]);
    // Por usuario: solo una desactivación EXPLÍCITA (false) oculta un tipo —
    // ausente en el mapa = encendido por defecto.
    const prefs = usuario?.preferenciasNotificaciones ?? {};

    const vistaPorTipo = new Map(vistas.map(v => [v.tipo, v]));
    const ahora = Date.now();

    const itemsEventos: ItemCentro[] = eventos
      .filter(e => puedeVerEvento(e.tipo, rol) && prefs[e.tipo] !== false)
      .map(e => ({
        id: `evento-${e.id}`, origen: 'evento', tipo: e.tipo,
        prioridad: prioridadEvento(e.tipo),
        titulo: e.asunto, descripcion: e.mensaje,
        ruta: this.rutaEvento(e.tipo, e.referencia),
        emoji: this.emojiEvento(e.tipo),
        fecha: e.createdAt.toISOString(),
        atendido: e.leido,
      }));

    const itemsAlertas: ItemCentro[] = alertasRes.alertas
      .filter(a => puedeVerAlerta(a.id, rol) && prefs[a.id] !== false)
      .map(a => {
        const vista = vistaPorTipo.get(a.id);
        const huellaActual = this.huellaAlerta(a);
        const snoozeVigente = !!vista?.pospuestoHasta && new Date(vista.pospuestoHasta).getTime() > ahora;
        const mismaHuella = !!vista && vista.huella === huellaActual;
        const atendido = !!vista && mismaHuella && (snoozeVigente || !vista.pospuestoHasta);
        return {
          id: `alerta-${a.id}`, origen: 'alerta', tipo: a.id,
          prioridad: prioridadAlerta(a.id),
          titulo: a.titulo, descripcion: a.descripcion,
          ruta: a.ruta, emoji: a.emoji,
          fecha: new Date().toISOString(),
          atendido,
          cantidad: a.cantidad, monto: a.monto,
        } as ItemCentro;
      });

    let items = [...itemsEventos, ...itemsAlertas].sort((x, y) => {
      if (x.prioridad !== y.prioridad) return x.prioridad - y.prioridad;
      return x.fecha < y.fecha ? 1 : -1; // más reciente primero dentro de la misma prioridad
    });

    const noLeidos = itemsEventos.filter(i => !i.atendido).length;
    const noVistas = itemsAlertas.filter(i => !i.atendido).length;

    if (opts.soloNoAtendidas) items = items.filter(i => !i.atendido);

    return { items, noLeidos, noVistas, total: noLeidos + noVistas };
  }

  /** Solo los contadores — para el badge de la campanita, más liviano que la lista completa. */
  async resumen(): Promise<{ noLeidos: number; noVistas: number; total: number }> {
    const { noLeidos, noVistas, total } = await this.obtener();
    return { noLeidos, noVistas, total };
  }

  async marcarEventoLeido(eventoId: number): Promise<void> {
    const eid = this.tenantSvc.getEmpresaId();
    const userId = this.tenantSvc.getUserId();
    // empresaId NULL (avisos de cuenta) también son del usuario sin importar
    // la empresa activa — el UPDATE de abajo cubre ambos casos a la vez; para
    // el resto, empresaId debe coincidir (nunca marcar el aviso de OTRA empresa).
    await this.eventoRepo
      .createQueryBuilder()
      .update(NotificacionEnviada)
      .set({ leido: true, leidoEn: new Date() })
      .where('id = :eventoId AND "userId" = :userId AND ("empresaId" = :eid OR "empresaId" IS NULL)', { eventoId, userId, eid })
      .execute();
  }

  async marcarTodoLeido(): Promise<number> {
    const eid = this.tenantSvc.getEmpresaId();
    const userId = this.tenantSvc.getUserId();
    const r = await this.eventoRepo
      .createQueryBuilder()
      .update(NotificacionEnviada)
      .set({ leido: true, leidoEn: new Date() })
      .where('"userId" = :userId AND ("empresaId" = :eid OR "empresaId" IS NULL) AND leido = false', { userId, eid })
      .execute();
    return r.affected ?? 0;
  }

  async marcarAlertaVista(tipo: string, posponer = false): Promise<void> {
    const eid = this.tenantSvc.getEmpresaId();
    const userId = this.tenantSvc.getUserId();
    if (!userId) throw new ForbiddenException('Se requiere sesión de usuario');
    if (!VISIBILIDAD_ALERTAS[tipo]) throw new ForbiddenException(`Tipo de alerta desconocido: ${tipo}`);

    const { alertas } = await this.alertasSvc.getAlertas();
    const actual = alertas.find(a => a.id === tipo);
    const huella = actual ? this.huellaAlerta(actual) : '0:0';

    const existente = await this.vistaRepo.findOne({ where: { empresaId: eid, userId, tipo } });
    const pospuestoHasta = posponer ? new Date(Date.now() + 24 * 3_600_000) : undefined;

    if (existente) {
      await this.vistaRepo.update(existente.id, {
        huella, vistoHasta: new Date(), pospuestoHasta,
      });
    } else {
      await this.vistaRepo.save(
        this.vistaRepo.create({ empresaId: eid, userId, tipo, huella, vistoHasta: new Date(), pospuestoHasta }),
      );
    }
  }

  /** Mi Perfil → Notificaciones: todos los tipos que el rol del usuario
   *  puede ver, con su estado actual (encendido salvo que el usuario lo haya
   *  apagado explícitamente). */
  async obtenerPreferencias(): Promise<{ tipo: string; origen: 'evento' | 'alerta'; label: string; activo: boolean }[]> {
    const userId = this.tenantSvc.getUserId();
    const rol = this.tenantSvc.getRolEmpresa() ?? 'viewer';
    if (!userId) throw new ForbiddenException('Se requiere sesión de usuario');

    const usuario = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'preferenciasNotificaciones'] });
    const prefs = usuario?.preferenciasNotificaciones ?? {};

    const eventos = Object.entries(VISIBILIDAD_EVENTOS)
      .filter(([tipo]) => puedeVerEvento(tipo, rol))
      .map(([tipo, v]) => ({ tipo, origen: 'evento' as const, label: v.label, activo: prefs[tipo] !== false }));

    const alertas = Object.entries(VISIBILIDAD_ALERTAS)
      .filter(([id]) => puedeVerAlerta(id, rol))
      .map(([id, v]) => ({ tipo: id, origen: 'alerta' as const, label: v.label, activo: prefs[id] !== false }));

    return [...eventos, ...alertas];
  }

  async guardarPreferencia(tipo: string, activo: boolean): Promise<void> {
    const userId = this.tenantSvc.getUserId();
    if (!userId) throw new ForbiddenException('Se requiere sesión de usuario');
    if (!VISIBILIDAD_EVENTOS[tipo] && !VISIBILIDAD_ALERTAS[tipo]) {
      throw new ForbiddenException(`Tipo de notificación desconocido: ${tipo}`);
    }

    const usuario = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'preferenciasNotificaciones'] });
    const prefs = { ...(usuario?.preferenciasNotificaciones ?? {}) };
    if (activo) delete prefs[tipo]; // encendido = estado por defecto, no hace falta guardarlo
    else prefs[tipo] = false;

    await this.userRepo.update(userId, { preferenciasNotificaciones: prefs });
  }

  private rutaEvento(tipo: string, referencia?: string): string {
    switch (tipo) {
      case 'xlink_documento_recibido': return '/xlink?tab=porProcesar';
      case 'caja_huerfana':            return referencia ? `/caja?cajaId=${referencia}` : '/caja';
      case 'ecf_revision_manual':      return '/ecf';
      case 'login_bloqueado':
      case 'posible_acceso_no_autorizado':
      case 'supervisor_bloqueado':     return '/equipo';
      default:                         return '/notificaciones';
    }
  }

  private emojiEvento(tipo: string): string {
    const mapa: Record<string, string> = {
      posible_acceso_no_autorizado: '🚨', login_bloqueado: '🔒', supervisor_bloqueado: '🔒',
      caja_huerfana: '🏦', ecf_revision_manual: '⏳', xlink_documento_recibido: '🔗', manual: '📌',
    };
    return mapa[tipo] ?? '🔔';
  }
}
