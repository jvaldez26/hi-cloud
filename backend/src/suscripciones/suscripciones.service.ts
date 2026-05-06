import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  Suscripcion, PlanTipo, SuscripcionEstado, PLAN_LIMITES,
} from './entities/suscripcion.entity';

@Injectable()
export class SuscripcionesService implements OnModuleInit {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(
    @InjectRepository(Suscripcion)
    private repo: Repository<Suscripcion>,
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
}
