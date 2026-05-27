import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { FacturaRecurrente, Frecuencia } from './entities/factura-recurrente.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { User } from '../users/users.entity';
import { TenantService } from '../tenant/tenant.service';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { EmailService } from '../notificaciones/services/email.service';
import { PDFService } from '../facturas/services/pdf.service';

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
    @InjectDataSource() private ds: DataSource,
    private tenantService: TenantService,
    private emailService:  EmailService,
    private pdfService:    PDFService,
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

  /** Historial de facturas generadas por una plantilla recurrente. */
  async historialRecurrente(id: number, pagination: PaginationDto) {
    await this.findById(id); // lanza 404 si no existe
    const page  = pagination.page  ?? 1;
    const limit = pagination.limit ?? 10;
    const [data, total] = await this.facturaRepository.findAndCount({
      where:  { facturaRecurrenteId: id, isActive: true },
      order:  { createdAt: 'DESC' },
      skip:   (page - 1) * limit,
      take:   limit,
      select: ['id', 'folio', 'fecha', 'estado', 'total', 'subtotal', 'iva', 'createdAt', 'clienteId'],
    });
    return { data, meta: { total, page, pageSize: limit } };
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

    // Rastrear resultados por empresa para el email de notificación
    const resumenPorEmpresa = new Map<number, { generadas: number; errores: number; folios: string[] }>();

    for (const rec of pendientes) {
      try {
        // Verificar que no haya pasado la fecha fin
        if (rec.fechaFin && new Date(rec.fechaFin) < hoy) {
          await this.recurrenteRepository.update(rec.id, { activa: false });
          continue;
        }

        // Calcular totales — normalizar a números para evitar NaN en BD
        let subtotal = 0, iva = 0;
        const detallesData = rec.detalles.map((d, idx) => {
          const precio      = Number(d.precioUnitario ?? 0) || 0;
          const cantidad    = Number(d.cantidad       ?? 1) || 1;
          const pctIva      = Number(d.porcentajeIva  ?? 0) || 0;
          const descripcion = (d.descripcion ?? '').trim() || `Ítem ${idx + 1}`;
          const sub         = precio * cantidad;
          const impIva      = sub * (pctIva / 100);
          subtotal += sub; iva += impIva;
          return { ...d, descripcion, precioUnitario: precio, cantidad, porcentajeIva: pctIva,
                   subtotal: sub, importeIva: impIva, total: sub + impIva };
        });

        // Generar folio atómico con la misma utilidad que facturas regulares
        const folio = await generarNumeroSecuencial(
          this.ds, 'facturas', 'folio', '^FAC-[0-9]+$', 'FAC-', 1, rec.empresaId!,
        );

        // Crear factura — propaga empresaId del recurrente
        const factura = await this.facturaRepository.save(
          this.facturaRepository.create({
            empresaId:           rec.empresaId,
            folio,
            fecha:               hoy,
            estado:              FacturaEstado.BORRADOR,
            clienteId:           rec.clienteId,
            usuarioId:           rec.userId,
            notas:               `Factura recurrente: ${rec.nombre}`,
            subtotal:            Number(subtotal.toFixed(2)),
            iva:                 Number(iva.toFixed(2)),
            total:               Number((subtotal + iva).toFixed(2)),
            facturaRecurrenteId: rec.id,   // trazabilidad al template
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

        // Acumular para el email resumen
        if (rec.empresaId) {
          const emp = resumenPorEmpresa.get(rec.empresaId) ?? { generadas: 0, errores: 0, folios: [] };
          emp.generadas++;
          emp.folios.push(folio);
          resumenPorEmpresa.set(rec.empresaId, emp);
        }

        // Enviar email al cliente (non-blocking — carga relaciones, luego dispara)
        if (rec.empresaId) {
          this.facturaRepository.findOne({
            where: { id: factura.id },
            relations: ['cliente', 'detalles'],
          }).then(fConRel => {
            if (!fConRel) return;
            return this.enviarEmailFactura(fConRel, rec, rec.empresaId!);
          }).catch(e =>
            this.logger.warn(`[EmailFactura] Falló cron "${rec.nombre}": ${e?.message}`),
          );
        }

        this.logger.log(`✅ Factura recurrente "${rec.nombre}" → ${folio} (próxima: ${proxima.toDateString()})`);
      } catch (err) {
        this.logger.error(`Error generando recurrente #${rec.id}: ${(err as Error).message}`);
        // Acumular errores
        if (rec.empresaId) {
          const emp = resumenPorEmpresa.get(rec.empresaId) ?? { generadas: 0, errores: 0, folios: [] };
          emp.errores++;
          resumenPorEmpresa.set(rec.empresaId, emp);
        }
      }
    }

    // Enviar email resumen a las empresas con notifFactRecurrente habilitado
    await this.notificarResumen(resumenPorEmpresa).catch(e =>
      this.logger.warn(`[Recurrentes] Email resumen falló: ${e?.message}`),
    );
  }

  private async notificarResumen(
    resumen: Map<number, { generadas: number; errores: number; folios: string[] }>,
  ): Promise<void> {
    if (resumen.size === 0) return;

    for (const [empresaId, r] of resumen.entries()) {
      try {
        // Verificar flag de notificación de la empresa
        const [emp] = await this.ds.query<{ configuracion: any; nombre: string }[]>(
          `SELECT configuracion, nombre FROM empresa WHERE id = $1 AND "isActive" = true`,
          [empresaId],
        );
        if (!emp) continue;
        const cfg = (emp.configuracion ?? {}) as Record<string, unknown>;
        if (cfg.notifFactRecurrente === false) continue; // flag desactivado

        // Obtener emails de admin/contador de la empresa
        const admins = await this.ds.query<{ email: string; nombre: string }[]>(
          `SELECT u.email, u.nombre FROM users u
           JOIN usuario_empresa ue ON ue."userId" = u.id
           WHERE ue."empresaId" = $1 AND ue."isActive" = true
             AND u."isActive" = true AND u.role IN ('admin','contador')
           LIMIT 5`,
          [empresaId],
        );
        if (!admins.length) continue;

        const foliosList = r.folios.length > 5
          ? [...r.folios.slice(0, 5), `... y ${r.folios.length - 5} más`]
          : r.folios;

        const html = `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <div style="background:#0F172A;padding:20px 24px;border-radius:10px 10px 0 0">
              <div style="color:#F59E0B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">
                🔄 Facturas Recurrentes — ${emp.nombre}
              </div>
            </div>
            <div style="background:#fff;padding:20px 24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px">
              <p style="margin:0 0 12px;color:#0F172A;font-size:14px">
                El cron diario de hoy generó <strong>${r.generadas} factura(s)</strong>:
              </p>
              <ul style="margin:0 0 12px;padding-left:20px;color:#475569;font-size:13px">
                ${foliosList.map(f => `<li>${f}</li>`).join('')}
              </ul>
              ${r.errores > 0 ? `<p style="color:#DC2626;font-size:13px">⚠ ${r.errores} factura(s) no se pudieron generar por errores. Revisa los logs.</p>` : ''}
              <p style="color:#94A3B8;font-size:11px;margin:8px 0 0">Las facturas están en estado <strong>Borrador</strong> — revisar y emitir.</p>
            </div>
          </div>`;

        await this.emailService.enviar({
          to:      admins.map(a => a.email),
          subject: `🔄 ${r.generadas} factura(s) recurrente(s) generadas — ${emp.nombre}`,
          html,
        });

        this.logger.log(`[Recurrentes] Email enviado a empresa #${empresaId}: ${r.generadas} generadas`);
      } catch (err) {
        this.logger.warn(`[Recurrentes] Error notificando empresa #${empresaId}: ${(err as Error).message}`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Email automático al cliente cuando se genera una factura recurrente
  // ──────────────────────────────────────────────────────────────────

  private async enviarEmailFactura(
    factura: Factura,
    rec: FacturaRecurrente,
    empresaId: number,
  ): Promise<void> {
    // 1. Verificar que el cliente tiene email
    const clienteEmail = factura.cliente?.email;
    if (!clienteEmail) {
      this.logger.debug(`[EmailFactura] Cliente #${factura.clienteId} sin email — se omite`);
      return;
    }

    // 2. Verificar flag de la empresa: autoEmailFacturaRecurrente (default: true)
    const [emp] = await this.ds.query<{ configuracion: any; nombre: string; razonSocial: string }[]>(
      `SELECT configuracion, nombre, "razonSocial" FROM empresa WHERE id = $1 AND "isActive" = true`,
      [empresaId],
    );
    if (!emp) return;
    const cfg = (emp.configuracion ?? {}) as Record<string, unknown>;
    if (cfg.autoEmailFacturaRecurrente === false) {
      this.logger.debug(`[EmailFactura] autoEmailFacturaRecurrente desactivado para empresa #${empresaId}`);
      return;
    }

    // 3. Generar PDF (fuera del contexto HTTP — usa empresaId directo)
    const { buffer, filename } = await this.pdfService.generarPDFDesdeEntidad(factura, empresaId);

    // 4. Construir HTML del email
    const empresaNombre = emp.razonSocial || emp.nombre || 'HiCloud ERP';
    const clienteNombre = factura.cliente?.nombre || 'Cliente';
    const folio         = factura.folio;
    const total         = Number(factura.total ?? 0).toLocaleString('es-DO', {
      style: 'currency', currency: factura.moneda || 'DOP',
    });

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#0F172A;padding:20px 24px;border-radius:10px 10px 0 0">
          <div style="color:#F59E0B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">
            📄 Factura — ${empresaNombre}
          </div>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px">
          <p style="margin:0 0 12px;color:#0F172A;font-size:14px">
            Estimado/a <strong>${clienteNombre}</strong>,
          </p>
          <p style="margin:0 0 16px;color:#475569;font-size:13px">
            Adjunto encontrará la factura <strong>${folio}</strong> por un total de <strong>${total}</strong>.
          </p>
          <p style="margin:0 0 8px;color:#475569;font-size:13px">
            Para consultas sobre esta factura, no dude en contactarnos.
          </p>
          <p style="color:#94A3B8;font-size:11px;margin:16px 0 0;border-top:1px solid #F1F5F9;padding-top:12px">
            ${empresaNombre} · Factura generada automáticamente por HiCloud ERP
          </p>
        </div>
      </div>`;

    // 5. Enviar email — no-throw
    await this.emailService.enviar({
      to:      clienteEmail,
      subject: `Factura ${folio} — ${empresaNombre}`,
      html,
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });

    this.logger.log(`[EmailFactura] Enviada ${folio} a ${clienteEmail}`);
  }

  async ejecutarAhora(id: number) {
    const rec = await this.findById(id);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Generar factura directamente (sin depender del cron ni afectar otras empresas)
    let subtotal = 0, iva = 0;
    const detallesData = rec.detalles.map((d, idx) => {
      const precio      = Number(d.precioUnitario ?? 0) || 0;
      const cantidad    = Number(d.cantidad       ?? 1) || 1;
      const pctIva      = Number(d.porcentajeIva  ?? 0) || 0;
      const descripcion = (d.descripcion ?? '').trim() || `Ítem ${idx + 1}`;
      const sub         = precio * cantidad;
      const impIva      = sub * (pctIva / 100);
      subtotal += sub; iva += impIva;
      return { ...d, descripcion, precioUnitario: precio, cantidad, porcentajeIva: pctIva,
               subtotal: sub, importeIva: impIva, total: sub + impIva };
    });

    const folio = await generarNumeroSecuencial(
      this.ds, 'facturas', 'folio', '^FAC-[0-9]+$', 'FAC-', 1, rec.empresaId!,
    );

    const factura = await this.facturaRepository.save(
      this.facturaRepository.create({
        empresaId:           rec.empresaId,
        folio,
        fecha:               hoy,
        estado:              FacturaEstado.BORRADOR,
        clienteId:           rec.clienteId,
        usuarioId:           rec.userId,
        notas:               `Factura recurrente: ${rec.nombre}`,
        subtotal:            Number(subtotal.toFixed(2)),
        iva:                 Number(iva.toFixed(2)),
        total:               Number((subtotal + iva).toFixed(2)),
        facturaRecurrenteId: rec.id,   // trazabilidad al template
      }),
    );

    await this.detalleRepository.save(
      this.detalleRepository.create(
        detallesData.map(d => ({ ...d, facturaId: factura.id })),
      ),
    );

    // Calcular próxima ejecución desde hoy
    const proxima = this.calcularProxima(rec.frecuencia, rec.diaEjecucion, hoy);

    await this.recurrenteRepository.update(id, {
      ultimaEjecucion:  hoy,
      proximaEjecucion: proxima,
      totalGeneradas:   rec.totalGeneradas + 1,
    });

    this.logger.log(
      `✅ Ejecución manual "${rec.nombre}" → ${folio} (próxima: ${proxima.toDateString()})`,
    );

    // Enviar email al cliente (non-blocking, no falla la generación)
    if (rec.empresaId) {
      const facturaConRelaciones = await this.facturaRepository.findOne({
        where: { id: factura.id },
        relations: ['cliente', 'detalles'],
      });
      if (facturaConRelaciones) {
        this.enviarEmailFactura(facturaConRelaciones, rec, rec.empresaId).catch(e =>
          this.logger.warn(`[EmailFactura] Falló envío manual "${rec.nombre}": ${e?.message}`),
        );
      }
    }

    return this.findById(id);
  }
}
