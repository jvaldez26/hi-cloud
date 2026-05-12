import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DemoRequest, EstadoDemo } from './entities/demo-request.entity';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectRepository(DemoRequest)
    private demoRepository: Repository<DemoRequest>,
    private configService: ConfigService,
  ) {}

  async crear(dto: CreateDemoRequestDto): Promise<DemoRequest> {
    const request = await this.demoRepository.save(
      this.demoRepository.create({
        ...dto,
        pais: dto.pais ?? 'República Dominicana',
      }),
    );

    this.logger.log(
      `📧 Nueva solicitud de demo: ${dto.nombre} — ${dto.empresa} (${dto.email})`,
    );

    // Log para notificar al equipo de ventas
    this.logger.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NUEVA SOLICITUD DE DEMO — HiCloud ERP
  Nombre:  ${dto.nombre}
  Empresa: ${dto.empresa}
  Email:   ${dto.email}
  Tel:     ${dto.telefono}
  Tamaño:  ${dto.tamanoEmpresa} empleados
  Módulos: ${(dto.modulosInteres ?? []).join(', ')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return request;
  }

  async listar(filtro: {
    page?: number; limit?: number; estado?: EstadoDemo;
  }) {
    const { page = 1, limit = 20, estado } = filtro;
    const qb = this.demoRepository
      .createQueryBuilder('d')
      .orderBy('d.createdAt', 'DESC');

    if (estado) qb.where('d.estado = :estado', { estado });

    const [data, total] = await qb
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async actualizarEstado(id: number, update: {
    estado?: EstadoDemo; notasInternas?: string; asignadoA?: string;
  }) {
    await this.demoRepository.update(id, update);
    return this.demoRepository.findOne({ where: { id } });
  }

  async getEstadisticas() {
    const rows = await this.demoRepository
      .createQueryBuilder('d')
      .select('d.estado', 'estado')
      .addSelect('COUNT(d.id)', 'cantidad')
      .groupBy('d.estado')
      .getRawMany();

    const total = await this.demoRepository.count();
    const hoy   = await this.demoRepository
      .createQueryBuilder('d')
      .where('DATE(d.createdAt) = CURRENT_DATE')
      .getCount();

    return {
      total, hoy,
      porEstado: rows.map(r => ({ estado: r.estado, cantidad: Number(r.cantidad) })),
    };
  }
}
