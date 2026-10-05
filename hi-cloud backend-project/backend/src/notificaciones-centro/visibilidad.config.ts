import { UserRole } from '../users/enums/user-role.enum';

/**
 * Quién ve qué, y en qué orden — ÚNICA fuente para el centro de
 * notificaciones unificado (eventos de notificaciones_enviadas + alertas de
 * AlertasSistemaService). Pedido explícito: "un VENDEDOR no debe ver
 * descuadres de caja de otros ni alertas contables".
 *
 * Prioridad (menor = primero): 0 eventos críticos de seguridad/caja/fiscal,
 * 1 Xlink y otros eventos de negocio, 2 alertas de estado (umbrales).
 */
export interface VisibilidadTipo {
  roles:     UserRole[];
  prioridad: 0 | 1 | 2;
  /** Etiqueta legible — usada solo como respaldo si el emisor no trae label propio. */
  label:     string;
}

const ADMIN_CONT: UserRole[] = [UserRole.ADMIN, UserRole.CONTADOR];
const ADMIN_CONT_VEND: UserRole[] = [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR];
const SOLO_ADMIN: UserRole[] = [UserRole.ADMIN];

/**
 * Eventos (notificaciones_enviadas.tipo). Las claves son los valores reales
 * del enum TipoNotificacion (snake_case) — así no hace falta traducir ida y
 * vuelta entre el backend y este mapa.
 */
export const VISIBILIDAD_EVENTOS: Record<string, VisibilidadTipo> = {
  posible_acceso_no_autorizado: { roles: SOLO_ADMIN,       prioridad: 0, label: 'Posible acceso no autorizado' },
  login_bloqueado:               { roles: [UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER, UserRole.EMPLEADO], prioridad: 0, label: 'Cuenta bloqueada' },
  supervisor_bloqueado:          { roles: ADMIN_CONT_VEND, prioridad: 0, label: 'Supervisor bloqueado' },
  caja_huerfana:                 { roles: ADMIN_CONT,      prioridad: 0, label: 'Caja abierta de un día anterior' },
  ecf_revision_manual:           { roles: ADMIN_CONT,      prioridad: 0, label: 'e-CF en revisión manual' },
  xlink_documento_recibido:      { roles: ADMIN_CONT,      prioridad: 1, label: 'Documento recibido por Xlink' },
  manual:                        { roles: ADMIN_CONT,      prioridad: 1, label: 'Aviso' },
  // Definidos en el enum pero sin emisor activo hoy — se dejan mapeados para
  // que, el día que alguien los dispare, ya tengan visibilidad definida.
  cxc_vencida:        { roles: ADMIN_CONT, prioridad: 2, label: 'Cuenta por cobrar vencida' },
  cxc_por_vencer:     { roles: ADMIN_CONT, prioridad: 2, label: 'Cuenta por cobrar por vencer' },
  cxp_vencida:        { roles: ADMIN_CONT, prioridad: 2, label: 'Cuenta por pagar vencida' },
  cxp_por_vencer:     { roles: ADMIN_CONT, prioridad: 2, label: 'Cuenta por pagar por vencer' },
  stock_bajo:         { roles: ADMIN_CONT_VEND, prioridad: 2, label: 'Stock bajo' },
  ecf_secuencia_vence:{ roles: ADMIN_CONT, prioridad: 2, label: 'Secuencia e-CF por vencer' },
  ecf_cuota_80:       { roles: SOLO_ADMIN, prioridad: 2, label: 'Cuota de e-CF al 80%' },
  ecf_cuota_excedida: { roles: SOLO_ADMIN, prioridad: 2, label: 'Cuota de e-CF excedida' },
  nomina_pendiente:   { roles: ADMIN_CONT, prioridad: 2, label: 'Nómina pendiente' },
};

/**
 * Alertas de estado (AlertasSistemaService) — las claves son el campo `id`
 * de cada Alerta (ej. 'stock-bajo', 'cierre-descuadre').
 */
export const VISIBILIDAD_ALERTAS: Record<string, VisibilidadTipo> = {
  'cxc-vencidas':             { roles: ADMIN_CONT,      prioridad: 2, label: 'Cuentas por cobrar vencidas' },
  'stock-bajo':               { roles: ADMIN_CONT_VEND, prioridad: 2, label: 'Productos con stock bajo' },
  'cxp-proximas':             { roles: ADMIN_CONT,      prioridad: 2, label: 'Pagos a proveedores próximos' },
  'contratos-vence':          { roles: ADMIN_CONT,      prioridad: 2, label: 'Contratos por vencer' },
  'flota-documentos':         { roles: ADMIN_CONT,      prioridad: 2, label: 'Documentos de flota por vencer' },
  'facturas-borrador':        { roles: ADMIN_CONT_VEND, prioridad: 2, label: 'Facturas en borrador antiguas' },
  'comprador-sin-vincular':   { roles: ADMIN_CONT_VEND, prioridad: 2, label: 'Ventas sin vincular a cliente' },
  'credito-excedido':         { roles: ADMIN_CONT,      prioridad: 2, label: 'Clientes con crédito excedido' },
  'periodos-abiertos':        { roles: ADMIN_CONT,      prioridad: 2, label: 'Períodos contables sin cerrar' },
  'recurrentes-pendientes':   { roles: ADMIN_CONT,      prioridad: 2, label: 'Facturas recurrentes pendientes' },
  'ecf-rechazados':           { roles: ADMIN_CONT,      prioridad: 2, label: 'Comprobantes rechazados por DGII' },
  'ecf-atascados':            { roles: ADMIN_CONT,      prioridad: 2, label: 'Comprobantes sin enviar a DGII' },
  'secuencias-ecf-vencen':    { roles: ADMIN_CONT,      prioridad: 2, label: 'Secuencias e-CF por agotarse' },
  // El propio ejemplo del usuario: NUNCA vendedor.
  'cierre-descuadre':         { roles: ADMIN_CONT,      prioridad: 2, label: 'Descuadre de caja' },
};

export function puedeVerEvento(tipo: string, rol: string): boolean {
  const v = VISIBILIDAD_EVENTOS[tipo];
  if (!v) return false; // tipo desconocido → oculto (nunca mostrar algo sin clasificar)
  return (v.roles as string[]).includes(rol);
}

export function puedeVerAlerta(id: string, rol: string): boolean {
  const v = VISIBILIDAD_ALERTAS[id];
  if (!v) return false;
  return (v.roles as string[]).includes(rol);
}

export function prioridadEvento(tipo: string): number {
  return VISIBILIDAD_EVENTOS[tipo]?.prioridad ?? 2;
}

export function prioridadAlerta(id: string): number {
  return VISIBILIDAD_ALERTAS[id]?.prioridad ?? 2;
}
