import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Empleado } from '../nomina/entities/empleado.entity';
import { ContratoLaboral } from '../nomina/entities/contrato-laboral.entity';
import { TenantService } from '../tenant/tenant.service';
import { IsrService } from '../isr/isr.service';
import { EmailService } from '../notificaciones/services/email.service';
import { fechaTextoRD } from '../common/utils/fecha-local.util';
import { reportServiceError } from '../common/observability/sentry';

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

    // BUG CORREGIDO (2026-09-06): las tablas reales son nomina_periodos y
    // nomina_lineas (orden de palabras invertido en el original: periodos_nomina
    // / lineas_nomina no existen). Además, diasTrabajados/salarioBruto/etc. son
    // columnas de la LÍNEA (por empleado), no del período — el original las leía
    // con el alias del período (pn.), que ni siquiera las tiene. El SELECT
    // fallaba SIEMPRE; el .catch(() => []) lo tragaba y "Mis recibos" del portal
    // del empleado mostraba lista vacía para TODOS los empleados, indefinidamente.
    //
    // Mapeo de nombres — el frontend (PortalEmpleadoPage.tsx, TabRecibos) espera
    // descuentoAfp/descuentoSfs/descuentoIsr, pero NominaLinea no tiene columnas
    // con esos nombres literales. Son el mismo concepto con el nombre que usa la
    // ley dominicana en el entity:
    //   descuentoAfp -> ln.tssAfpEmpleado  (TSS Empleado, Ley 87-01 — AFP)
    //   descuentoSfs -> ln.tssSfsEmpleado  (TSS Empleado, Ley 87-01 — SFS)
    //   descuentoIsr -> ln.isr             (ISR, Ley 179-09)
    const nominas = await this.dataSource.query<any[]>(`
      SELECT
        pn.id                    AS "periodoId",
        ln.id                    AS "lineaId",
        pn.periodo,
        ln."diasTrabajados",
        ln."salarioBruto"::text,
        ln."tssAfpEmpleado"::text AS "descuentoAfp",
        ln."tssSfsEmpleado"::text AS "descuentoSfs",
        ln.isr::text              AS "descuentoIsr",
        ln."salarioNeto"::text,
        pn.estado,
        pn."fechaPago"::text
      FROM nomina_periodos pn
      JOIN nomina_lineas ln ON ln."periodoId" = pn.id
      WHERE ln."empleadoId" = $1
        AND pn."empresaId"  = $2
        AND pn."isActive"   = true
      ORDER BY pn.periodo DESC
      LIMIT 24
    `, [emp.id, empresaId]).catch((err: Error) => {
      reportServiceError(err, 'portalEmpleado.getMisNominas.leerNominas', { empresaId, usuarioId });
      this.logger.error(`No se pudo leer nomina_periodos/nomina_lineas para empleado #${emp.id}: ${err.message}`);
      return [];
    });

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

    // BUG CORREGIDO (2026-09-06): la consulta original apuntaba a una tabla
    // "vacaciones" que nunca existió — la tabla real es solicitudes_vacacion
    // (entity SolicitudVacacion) y traía dos columnas inventadas (una de ellas
    // pretendía llamarse igual que este mismo concepto). La columna de días es
    // diasSolicitados, no la que usaba el original. La consulta fallaba
    // siempre, el .catch(() => []) lo tragaba en silencio, y "Mis vacaciones"
    // del portal del empleado mostraba historial vacío y 0 días usados para
    // TODOS los empleados, indefinidamente.
    //
    // La columna inventada no se reemplaza por nada: SolicitudVacacion no
    // tiene ese concepto (confirmado contra getMisSolicitudes(), que sí lee
    // esta tabla correctamente, y contra PortalEmpleadoPage.tsx, que no
    // renderiza ningún campo así). Cada fila de esta tabla YA es una solicitud
    // de vacaciones; no hace falta distinguir un tipo.
    const vacaciones = await this.dataSource.query<any[]>(`
      SELECT
        "fechaInicio"::text,
        "fechaFin"::text,
        "diasSolicitados" AS dias,
        estado,
        motivo
      FROM solicitudes_vacacion
      WHERE "empleadoId" = $1
        AND "empresaId"  = $2
        AND "isActive"   = true
      ORDER BY "fechaInicio" DESC
      LIMIT 20
    `, [emp.id, empresaId]).catch((err: Error) => {
      reportServiceError(err, 'portalEmpleado.getMisVacaciones.leerSolicitudes', { empresaId, usuarioId });
      this.logger.error(`No se pudo leer solicitudes_vacacion para empleado #${emp.id}: ${err.message}`);
      return [];
    });

    // Días acumulados por Ley 16-92 RD (14 días primeros 5 años, 18 días después)
    const aniosServicio = emp.fechaIngreso
      ? Math.floor((Date.now() - new Date(emp.fechaIngreso).getTime()) / (1000 * 60 * 60 * 24 * 365))
      : 0;
    const diasPorLey    = aniosServicio >= 5 ? 18 : 14;
    const diasUsados    = vacaciones
      .filter((v: any) => v.estado === 'aprobada')
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

    const fechaHoy = fechaTextoRD(new Date(), {
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
