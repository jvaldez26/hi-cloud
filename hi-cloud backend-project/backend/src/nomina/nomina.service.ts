import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { Empleado, EstadoEmpleado, TipoContrato } from './entities/empleado.entity';
import { NominaPeriodo, EstadoNomina } from './entities/nomina-periodo.entity';
import { NominaLinea } from './entities/nomina-linea.entity';
import { NominaNovedadEmpleado, TipoNovedad } from './entities/nomina-novedad.entity';
import { ContratoLaboral, EstadoContrato } from './entities/contrato-laboral.entity';
import { CreateEmpleadoDto } from './dto/create-empleado.dto';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto';
import { CreateNominaPeriodoDto } from './dto/create-nomina-periodo.dto';
import { FiltroEmpleadoDto, FiltroNominaPeriodoDto } from './dto/filtro-nomina.dto';
import { NominaCalculosService } from './services/nomina-calculos.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';
import { TipoMovimientoBancario, OrigenMovimiento } from '../tesoreria/entities/movimiento-bancario.entity';
import { TenantService } from '../tenant/tenant.service';
import PDFDocument from 'pdfkit';

@Injectable()
export class NominaService {
  private readonly logger = new Logger(NominaService.name);

  constructor(
    @InjectRepository(Empleado)
    private empleadoRepository: Repository<Empleado>,
    @InjectRepository(NominaPeriodo)
    private periodoRepository: Repository<NominaPeriodo>,
    @InjectRepository(NominaLinea)
    private lineaRepository: Repository<NominaLinea>,
    @InjectRepository(NominaNovedadEmpleado)
    private novedadRepository: Repository<NominaNovedadEmpleado>,
    @InjectRepository(ContratoLaboral)
    private contratoRepository: Repository<ContratoLaboral>,
    private calculos:         NominaCalculosService,
    private asientosService:  AsientosAutomaticosService,
    private tesoreriaService: TesoreriaService,
    private tenantService:    TenantService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Empleados
  // ──────────────────────────────────────────────────────────────────

  async createEmpleado(dto: CreateEmpleadoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.empleadoRepository.findOne({
      where: { cedula: dto.cedula, empresaId },
    });
    if (existe) throw new ConflictException(`Cédula ${dto.cedula} ya está registrada en esta empresa`);

    const emp = this.empleadoRepository.create({ ...dto, empresaId });
    return this.empleadoRepository.save(emp);
  }

  async getEmpleados(filtro: FiltroEmpleadoDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search, estado, departamento } = filtro;

    const qb = this.empleadoRepository
      .createQueryBuilder('e')
      .where('e.empresaId = :eid', { eid: empresaId })
      .andWhere('e.isActive = :active', { active: true });

    if (estado)       qb.andWhere('e.estado = :estado', { estado });
    if (departamento) qb.andWhere('e.departamento ILIKE :dep', { dep: `%${departamento}%` });
    if (search) {
      qb.andWhere(
        '(e.nombre ILIKE :s OR e.apellido ILIKE :s OR e.cedula ILIKE :s OR e.cargo ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('e.apellido', 'ASC')
      .addOrderBy('e.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findEmpleadoById(id: number) {
    const emp = await this.empleadoRepository.findOne({
      where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true },
    });
    if (!emp) throw new NotFoundException(`Empleado #${id} no encontrado`);
    return emp;
  }

  async updateEmpleado(id: number, dto: UpdateEmpleadoDto) {
    await this.findEmpleadoById(id);
    await this.empleadoRepository.update(id, dto as any);
    return this.findEmpleadoById(id);
  }

  async removeEmpleado(id: number) {
    const emp = await this.findEmpleadoById(id);
    await this.empleadoRepository.update(id, {
      isActive: false,
      estado: EstadoEmpleado.INACTIVO,
    });
    return { message: `Empleado "${emp.nombre} ${emp.apellido}" desactivado` };
  }

  async getPrestaciones(empleadoId: number) {
    const emp = await this.findEmpleadoById(empleadoId);
    return this.calculos.calcularPrestaciones(emp);
  }

  async getHistorialEmpleado(empleadoId: number) {
    await this.findEmpleadoById(empleadoId);
    return this.lineaRepository.find({
      where: { empleadoId, isActive: true },
      relations: ['periodo'],
      order: { createdAt: 'DESC' },
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // Novedades
  // ──────────────────────────────────────────────────────────────────

  async createNovedad(dto: {
    empleadoId: number;
    periodoId?: number;
    tipo: TipoNovedad;
    descripcion: string;
    monto?: number;
    horasExtras?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findEmpleadoById(dto.empleadoId);

    const novedad = this.novedadRepository.create({
      ...dto,
      empresaId,
      monto:       dto.monto       ?? 0,
      horasExtras: dto.horasExtras ?? 0,
      aplicado:    false,
    });
    return this.novedadRepository.save(novedad);
  }

  async getNovedades(empleadoId?: number, periodoId?: number, soloSinAplicar = false) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.novedadRepository
      .createQueryBuilder('n')
      .where('n.empresaId = :eid', { eid: empresaId })
      .andWhere('n.isActive = :active', { active: true });

    if (empleadoId)    qb.andWhere('n.empleadoId = :eid2', { eid2: empleadoId });
    if (periodoId)     qb.andWhere('(n.periodoId = :pid OR n.periodoId IS NULL)', { pid: periodoId });
    if (soloSinAplicar) qb.andWhere('n.aplicado = false');

    return qb.orderBy('n.createdAt', 'DESC').getMany();
  }

  async deleteNovedad(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const nov = await this.novedadRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!nov) throw new NotFoundException(`Novedad #${id} no encontrada`);
    if (nov.aplicado) throw new BadRequestException('No se puede eliminar una novedad ya aplicada');
    await this.novedadRepository.update(id, { isActive: false });
    return { message: 'Novedad eliminada' };
  }

  // ──────────────────────────────────────────────────────────────────
  // Contratos Laborales
  // ──────────────────────────────────────────────────────────────────

  async createContrato(dto: {
    empleadoId: number;
    numero?: string;
    tipo: TipoContrato;
    fechaInicio: string;
    fechaFin?: string;
    salario: number;
    cargo: string;
    departamento?: string;
    clausulas?: string;
    lugarTrabajo?: string;
    horasSemana?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findEmpleadoById(dto.empleadoId);

    const numero = dto.numero ?? await this.generarNumeroContrato();

    const contrato = this.contratoRepository.create({
      ...dto,
      numero,
      empresaId,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin:    dto.fechaFin ? new Date(dto.fechaFin) : undefined,
      estado:      EstadoContrato.ACTIVO,
    });
    return this.contratoRepository.save(contrato);
  }

  private async generarNumeroContrato(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    return generarNumeroSecuencial(
      this.dataSource,
      'contratos_laborales',
      'numero',
      '^CONT-[0-9]+$',
      'CONT-',
      4,
      empresaId,
    );
  }

  async getContratos(empleadoId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.contratoRepository
      .createQueryBuilder('c')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = :active', { active: true });

    if (empleadoId) qb.andWhere('c.empleadoId = :eid2', { eid2: empleadoId });

    return qb.orderBy('c.fechaInicio', 'DESC').getMany();
  }

  async findContratoById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = await this.contratoRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!c) throw new NotFoundException(`Contrato #${id} no encontrado`);
    return c;
  }

  async updateContrato(id: number, dto: Partial<{ estado: string; clausulas: string; fechaFin: string }>) {
    await this.findContratoById(id);
    await this.contratoRepository.update(id, dto as any);
    return this.findContratoById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Períodos de Nómina
  // ──────────────────────────────────────────────────────────────────

  async crearPeriodo(dto: CreateNominaPeriodoDto, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.periodoRepository.findOne({
      where: { periodo: dto.periodo, isActive: true, empresaId } as any,
    });
    if (existe) throw new ConflictException(`Ya existe una nómina para el período ${dto.periodo}`);

    const empleadosActivos = await this.empleadoRepository.find({
      where: { estado: EstadoEmpleado.ACTIVO, isActive: true, empresaId },
    });

    if (empleadosActivos.length === 0) {
      throw new BadRequestException('No hay empleados activos para generar la nómina');
    }

    const diasPeriodo = dto.diasPeriodo ?? 30;

    const periodoData: any = {
      periodo:     dto.periodo,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin:    new Date(dto.fechaFin),
      fechaPago:   new Date(dto.fechaPago),
      diasPeriodo,
      totalEmpleados: empleadosActivos.length,
      userId,
      empresaId,
    };
    const periodo = await this.periodoRepository.save(
      this.periodoRepository.create(periodoData),
    ) as unknown as NominaPeriodo;

    // Cargar novedades sin aplicar para esta empresa (las sin periodoId se aplican a todos)
    const todasNovedades = await this.novedadRepository.find({
      where: { empresaId, isActive: true, aplicado: false },
    });

    const lineas: Partial<NominaLinea>[] = [];
    let totalBruto = 0, totalTSSEmpl = 0, totalISR = 0;
    let totalOtras = 0, totalNeto = 0, totalTSSPat = 0, totalCosto = 0;

    for (const emp of empleadosActivos) {
      // Novedades del empleado: las sin periodoId (globales) + las de este período
      const novedadesEmp = todasNovedades.filter(
        n => n.empleadoId === emp.id && (n.periodoId == null || n.periodoId === periodo.id),
      );

      const c = this.calculos.calcularLinea(emp, diasPeriodo, diasPeriodo, novedadesEmp);
      lineas.push({ ...c, periodoId: periodo.id, empleadoId: emp.id });

      totalBruto   += c.salarioBruto;
      totalTSSEmpl += c.totalTSSEmpleado;
      totalISR     += c.isr;
      totalOtras   += c.otrasDeduciones + c.otrosDescuentos;
      totalNeto    += c.salarioNeto;
      totalTSSPat  += c.totalTSSPatronal;
      totalCosto   += c.costoTotalEmpleado;
    }

    await this.lineaRepository.save(this.lineaRepository.create(lineas));

    await this.periodoRepository.update(periodo.id, {
      totalSalariosBruto:    Number(totalBruto.toFixed(2)),
      totalTSSEmpleados:     Number(totalTSSEmpl.toFixed(2)),
      totalISR:              Number(totalISR.toFixed(2)),
      totalOtrasDeducciones: Number(totalOtras.toFixed(2)),
      totalNeto:             Number(totalNeto.toFixed(2)),
      totalTSSPatronal:      Number(totalTSSPat.toFixed(2)),
      totalCostoEmpresa:     Number(totalCosto.toFixed(2)),
    });

    // Marcar novedades sin periodoId como aplicadas (se ejecutaron en este período)
    const novedadesGlobales = todasNovedades.filter(n => n.periodoId == null);
    if (novedadesGlobales.length > 0) {
      await this.novedadRepository
        .createQueryBuilder()
        .update()
        .set({ aplicado: true, periodoId: periodo.id })
        .whereInIds(novedadesGlobales.map(n => n.id))
        .execute();
    }

    return this.findPeriodoById(periodo.id);
  }

  async getPeriodos(filtro: FiltroNominaPeriodoDto) {
    const { limit = 10, page = 1, estado, periodo } = filtro;
    const empresaId = this.tenantService.getEmpresaId();

    const qb = this.periodoRepository
      .createQueryBuilder('p')
      .where('p.isActive = :active', { active: true })
      .andWhere('p.empresaId = :eid', { eid: empresaId });

    if (estado)  qb.andWhere('p.estado = :estado', { estado });
    if (periodo) qb.andWhere('p.periodo LIKE :per', { per: `${periodo}%` });

    const [data, total] = await qb
      .orderBy('p.periodo', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findPeriodoById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const p = await this.periodoRepository.findOne({
      where: { id, isActive: true, empresaId } as any,
      relations: ['user'],
    });
    if (!p) throw new NotFoundException(`Período de nómina #${id} no encontrado`);
    return p;
  }

  async getLineasPeriodo(periodoId: number) {
    await this.findPeriodoById(periodoId);
    return this.lineaRepository.find({
      where: { periodoId, isActive: true },
      relations: ['empleado'],
      order: { empleado: { apellido: 'ASC' } },
    });
  }

  async procesarPeriodo(id: number) {
    const periodo = await this.findPeriodoById(id);
    if (periodo.estado !== EstadoNomina.BORRADOR) {
      throw new BadRequestException(`Solo se pueden procesar períodos en BORRADOR`);
    }
    await this.periodoRepository.update(id, { estado: EstadoNomina.PROCESADA });
    return this.findPeriodoById(id);
  }

  async pagarPeriodo(id: number, userId: number) {
    const periodo = await this.findPeriodoById(id);
    if (periodo.estado !== EstadoNomina.PROCESADA) {
      throw new BadRequestException(`Solo se pueden pagar períodos en estado PROCESADA`);
    }

    await this.periodoRepository.update(id, { estado: EstadoNomina.PAGADA });

    await this.asientosService.asientoNomina(
      periodo.id,
      Number(periodo.totalSalariosBruto),
      Number(periodo.totalNeto),
      Number(periodo.totalTSSEmpleados),
      Number(periodo.totalISR),
      Number(periodo.totalTSSPatronal),
      periodo.periodo,
      userId,
    );

    await this.tesoreriaService.registrarMovimientoAutomatico(
      TipoMovimientoBancario.RETIRO,
      Number(periodo.totalNeto),
      `Pago nómina ${periodo.periodo} — ${periodo.totalEmpleados} empleados`,
      OrigenMovimiento.NOMINA,
      periodo.id,
      userId,
    );

    return this.findPeriodoById(id);
  }

  async anularPeriodo(id: number) {
    const periodo = await this.findPeriodoById(id);
    if (periodo.estado === EstadoNomina.PAGADA) {
      throw new BadRequestException('No se puede anular una nómina ya pagada');
    }
    if (periodo.estado === EstadoNomina.ANULADA) {
      throw new BadRequestException('La nómina ya está anulada');
    }
    await this.periodoRepository.update(id, { estado: EstadoNomina.ANULADA });
    return this.findPeriodoById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Archivo de Banco (ACH / transferencias masivas)
  // ──────────────────────────────────────────────────────────────────

  async generarArchivoBanco(periodoId: number): Promise<{ csv: string; filename: string; totalLineas: number }> {
    const periodo = await this.findPeriodoById(periodoId);
    const lineas  = await this.getLineasPeriodo(periodoId);

    const rows: string[] = [
      'Banco,Cuenta,Nombre,Cedula,Monto,Periodo',
    ];

    for (const l of lineas) {
      const emp = l.empleado;
      rows.push([
        `"${emp.banco ?? ''}"`,
        `"${emp.cuentaBancaria ?? ''}"`,
        `"${emp.nombre} ${emp.apellido}"`,
        `"${emp.cedula}"`,
        Number(l.salarioNeto ?? 0).toFixed(2),
        `"${periodo.periodo}"`,
      ].join(','));
    }

    return {
      csv:         rows.join('\r\n'),
      filename:    `Nomina-Banco-${periodo.periodo}.csv`,
      totalLineas: lineas.length,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Recibos
  // ──────────────────────────────────────────────────────────────────

  async getReciboEmpleado(periodoId: number, empleadoId: number) {
    const periodo = await this.findPeriodoById(periodoId);
    const linea   = await this.lineaRepository.findOne({
      where: { periodoId, empleadoId, isActive: true },
      relations: ['empleado'],
    });
    if (!linea) {
      throw new NotFoundException(`No se encontró línea de nómina para ese empleado en el período`);
    }

    const emp = linea.empleado;
    let novedades: any[] = [];
    try { novedades = JSON.parse(linea.novedadesDetalle ?? '[]'); } catch { novedades = []; }

    return {
      empresa: { nombre: 'HiCloud ERP', rnc: process.env['ECF_RNC_EMISOR'] ?? '' },
      empleado: {
        cedula:       emp.cedula,
        nombre:       `${emp.nombre} ${emp.apellido}`,
        cargo:        emp.cargo,
        departamento: emp.departamento,
        fechaIngreso: emp.fechaIngreso,
        banco:        emp.banco,
        cuentaBancaria: emp.cuentaBancaria,
      },
      periodo: {
        periodo:       periodo.periodo,
        fechaInicio:   periodo.fechaInicio,
        fechaFin:      periodo.fechaFin,
        fechaPago:     periodo.fechaPago,
        diasTrabajados: linea.diasTrabajados,
      },
      ingresos: {
        salarioBase:      Number(linea.salarioBase),
        horasExtras:      linea.horasExtras ?? 0,
        montoHorasExtras: Number(linea.montoHorasExtras ?? 0),
        bonos:            Number(linea.bonos ?? 0),
        salarioBruto:     Number(linea.salarioBruto),
      },
      deducciones: {
        tssSFS:          Number(linea.tssSfsEmpleado),
        tssAFP:          Number(linea.tssAfpEmpleado),
        totalTSS:        Number(linea.totalTSSEmpleado),
        isr:             Number(linea.isr),
        otras:           Number(linea.otrasDeduciones),
        otrosDescuentos: Number(linea.otrosDescuentos ?? 0),
        total:           Number(linea.totalDeducciones),
      },
      novedades,
      salarioNeto: Number(linea.salarioNeto),
      costoEmpresa: {
        salarioBruto:     Number(linea.salarioBruto),
        tssSFSPatronal:   Number(linea.tssSfsPatronal),
        tssAFPPatronal:   Number(linea.tssAfpPatronal),
        tssSRLPatronal:   Number(linea.tssSrlPatronal),
        totalTSSPatronal: Number(linea.totalTSSPatronal),
        costoTotal:       Number(linea.costoTotalEmpleado),
      },
      generadoEn: new Date().toISOString(),
    };
  }

  /**
   * Genera el recibo de sueldo en PDF usando PDFKit (puro Node.js).
   * No requiere Puppeteer ni Chrome — funciona en cualquier servidor.
   */
  async generarReciboPdf(data: any): Promise<{ buffer: Buffer; filename: string }> {
    const emp  = data.empleado    ?? {};
    const per  = data.periodo     ?? {};
    const ing  = data.ingresos    ?? {};
    const ded  = data.deducciones ?? {};
    const emp2 = data.empresa     ?? {};
    const novedades: any[] = data.novedades ?? [];

    this.logger.log(
      `[ReciboPDF] Generando recibo PDFKit — empleado: "${emp.nombre ?? 'N/A'}", período: "${per.periodo ?? 'N/A'}"`,
    );

    try {
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];

        const doc = new PDFDocument({
          size: 'A4',
          margin: 0,
          info: { Title: 'Recibo de Sueldo', Author: emp2.nombre ?? 'HiCloud ERP' },
        });

        doc.on('data',  (c: Buffer) => chunks.push(c));
        doc.on('end',   () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ── Helpers ──────────────────────────────────────────────────────────
        const W   = 595.28;   // A4 ancho en pts
        const MAR = 36;       // margen lateral
        const CW  = W - MAR * 2;
        const fmtM = (v: number) =>
          `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
        const fmtD = (d: any) =>
          d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

        // ── HEADER (fondo azul) ───────────────────────────────────────────────
        doc.rect(0, 0, W, 80).fill('#1a56db');
        doc.fillColor('#ffffff')
           .font('Helvetica-Bold').fontSize(7)
           .text('RECIBO DE SUELDO', MAR, 14, { characterSpacing: 1 });
        doc.font('Helvetica-Bold').fontSize(18)
           .text(emp2.nombre ?? 'HiCloud ERP', MAR, 24);
        if (emp2.rnc) {
          doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.8)')
             .text(`RNC: ${emp2.rnc}`, MAR, 47);
        }
        // Período — derecha
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#ffffff')
           .text(per.periodo ?? '', 0, 28, { align: 'right', width: W - MAR });
        doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.85)')
           .text(`${fmtD(per.fechaInicio)} — ${fmtD(per.fechaFin)}`, 0, 47, { align: 'right', width: W - MAR });
        doc.text(`Pago: ${fmtD(per.fechaPago)}`, 0, 59, { align: 'right', width: W - MAR });

        // ── DATOS EMPLEADO ────────────────────────────────────────────────────
        let y = 96;
        doc.rect(MAR, y, CW, 90).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.rect(MAR, y, 4, 90).fill('#1a56db');

        doc.fillColor('#1a56db').font('Helvetica-Bold').fontSize(7)
           .text('DATOS DEL EMPLEADO', MAR + 12, y + 10, { characterSpacing: 0.5 });

        const colW = CW / 2 - 10;
        const campos = [
          ['Nombre',          emp.nombre        ?? '—'],
          ['Cédula',          emp.cedula         ?? '—'],
          ['Cargo',           emp.cargo          ?? '—'],
          ['Departamento',    emp.departamento   ?? '—'],
          ['Banco',           emp.banco          ?? '—'],
          ['Cuenta',          emp.cuentaBancaria ?? '—'],
        ];
        campos.forEach(([lbl, val], i) => {
          const cx = MAR + 12 + (i % 2 === 0 ? 0 : colW + 20);
          const cy = y + 24 + Math.floor(i / 2) * 18;
          doc.fillColor('#6b7280').font('Helvetica').fontSize(8).text(`${lbl}: `, cx, cy, { continued: true });
          doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8).text(val);
        });
        // Días trabajados
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
           .text('Días trabajados: ', MAR + 12, y + 24 + 3 * 18, { continued: true });
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8)
           .text(String(per.diasTrabajados ?? 30));

        // ── TABLA INGRESOS / DEDUCCIONES ──────────────────────────────────────
        y += 100;
        const half = (CW - 12) / 2;

        // Cabecera INGRESOS
        doc.rect(MAR, y, half, 18).fill('#059669');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
           .text('INGRESOS', MAR + 6, y + 6, { characterSpacing: 0.5 });

        // Cabecera DEDUCCIONES
        doc.rect(MAR + half + 12, y, half, 18).fill('#dc2626');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
           .text('DEDUCCIONES', MAR + half + 18, y + 6, { characterSpacing: 0.5 });

        y += 18;

        // Filas ingresos
        const ingFilas: [string, number][] = [
          ['Salario Base', ing.salarioBase ?? 0],
          ...(ing.montoHorasExtras > 0 ? [[`Horas Extras (${ing.horasExtras}h)`, ing.montoHorasExtras]] as [string,number][] : []),
          ...(ing.bonos > 0             ? [['Bonos', ing.bonos]]                                        as [string,number][] : []),
          ['Salario Bruto', ing.salarioBruto ?? 0],
        ];
        // Filas deducciones
        const dedFilas: [string, number][] = [
          ['TSS — SFS',   ded.tssSFS  ?? 0],
          ['TSS — AFP',   ded.tssAFP  ?? 0],
          ['ISR',         ded.isr     ?? 0],
          ...(ded.otras > 0           ? [['Otras fijas',        ded.otras]]         as [string,number][] : []),
          ...(ded.otrosDescuentos > 0 ? [['Descuentos/Ausencias', ded.otrosDescuentos]] as [string,number][] : []),
          ['Total deducciones', ded.total ?? 0],
        ];
        const rowH = 16;
        const maxRows = Math.max(ingFilas.length, dedFilas.length);

        for (let i = 0; i < maxRows; i++) {
          const ry = y + i * rowH;
          const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
          doc.rect(MAR,             ry, half, rowH).fill(bg);
          doc.rect(MAR + half + 12, ry, half, rowH).fill(bg);

          if (ingFilas[i]) {
            const [lbl, val] = ingFilas[i];
            const isBruto = lbl === 'Salario Bruto';
            doc.fillColor(isBruto ? '#1a56db' : '#374151')
               .font(isBruto ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
               .text(lbl, MAR + 6, ry + 4, { width: half - 80 });
            doc.fillColor(isBruto ? '#1a56db' : '#111111')
               .font('Helvetica-Bold').fontSize(8)
               .text(fmtM(val), MAR + 6, ry + 4, { width: half - 8, align: 'right' });
          }
          if (dedFilas[i]) {
            const [lbl, val] = dedFilas[i];
            const isTotal = lbl === 'Total deducciones';
            doc.fillColor(isTotal ? '#dc2626' : '#374151')
               .font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
               .text(lbl, MAR + half + 18, ry + 4, { width: half - 80 });
            doc.fillColor(isTotal ? '#dc2626' : '#111111')
               .font('Helvetica-Bold').fontSize(8)
               .text(fmtM(val), MAR + half + 18, ry + 4, { width: half - 8, align: 'right' });
          }
        }
        y += maxRows * rowH + 6;

        // ── NOVEDADES ─────────────────────────────────────────────────────────
        if (novedades.length > 0) {
          doc.rect(MAR, y, CW, 16).fill('#7c3aed');
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
             .text('NOVEDADES DEL PERÍODO', MAR + 6, y + 5, { characterSpacing: 0.5 });
          y += 16;
          novedades.forEach((n: any, i: number) => {
            const esDesc = n.tipo === 'ausencia' || n.tipo === 'descuento';
            doc.rect(MAR, y, CW, 15).fill(i % 2 === 0 ? '#faf5ff' : '#ffffff');
            doc.fillColor('#374151').font('Helvetica').fontSize(8)
               .text(`${n.descripcion}${n.horas ? ` (${n.horas}h)` : ''}`, MAR + 6, y + 3, { width: CW - 120 });
            doc.fillColor(esDesc ? '#dc2626' : '#059669')
               .font('Helvetica-Bold').fontSize(8)
               .text(`${esDesc ? '-' : '+'}${fmtM(Math.abs(n.monto))}`, MAR + 6, y + 3, { width: CW - 8, align: 'right' });
            y += 15;
          });
          y += 4;
        }

        // ── CAJA SALARIO NETO ─────────────────────────────────────────────────
        y += 4;
        doc.rect(MAR, y, CW, 44).fill('#1a56db');
        doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica-Bold').fontSize(8)
           .text('SALARIO NETO A COBRAR', MAR + 14, y + 10, { characterSpacing: 1 });
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
           .text(fmtM(data.salarioNeto ?? 0), MAR + 14, y + 19, { width: CW - 20, align: 'right' });
        y += 54;

        // ── FIRMAS ────────────────────────────────────────────────────────────
        y += 24;
        const fw = (CW - 20) / 2;
        doc.moveTo(MAR, y + 24).lineTo(MAR + fw, y + 24).stroke('#374151');
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
           .text('Firma del Empleado', MAR, y + 27, { width: fw, align: 'center' });
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8)
           .text(emp.nombre ?? '', MAR, y + 38, { width: fw, align: 'center' });

        doc.moveTo(MAR + fw + 20, y + 24).lineTo(MAR + CW, y + 24).stroke('#374151');
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
           .text('Recursos Humanos', MAR + fw + 20, y + 27, { width: fw, align: 'center' });
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8)
           .text(emp2.nombre ?? '', MAR + fw + 20, y + 38, { width: fw, align: 'center' });

        // ── FOOTER ────────────────────────────────────────────────────────────
        doc.moveTo(MAR, 800).lineTo(W - MAR, 800).stroke('#e2e8f0');
        doc.fillColor('#9ca3af').font('Helvetica').fontSize(7)
           .text('HiCloud ERP · Recibo generado automáticamente', MAR, 806)
           .text(new Date().toLocaleString('es-DO'), 0, 806, { align: 'right', width: W - MAR });

        doc.end();
      });

      const nombre   = `${emp.nombre ?? 'Empleado'}`.replace(/\s+/g, '-');
      const filename = `Recibo-${nombre}-${per.periodo ?? ''}.pdf`;
      this.logger.log(`[ReciboPDF] ✅ PDF generado (PDFKit) — ${filename} (${buffer.length} bytes)`);
      return { buffer, filename };

    } catch (err: any) {
      this.logger.error(
        `[ReciboPDF] ❌ Error — empleado: "${emp.nombre ?? 'N/A'}", período: "${per.periodo ?? 'N/A'}"`,
        err?.stack ?? err?.message ?? String(err),
      );
      throw new InternalServerErrorException(
        `Error al generar el recibo PDF: ${err?.message ?? 'error desconocido'}`,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Resumen general
  // ──────────────────────────────────────────────────────────────────

  async getResumenNomina() {
    const empresaId = this.tenantService.getEmpresaId();
    const [totalEmpleados, empleadosActivos] = await Promise.all([
      this.empleadoRepository.count({ where: { isActive: true, empresaId } }),
      this.empleadoRepository.count({ where: { estado: EstadoEmpleado.ACTIVO, isActive: true, empresaId } }),
    ]);

    const ultimoPeriodo = await this.periodoRepository.findOne({
      where: { estado: EstadoNomina.PAGADA, isActive: true, empresaId } as any,
      order: { periodo: 'DESC' },
    });

    const periodosEnProceso = await this.periodoRepository.count({
      where: { estado: EstadoNomina.PROCESADA, isActive: true, empresaId } as any,
    });

    const novedadesPendientes = await this.novedadRepository.count({
      where: { empresaId, isActive: true, aplicado: false },
    });

    return {
      empleados: { total: totalEmpleados, activos: empleadosActivos },
      ultimoPeriodoPagado: ultimoPeriodo
        ? {
          periodo:   ultimoPeriodo.periodo,
          totalNeto: Number(ultimoPeriodo.totalNeto),
          empleados: ultimoPeriodo.totalEmpleados,
        }
        : null,
      periodosEnProceso,
      novedadesPendientes,
      generadoEn: new Date().toISOString(),
    };
  }
}
