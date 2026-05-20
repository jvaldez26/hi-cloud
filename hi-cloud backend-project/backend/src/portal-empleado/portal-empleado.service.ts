import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Empleado } from '../nomina/entities/empleado.entity';
import { TenantService } from '../tenant/tenant.service';
import { IsrService } from '../isr/isr.service';

@Injectable()
export class PortalEmpleadoService {
  constructor(
    @InjectRepository(Empleado) private empRepo: Repository<Empleado>,
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
    private isrSvc:      IsrService,
  ) {}

  // ─── Perfil del empleado vinculado al usuario logueado ───────────────────────
  // Vinculación por email: el email del usuario debe coincidir con el del empleado.

  async getMiPerfil(usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    // Obtener el email del usuario para buscar el empleado vinculado
    const [userRow] = await this.dataSource.query<{ email: string }[]>(
      `SELECT email FROM users WHERE id = $1 LIMIT 1`,
      [usuarioId],
    );
    if (!userRow) throw new NotFoundException('Usuario no encontrado');

    const emp = await this.empRepo
      .createQueryBuilder('e')
      .where('e."empresaId" = :eid',             { eid: empresaId })
      .andWhere('LOWER(e.email) = LOWER(:email)', { email: userRow.email })
      .andWhere('e."isActive" = :a',              { a: true })
      .getOne();

    if (!emp) throw new NotFoundException(
      'No hay un empleado vinculado a tu usuario en esta empresa. ' +
      'Pide al administrador que registre tu empleado con el correo: ' + userRow.email,
    );
    return emp;
  }

  // ─── Recibos de nómina del empleado ──────────────────────────────────────────

  async getMisNominas(usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const emp = await this.getMiPerfil(usuarioId);

    const nominas = await this.dataSource.query<any[]>(`
      SELECT
        pn.id            AS "periodoId",
        ln.id            AS "lineaId",
        pn.periodo,
        pn."diasTrabajados",
        pn."salarioBruto"::text,
        pn."descuentoAfp"::text,
        pn."descuentoSfs"::text,
        pn."descuentoIsr"::text,
        pn."otrosDescuentos"::text,
        pn."salarioNeto"::text,
        pn.estado,
        pn."fechaPago"::text
      FROM periodos_nomina pn
      JOIN lineas_nomina ln ON ln."periodoId" = pn.id
      WHERE ln."empleadoId" = $1
        AND pn."empresaId"  = $2
        AND pn."isActive"   = true
      ORDER BY pn.periodo DESC
      LIMIT 24
    `, [emp.id, empresaId]).catch(() => []);

    return { empleado: emp, nominas };
  }

  // ─── Resumen financiero del empleado ─────────────────────────────────────────

  async getMiResumen(usuarioId: number) {
    const emp    = await this.getMiPerfil(usuarioId);
    const calculo = this.isrSvc.calcularISR(Number(emp.salarioBase));

    return {
      empleado: {
        nombre:      `${emp.nombre} ${emp.apellido}`,
        cedula:      emp.cedula,
        cargo:       emp.cargo,
        departamento: emp.departamento,
        fechaIngreso: emp.fechaIngreso,
        salarioBase:  Number(emp.salarioBase),
        tipoContrato: emp.tipoContrato,
      },
      calculoMensual: {
        salarioBruto:    Number(emp.salarioBase),
        descuentoAfp:    calculo.deduccionAfp,
        descuentoSfs:    calculo.deduccionSfs,
        descuentoIsr:    calculo.isrMensual,
        totalDescuentos: +(calculo.deduccionAfp + calculo.deduccionSfs + calculo.isrMensual).toFixed(2),
        salarioNeto:     +(Number(emp.salarioBase) - calculo.deduccionAfp - calculo.deduccionSfs - calculo.isrMensual).toFixed(2),
      },
    };
  }

  // ─── Vacaciones del empleado ─────────────────────────────────────────────────

  async getMisVacaciones(usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const emp = await this.getMiPerfil(usuarioId);

    const vacaciones = await this.dataSource.query<any[]>(`
      SELECT
        v.tipo,
        v."fechaInicio"::text,
        v."fechaFin"::text,
        v.dias,
        v.estado,
        v.motivo
      FROM vacaciones v
      WHERE v."empleadoId" = $1
        AND v."empresaId"  = $2
        AND v."isActive"   = true
      ORDER BY v."fechaInicio" DESC
      LIMIT 20
    `, [emp.id, empresaId]).catch(() => []);

    // Días acumulados por Ley 16-92 RD (14 días primeros 5 años, 18 días después)
    const aniosServicio = emp.fechaIngreso
      ? Math.floor((Date.now() - new Date(emp.fechaIngreso).getTime()) / (1000 * 60 * 60 * 24 * 365))
      : 0;
    const diasPorLey    = aniosServicio >= 5 ? 18 : 14;
    const diasUsados    = vacaciones
      .filter((v: any) => v.estado === 'aprobada' && v.tipo === 'vacaciones')
      .reduce((s: number, v: any) => s + Number(v.dias ?? 0), 0);

    return {
      empleado:     `${emp.nombre} ${emp.apellido}`,
      aniosServicio,
      diasPorLey,
      diasUsados:   diasUsados % diasPorLey,
      diasDisponibles: Math.max(0, diasPorLey - (diasUsados % diasPorLey)),
      historial:    vacaciones,
    };
  }

  // ─── Solicitudes de vacaciones / permisos del empleado ───────────────────────

  async getMisSolicitudes(usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const emp = await this.getMiPerfil(usuarioId);

    const solicitudes = await this.dataSource.query<any[]>(`
      SELECT
        id,
        "fechaInicio"::text,
        "fechaFin"::text,
        "diasSolicitados",
        estado,
        motivo,
        "observacionAprobador",
        anio,
        "createdAt"::text
      FROM solicitudes_vacacion
      WHERE "empleadoId" = $1
        AND "empresaId"  = $2
        AND "isActive"   = true
      ORDER BY "createdAt" DESC
      LIMIT 50
    `, [emp.id, empresaId]).catch(() => []);

    return { empleado: emp, solicitudes };
  }

  async crearSolicitud(usuarioId: number, dto: {
    fechaInicio: string;
    fechaFin:    string;
    motivo?:     string;
  }) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const emp = await this.getMiPerfil(usuarioId);

    const inicio = new Date(dto.fechaInicio);
    const fin    = new Date(dto.fechaFin);
    if (fin < inicio) throw new BadRequestException('La fecha fin debe ser posterior a la fecha inicio');

    // Calcular días hábiles (lunes-viernes)
    let dias = 0;
    const d  = new Date(inicio);
    while (d <= fin) {
      if (d.getDay() !== 0 && d.getDay() !== 6) dias++;
      d.setDate(d.getDate() + 1);
    }
    if (dias <= 0) throw new BadRequestException('El período no contiene días hábiles');

    const [result] = await this.dataSource.query<{ id: number }[]>(`
      INSERT INTO solicitudes_vacacion
        ("empresaId", "empleadoId", "fechaInicio", "fechaFin", "diasSolicitados", estado, motivo, anio, "isActive", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, 'pendiente', $6, $7, true, NOW(), NOW())
      RETURNING id
    `, [empresaId, emp.id, dto.fechaInicio, dto.fechaFin, dias, dto.motivo ?? null, inicio.getFullYear()]);

    return { ok: true, id: result?.id, diasSolicitados: dias };
  }
}
