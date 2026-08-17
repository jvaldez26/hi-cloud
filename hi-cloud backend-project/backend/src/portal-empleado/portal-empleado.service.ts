import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Empleado } from '../nomina/entities/empleado.entity';
import { ContratoLaboral } from '../nomina/entities/contrato-laboral.entity';
import { TenantService } from '../tenant/tenant.service';
import { IsrService } from '../isr/isr.service';
import { EmailService } from '../notificaciones/services/email.service';

@Injectable()
export class PortalEmpleadoService {
  private readonly logger = new Logger(PortalEmpleadoService.name);
  constructor(
    @InjectRepository(Empleado)        private empRepo:       Repository<Empleado>,
    @InjectRepository(ContratoLaboral) private contratoRepo:  Repository<ContratoLaboral>,
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
    private isrSvc:      IsrService,
    private emailSvc:    EmailService,
  ) {}

  // ─── Perfil del empleado vinculado al usuario logueado ───────────────────────
  // Vinculación por email: el email del usuario debe coincidir con el del empleado.

  async getMiPerfil(usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    // Obtener datos del usuario logueado
    const [userRow] = await this.dataSource.query<{ email: string; nombre: string }[]>(
      `SELECT email, nombre FROM users WHERE id = $1 LIMIT 1`,
      [usuarioId],
    );
    if (!userRow) throw new NotFoundException('Usuario no encontrado');

    // 1) Buscar por userId directo (vinculación explícita del admin)
    let emp = await this.empRepo
      .createQueryBuilder('e')
      .where('e."empresaId" = :eid', { eid: empresaId })
      .andWhere('e."userId" = :uid',  { uid: usuarioId })
      .andWhere('e."isActive" = :a',  { a: true })
      .getOne();

    // 2) Fallback: buscar por email coincidente (vinculación implícita)
    if (!emp) {
      emp = await this.empRepo
        .createQueryBuilder('e')
        .where('e."empresaId" = :eid',             { eid: empresaId })
        .andWhere('LOWER(e.email) = LOWER(:email)', { email: userRow.email })
        .andWhere('e."isActive" = :a',              { a: true })
        .getOne();
    }

    if (!emp) throw new NotFoundException(
      `Para habilitar el portal, el administrador debe vincular tu usuario ` +
      `de sistema (${userRow.email}) con tu registro de empleado en el módulo de Nómina.`,
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
        nombre:          emp.nombre,
        apellido:        emp.apellido,
        cedula:          emp.cedula,
        email:           emp.email ?? null,
        telefono:        emp.telefono ?? null,
        fechaNacimiento: emp.fechaNacimiento ?? null,
        cargo:           emp.cargo,
        departamento:    emp.departamento ?? null,
        fechaIngreso:    emp.fechaIngreso,
        salarioBase:     Number(emp.salarioBase),
        tipoContrato:    emp.tipoContrato,
        banco:           emp.banco ?? null,
        cuentaBancaria:  emp.cuentaBancaria ?? null,
        estado:          emp.estado,
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

  /**
   * El empleado solicita vinculación con su usuario del sistema.
   * Registra la solicitud y notifica al admin por log (el admin va a Nómina → Empleados).
   */
  async solicitarVinculacion(usuarioId: number) {
    const [userRow] = await this.dataSource.query<{ email: string; nombre: string }[]>(
      `SELECT email, nombre FROM users WHERE id = $1 LIMIT 1`,
      [usuarioId],
    );
    if (!userRow) throw new NotFoundException('Usuario no encontrado');

    this.logger.warn(
      `[SOLICITUD-VINCULACION] Usuario "${userRow.nombre}" (${userRow.email}) ` +
      `solicita ser vinculado con su empleado en el módulo de Nómina.`
    );

    return {
      ok: true,
      mensaje: `Solicitud enviada. El administrador recibirá la notificación y vinculará tu perfil desde Nómina → Empleados.`,
    };
  }

  // ─── Contrato laboral del empleado ───────────────────────────────────────────

  async getMiContratoLaboral(usuarioId: number) {
    const emp = await this.getMiPerfil(usuarioId);

    const contrato = await this.contratoRepo.findOne({
      where:  { empleadoId: emp.id, empresaId: emp.empresaId, isActive: true } as any,
      order:  { createdAt: 'DESC' },
    });

    if (!contrato) throw new NotFoundException(
      'No tienes contratos laborales registrados. Consulta con el área de Recursos Humanos.',
    );

    return {
      empleado: `${emp.nombre} ${emp.apellido}`,
      contrato: {
        id:           contrato.id,
        numero:       contrato.numero,
        tipo:         contrato.tipo,
        estado:       contrato.estado,
        fechaInicio:  contrato.fechaInicio,
        fechaFin:     contrato.fechaFin ?? null,
        salario:      Number(contrato.salario),
        cargo:        contrato.cargo,
        departamento: contrato.departamento ?? null,
        clausulas:    contrato.clausulas ?? null,
      },
    };
  }

  // ─── Carta de trabajo (certificación laboral) ────────────────────────────────

  async generarCartaTrabajo(usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const emp       = await this.getMiPerfil(usuarioId);

    // Obtener nombre de empresa
    const [empresa] = await this.dataSource.query<{ nombre: string; rnc: string }[]>(
      `SELECT "nombreComercial" AS nombre, rnc FROM empresa WHERE id = $1 LIMIT 1`,
      [empresaId],
    ).catch(() => [{ nombre: 'La Empresa', rnc: '' }]);

    const aniosServicio = emp.fechaIngreso
      ? Math.floor((Date.now() - new Date(emp.fechaIngreso).getTime()) / (1000 * 60 * 60 * 24 * 365))
      : 0;

    const fechaHoy = new Date().toLocaleDateString('es-DO', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const carta = {
      empresa:         empresa?.nombre ?? 'La Empresa',
      rnc:             empresa?.rnc ?? '',
      empleado:        `${emp.nombre} ${emp.apellido}`,
      cedula:          emp.cedula,
      cargo:           emp.cargo,
      departamento:    emp.departamento ?? null,
      tipoContrato:    emp.tipoContrato,
      fechaIngreso:    emp.fechaIngreso,
      aniosServicio,
      salarioBase:     Number(emp.salarioBase),
      fechaEmision:    fechaHoy,
      // Texto de la carta listo para imprimir
      texto: [
        `A QUIEN PUEDA INTERESAR:`,
        ``,
        `Mediante la presente, ${empresa?.nombre ?? 'La Empresa'} certifica que el/la Sr/Sra.`,
        `${emp.nombre} ${emp.apellido}, portador/a de la cédula de identidad No. ${emp.cedula ?? 'N/A'},`,
        `labora en esta empresa desde el ${new Date(emp.fechaIngreso).toLocaleDateString('es-DO')}`,
        `en el cargo de ${emp.cargo}${emp.departamento ? `, departamento de ${emp.departamento}` : ''},`,
        `con un contrato de tipo ${emp.tipoContrato}.`,
        ``,
        `La presente se expide para los fines que el/la interesado/a estime conveniente.`,
        ``,
        `Santo Domingo, República Dominicana, ${fechaHoy}.`,
      ].join('\n'),
    };

    return carta;
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

    // Notificar al admin de la empresa sobre la nueva solicitud — no-bloqueante
    this.notificarAdminNuevaSolicitud(empresaId, emp, dto.fechaInicio, dto.fechaFin, dias, dto.motivo)
      .catch(err => this.logger.warn(`[crearSolicitud] notificación admin empresa #${empresaId}: ${(err as Error).message}`));

    return { ok: true, id: result?.id, diasSolicitados: dias };
  }

  private async notificarAdminNuevaSolicitud(
    empresaId:   number,
    emp:         Empleado,
    fechaInicio: string,
    fechaFin:    string,
    dias:        number,
    motivo?:     string,
  ): Promise<void> {
    try {
      const [admin] = await this.dataSource.query<{ email: string; nombre: string }[]>(`
        SELECT u.email, u.nombre FROM users u
        JOIN usuario_empresa ue ON ue."userId" = u.id
        WHERE ue."empresaId" = $1 AND ue."isActive" = true AND ue."isPrincipal" = true
        LIMIT 1
      `, [empresaId]);
      if (!admin) return;

      const fmtD = (d: string) =>
        new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });

      await this.emailSvc.enviar({
        to: admin.email,
        subject: `Nueva solicitud de vacaciones — ${emp.nombre} ${emp.apellido}`,
        html: `
          <p>Hola ${admin.nombre},</p>
          <p>El empleado <strong>${emp.nombre} ${emp.apellido}</strong> ha enviado una solicitud de vacaciones que requiere tu atención:</p>
          <ul>
            <li><strong>Período:</strong> ${fmtD(fechaInicio)} al ${fmtD(fechaFin)}</li>
            <li><strong>Días hábiles:</strong> ${dias}</li>
            ${motivo ? `<li><strong>Motivo:</strong> ${motivo}</li>` : ''}
          </ul>
          <p>Puedes aprobar o rechazar esta solicitud desde el módulo de Vacaciones en HiCloud ERP.</p>
        `,
      });
    } catch (err) {
      this.logger.warn(`notificarAdminNuevaSolicitud empresa #${empresaId}: ${(err as Error).message}`);
    }
  }
}
