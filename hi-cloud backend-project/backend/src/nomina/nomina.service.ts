import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class NominaService {
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
    const total = await this.contratoRepository.count({ where: { empresaId } });
    return `CONT-${String(total + 1).padStart(4, '0')}`;
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

  async generarReciboPdf(data: any): Promise<{ buffer: Buffer; filename: string }> {
    const fmtM = (v: number) => `RD$ ${Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
    const fmtD = (d: any) => d ? new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const C = '#1a56db', G = '#059669', R = '#dc2626', GR = '#6b7280';
    const fila = (l: string, v: number, c = '#111') =>
      `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:12px"><span style="color:${GR}">${l}</span><span style="font-weight:600;color:${c}">${fmtM(v)}</span></div>`;

    const emp = data.empleado ?? {}, per = data.periodo ?? {}, ing = data.ingresos ?? {}, ded = data.deducciones ?? {}, emp2 = data.empresa ?? {};
    const novedades: any[] = data.novedades ?? [];

    const novedadesHtml = novedades.length > 0
      ? novedades.map((n: any) => {
          const signo = (n.tipo === 'ausencia' || n.tipo === 'descuento') ? '-' : '+';
          return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px solid #f5f5f5">
            <span style="color:${GR}">${n.descripcion}${n.horas ? ` (${n.horas}h)` : ''}</span>
            <span style="font-weight:600;color:${signo === '-' ? R : G}">${signo}${fmtM(Math.abs(n.monto))}</span>
          </div>`;
        }).join('')
      : '<div style="font-size:11px;color:#9ca3af">Sin novedades este período</div>';

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',Arial,sans-serif;font-size:12px;color:#111;background:#fff}@page{margin:10mm 12mm;size:Letter}</style>
</head><body>
<div style="background:linear-gradient(135deg,${C},#3b82f6);padding:20px 24px;margin-bottom:18px;color:#fff">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><div style="font-size:9px;opacity:.7;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Recibo de Sueldo</div><div style="font-size:20px;font-weight:800">${emp2.nombre ?? 'HiCloud ERP'}</div>${emp2.rnc ? `<div style="font-size:11px;opacity:.8">RNC: ${emp2.rnc}</div>` : ''}</div>
    <div style="text-align:right"><div style="font-size:9px;opacity:.7;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Período</div><div style="font-size:14px;font-weight:700">${per.periodo ?? ''}</div><div style="font-size:11px;opacity:.8">${fmtD(per.fechaInicio)} — ${fmtD(per.fechaFin)}</div><div style="font-size:11px;opacity:.8">Fecha de pago: ${fmtD(per.fechaPago)}</div></div>
  </div>
</div>
<div style="background:#f8fafc;border-radius:8px;padding:14px 16px;margin-bottom:16px;border-left:4px solid ${C}">
  <div style="font-size:9px;color:${C};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Datos del Empleado</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
    <div><span style="color:${GR}">Nombre: </span><strong>${emp.nombre ?? ''}</strong></div>
    <div><span style="color:${GR}">Cédula: </span><strong>${emp.cedula ?? ''}</strong></div>
    <div><span style="color:${GR}">Cargo: </span><span>${emp.cargo ?? '—'}</span></div>
    <div><span style="color:${GR}">Departamento: </span><span>${emp.departamento ?? '—'}</span></div>
    <div><span style="color:${GR}">Banco: </span><span>${emp.banco ?? '—'}</span></div>
    <div><span style="color:${GR}">Cuenta: </span><span>${emp.cuentaBancaria ?? '—'}</span></div>
    <div><span style="color:${GR}">Días trabajados: </span><strong>${per.diasTrabajados ?? 30}</strong></div>
    ${ing.horasExtras > 0 ? `<div><span style="color:${GR}">Horas extras: </span><strong style="color:${G}">${ing.horasExtras}h</strong></div>` : ''}
  </div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
  <div>
    <div style="font-size:9px;color:${G};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;border-left:3px solid ${G};padding-left:6px">Ingresos</div>
    ${fila('Salario Base', ing.salarioBase)}
    ${ing.montoHorasExtras > 0 ? fila(`Horas Extras (${ing.horasExtras}h)`, ing.montoHorasExtras, G) : ''}
    ${ing.bonos > 0 ? fila('Bonos', ing.bonos, G) : ''}
    ${fila('Salario Bruto', ing.salarioBruto, C)}
  </div>
  <div>
    <div style="font-size:9px;color:${R};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;border-left:3px solid ${R};padding-left:6px">Deducciones</div>
    ${fila('TSS — SFS', ded.tssSFS)}
    ${fila('TSS — AFP', ded.tssAFP)}
    ${fila('ISR', ded.isr)}
    ${ded.otras > 0 ? fila('Otras fijas', ded.otras) : ''}
    ${ded.otrosDescuentos > 0 ? fila('Descuentos/Ausencias', ded.otrosDescuentos) : ''}
    ${fila('Total deducciones', ded.total, R)}
  </div>
</div>
${novedades.length > 0 ? `
<div style="margin-bottom:16px">
  <div style="font-size:9px;color:#7c3aed;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;border-left:3px solid #7c3aed;padding-left:6px">Novedades del Período</div>
  ${novedadesHtml}
</div>` : ''}
<div style="background:${C};border-radius:8px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
  <div style="font-size:10px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1px">SALARIO NETO A COBRAR</div>
  <div style="font-size:24px;font-weight:900;color:#fff">${fmtM(data.salarioNeto ?? 0)}</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:10px">
  <div style="text-align:center"><div style="border-top:1px solid #374151;padding-top:6px;margin-top:32px;font-size:11px;color:${GR}">Firma del Empleado</div><div style="font-size:11px;font-weight:600;color:#111;margin-top:3px">${emp.nombre ?? ''}</div></div>
  <div style="text-align:center"><div style="border-top:1px solid #374151;padding-top:6px;margin-top:32px;font-size:11px;color:${GR}">Recursos Humanos</div><div style="font-size:11px;font-weight:600;color:#111;margin-top:3px">${emp2.nombre ?? ''}</div></div>
</div>
<div style="margin-top:16px;padding-top:8px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af">
  <span>HiCloud ERP · Recibo generado automáticamente</span>
  <span>${new Date().toLocaleString('es-DO')}</span>
</div>
</body></html>`;

    const puppeteer = await import('puppeteer');
    const browser   = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15_000 });
      const buf = await page.pdf({ format: 'Letter', printBackground: true });
      const nombre = `${emp.nombre ?? 'Empleado'}`.replace(/\s+/g, '-');
      return { buffer: Buffer.from(buf), filename: `Recibo-${nombre}-${per.periodo ?? ''}.pdf` };
    } finally { await browser.close(); }
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
