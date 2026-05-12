import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RetencionISR,
  TipoServicioRetencion,
  TASAS_RETENCION,
} from './entities/retencion-isr.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

interface CreateRetencionDto {
  periodo:              string;
  nombreProveedor:      string;
  rncProveedor?:        string;
  tipoServicio:         TipoServicioRetencion;
  descripcionServicio:  string;
  montoBruto:           number;
  compraId?:            number;
}

@Injectable()
export class RetencionesService {
  constructor(
    @InjectRepository(RetencionISR)
    private repo: Repository<RetencionISR>,
    private tenantService: TenantService,
  ) {}

  async crear(dto: CreateRetencionDto, userId: number): Promise<RetencionISR> {
    const tasa        = TASAS_RETENCION[dto.tipoServicio];
    const montoRetenido = Number((dto.montoBruto * tasa / 100).toFixed(2));
    const montoNeto     = Number((dto.montoBruto - montoRetenido).toFixed(2));

    return this.repo.save(
      this.repo.create({
        ...dto,
        empresaId: this.tenantService.getEmpresaId(),
        porcentajeRetencion: tasa,
        montoRetenido,
        montoNeto,
        userId,
      }),
    );
  }

  async listar(pagination: PaginationDto) {
    const { limit = 10, page = 1 } = pagination;
    const [data, total] = await this.repo.findAndCount({
      where: { empresaId: this.tenantService.getEmpresaId() },
      order: { createdAt: 'DESC' },
      skip:  (page - 1) * limit,
      take:  limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getReporteIR17(mes: number, anio: number) {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

    const rows = await this.repo.find({
      where: { periodo, empresaId: this.tenantService.getEmpresaId() },
      order: { createdAt: 'ASC' },
    });

    const totalBruto    = rows.reduce((s, r) => s + Number(r.montoBruto), 0);
    const totalRetenido = rows.reduce((s, r) => s + Number(r.montoRetenido), 0);
    const totalNeto     = rows.reduce((s, r) => s + Number(r.montoNeto), 0);

    const porTipo: Record<string, { cantidad: number; montoBruto: number; montoRetenido: number }> = {};
    for (const r of rows) {
      if (!porTipo[r.tipoServicio]) {
        porTipo[r.tipoServicio] = { cantidad: 0, montoBruto: 0, montoRetenido: 0 };
      }
      porTipo[r.tipoServicio].cantidad++;
      porTipo[r.tipoServicio].montoBruto   += Number(r.montoBruto);
      porTipo[r.tipoServicio].montoRetenido += Number(r.montoRetenido);
    }

    return {
      tipo:     'IR-17',
      descripcion: 'Declaración Mensual de Retenciones ISR',
      ley:      'Código Tributario RD — Ley 11-92',
      periodo:  { mes, anio },
      retenciones: rows,
      resumen: {
        cantidadTransacciones: rows.length,
        totalBruto:    Number(totalBruto.toFixed(2)),
        totalRetenido: Number(totalRetenido.toFixed(2)),
        totalNeto:     Number(totalNeto.toFixed(2)),
      },
      porTipo,
      tasasVigentes: TASAS_RETENCION,
    };
  }

  async remove(id: number) {
    const r = await this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
    if (!r) throw new NotFoundException(`Retención #${id} no encontrada`);
    await this.repo.delete(id);
    return { message: 'Retención eliminada' };
  }
}
