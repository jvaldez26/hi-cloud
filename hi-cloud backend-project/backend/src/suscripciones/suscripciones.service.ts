import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  Suscripcion, PlanTipo, SuscripcionEstado, PLAN_LIMITES, PLANES,
} from './entities/suscripcion.entity';
import { PlanConfiguracion } from './entities/plan-configuracion.entity';

/** Jerarquía de planes — mayor número = plan superior */
const PLAN_TIER: Record<string, number> = {
  trial:       0,
  basico:      1,
  profesional: 2,
  empresarial: 3,
  enterprise:  4,
};

@Injectable()
export class SuscripcionesService implements OnModuleInit {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(
    @InjectRepository(Suscripcion)
    private repo: Repository<Suscripcion>,
    @InjectRepository(PlanConfiguracion)
    private planConfigRepo: Repository<PlanConfiguracion>,
    private ds: DataSource,
  ) {}

  async onModuleInit() {
    // Agregar valor 'enterprise' al enum si no existe
    try {
      await this.ds.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'suscripciones_plan_enum' AND e.enumlabel = 'enterprise'
          ) THEN
            ALTER TYPE suscripciones_plan_enum ADD VALUE 'enterprise';
          END IF;
        END $$;
      `);
    } catch (e) {
      this.logger.warn('No se pudo migrar enum enterprise: ' + (e as Error).message);
    }

    // Crear suscripción trial para empresa 1 si no existe
    const exists = await this.repo.findOne({ where: { empresaId: 1 } });
    if (!exists) {
      const hoy = new Date();
      const fin = new Date(); fin.setDate(fin.getDate() + 7);
      await this.repo.save(this.repo.create({
        empresaId: 1,
        plan:      PlanTipo.TRIAL,
        estado:    SuscripcionEstado.ACTIVA,
        fechaInicio:      hoy,
        fechaVencimiento: fin,
      }));
    }
  }

  async getSuscripcion(empresaId = 1): Promise<Suscripcion & { info: typeof PLAN_LIMITES[PlanTipo]; diasRestantes: number }> {
    let s = await this.repo.findOne({ where: { empresaId } });
    if (!s) {
      const hoy = new Date();
      const fin = new Date(); fin.setDate(fin.getDate() + 7);
      s = await this.repo.save(this.repo.create({
        empresaId,
        plan:  PlanTipo.TRIAL,
        estado: SuscripcionEstado.ACTIVA,
        fechaInicio: hoy,
        fechaVencimiento: fin,
      }));
    }
    const hoy = new Date();
    const venc = new Date(s.fechaVencimiento);
    const diasRestantes = Math.max(0, Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)));
    return { ...s, info: PLAN_LIMITES[s.plan], diasRestantes };
  }

  async activarPlan(empresaId: number, plan: PlanTipo, meses: number, notas?: string) {
    const s = await this.repo.findOne({ where: { empresaId } });
    const inicio = new Date();
    const fin    = new Date(); fin.setMonth(fin.getMonth() + meses);

    // ── Validar: solo se permite subir de plan, no bajar ──────────────────────
    // El downgrade lo realiza exclusivamente el Super Admin desde su panel.
    if (s && s.plan !== plan) {
      const tierActual = PLAN_TIER[s.plan] ?? 0;
      const tierNuevo  = PLAN_TIER[plan]   ?? 0;
      if (tierNuevo < tierActual) {
        throw new BadRequestException(
          `No es posible cambiar a un plan inferior (${s.plan} → ${plan}). ` +
          `Para hacer un downgrade contacte al administrador de la plataforma HiCloud.`,
        );
      }
    }

    if (s) {
      await this.repo.update(s.id, {
        plan, estado: SuscripcionEstado.ACTIVA,
        fechaInicio: inicio, fechaVencimiento: fin,
        notasAdmin: notas,
      });
    } else {
      await this.repo.save(this.repo.create({
        empresaId, plan, estado: SuscripcionEstado.ACTIVA,
        fechaInicio: inicio, fechaVencimiento: fin,
        notasAdmin: notas,
      }));
    }
    this.logger.log(`Plan ${plan} activado para empresa #${empresaId} por ${meses} meses`);
    return this.getSuscripcion(empresaId);
  }

  async suspender(empresaId: number) {
    const s = await this.repo.findOne({ where: { empresaId } });
    if (s) await this.repo.update(s.id, { estado: SuscripcionEstado.SUSPENDIDA });
    return this.getSuscripcion(empresaId);
  }

  async listarTodasLasSuscripciones() {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    const hoy  = new Date();
    return rows.map(s => ({
      ...s,
      info: PLAN_LIMITES[s.plan],
      diasRestantes: Math.max(0,
        Math.ceil((new Date(s.fechaVencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
      ),
    }));
  }

  async getEstadisticasPlanes() {
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('s.plan', 'plan')
      .addSelect('s.estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('s.plan, s.estado')
      .getRawMany();

    const totales = await this.repo.count();
    const activas = await this.repo.count({ where: { estado: SuscripcionEstado.ACTIVA } });

    return { totales, activas, porPlan: rows };
  }

  // Cron: marcar vencidas diariamente
  @Cron('10 0 * * *')
  async marcarVencidas() {
    const res = await this.repo.update(
      { estado: SuscripcionEstado.ACTIVA, fechaVencimiento: LessThan(new Date()) },
      { estado: SuscripcionEstado.VENCIDA },
    );
    if ((res.affected ?? 0) > 0)
      this.logger.warn(`${res.affected} suscripciones marcadas como vencidas`);
  }

  // ── Catálogo de planes — lee desde BD, fusiona con límites en código ───────

  async getPlanesCatalogo() {
    // Asegurar que la tabla tenga datos para todos los planes
    await this.seedPlanConfiguracion();

    const configs = await this.planConfigRepo.find({ order: { createdAt: 'ASC' } });
    const configMap = Object.fromEntries(configs.map(c => [c.clave, c]));

    return Object.entries(PLANES).map(([clave, def]) => {
      const cfg = configMap[clave];
      return {
        clave,
        nombre:         cfg?.nombre   ?? def.nombre,
        precio:         cfg ? Number(cfg.precio) : def.precio,
        descripcion:    cfg?.descripcion,
        diasPrueba:     def.diasPrueba,
        maxUsuarios:    def.maxUsuarios,
        maxFacturasMes: def.maxFacturasMes,
        maxProductos:   def.maxProductos,
        maxClientes:    def.maxClientes,
        maxSucursales:  def.maxSucursales,
        modulos:        def.modulos,
        soporte:        def.soporte,
      };
    });
  }

  async updatePlanConfig(clave: string, dto: { nombre?: string; precio?: number; descripcion?: string }) {
    await this.seedPlanConfiguracion();
    const exists = await this.planConfigRepo.findOne({ where: { clave } });
    if (!exists) {
      const def = PLANES[clave as PlanTipo];
      if (!def) throw new Error(`Plan "${clave}" no existe`);
      await this.planConfigRepo.save(
        this.planConfigRepo.create({ clave, nombre: def.nombre, precio: def.precio, activo: true }),
      );
    }
    await this.planConfigRepo.update({ clave }, {
      ...(dto.nombre      !== undefined && { nombre:      dto.nombre }),
      ...(dto.precio      !== undefined && { precio:      dto.precio }),
      ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
    });
    return this.planConfigRepo.findOne({ where: { clave } });
  }

  private async seedPlanConfiguracion() {
    const count = await this.planConfigRepo.count();
    if (count >= 5) return; // ya inicializado

    for (const [clave, def] of Object.entries(PLANES)) {
      const existe = await this.planConfigRepo.findOne({ where: { clave } });
      if (!existe) {
        await this.planConfigRepo.save(
          this.planConfigRepo.create({ clave, nombre: def.nombre, precio: def.precio, activo: true }),
        );
      }
    }
  }
}
