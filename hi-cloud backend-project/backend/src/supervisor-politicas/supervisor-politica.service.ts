import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { SupervisorPolitica, ModoSupervisor } from './entities/supervisor-politica.entity';
import { SupervisorAutorizacion } from './entities/supervisor-autorizacion.entity';
import { CATALOGO_SUPERVISOR, esClaveValida } from './supervisor-catalogo';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';

export interface PoliticaResuelta { requerido: boolean; modo: ModoSupervisor }

const TTL_TOKEN_MS = 3 * 60_000; // 3 minutos — "vida corta" para el modo cada_vez
const TTL_SESION_HORAS = 8;      // misma ventana que pos_supervisor_log hoy

@Injectable()
export class SupervisorPoliticaService {
  constructor(
    @InjectRepository(SupervisorPolitica)
    private readonly politicaRepo: Repository<SupervisorPolitica>,
    @InjectRepository(SupervisorAutorizacion)
    private readonly autorizacionRepo: Repository<SupervisorAutorizacion>,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Catálogo completo + el valor actual de la empresa (fila si existe, default del catálogo si no). */
  async listarPoliticas(empresaId: number) {
    const filas = await this.politicaRepo.find({ where: { empresaId } });
    const porClave = new Map(filas.map(f => [f.clave, f]));
    return CATALOGO_SUPERVISOR.map(item => {
      const fila = porClave.get(item.clave);
      return {
        clave:       item.clave,
        label:       item.label,
        descripcion: item.descripcion,
        grupo:       item.grupo,
        requerido:   fila?.requerido ?? item.defaultRequerido,
        modo:        fila?.modo      ?? item.defaultModo,
      };
    });
  }

  async obtenerPolitica(empresaId: number, clave: string): Promise<PoliticaResuelta> {
    const item = CATALOGO_SUPERVISOR.find(c => c.clave === clave);
    if (!item) return { requerido: false, modo: 'sesion' }; // clave no catalogada → nunca bloquea
    const fila = await this.politicaRepo.findOne({ where: { empresaId, clave } });
    return {
      requerido: fila?.requerido ?? item.defaultRequerido,
      modo:      fila?.modo      ?? item.defaultModo,
    };
  }

  /** Solo ADMIN llega aquí (lo exige el controller) — cada cambio queda auditado. */
  async guardarPoliticas(
    empresaId: number,
    items: { clave: string; requerido: boolean; modo: ModoSupervisor }[],
    actor: { id: number; nombre: string },
  ): Promise<void> {
    for (const it of items) {
      if (!esClaveValida(it.clave)) throw new BadRequestException(`Clave desconocida: ${it.clave}`);
      if (it.modo !== 'sesion' && it.modo !== 'cada_vez') {
        throw new BadRequestException(`Modo inválido para ${it.clave}: ${it.modo}`);
      }
    }

    const existentes = await this.politicaRepo.find({ where: { empresaId } });
    const porClave = new Map(existentes.map(f => [f.clave, f]));

    for (const it of items) {
      const anterior = porClave.get(it.clave);
      const cambio = !anterior || anterior.requerido !== it.requerido || anterior.modo !== it.modo;
      if (!cambio) continue;

      await this.politicaRepo.upsert(
        { empresaId, clave: it.clave, requerido: it.requerido, modo: it.modo, updatedAt: new Date() },
        ['empresaId', 'clave'],
      );

      await this.auditoria.registrar({
        userId: actor.id, userName: actor.nombre, empresaId,
        accion: AccionAuditoria.UPDATE, modulo: 'supervisor-politicas',
        entidad: 'SupervisorPolitica', entidadId: it.clave,
        descripcion: `Política "${it.clave}": requerido ${anterior?.requerido ?? false}→${it.requerido}, modo ${anterior?.modo ?? 'sesion'}→${it.modo}`,
        valorAnterior: anterior ? JSON.stringify({ requerido: anterior.requerido, modo: anterior.modo }) : undefined,
        valorNuevo:    JSON.stringify({ requerido: it.requerido, modo: it.modo }),
        metodo: 'PATCH', ruta: '/configuracion/supervisor-politicas', exitoso: true,
      });
    }
  }

  /** ¿Hay una sesión de supervisor abierta (últimas 8h) para este cajero? — misma consulta que ya usaban
   *  SupervisorGateGuard y facturas.service.ts. */
  private async sesionActiva(empresaId: number, cajeroId: number): Promise<{ id: number } | null> {
    const [row] = await this.dataSource.query<{ id: number }[]>(`
      SELECT act.id
      FROM pos_supervisor_log act
      WHERE act."cajeroId" = $1 AND act."empresaId" = $2 AND act."sessionId" IS NULL
        AND act."createdAt" >= NOW() - INTERVAL '${TTL_SESION_HORAS} hours'
        AND NOT EXISTS (SELECT 1 FROM pos_supervisor_log c WHERE c."sessionId" = act.id)
      ORDER BY act."createdAt" DESC
      LIMIT 1
    `, [cajeroId, empresaId]);
    return row ?? null;
  }

  /** Emite un token de un solo uso (modo cada_vez), tras validar credenciales en AuthService.verificarSupervisor. */
  async emitirAutorizacionCadaVez(
    empresaId: number, cajeroId: number, supervisorId: number, clave: string,
  ): Promise<string> {
    const token = crypto.randomBytes(24).toString('hex');
    await this.autorizacionRepo.save(this.autorizacionRepo.create({
      empresaId, cajeroId, supervisorId, clave, token,
      usado: false, expiraEn: new Date(Date.now() + TTL_TOKEN_MS),
    }));
    return token;
  }

  /** Consume (de un solo uso) un token de autorización — atómico vía UPDATE condicional. */
  private async consumirToken(empresaId: number, cajeroId: number, clave: string, token: string): Promise<boolean> {
    const r = await this.autorizacionRepo
      .createQueryBuilder()
      .update(SupervisorAutorizacion)
      .set({ usado: true })
      .where('token = :token', { token })
      .andWhere('"empresaId" = :empresaId', { empresaId })
      .andWhere('"cajeroId" = :cajeroId', { cajeroId })
      .andWhere('clave = :clave', { clave })
      .andWhere('usado = false')
      .andWhere('"expiraEn" > NOW()')
      .execute();
    return (r.affected ?? 0) > 0;
  }

  /**
   * Punto único de validación — lo usan tanto el guard genérico como
   * facturas.service.ts (venta a crédito, que ya tenía su propio flujo
   * auditado y lo mantiene, solo cambiando de dónde sale "requerido").
   * No hace nada (pasa) si la política no exige la clave.
   */
  async validarAutorizacion(
    empresaId: number, cajeroId: number, clave: string,
    prueba: { sessionId?: number | null; token?: string | null },
  ): Promise<void> {
    const { requerido, modo } = await this.obtenerPolitica(empresaId, clave);
    if (!requerido) return;

    if (modo === 'sesion') {
      if (prueba.sessionId) {
        const sesion = await this.dataSource.query<{ id: number }[]>(`
          SELECT id FROM pos_supervisor_log
          WHERE id = $1 AND "empresaId" = $2 AND "cajeroId" = $3 AND "sessionId" IS NULL
            AND "createdAt" >= NOW() - INTERVAL '${TTL_SESION_HORAS} hours'
          LIMIT 1
        `, [prueba.sessionId, empresaId, cajeroId]);
        if (sesion.length) return;
      }
      const activa = await this.sesionActiva(empresaId, cajeroId);
      if (activa) return;
      throw new ForbiddenException('Esta acción requiere modo supervisor activo — actívalo desde el Punto de Venta.');
    }

    // modo === 'cada_vez'
    if (prueba.token && await this.consumirToken(empresaId, cajeroId, clave, prueba.token)) return;
    throw new ForbiddenException('Esta acción requiere una autorización de supervisor nueva.');
  }
}
