import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CajaChica, EstadoCajaChica } from './entities/caja-chica.entity';
import { MovimientoCajaChica, TipoMovCajaChica } from './entities/movimiento-caja-chica.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateCajaDto {
  nombre:               string;
  montoInicial:         number;
  montoMaximoEgreso?:   number;
  pctAlerta?:           number;
  responsableId?:       number;
  nombreResponsable?:   string;
  descripcion?:         string;
}

interface EgresoDto {
  fecha:         string;
  descripcion:   string;
  categoria?:    string;
  monto:         number;
  comprobante?:  string;
  beneficiario?: string;
  notas?:        string;
}

interface ReposicionDto {
  fecha:         string;
  descripcion?:  string;
  monto:         number;
  notas?:        string;
}

@Injectable()
export class CajaChicaService {
  constructor(
    @InjectRepository(CajaChica)           private cajaRepo:  Repository<CajaChica>,
    @InjectRepository(MovimientoCajaChica) private movRepo:   Repository<MovimientoCajaChica>,
    private tenantSvc: TenantService,
  ) {}

  // ─── Cajas ────────────────────────────────────────────────────────────────────

  listarCajas() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.cajaRepo.find({ where: { empresaId, isActive: true }, order: { nombre: 'ASC' } });
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const c = await this.cajaRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!c) throw new NotFoundException(`Caja Chica #${id} no encontrada`);
    return c;
  }

  async crearCaja(dto: CreateCajaDto, userId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const caja = await this.cajaRepo.save(
      this.cajaRepo.create({
        empresaId,
        nombre:             dto.nombre,
        montoInicial:       dto.montoInicial,
        saldoActual:        dto.montoInicial,
        montoMaximoEgreso:  dto.montoMaximoEgreso ?? 0,
        pctAlerta:          dto.pctAlerta ?? 20,
        responsableId:      dto.responsableId ?? userId,
        nombreResponsable:  dto.nombreResponsable,
        descripcion:        dto.descripcion,
      }),
    );

    // Movimiento de apertura
    await this.movRepo.save(
      this.movRepo.create({
        empresaId,
        cajaChicaId:   caja.id,
        tipo:          TipoMovCajaChica.APERTURA,
        fecha:         new Date().toISOString().split('T')[0],
        descripcion:   `Apertura de caja chica "${caja.nombre}"`,
        monto:         dto.montoInicial,
        saldoAnterior: 0,
        saldoNuevo:    dto.montoInicial,
        userId,
      }),
    );

    return caja;
  }

  // ─── Egresos ──────────────────────────────────────────────────────────────────

  async registrarEgreso(cajaId: number, dto: EgresoDto, userId: number) {
    const caja = await this.findOne(cajaId);

    if (caja.estado === EstadoCajaChica.CERRADA) {
      throw new BadRequestException('La caja chica está cerrada');
    }
    if (dto.monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor que cero');
    }
    if (dto.monto > caja.saldoActual) {
      throw new BadRequestException(
        `Saldo insuficiente. Disponible: RD$ ${caja.saldoActual.toLocaleString('es-DO')}`,
      );
    }
    if (caja.montoMaximoEgreso > 0 && dto.monto > caja.montoMaximoEgreso) {
      throw new BadRequestException(
        `Monto supera el máximo permitido por egreso: RD$ ${caja.montoMaximoEgreso.toLocaleString('es-DO')}`,
      );
    }

    const saldoAnterior = Number(caja.saldoActual);
    const saldoNuevo    = +(saldoAnterior - dto.monto).toFixed(2);

    const empresaId = this.tenantSvc.getEmpresaId();
    await this.cajaRepo.update(cajaId, { saldoActual: saldoNuevo });

    const mov = await this.movRepo.save(
      this.movRepo.create({
        empresaId,
        cajaChicaId:   cajaId,
        tipo:          TipoMovCajaChica.EGRESO,
        fecha:         dto.fecha,
        descripcion:   dto.descripcion,
        categoria:     dto.categoria,
        monto:         dto.monto,
        saldoAnterior,
        saldoNuevo,
        comprobante:   dto.comprobante,
        beneficiario:  dto.beneficiario,
        notas:         dto.notas,
        userId,
      }),
    );

    const saldoAlerta = +(Number(caja.montoInicial) * Number(caja.pctAlerta) / 100).toFixed(2);
    return {
      movimiento: mov,
      saldoActual: saldoNuevo,
      alerta:      saldoNuevo <= saldoAlerta,
    };
  }

  // ─── Reposición ───────────────────────────────────────────────────────────────

  async reponer(cajaId: number, dto: ReposicionDto, userId: number) {
    const caja = await this.findOne(cajaId);

    if (caja.estado === EstadoCajaChica.CERRADA) {
      throw new BadRequestException('La caja chica está cerrada');
    }

    const empresaId    = this.tenantSvc.getEmpresaId();
    const saldoAnterior = Number(caja.saldoActual);
    const saldoNuevo    = +(saldoAnterior + dto.monto).toFixed(2);

    await this.cajaRepo.update(cajaId, { saldoActual: saldoNuevo });

    return this.movRepo.save(
      this.movRepo.create({
        empresaId,
        cajaChicaId:   cajaId,
        tipo:          TipoMovCajaChica.REPOSICION,
        fecha:         dto.fecha,
        descripcion:   dto.descripcion ?? `Reposición de fondos`,
        monto:         dto.monto,
        saldoAnterior,
        saldoNuevo,
        userId,
        notas:         dto.notas,
      }),
    );
  }

  // ─── Cierre ───────────────────────────────────────────────────────────────────

  async cerrar(cajaId: number, userId: number) {
    const caja = await this.findOne(cajaId);

    if (caja.estado === EstadoCajaChica.CERRADA) {
      throw new BadRequestException('La caja ya está cerrada');
    }

    const empresaId = this.tenantSvc.getEmpresaId();
    await this.cajaRepo.update(cajaId, { estado: EstadoCajaChica.CERRADA });

    await this.movRepo.save(
      this.movRepo.create({
        empresaId,
        cajaChicaId:   cajaId,
        tipo:          TipoMovCajaChica.CIERRE,
        fecha:         new Date().toISOString().split('T')[0],
        descripcion:   `Cierre de caja chica "${caja.nombre}"`,
        monto:         Number(caja.saldoActual),
        saldoAnterior: Number(caja.saldoActual),
        saldoNuevo:    0,
        userId,
      }),
    );

    return this.findOne(cajaId);
  }

  // ─── Movimientos ─────────────────────────────────────────────────────────────

  listarMovimientos(cajaId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.movRepo.find({
      where: { empresaId, cajaChicaId: cajaId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Resumen ─────────────────────────────────────────────────────────────────

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cajas     = await this.cajaRepo.find({ where: { empresaId, isActive: true } });

    const totales = await this.movRepo
      .createQueryBuilder('m')
      .select('m.tipo', 'tipo')
      .addSelect('COALESCE(SUM(m.monto), 0)', 'total')
      .where('m.empresaId = :eid', { eid: empresaId })
      .andWhere('m.isActive = :a', { a: true })
      .groupBy('m.tipo')
      .getRawMany<{ tipo: string; total: string }>();

    const egresos    = totales.find(t => t.tipo === 'egreso')?.total    ?? 0;
    const reposiciones = totales.find(t => t.tipo === 'reposicion')?.total ?? 0;

    return {
      cajasActivas:  cajas.filter(c => c.estado === 'activa').length,
      cajasCerradas: cajas.filter(c => c.estado === 'cerrada').length,
      totalEgresos:      Number(egresos),
      totalReposiciones: Number(reposiciones),
      cajas: cajas.map(c => ({
        ...c,
        pctUsado:    c.montoInicial > 0
          ? +((1 - Number(c.saldoActual) / Number(c.montoInicial)) * 100).toFixed(1)
          : 0,
        enAlerta:    Number(c.saldoActual) <= (Number(c.montoInicial) * Number(c.pctAlerta) / 100),
      })),
    };
  }
}
