import { randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Factura } from '../facturas/entities/factura.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { TenantService } from '../tenant/tenant.service';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { Cotizacion } from '../cotizaciones/entities/cotizacion.entity';
import { Conduce } from '../conduce/entities/conduce.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { NotaCredito } from '../notas-credito/entities/nota-credito.entity';
import { NotaDebito } from '../notas-debito/entities/nota-debito.entity';

export interface MensajeWhatsApp {
  texto:        string;
  encoded:      string;
  link:         string;
  numero?:      string;
  linkPublico?: string;
}

const FMT_DOP = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v);

@Injectable()
export class ComunicacionesService {
  constructor(
    @InjectRepository(Factura)          private facturaRepo:  Repository<Factura>,
    @InjectRepository(Cliente)          private clienteRepo:  Repository<Cliente>,
    @InjectRepository(CuentaPorCobrar)  private cxcRepo:      Repository<CuentaPorCobrar>,
    @InjectRepository(Cotizacion)       private cotizRepo:    Repository<Cotizacion>,
    @InjectRepository(Conduce)          private conduceRepo:  Repository<Conduce>,
    @InjectRepository(Empresa)          private empresaRepo:  Repository<Empresa>,
    @InjectRepository(NotaCredito)      private ncRepo:       Repository<NotaCredito>,
    @InjectRepository(NotaDebito)       private ndRepo:       Repository<NotaDebito>,
    private tenantSvc: TenantService,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildLink(texto: string, telefono?: string): MensajeWhatsApp {
    const encoded = encodeURIComponent(texto);
    const numero  = telefono?.replace(/\D/g, '') ?? '';
    const link    = numero
      ? `https://wa.me/${numero.startsWith('1') ? '' : '1809'}${numero}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    return { texto, encoded, link, numero: numero || undefined };
  }

  private async getEmpresaNombre(empresaId: number): Promise<string> {
    const emp = await this.empresaRepo.findOne({ where: { id: empresaId } });
    return emp?.nombreComercial ?? emp?.nombre ?? 'HiCloud ERP';
  }

  // ─── Mensajes para Facturas ───────────────────────────────────────────────────

  async mensajeFactura(facturaId: number, _appUrl?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const factura   = await this.facturaRepo.findOne({ where: { id: facturaId, empresaId } });
    if (!factura) throw new NotFoundException('Factura no encontrada');

    const cliente = await this.clienteRepo.findOne({ where: { id: factura.clienteId } });
    const empresa = await this.getEmpresaNombre(empresaId);

    // Auto-activar portal token del cliente para generar el link público
    let linkPublico = '';
    if (cliente) {
      const ahora    = new Date();
      const expirado = !cliente.portalTokenExpiry || new Date(cliente.portalTokenExpiry) < ahora;
      if (!cliente.portalToken || expirado) {
        const token  = randomBytes(32).toString('hex');
        const expiry = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);
        await this.clienteRepo.update(cliente.id, { portalToken: token, portalTokenExpiry: expiry });
        cliente.portalToken       = token;
        cliente.portalTokenExpiry = expiry;
      }
      const baseUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
      linkPublico   = `${baseUrl}/portal/${cliente.portalToken}`;
    }

    const texto = [
      `Estimado/a *${cliente?.nombre ?? 'Cliente'}*,`,
      '',
      `Le informamos que su *factura ${factura.folio}* por *${FMT_DOP(Number(factura.total))}*`,
      `con fecha *${new Date(factura.fecha).toLocaleDateString('es-DO')}* ya está disponible.`,
      ...(linkPublico ? ['', `📄 Ver y descargar su factura: ${linkPublico}`] : []),
      '',
      `Para cualquier consulta estamos a su disposición.`,
      '',
      `_${empresa}_`,
    ].join('\n');

    return { ...this.buildLink(texto, cliente?.telefono), linkPublico };
  }

  // ─── Recordatorios CxC ───────────────────────────────────────────────────────

  async recordatorioCxC(cxcId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cxc       = await this.cxcRepo.findOne({
      where: { id: cxcId, empresaId },
      relations: ['cliente'],
    });
    if (!cxc) throw new NotFoundException('Cuenta por cobrar no encontrada');

    const empresa  = await this.getEmpresaNombre(empresaId);
    const vencida  = cxc.fechaVencimiento < new Date();
    const diasPast = vencida
      ? Math.floor((Date.now() - new Date(cxc.fechaVencimiento).getTime()) / 86400000)
      : 0;

    const texto = [
      `Estimado/a *${(cxc as any).cliente?.nombre ?? 'Cliente'}*,`,
      '',
      vencida
        ? `⚠️ Le recordamos que la *Factura ${(cxc as any).factura?.folio ?? `#${cxc.facturaId}`}* por *${FMT_DOP(Number(cxc.montoPendiente))}* venció hace *${diasPast} día(s)*.`
        : `Le recordamos que la *Factura ${(cxc as any).factura?.folio ?? `#${cxc.facturaId}`}* por *${FMT_DOP(Number(cxc.montoPendiente))}* vence el *${new Date(cxc.fechaVencimiento).toLocaleDateString('es-DO')}*.`,
      '',
      `Le agradecemos su pronto pago para mantener su crédito al día.`,
      '',
      `Para coordinar el pago puede contactarnos directamente.`,
      '',
      `_${empresa}_`,
    ].join('\n');

    return this.buildLink(texto, (cxc as any).cliente?.telefono);
  }

  // ─── Recordatorios CxC masivos ────────────────────────────────────────────────

  async listaCxCPendientes() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cuentas   = await this.cxcRepo.find({
      where: { empresaId, estado: In(['pendiente', 'pagada_parcial']) as any },
      relations: ['cliente'],
      order: { fechaVencimiento: 'ASC' },
    });

    return cuentas.map(c => ({
      id:              c.id,
      facturaId:       c.facturaId,
      clienteNombre:   (c as any).cliente?.nombre ?? `Cliente #${c.clienteId}`,
      clienteTelefono: (c as any).cliente?.telefono,
      montoPendiente:  Number(c.montoPendiente),
      fechaVencimiento: c.fechaVencimiento,
      diasVencida:     c.fechaVencimiento < new Date()
        ? Math.floor((Date.now() - new Date(c.fechaVencimiento).getTime()) / 86400000)
        : 0,
    }));
  }

  // ─── Mensajes para Cotizaciones ───────────────────────────────────────────────

  async mensajeCotizacion(cotizacionId: number, appUrl?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const cot       = await this.cotizRepo.findOne({ where: { id: cotizacionId, empresaId } });
    if (!cot) throw new NotFoundException('Cotización no encontrada');

    const cliente  = await this.clienteRepo.findOne({ where: { id: cot.clienteId } });
    const empresa  = await this.getEmpresaNombre(empresaId);
    const linkCot  = appUrl ? `${appUrl}/cotizaciones/${cotizacionId}` : '';

    const texto = [
      `Estimado/a *${cliente?.nombre ?? 'Cliente'}*,`,
      '',
      `Adjunto encontrará nuestra *Cotización ${cot.numero}* por *${FMT_DOP(Number(cot.total))}*`,
      `con validez hasta *${new Date(cot.fechaVencimiento).toLocaleDateString('es-DO')}*.`,
      '',
      linkCot ? `📎 Ver cotización: ${linkCot}` : '',
      '',
      `Esperamos su confirmación para proceder.`,
      `*¡Gracias por su preferencia!*`,
      '',
      `_${empresa}_`,
    ].filter(Boolean).join('\n');

    return this.buildLink(texto, cliente?.telefono);
  }

  // ─── Mensajes para Conduces ───────────────────────────────────────────────────

  async mensajeConduce(conduceId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const conduce   = await this.conduceRepo.findOne({ where: { id: conduceId, empresaId } });
    if (!conduce) throw new NotFoundException('Conduce no encontrado');

    const cliente = await this.clienteRepo.findOne({ where: { id: conduce.clienteId } });
    const empresa = await this.getEmpresaNombre(empresaId);

    const texto = [
      `Estimado/a *${cliente?.nombre ?? 'Cliente'}*,`,
      '',
      `Le informamos que su pedido *${conduce.numero}* está en camino.`,
      '',
      `📦 Ítems: *${conduce.detalles?.length ?? 0}*`,
      `🏠 Destino: *${conduce.direccionEntrega}*`,
      conduce.conductor ? `🚗 Conductor: *${conduce.conductor}*` : '',
      conduce.vehiculo  ? `🚘 Vehículo: *${conduce.vehiculo}*`  : '',
      '',
      `Le avisaremos cuando sea entregado.`,
      '',
      `_${empresa}_`,
    ].filter(Boolean).join('\n');

    return this.buildLink(texto, cliente?.telefono ?? conduce.telefonoContacto);
  }

  // ─── Mensajes para Notas de Crédito (E34) ────────────────────────────────────

  async mensajeNotaCredito(ncId: number, apiBaseUrl?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const nc        = await this.ncRepo.findOne({
      where:     { id: ncId, empresaId },
      relations: ['cliente'],
    });
    if (!nc) throw new NotFoundException('Nota de crédito no encontrada');

    const empresa = await this.getEmpresaNombre(empresaId);
    const cliente = (nc as any).cliente;
    const linkPdf = apiBaseUrl ? `${apiBaseUrl}/notas-credito/${ncId}/pdf` : '';

    const texto = [
      `Estimado/a *${cliente?.nombre ?? 'Cliente'}*,`,
      '',
      `Le informamos que hemos emitido una *Nota de Crédito ${nc.numero}*`,
      `por un monto de *${FMT_DOP(Number(nc.total))}*.`,
      nc.facturaOriginalFolio ? `Factura relacionada: *${nc.facturaOriginalFolio}*` : '',
      '',
      linkPdf ? `📎 Descargar NC: ${linkPdf}` : '',
      '',
      `Para consultas estamos a su disposición.`,
      '',
      `_${empresa}_`,
    ].filter(Boolean).join('\n');

    return this.buildLink(texto, cliente?.telefono);
  }

  // ─── Mensajes para Notas de Débito (E33) ─────────────────────────────────────

  async mensajeNotaDebito(ndId: number, apiBaseUrl?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const nd        = await this.ndRepo.findOne({
      where:     { id: ndId, empresaId },
      relations: ['cliente'],
    });
    if (!nd) throw new NotFoundException('Nota de débito no encontrada');

    const empresa = await this.getEmpresaNombre(empresaId);
    const cliente = (nd as any).cliente;
    const linkPdf = apiBaseUrl ? `${apiBaseUrl}/notas-debito/${ndId}/pdf` : '';

    const texto = [
      `Estimado/a *${cliente?.nombre ?? 'Cliente'}*,`,
      '',
      `Le informamos que hemos emitido una *Nota de Débito ${nd.numero}*`,
      `por un monto adicional de *${FMT_DOP(Number(nd.total))}*.`,
      nd.facturaOriginalFolio ? `Factura relacionada: *${nd.facturaOriginalFolio}*` : '',
      '',
      linkPdf ? `📎 Descargar ND: ${linkPdf}` : '',
      '',
      `Para consultas estamos a su disposición.`,
      '',
      `_${empresa}_`,
    ].filter(Boolean).join('\n');

    return this.buildLink(texto, cliente?.telefono);
  }

  // ─── Plantillas personalizables ──────────────────────────────────────────────

  getPlantillas() {
    return {
      bienvenida: {
        nombre:  'Bienvenida a cliente nuevo',
        texto:   '¡Bienvenido/a a {empresa}! 🎉\n\nEs un placer tenerle como cliente. Estamos para servirle.\n\n_{empresa}_',
        campos:  ['empresa', 'clienteNombre'],
      },
      cobranza: {
        nombre:  'Recordatorio de cobranza',
        texto:   'Estimado/a {clienteNombre}, le recordamos el pago pendiente de *{monto}* (Factura {folio}). Vencimiento: *{fecha}*.\n\n_{empresa}_',
        campos:  ['clienteNombre', 'monto', 'folio', 'fecha', 'empresa'],
      },
      pago_recibido: {
        nombre:  'Confirmación de pago',
        texto:   'Estimado/a {clienteNombre}, confirmamos recepción de su pago de *{monto}*. ¡Gracias! 🙏\n\n_{empresa}_',
        campos:  ['clienteNombre', 'monto', 'empresa'],
      },
      promocion: {
        nombre:  'Anuncio de promoción',
        texto:   '¡{empresa} tiene una oferta especial para usted! 🎁\n\n{descripcion}\n\nVálido hasta: {fechaFin}\n\n¡No se lo pierda!',
        campos:  ['empresa', 'descripcion', 'fechaFin'],
      },
    };
  }
}
