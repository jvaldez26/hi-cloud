import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, DataSource } from 'typeorm';
import { TenantService } from '../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { ECF, EstadoDGII } from './entities/ecf.entity';
import { TipoECF } from './entities/tipo-ecf.entity';
import { SecuenciaECF } from './entities/secuencia-ecf.entity';
import { ProveedorECF } from './entities/proveedor-ecf.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { CreateSecuenciaECFDto } from './dto/create-secuencia-ecf.dto';
import { UpdateEstadoECFDto } from './dto/update-estado-ecf.dto';
import { FiltroECFDto } from './dto/filtro-ecf.dto';
import { CreateProveedorECFDto } from './dto/create-proveedor-ecf.dto';
import { UpdateProveedorECFDto } from './dto/update-proveedor-ecf.dto';
import { ECFHttpService } from './services/ecf-http.service';

const MAX_INTENTOS = 3;

const SEED_TIPOS: Partial<TipoECF>[] = [
  { codigo: 'E31', descripcion: 'Facturas de Crédito Fiscal Electrónica',   prefijo: 'E31', requiereRNC: true,  aplicaITBIS: true  },
  { codigo: 'E32', descripcion: 'Facturas de Consumo Electrónica',          prefijo: 'E32', requiereRNC: false, aplicaITBIS: true  },
  { codigo: 'E33', descripcion: 'Notas de Débito Electrónica',              prefijo: 'E33', requiereRNC: false, aplicaITBIS: true  },
  { codigo: 'E34', descripcion: 'Notas de Crédito Electrónica',             prefijo: 'E34', requiereRNC: false, aplicaITBIS: true  },
  { codigo: 'E41', descripcion: 'Compras Electrónicas',                     prefijo: 'E41', requiereRNC: true,  aplicaITBIS: true  },
  { codigo: 'E43', descripcion: 'Gastos Menores Electrónicos',              prefijo: 'E43', requiereRNC: false, aplicaITBIS: true  },
  { codigo: 'E44', descripcion: 'Regímenes Especiales Electrónicos',        prefijo: 'E44', requiereRNC: false, aplicaITBIS: false  },
  { codigo: 'E45', descripcion: 'Gubernamentales Electrónicos',             prefijo: 'E45', requiereRNC: true,  aplicaITBIS: false  },
  { codigo: 'E46', descripcion: 'Exportaciones Electrónicas',               prefijo: 'E46', requiereRNC: false, aplicaITBIS: false  },
  { codigo: 'E47', descripcion: 'Pagos al Exterior Electrónicos',           prefijo: 'E47', requiereRNC: false, aplicaITBIS: false  },
];

@Injectable()
export class ECFService implements OnModuleInit {
  private readonly logger = new Logger(ECFService.name);

  constructor(
    @InjectRepository(ECF)
    private ecfRepository: Repository<ECF>,
    @InjectRepository(TipoECF)
    private tipoECFRepository: Repository<TipoECF>,
    @InjectRepository(SecuenciaECF)
    private secuenciaRepository: Repository<SecuenciaECF>,
    @InjectRepository(ProveedorECF)
    private proveedorRepository: Repository<ProveedorECF>,
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    @InjectRepository(Cliente)
    private clienteRepository: Repository<Cliente>,
    private ecfHttpService: ECFHttpService,
    private configService: ConfigService,
    private tenantService: TenantService,
    private dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Seed inicial de tipos e-CF
  // ──────────────────────────────────────────────────────────────────

  async onModuleInit() {
    const total = await this.tipoECFRepository.count();
    if (total === 0) {
      await this.tipoECFRepository.save(
        SEED_TIPOS.map((t) => this.tipoECFRepository.create(t)),
      );
      this.logger.log('Tipos e-CF sembrados correctamente (E31–E47)');
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────

  private generarCodigoSeguridad(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatFechaXml(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '');
  }

  private generarXML(
    ecf: ECF,
    factura: Factura,
    secuencia: SecuenciaECF,
    rnc: string,
    razonSocial: string,
  ): string {
    const tipoNumerico = ecf.tipoECF.codigo.replace('E', '');
    const fechaEmision = this.formatFechaXml(new Date(factura.fecha));
    const fechaVencSec = new Date(secuencia.fechaVencimiento)
      .toISOString()
      .split('T')[0];

    const items = factura.detalles
      .map(
        (d, i) => `
      <Item>
        <LineaItem>${i + 1}</LineaItem>
        <NombreItem>${this.escapeXml(d.descripcion)}</NombreItem>
        <IndicadorFacturacion>1</IndicadorFacturacion>
        <CantidadItem>${d.cantidad}</CantidadItem>
        <UnidadMedidaItem>1234</UnidadMedidaItem>
        <PrecioUnitarioItem>${Number(d.precioUnitario).toFixed(2)}</PrecioUnitarioItem>
        <DescuentoMonto>0.00</DescuentoMonto>
        <TablaSubDescuento>
          <SubDescuento>
            <TipoSubDescuento>01</TipoSubDescuento>
            <SubDescuentoPorcentaje>0.00</SubDescuentoPorcentaje>
          </SubDescuento>
        </TablaSubDescuento>
        <MontoItem>${Number(d.subtotal).toFixed(2)}</MontoItem>
        <ITBIS>${Number(d.importeIva).toFixed(2)}</ITBIS>
      </Item>`,
      )
      .join('');

    const compradorXml =
      factura.cliente && factura.cliente.rncReceptor
        ? `
  <Comprador>
    <RNCComprador>${factura.cliente.rncReceptor}</RNCComprador>
    <RazonSocialComprador>${this.escapeXml(factura.cliente.nombre)}</RazonSocialComprador>
    ${factura.cliente.direccion ? `<DireccionComprador>${this.escapeXml(factura.cliente.direccion)}</DireccionComprador>` : ''}
  </Comprador>`
        : '';

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<DGII_CF>
  <Encabezado>
    <Version>1.0</Version>
    <CodigoSeguridadCF>${ecf.codigoSeguridad}</CodigoSeguridadCF>
    <TipoeCF>${tipoNumerico}</TipoeCF>
    <eNCF>${ecf.numero}</eNCF>
    <FechaVencimientoSecuencia>${fechaVencSec}</FechaVencimientoSecuencia>
    <IndicadorMontoGravado>1</IndicadorMontoGravado>
    <TipoIngresos>01</TipoIngresos>
    <TipoPago>1</TipoPago>
    <TotalPaginas>1</TotalPaginas>
  </Encabezado>
  <Emisor>
    <RNCEmisor>${rnc}</RNCEmisor>
    <RazonSocialEmisor>${this.escapeXml(razonSocial)}</RazonSocialEmisor>
    <FechaEmision>${fechaEmision}</FechaEmision>
  </Emisor>${compradorXml}
  <DetallesItems>${items}
  </DetallesItems>
  <Totales>
    <MontoGravadoTotal>${Number(factura.subtotal).toFixed(2)}</MontoGravadoTotal>
    <MontoGravadoI1>${Number(factura.subtotal).toFixed(2)}</MontoGravadoI1>
    <MontoGravadoI2>0.00</MontoGravadoI2>
    <MontoGravadoI3>0.00</MontoGravadoI3>
    <MontoExento>0.00</MontoExento>
    <ITBIS1>${Number(factura.iva).toFixed(2)}</ITBIS1>
    <ITBIS2>0.00</ITBIS2>
    <ITBIS3>0.00</ITBIS3>
    <TotalITBISRetenido>0.00</TotalITBISRetenido>
    <TotalISRRetencion>0.00</TotalISRRetencion>
    <TotalITBIS>${Number(factura.iva).toFixed(2)}</TotalITBIS>
    <TotalISC>0.00</TotalISC>
    <OtrosImpuestosTasas>0.00</OtrosImpuestosTasas>
    <MontoTotal>${Number(factura.total).toFixed(2)}</MontoTotal>
    <MontoNoFacturable>0.00</MontoNoFacturable>
    <MontoPeriodo>0.00</MontoPeriodo>
    <Saldo>0.00</Saldo>
    <MontoAvancePago>0.00</MontoAvancePago>
    <ValorPagar>${Number(factura.total).toFixed(2)}</ValorPagar>
    <TotalItbisBienesServicios>${Number(factura.iva).toFixed(2)}</TotalItbisBienesServicios>
    <TotalItbisServicos>0.00</TotalItbisServicos>
    <TotalItbisBienes>${Number(factura.iva).toFixed(2)}</TotalItbisBienes>
  </Totales>
</DGII_CF>`.trim();
  }

  private async getProveedorActivo(): Promise<ProveedorECF | null> {
    return this.proveedorRepository.findOne({ where: { isActive: true } });
  }

  // ──────────────────────────────────────────────────────────────────
  // Determinación automática del tipo de e-CF
  // ──────────────────────────────────────────────────────────────────

  determinarTipoECF(cliente: Cliente): string {
    if (cliente.esExtranjero) return 'E46';
    if (cliente.rncReceptor)  return 'E31';
    return 'E32';
  }

  // ──────────────────────────────────────────────────────────────────
  // Generación del e-CF — llamado desde FacturasService
  // ──────────────────────────────────────────────────────────────────

  async generarECF(factura: Factura, userId: number): Promise<ECF> {
    // ── CORRECCIÓN 1: usar tipoNcf de la factura (seleccionado por el usuario en POS)
    // Si la factura tiene tipoNcf explícito → usarlo.  Fallback: determinar por cliente.
    const codigotipo = factura.tipoNcf && /^E\d{2}$/.test(factura.tipoNcf)
      ? factura.tipoNcf
      : this.determinarTipoECF(factura.cliente);

    this.logger.log(`generarECF: factura=${factura.id} tipoNcf=${factura.tipoNcf} → usando tipo=${codigotipo}`);

    const tipoECF = await this.tipoECFRepository.findOne({
      where: { codigo: codigotipo, isActive: true },
    });
    if (!tipoECF) throw new BadRequestException(`Tipo e-CF ${codigotipo} no encontrado`);

    const empresaId = factura.empresaId;

    // ── CORRECCIÓN 2: buscar secuencia activa por empresa + tipo
    const secuencia = await this.secuenciaRepository.findOne({
      where: {
        tipoECFId: tipoECF.id,
        empresaId: empresaId ?? undefined,
        isAgotada: false,
        isActiva:  true,
        isActive:  true,
      },
      relations: ['tipoECF'],
      order: { fechaVencimiento: 'ASC' },
    });

    if (!secuencia) {
      throw new BadRequestException(
        `No hay secuencia activa para ${codigotipo}. Configure una en Secuencias Fiscales.`,
      );
    }

    if (new Date(secuencia.fechaVencimiento) < new Date()) {
      throw new BadRequestException(
        `La secuencia ${codigotipo} está vencida (${new Date(secuencia.fechaVencimiento).toLocaleDateString('es-DO')}). Renuévela en la DGII.`,
      );
    }

    // ── CORRECCIÓN 3: transacción con bloqueo pessimistic para evitar duplicados concurrentes
    const savedECF = await this.dataSource.transaction(async (manager) => {
      // Bloquear la fila de la secuencia para escritura exclusiva
      const secLocked = await manager
        .createQueryBuilder(SecuenciaECF, 's')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: secuencia.id })
        .getOne();

      if (!secLocked) throw new BadRequestException('Secuencia no disponible');

      let seq = secLocked.secuenciaActual;
      let numero = `${tipoECF.prefijo}${String(seq).padStart(10, '0')}`;

      // ── CORRECCIÓN 4: si el número ya existe, avanzar hasta encontrar uno libre
      let intentos = 0;
      while (intentos < 100) {
        const existe = await manager.findOne(ECF, {
          where: { numero, empresaId: empresaId ?? undefined },
        });
        if (!existe) break;

        this.logger.warn(`ECF ${numero} ya existe para empresa ${empresaId}, avanzando secuencia...`);
        seq++;
        numero = `${tipoECF.prefijo}${String(seq).padStart(10, '0')}`;
        intentos++;
      }

      if (seq > secLocked.secuenciaFinal) {
        await manager.update(SecuenciaECF, secuencia.id, { isAgotada: true });
        throw new BadRequestException(
          `Secuencia ${codigotipo} agotada (${secLocked.secuenciaFinal}). Configure una nueva en Secuencias Fiscales.`,
        );
      }

      // Guardar ECF con el número correcto
      const ecf = manager.create(ECF, {
        numero,
        tipoECFId:       tipoECF.id,
        secuenciaId:     secuencia.id,
        facturaId:       factura.id,
        empresaId:       empresaId ?? undefined,
        isUsado:         true,
        fechaUso:        new Date(),
        codigoSeguridad: this.generarCodigoSeguridad(),
        estadoDGII:      EstadoDGII.PENDIENTE,
      });
      const saved = await manager.save(ECF, ecf);

      // Avanzar secuencia DENTRO de la transacción
      const nuevaActual = seq + 1;
      const agotada     = nuevaActual > secLocked.secuenciaFinal;
      await manager.update(SecuenciaECF, secuencia.id, {
        secuenciaActual: nuevaActual,
        isAgotada:       agotada,
      });

      if (agotada) this.logger.warn(`Secuencia ${codigotipo} agotada. Solicite nueva autorización DGII.`);

      this.logger.log(`e-CF generado: ${numero} (empresa=${empresaId})`);
      return saved;
    });

    // Actualizar factura con ECF id (fuera de la transacción — no crítico)
    await this.facturaRepository.update(factura.id, { ecfId: savedECF.id } as any);

    // Generar XML
    const xml = this.generarXML(
      { ...savedECF, tipoECF },
      factura,
      secuencia,
      this.configService.get<string>('ECF_RNC_EMISOR', ''),
      this.configService.get<string>('ECF_RAZON_SOCIAL', ''),
    );
    await this.ecfRepository.update(savedECF.id, { xml });

    // Enviar al proveedor (fallo no bloquea la emisión)
    await this.enviarAlProveedor(savedECF.id);

    return this.ecfRepository.findOne({
      where: { id: savedECF.id },
      relations: ['tipoECF', 'secuencia'],
    }) as Promise<ECF>;
  }

  async enviarAlProveedor(ecfId: number): Promise<void> {
    const ecf = await this.ecfRepository.findOne({ where: { id: ecfId } });
    if (!ecf?.xml) return;

    const proveedor = await this.getProveedorActivo();
    if (!proveedor) {
      this.logger.warn(`No hay proveedor e-CF activo. ECF ${ecf.numero} quedará PENDIENTE.`);
      await this.ecfRepository.update(ecfId, {
        errorEnvio: 'Sin proveedor e-CF activo configurado',
        intentosEnvio: ecf.intentosEnvio + 1,
        ultimoIntentoEnvio: new Date(),
      });
      return;
    }

    try {
      const respuesta = await this.ecfHttpService.enviarECF(
        ecf.xml,
        proveedor.apiUrl,
        proveedor.apiKey,
      );

      await this.ecfRepository.update(ecfId, {
        estadoDGII: EstadoDGII.ACEPTADO,
        xmlRespuesta: respuesta.xmlRespuesta,
        firmaDigital: respuesta.firmaDigital,
        fechaFirma: new Date(),
        proveedorReferencia: respuesta.referencia,
        intentosEnvio: ecf.intentosEnvio + 1,
        ultimoIntentoEnvio: new Date(),
        errorEnvio: undefined,
      });

      this.logger.log(`e-CF ${ecf.numero} enviado y aceptado. Ref: ${respuesta.referencia}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      this.logger.error(`Error enviando e-CF ${ecf.numero}: ${msg}`);
      await this.ecfRepository.update(ecfId, {
        intentosEnvio: ecf.intentosEnvio + 1,
        ultimoIntentoEnvio: new Date(),
        errorEnvio: msg,
      });
    }
  }

  async reintentarEnvio(numero: string): Promise<ECF> {
    const ecf = await this.getECFByNumero(numero);

    if (ecf.estadoDGII === EstadoDGII.ACEPTADO) {
      throw new BadRequestException('El e-CF ya fue aceptado por la DGII');
    }

    if (ecf.intentosEnvio >= MAX_INTENTOS) {
      throw new BadRequestException(
        `Se alcanzó el máximo de ${MAX_INTENTOS} intentos de envío`,
      );
    }

    await this.enviarAlProveedor(ecf.id);
    return this.getECFByNumero(numero);
  }

  // ──────────────────────────────────────────────────────────────────
  // Secuencias
  // ──────────────────────────────────────────────────────────────────

  async createSecuencia(dto: CreateSecuenciaECFDto, userId: number): Promise<SecuenciaECF> {
    const empresaId = this.tenantService.getEmpresaId();

    const tipoECF = await this.tipoECFRepository.findOne({
      where: { id: dto.tipoECFId, isActive: true },
    });
    if (!tipoECF) throw new NotFoundException(`Tipo e-CF #${dto.tipoECFId} no encontrado`);

    if (dto.secuenciaFinal <= dto.secuenciaInicial)
      throw new BadRequestException('secuenciaFinal debe ser mayor que secuenciaInicial');

    const fechaVenc = new Date(dto.fechaVencimiento);
    if (fechaVenc < new Date())
      throw new BadRequestException('La fecha de vencimiento no puede ser anterior a hoy');

    // Desactivar secuencia anterior del mismo tipo para esta empresa
    await this.secuenciaRepository.update(
      { tipoECFId: dto.tipoECFId, empresaId, isActiva: true },
      { isActiva: false },
    );

    const secuencia = this.secuenciaRepository.create({
      empresaId,
      tipoECFId: dto.tipoECFId,
      secuenciaInicial: dto.secuenciaInicial,
      secuenciaFinal: dto.secuenciaFinal,
      secuenciaActual: dto.secuenciaInicial,
      fechaVencimiento: fechaVenc,
      isActiva: true,
      userId,
    });

    return this.secuenciaRepository.save(secuencia);
  }

  async getSecuencias(pagination: { limit?: number; page?: number }) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1 } = pagination;

    const [data, total] = await this.secuenciaRepository.findAndCount({
      where: { empresaId, isActive: true },
      relations: ['tipoECF', 'user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Enriquecer con % de uso
    const enriched = data.map(s => ({
      ...s,
      disponibles:   s.secuenciaFinal - s.secuenciaActual + 1,
      usados:        s.secuenciaActual - s.secuenciaInicial,
      total:         s.secuenciaFinal - s.secuenciaInicial + 1,
      pctUsado:      +((s.secuenciaActual - s.secuenciaInicial) / (s.secuenciaFinal - s.secuenciaInicial + 1) * 100).toFixed(1),
    }));

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSecuenciasProximasVencer(): Promise<any[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const limite = new Date();
    limite.setDate(limite.getDate() + 30);

    const secs = await this.secuenciaRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.tipoECF', 'tipo')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = :active', { active: true })
      .andWhere('s.isActiva = :activa', { activa: true })
      .andWhere('s.isAgotada = :agotada', { agotada: false })
      .andWhere(
        '(s.fechaVencimiento <= :limite OR ((s.secuenciaActual - s.secuenciaInicial) * 100.0 / (s.secuenciaFinal - s.secuenciaInicial + 1)) >= 85)',
        { limite },
      )
      .orderBy('s.fechaVencimiento', 'ASC')
      .getMany();

    return secs.map(s => ({
      ...s,
      disponibles: s.secuenciaFinal - s.secuenciaActual + 1,
      pctUsado:    +((s.secuenciaActual - s.secuenciaInicial) / (s.secuenciaFinal - s.secuenciaInicial + 1) * 100).toFixed(1),
    }));
  }

  async desactivarSecuencia(id: number, userId: number): Promise<SecuenciaECF> {
    const empresaId = this.tenantService.getEmpresaId();
    const sec = await this.secuenciaRepository.findOne({
      where: { id, empresaId, isActive: true },
    });
    if (!sec) throw new NotFoundException(`Secuencia #${id} no encontrada`);
    await this.secuenciaRepository.update(id, { isActiva: false });
    return this.secuenciaRepository.findOne({ where: { id }, relations: ['tipoECF'] }) as Promise<SecuenciaECF>;
  }

  async getResumenSecuencias(): Promise<any[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const tipos = await this.tipoECFRepository.find({ where: { isActive: true } });

    const resultado = await Promise.all(tipos.map(async tipo => {
      const sec = await this.secuenciaRepository.findOne({
        where: { empresaId, tipoECFId: tipo.id, isActiva: true, isActive: true },
        order: { createdAt: 'DESC' },
      });

      if (!sec) {
        return {
          tipo,
          secuencia: null,
          estado: 'SIN_CONFIGURAR',
          pctUsado: 0,
          disponibles: 0,
          usados: 0,
          total: 0,
          alerta: false,
        };
      }

      const total      = sec.secuenciaFinal - sec.secuenciaInicial + 1;
      const usados     = sec.secuenciaActual - sec.secuenciaInicial;
      const disponibles = sec.secuenciaFinal - sec.secuenciaActual + 1;
      const pctUsado   = +(usados / total * 100).toFixed(1);
      const diasVence  = Math.ceil((new Date(sec.fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const alerta     = pctUsado >= 85 || disponibles < 50 || diasVence <= 30;

      return {
        tipo,
        secuencia: { ...sec, disponibles, usados, total, pctUsado },
        estado: sec.isAgotada ? 'AGOTADA' : 'ACTIVA',
        pctUsado,
        disponibles,
        usados,
        total,
        alerta,
        diasVence,
      };
    }));

    return resultado;
  }

  async getEstadisticasPorTipo(mes?: number, anio?: number): Promise<any[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.ecfRepository
      .createQueryBuilder('ecf')
      .leftJoin('ecf.tipoECF', 'tipo')
      .select('tipo.codigo', 'codigo')
      .addSelect('tipo.descripcion', 'descripcion')
      .addSelect('COUNT(ecf.id)', 'cantidad')
      .addSelect('SUM(CASE WHEN ecf.estadoDGII = \'aceptado\' THEN 1 ELSE 0 END)', 'aceptados')
      .addSelect('SUM(CASE WHEN ecf.estadoDGII = \'rechazado\' THEN 1 ELSE 0 END)', 'rechazados')
      .addSelect('SUM(CASE WHEN ecf.estadoDGII = \'pendiente\' THEN 1 ELSE 0 END)', 'pendientes')
      .where('ecf.empresaId = :eid', { eid: empresaId })
      .andWhere('ecf.isActive = :active', { active: true });

    if (mes && anio) {
      qb.andWhere('EXTRACT(MONTH FROM ecf.createdAt) = :mes AND EXTRACT(YEAR FROM ecf.createdAt) = :anio', { mes, anio });
    }

    return qb.groupBy('tipo.codigo, tipo.descripcion').orderBy('tipo.codigo').getRawMany();
  }

  // ──────────────────────────────────────────────────────────────────
  // Consultas de e-CFs
  // ──────────────────────────────────────────────────────────────────

  async getECFs(filtro: FiltroECFDto) {
    const { limit = 10, page = 1, search, estado, tipo, fecha } = filtro;

    const qb = this.ecfRepository
      .createQueryBuilder('ecf')
      .leftJoinAndSelect('ecf.tipoECF', 'tipo')
      .leftJoinAndSelect('ecf.factura', 'factura')
      .where('ecf.isActive = :active', { active: true });

    if (estado) qb.andWhere('ecf.estadoDGII = :estado', { estado });
    if (tipo)   qb.andWhere('tipo.codigo = :tipo', { tipo });
    if (fecha)  qb.andWhere("TO_CHAR(ecf.createdAt, 'YYYY-MM') = :fecha", { fecha });
    if (search) {
      qb.andWhere(
        '(ecf.numero ILIKE :s OR ecf.proveedorReferencia ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('ecf.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getECFByNumero(numero: string): Promise<ECF> {
    const ecf = await this.ecfRepository.findOne({
      where: { numero, isActive: true },
      relations: ['tipoECF', 'secuencia', 'factura'],
    });
    if (!ecf) throw new NotFoundException(`e-CF ${numero} no encontrado`);
    return ecf;
  }

  async getECFsPendientes() {
    return this.ecfRepository.find({
      where: { estadoDGII: EstadoDGII.PENDIENTE, isActive: true },
      relations: ['tipoECF'],
      order: { createdAt: 'ASC' },
    });
  }

  async getECFsRechazados() {
    return this.ecfRepository.find({
      where: { estadoDGII: EstadoDGII.RECHAZADO, isActive: true },
      relations: ['tipoECF'],
      order: { ultimoIntentoEnvio: 'DESC' },
    });
  }

  async getXML(numero: string): Promise<string> {
    const ecf = await this.getECFByNumero(numero);
    if (!ecf.xml) throw new NotFoundException(`XML del e-CF ${numero} aún no generado`);
    return ecf.xml;
  }

  async actualizarEstadoDGII(numero: string, dto: UpdateEstadoECFDto): Promise<ECF> {
    const ecf = await this.getECFByNumero(numero);

    const update: Partial<ECF> = { estadoDGII: dto.estadoDGII };
    if (dto.xmlRespuesta)       update.xmlRespuesta = dto.xmlRespuesta;
    if (dto.firmaDigital)       update.firmaDigital = dto.firmaDigital;
    if (dto.proveedorReferencia) update.proveedorReferencia = dto.proveedorReferencia;
    if (dto.estadoDGII === EstadoDGII.ACEPTADO) update.fechaFirma = new Date();

    await this.ecfRepository.update(ecf.id, update);
    return this.getECFByNumero(numero);
  }

  // ──────────────────────────────────────────────────────────────────
  // Proveedor e-CF
  // ──────────────────────────────────────────────────────────────────

  async getProveedor(): Promise<ProveedorECF | null> {
    return this.proveedorRepository.findOne({ where: { isActive: true } });
  }

  async createProveedor(dto: CreateProveedorECFDto): Promise<ProveedorECF> {
    // Solo puede haber un proveedor activo
    await this.proveedorRepository.update({ isActive: true }, { isActive: false });
    const proveedor = this.proveedorRepository.create({ ...dto, isActive: true });
    return this.proveedorRepository.save(proveedor);
  }

  async updateProveedor(id: number, dto: UpdateProveedorECFDto): Promise<ProveedorECF> {
    const proveedor = await this.proveedorRepository.findOne({ where: { id } });
    if (!proveedor) throw new NotFoundException(`Proveedor e-CF #${id} no encontrado`);
    await this.proveedorRepository.update(id, dto as any);
    return this.proveedorRepository.findOne({ where: { id } }) as Promise<ProveedorECF>;
  }

  // ──────────────────────────────────────────────────────────────────
  // Tipos e-CF (solo lectura para UI)
  // ──────────────────────────────────────────────────────────────────

  getTipos(): Promise<TipoECF[]> {
    return this.tipoECFRepository.find({ where: { isActive: true } });
  }
}
