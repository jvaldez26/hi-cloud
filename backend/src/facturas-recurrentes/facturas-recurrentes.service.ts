import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { FacturaRecurrente, Frecuencia } from './entities/factura-recurrente.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { User } from '../users/users.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateRecurrenteDto {
  nombre:        string;
  clienteId:     number;
  detalles:      FacturaRecurrente['detalles'];
  frecuencia:    Frecuencia;
  diaEjecucion:  number;
  fechaInicio:   string;
  fechaFin?:     string;
  notas?:        string;
}

@Injectable()
export class FacturasRecurrentesService {
  private readonly logger = new Logger(FacturasRecurrentesService.name);

  constructor(
    @InjectRepository(FacturaRecurrente)
    private recurrenteRepository: Repository<FacturaRecurrente>,
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    @InjectRepository(FacturaDetalle)
    private detalleRepository: Repository<FacturaDetalle>,
    private tenantService: TenantService,
  ) {}

  private calcularProxima(frecuencia: Frecuencia, diaEjecucion: number, desde: Date): Date {
    const prox = new Date(desde);
    switch (frecuencia) {
      case Frecuencia.DIARIA:
        prox.setDate(prox.getDate() + 1); break;
      case Frecuencia.SEMANAL:
        prox.setDate(prox.getDate() + 7); break;
      case Frecuencia.MENSUAL:
        prox.setMonth(prox.getMonth() + 1);
        prox.setDate(Math.min(diaEjecucion, new Date(prox.getFullYear(), prox.getMonth() + 1, 0).getDate()));
        break;
      case Frecuencia.ANUAL:
        prox.setFullYear(prox.getFullYear() + 1); break;
    }
    return prox;
  }

  async crear(dto: CreateRecurrenteDto, usuario: User) {
    const prox = new Date(dto.fechaInicio);
    const rec = this.recurrenteRepository.create({
      empresaId:       this.tenantService.getEmpresaId(),
      nombre:          dto.nombre,
      clienteId:       dto.clienteId,
      detalles:        dto.detalles,
      frecuencia:      dto.frecuencia,
      diaEjecucion:    dto.diaEjecucion,
      proximaEjecucion: prox,
      fechaFin:        dto.fechaFin ? new Date(dto.fechaFin) : undefined,
      notas:           dto.notas,
      userId:          usuario.id,
      activa:          true,
    });
    return this.recurrenteRepository.save(rec);
  }

  async listar(pagination: PaginationDto) {
    const { limit = 10, page = 1 } = pagination;
    const [data, total] = await this.recurrenteRepository.findAndCount({
      where: { empresaId: this.tenantService.getEmpresaId(), isActive: true },
      relations: ['cliente', 'user'],
      order: { proximaEjecucion: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number) {
    const r = await this.recurrenteRepository.findOne({
      where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true },
      relations: ['cliente', 'user'],
    });
    if (!r) throw new NotFoundException(`Factura recurrente #${id} no encontrada`);
    return r;
  }

  async toggleActiva(id: number) {
    const r = await this.findById(id);
    await this.recurrenteRepository.update(id, { activa: !r.activa });
    return this.findById(id);
  }

  async remove(id: number) {
    await this.findById(id);
    await this.recurrenteRepository.update(id, { isActive: false });
    return { message: 'Factura recurrente eliminada' };
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron diario: generar facturas que toca hoy
  // ──────────────────────────────────────────────────────────────────

  @Cron('15 0 * * *')
  async generarFacturasDiarias() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const pendientes = await this.recurrenteRepository.find({
      where: {
        activa: true,
        isActive: true,
        proximaEjecucion: LessThanOrEqual(hoy),
      },
      relations: ['cliente'],
    });

    if (pendientes.length === 0) return;

    this.logger.log(`Generando ${pendientes.length} facturas recurrentes...`);

    for (const rec of pendientes) {
      try {
        // Verificar que no haya pasado la fecha fin
        if (rec.fechaFin && new Date(rec.fechaFin) < hoy) {
          await this.recurrenteRepository.update(rec.id, { activa: false });
          continue;
        }

        // Calcular totales
        let subtotal = 0, iva = 0;
        const detallesData = rec.detalles.map(d => {
          const sub    = Number(d.precioUnitario) * d.cantidad;
          const impIva = sub * (d.porcentajeIva / 100);
          subtotal += sub; iva += impIva;
          return { ...d, subtotal: sub, importeIva: impIva, total: sub + impIva };
        });

        // Generar folio con MAX para evitar duplicados en concurrencia
        const y      = hoy.getFullYear();
        const m      = String(hoy.getMonth() + 1).padStart(2, '0');
        const prefix = `FAC-${y}${m}-`;
        const maxRes = await this.facturaRepository
          .createQueryBuilder('f')
          .select(`MAX(CAST(SPLIT_PART(f.folio, '-', 3) AS INTEGER))`, 'maxNum')
          .where('f.folio LIKE :p', { p: `${prefix}%` })
          .getRawOne<{ maxNum: number | null }>();
        const folio = `${prefix}${String((maxRes?.maxNum ?? 0) + 1).padStart(4, '0')}`;

        // Crear factura — propaga empresaId del recurrente
        const factura = await this.facturaRepository.save(
          this.facturaRepository.create({
            empresaId: rec.empresaId,
            folio,
            fecha:     hoy,
            estado:    FacturaEstado.BORRADOR,
            clienteId: rec.clienteId,
            usuarioId: rec.userId,
            notas:     `Factura recurrente: ${rec.nombre}`,
            subtotal:  Number(subtotal.toFixed(2)),
            iva:       Number(iva.toFixed(2)),
            total:     Number((subtotal + iva).toFixed(2)),
          }),
        );

        await this.detalleRepository.save(
          this.detalleRepository.create(
            detallesData.map(d => ({ ...d, facturaId: factura.id })),
          ),
        );

        // Calcular próxima ejecución
        const proxima = this.calcularProxima(rec.frecuencia, rec.diaEjecucion, hoy);

        await this.recurrenteRepository.update(rec.id, {
          ultimaEjecucion:  hoy,
          proximaEjecucion: proxima,
          totalGeneradas:   rec.totalGeneradas + 1,
        });

        this.logger.log(`✅ Factura recurrente "${rec.nombre}" → ${folio} (próxima: ${proxima.toDateString()})`);
      } catch (err) {
        this.logger.error(`Error generando recurrente #${rec.id}: ${(err as Error).message}`);
      }
    }
  }

  async ejecutarAhora(id: number) {
    const rec = await this.findById(id);
    await this.recurrenteRepository.update(id, {
      proximaEjecucion: new Date(Date.now() - 1000),
    });
    await this.generarFacturasDiarias();
    return this.findById(id);
  }
}
