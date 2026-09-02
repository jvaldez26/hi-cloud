import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantService } from '../../tenant/tenant.service';

@Injectable()
export class VehiculosService {
  private readonly logger = new Logger(VehiculosService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantSvc: TenantService,
  ) {}

  private get empresaId() { return this.tenantSvc.getEmpresaId(); }

  private async orFail(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM pr_vehiculos WHERE id=$1 AND "empresaId"=$2`, [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Vehículo #${id} no encontrado`);
    return row;
  }

  async findAll(params: any = {}) {
    const empresaId = this.empresaId;
    const page   = Math.max(1, Number(params.page)  || 1);
    const limit  = Math.min(100, Number(params.limit) || 20);
    const offset = (page - 1) * limit;

    const conds: string[] = [`"empresaId"=$1`];
    const args: any[]     = [empresaId];
    let idx = 2;

    if (params.activo !== undefined) {
      conds.push(`activo=$${idx++}`);
      args.push(params.activo === 'false' ? false : true);
    }
    if (params.search) {
      conds.push(`(placa ILIKE $${idx} OR chasis ILIKE $${idx} OR marca ILIKE $${idx} OR modelo ILIKE $${idx})`);
      args.push(`%${params.search}%`); idx++;
    }
    if (params.polizaVencida === 'true') {
      conds.push(`"fechaVencePoliza" IS NOT NULL AND "fechaVencePoliza" < CURRENT_DATE`);
    }
    if (params.polizaPorVencer === 'true') {
      conds.push(`"fechaVencePoliza" IS NOT NULL AND "fechaVencePoliza" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`);
    }

    const where = conds.join(' AND ');
    const [{ count }] = await this.ds.query(
      `SELECT COUNT(*) FROM pr_vehiculos WHERE ${where}`, args,
    );
    const data = await this.ds.query(
      `SELECT * FROM pr_vehiculos WHERE ${where} ORDER BY "createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...args, limit, offset],
    );
    return { data, total: Number(count), page, limit };
  }

  async findOne(id: number) {
    const vehiculo = await this.orFail(this.empresaId, id);
    // Préstamos vinculados a este vehículo
    const prestamos = await this.ds.query(
      `SELECT p.id, p.numero, p.estado, p."montoPrincipal", p."saldoCapital", d.nombre as deudorNombre
       FROM pr_prestamos p
       JOIN pr_deudores d ON d.id = p."deudorId"
       WHERE p."vehiculoId"=$1 AND p."empresaId"=$2
       ORDER BY p."createdAt" DESC`,
      [id, this.empresaId],
    );
    return { ...vehiculo, prestamos };
  }

  async findByPlaca(placa: string) {
    const rows = await this.ds.query<any[]>(
      `SELECT * FROM pr_vehiculos WHERE placa ILIKE $1 AND "empresaId"=$2 AND activo=true`,
      [placa.trim().toUpperCase(), this.empresaId],
    );
    return rows;
  }

  async create(data: any) {
    const empresaId = this.empresaId;

    if (!data.placa && !data.chasis) {
      throw new BadRequestException('Se requiere al menos la placa o el número de chasis del vehículo');
    }

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO pr_vehiculos (
         "empresaId","sucursalId",placa,chasis,motor,marca,modelo,anio,color,"tipoVehiculo",
         "valorMercado","valorFactura",aseguradora,"polizaSeguro","fechaVencePoliza",activo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        empresaId,
        data.sucursalId   ?? null,
        data.placa        ? data.placa.trim().toUpperCase() : null,
        data.chasis       ? data.chasis.trim().toUpperCase() : null,
        data.motor        ?? null,
        data.marca        ?? null,
        data.modelo       ?? null,
        data.anio         ?? null,
        data.color        ?? null,
        data.tipoVehiculo ?? null,
        data.valorMercado ?? null,
        data.valorFactura ?? null,
        data.aseguradora  ?? null,
        data.polizaSeguro ?? null,
        data.fechaVencePoliza ?? null,
        data.activo !== false,
      ],
    );
    this.logger.log(`Vehículo creado #${row.id} — placa: ${row.placa ?? row.chasis}`);
    return row;
  }

  async update(id: number, data: any) {
    const empresaId = this.empresaId;
    await this.orFail(empresaId, id);

    const allowed = [
      'placa', 'chasis', 'motor', 'marca', 'modelo', 'anio', 'color', 'tipoVehiculo',
      'valorMercado', 'valorFactura', 'aseguradora', 'polizaSeguro', 'fechaVencePoliza', 'activo',
    ];
    const fields: string[] = [];
    const args:   any[]    = [];
    let idx = 1;

    for (const key of allowed) {
      if (data[key] === undefined) continue;
      const col = key === 'anio' ? 'anio' : `"${key}"`;
      // Normalizar placa y chasis a mayúsculas
      const val = (key === 'placa' || key === 'chasis') && typeof data[key] === 'string'
        ? data[key].trim().toUpperCase()
        : data[key];
      fields.push(`${col}=$${idx++}`);
      args.push(val);
    }
    if (!fields.length) return this.findOne(id);

    args.push(id, empresaId);
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE pr_vehiculos SET ${fields.join(',')} WHERE id=$${idx++} AND "empresaId"=$${idx} RETURNING *
       ) SELECT * FROM fila`,
      args,
    );
    return row;
  }

  /** Resumen para el dashboard del prestamista: vehículos con seguro vencido o por vencer */
  async alertasSeguro() {
    const empresaId = this.empresaId;
    const vencidas = await this.ds.query(
      `SELECT v.*, p.numero as prestamo_numero
       FROM pr_vehiculos v
       LEFT JOIN pr_prestamos p ON p."vehiculoId"=v.id AND p.estado NOT IN ('pagado','cancelado')
       WHERE v."empresaId"=$1 AND v.activo=true
         AND v."fechaVencePoliza" IS NOT NULL
         AND v."fechaVencePoliza" < CURRENT_DATE
       ORDER BY v."fechaVencePoliza"`,
      [empresaId],
    );
    const porVencer = await this.ds.query(
      `SELECT v.*, p.numero as prestamo_numero,
              (v."fechaVencePoliza" - CURRENT_DATE) AS dias_restantes
       FROM pr_vehiculos v
       LEFT JOIN pr_prestamos p ON p."vehiculoId"=v.id AND p.estado NOT IN ('pagado','cancelado')
       WHERE v."empresaId"=$1 AND v.activo=true
         AND v."fechaVencePoliza" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY v."fechaVencePoliza"`,
      [empresaId],
    );
    return { vencidas, porVencer };
  }
}
