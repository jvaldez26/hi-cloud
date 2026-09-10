import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ReglaDistribucion, PeriodicitadRegla } from './entities/regla-distribucion.entity';
import { ReglaDistribucionLinea } from './entities/regla-distribucion-linea.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class DistribucionCostosService {
  constructor(
    @InjectRepository(ReglaDistribucion)
    private reglaRepo: Repository<ReglaDistribucion>,
    @InjectRepository(ReglaDistribucionLinea)
    private lineaRepo: Repository<ReglaDistribucionLinea>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ── CRUD Reglas ────────────────────────────────────────────────────────────

  async crearRegla(dto: {
    nombre: string; descripcion?: string;
    cuentaOrigenId: number; cuentaOrigenNombre?: string;
    periodicidad?: PeriodicitadRegla;
    lineas: Array<{
      cuentaDestinoId: number; cuentaDestinoNombre?: string;
      centroCostoId?: number; centroCostoNombre?: string;
      porcentaje: number; descripcion?: string;
    }>;
  }) {
    const empresaId = this.tenantService.getEmpresaId();

    // Validar que los porcentajes sumen 100
    const totalPct = dto.lineas.reduce((s, l) => s + Number(l.porcentaje), 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new BadRequestException(`Los porcentajes deben sumar 100%. Suma actual: ${totalPct.toFixed(2)}%`);
    }

    const regla = await this.reglaRepo.save(
      this.reglaRepo.create({ ...dto, empresaId, activa: true, vecesEjecutada: 0 }),
    );

    const lineas = dto.lineas.map(l =>
      this.lineaRepo.create({ ...l, reglaId: regla.id, empresaId }),
    );
    await this.lineaRepo.save(lineas);

    return this.findReglaById(regla.id);
  }

  async getReglas() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.reglaRepo.find({
      where: { empresaId, isActive: true },
      relations: ['lineas'],
      order: { nombre: 'ASC' },
    });
  }

  async findReglaById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const r = await this.reglaRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['lineas'],
    });
    if (!r) throw new NotFoundException(`Regla #${id} no encontrada`);
    return r;
  }

  async deleteRegla(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.reglaRepo.update({ id, empresaId }, { isActive: false });
    return { message: 'Regla eliminada' };
  }

  // ── Ejecutar regla → genera asiento contable de distribución ──────────────

  async ejecutarRegla(
    reglaId: number,
    monto: number,
    fecha: string,
    userId: number,
    concepto?: string,
  ) {
    const regla    = await this.findReglaById(reglaId);
    const empresaId = this.tenantService.getEmpresaId();

    if (monto <= 0) throw new BadRequestException('El monto debe ser positivo');
    if (!regla.lineas?.length) throw new BadRequestException('La regla no tiene líneas de distribución');

    // Calcular montos por línea
    const lineasCalculadas = regla.lineas.map(l => ({
      ...l,
      montoDistribuido: Number((monto * Number(l.porcentaje) / 100).toFixed(2)),
    }));

    // Ajuste de redondeo — agregar diferencia a la primera línea
    const totalCalc = lineasCalculadas.reduce((s, l) => s + l.montoDistribuido, 0);
    const diferencia = Number((monto - totalCalc).toFixed(2));
    if (diferencia !== 0) lineasCalculadas[0].montoDistribuido += diferencia;

    // Crear asiento contable
    const lineaDescripcion = concepto ?? `Distribución: ${regla.nombre}`;

    const asientoLineas = [
      // Crédito en la cuenta origen (se saca el costo del origen)
      {
        cuentaContableId: regla.cuentaOrigenId,
        descripcion:      lineaDescripcion,
        debe:             0,
        haber:            monto,
      },
      // Débito en cada cuenta destino
      ...lineasCalculadas.map(l => ({
        cuentaContableId: l.cuentaDestinoId,
        descripcion:      `${lineaDescripcion} — ${Number(l.porcentaje).toFixed(2)}% → ${l.cuentaDestinoNombre ?? l.cuentaDestinoId}`,
        debe:             l.montoDistribuido,
        haber:            0,
      })),
    ];

    // Insertar asiento en la BD directamente.
    //
    // Corregido junto con la falta de empresaId en asiento_lineas (abajo) —
    // los tres bugs viven en el mismo bloque de 15 líneas y sin arreglarlos
    // juntos el fix de empresaId nunca llega a ejecutarse:
    //   1. dataSource.query() de TypeORM devuelve el array de filas
    //      directamente (mismo patrón que el resto del proyecto,
    //      `const [row] = await this.dataSource.query(...)`), no un objeto
    //      { rows: [...] } al estilo driver pg crudo — desestructurar
    //      `.rows` lanzaba "Cannot destructure property 'rows' of
    //      undefined" en cada ejecución.
    //   2. La columna es "tipoOrigen" (enum TipoOrigenAsiento), no "tipo" —
    //      esa columna no existe en asientos_contables.
    //   3. estado 'borrador' nunca aparece en ningún reporte (todos filtran
    //      estado = 'contabilizado'): un asiento "ejecutado" por el usuario
    //      debe nacer CONTABILIZADO, igual que el resto del motor de
    //      asientos automáticos.
    const [asiento] = await this.dataSource.query<{ id: number }[]>(`
      INSERT INTO asientos_contables
        ("empresaId", fecha, "tipoOrigen", descripcion, estado, "totalDebe", "totalHaber", "userId")
      VALUES ($1, $2, 'manual', $3, 'contabilizado', $4, $4, $5)
      RETURNING id
    `, [empresaId, fecha, lineaDescripcion, monto, userId]);

    for (const l of asientoLineas) {
      await this.dataSource.query(`
        INSERT INTO asiento_lineas
          ("empresaId", "asientoId", "cuentaContableId", descripcion, debe, haber)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [empresaId, asiento.id, l.cuentaContableId, l.descripcion, l.debe, l.haber]);
    }

    // Actualizar estadísticas de la regla
    await this.reglaRepo.update(reglaId, {
      vecesEjecutada:  (regla.vecesEjecutada ?? 0) + 1,
      ultimaEjecucion: new Date(),
    } as any);

    return {
      asientoId:        asiento.id,
      monto,
      lineasDistribuidas: lineasCalculadas.length,
      detalle:          lineasCalculadas.map(l => ({
        cuenta:     l.cuentaDestinoNombre ?? `#${l.cuentaDestinoId}`,
        porcentaje: Number(l.porcentaje),
        monto:      l.montoDistribuido,
      })),
    };
  }

  // ── Simulación (preview sin guardar) ──────────────────────────────────────

  async simularRegla(reglaId: number, monto: number) {
    const regla = await this.findReglaById(reglaId);

    const lineasCalculadas = regla.lineas.map(l => ({
      cuentaDestino:   l.cuentaDestinoNombre ?? `#${l.cuentaDestinoId}`,
      centroCosto:     l.centroCostoNombre,
      porcentaje:      Number(l.porcentaje),
      montoDistribuido: Number((monto * Number(l.porcentaje) / 100).toFixed(2)),
    }));

    return {
      monto,
      cuentaOrigen:     regla.cuentaOrigenNombre ?? `#${regla.cuentaOrigenId}`,
      lineasDistribuidas: lineasCalculadas,
      totalVerificado:  lineasCalculadas.reduce((s, l) => s + l.montoDistribuido, 0),
    };
  }
}
