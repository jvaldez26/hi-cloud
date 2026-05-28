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
  // Helper principal: genera una factura a partir de la plantilla
  // ──────────────────────────────────────────────────────────────────

  private async generarDesdeTemplate(rec: FacturaRecurrente, fecha: Date): Promise<{ factura: Factura; folio: string }> {
    // 1. Guardia: la plantilla debe tener ítems
    const rawDetalles = Array.isArray(rec.detalles) ? rec.detalles : [];
    if (rawDetalles.length === 0) {
      throw new Error(`Plantilla "${rec.nombre}" no tiene ítems — no se puede generar factura`);
    }

    // 2. Calcular totales con fallback a precio del producto cuando precioUnitario = 0
    //    El JSON puede devolver valores como strings o números — se normaliza con parseFloat(String())
    let subtotal = 0, iva = 0;
    const detallesData: Array<{
      descripcion: string; productoId?: number;
      precioUnitario: number; cantidad: number; porcentajeIva: number;
      subtotal: number; importeIva: number; total: number;
    }> = [];

    for (let idx = 0; idx < rawDetalles.length; idx++) {
      const d = rawDetalles[idx] as any;
      let precio = parseFloat(String(d.precioUnitario ?? d.precio ?? 0)) || 0;

      // ── FALLBACK: si precio = 0 pero hay productoId, buscar precio actual en BD ──
      if (precio === 0 && d.productoId) {
        const [prod] = await this.ds.query<{ precio: string }[]>(
          `SELECT precio FROM productos WHERE id = $1 AND "isActive" = true AND "empresaId" = $2 LIMIT 1`,
          [d.productoId, rec.empresaId],
        );
        if (prod?.precio) {
          precio = parseFloat(String(prod.precio)) || 0;
          this.logger.log(
            `[Recurrentes] "${rec.nombre}" ítem ${idx + 1}: precioUnitario=0 en plantilla → ` +
            `usando precio del producto #${d.productoId}: ${precio}`,
          );
        }
      }

      const cantidad    = parseFloat(String(d.cantidad ?? 1)) || 1;
      const pctIva      = parseFloat(String(d.porcentajeIva ?? d.iva ?? 0)) || 0;
      const descripcion = (String(d.descripcion ?? d.concepto ?? d.nombre ?? '')).trim() || `Ítem ${idx + 1}`;
      const sub         = +(precio * cantidad).toFixed(2);
      const impIva      = +(sub * (pctIva / 100)).toFixed(2);

      subtotal = +(subtotal + sub).toFixed(2);
      iva      = +(iva + impIva).toFixed(2);

      detallesData.push({
        descripcion,
        productoId:     d.productoId != null ? Number(d.productoId) : undefined,
        precioUnitario: precio,
        cantidad,
        porcentajeIva:  pctIva,
        subtotal:       sub,
        importeIva:     impIva,
        total:          +(sub + impIva).toFixed(2),
      });
    }

    if (subtotal === 0) {
      this.logger.warn(
        `[Recurrentes] Plantilla "${rec.nombre}" (#${rec.id}) subtotal=0 después del fallback. ` +
        `Detalles raw: ${JSON.stringify(rawDetalles).slice(0, 300)}`,
      );
    }

    // 3. Folio atómico
    const folio = await generarNumeroSecuencial(
      this.ds, 'facturas', 'folio', '^FAC-[0-9]+$', 'FAC-', 1, rec.empresaId!,
    );

    // 4. Insertar cabecera de la factura
    const factura = await this.facturaRepository.save(
      this.facturaRepository.create({
        empresaId:           rec.empresaId,
        folio,
        fecha,
        estado:              FacturaEstado.BORRADOR,
        clienteId:           rec.clienteId,
        usuarioId:           rec.userId,
        notas:               `Factura recurrente: ${rec.nombre}`,
        subtotal,
        iva,
        total:               +(subtotal + iva).toFixed(2),
        facturaRecurrenteId: rec.id,
      }),
    );

    // 5. Insertar detalles
    await this.detalleRepository.save(
      this.detalleRepository.create(
        detallesData.map(d => ({ ...d, facturaId: factura.id })),
      ),
    );

    // 6. RECALCULAR totales desde la BD para garantizar coherencia
    //    (cubre cualquier edge-case de tipado entre el JSON de la plantilla y la BD)
    await this.ds.query(
      `UPDATE facturas
          SET subtotal  = (SELECT COALESCE(SUM(subtotal),    0) FROM factura_detalles WHERE "facturaId" = $1 AND "isActive" = true),
              iva       = (SELECT COALESCE(SUM("importeIva"), 0) FROM factura_detalles WHERE "facturaId" = $1 AND "isActive" = true),
              total     = (SELECT COALESCE(SUM(total),        0) FROM factura_detalles WHERE "facturaId" = $1 AND "isActive" = true)
        WHERE id = $1`,
      [factura.id],
    );

    // 7. Leer la factura actualizada
    const facturaFinal = await this.facturaRepository.findOne({ where: { id: factura.id } }) as Factura;

    this.logger.log(
      `[Recurrentes] "${rec.nombre}" → ${folio} | subtotal=${facturaFinal.subtotal} total=${facturaFinal.total}`,
    );

    return { factura: facturaFinal, folio };
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

    const resumenPorEmpresa = new Map<number, { generadas: number; errores: number; folios: string[] }>();

    for (const rec of pendientes) {
      try {
        if (rec.fechaFin && new Date(rec.fechaFin) < hoy) {
          await this.recurrenteRepository.update(rec.id, { activa: false });
          continue;
        }

        const { factura, folio } = await this.generarDesdeTemplate(rec, hoy);

        const proxima = this.calcularProxima(rec.frecuencia, rec.diaEjecucion, hoy);
        await this.recurrenteRepository.update(rec.id, {
          ultimaEjecucion:  hoy,
          proximaEjecucion: proxima,
          totalGeneradas:   rec.totalGeneradas + 1,
        });

        if (rec.empresaId) {
          const emp = resumenPorEmpresa.get(rec.empresaId) ?? { generadas: 0, errores: 0, folios: [] };
          emp.generadas++;
          emp.folios.push(folio);
          resumenPorEmpresa.set(rec.empresaId, emp);
        }

        // Enviar email al cliente (non-blocking)
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
        if (rec.empresaId) {
          const emp = resumenPorEmpresa.get(rec.empresaId) ?? { generadas: 0, errores: 0, folios: [] };
          emp.errores++;
          resumenPorEmpresa.set(rec.empresaId, emp);
        }
      }
    }

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
        const [emp] = await this.ds.query<{ configuracion: any; nombre: string }[]>(
          `SELECT configuracion, nombre FROM empresa WHERE id = $1 AND "isActive" = true`,
          [empresaId],
        );
        if (!emp) continue;
        const cfg = (emp.configuracion ?? {}) as Record<string, unknown>;
        if (cfg.notifFactRecurrente === false) continue;

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
    _rec: FacturaRecurrente,
    empresaId: number,
  ): Promise<void> {
    const clienteEmail = factura.cliente?.email;
    if (!clienteEmail) {
      this.logger.debug(`[EmailFactura] Cliente #${factura.clienteId} sin email — se omite`);
      return;
    }

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

    const { buffer, filename } = await this.pdfService.generarPDFDesdeEntidad(factura, empresaId);

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

    const { factura, folio } = await this.generarDesdeTemplate(rec, hoy);

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
