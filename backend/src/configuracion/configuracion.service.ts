import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Empresa } from './entities/empresa.entity';
import { ConfiguracionSistema, TipoConfiguracion } from './entities/configuracion-sistema.entity';
import { Sucursal } from './entities/sucursal.entity';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { TenantService } from '../tenant/tenant.service';

// ── Seed de configuraciones por defecto ─────────────────────────────────────
const CONFIGS_DEFECTO = [
  // ── Sistema
  { clave: 'NOMBRE_SISTEMA',         valor: 'HiCloud ERP',            tipo: TipoConfiguracion.STRING,  grupo: 'sistema',     descripcion: 'Nombre del sistema ERP', editable: true },
  { clave: 'VERSION',                valor: '1.0.0',                  tipo: TipoConfiguracion.STRING,  grupo: 'sistema',     descripcion: 'Versión del sistema', editable: false },
  { clave: 'MONEDA',                 valor: 'DOP',                    tipo: TipoConfiguracion.STRING,  grupo: 'sistema',     descripcion: 'Moneda base del sistema', editable: false },
  { clave: 'DECIMALES',              valor: '2',                      tipo: TipoConfiguracion.NUMBER,  grupo: 'sistema',     descripcion: 'Decimales en importes', editable: false },
  { clave: 'ZONA_HORARIA',           valor: 'America/Santo_Domingo',  tipo: TipoConfiguracion.STRING,  grupo: 'sistema',     descripcion: 'Zona horaria del servidor', editable: false },
  { clave: 'IDIOMA',                 valor: 'es',                     tipo: TipoConfiguracion.STRING,  grupo: 'sistema',     descripcion: 'Idioma del sistema', editable: true },
  { clave: 'TEMA',                   valor: 'light',                  tipo: TipoConfiguracion.STRING,  grupo: 'sistema',     descripcion: 'Tema visual: light | dark', editable: true },
  { clave: 'PAGINACION_DEFECTO',     valor: '10',                     tipo: TipoConfiguracion.NUMBER,  grupo: 'sistema',     descripcion: 'Registros por página por defecto', editable: true },

  // ── Fiscal DGII
  { clave: 'ITBIS_TASA_DEFECTO',     valor: '18',                     tipo: TipoConfiguracion.NUMBER,  grupo: 'fiscal',      descripcion: 'Tasa ITBIS por defecto (%)', editable: true },
  { clave: 'ISR_EXENTO_ANUAL',       valor: '416220',                 tipo: TipoConfiguracion.NUMBER,  grupo: 'fiscal',      descripcion: 'Monto exento ISR anual (RD$) — DGII 2024', editable: true },
  { clave: 'RETENCION_ITBIS_PORCEN', valor: '30',                     tipo: TipoConfiguracion.NUMBER,  grupo: 'fiscal',      descripcion: 'Porcentaje retención ITBIS en compras (%)', editable: true },
  { clave: 'RNC_EMISOR',             valor: '',                       tipo: TipoConfiguracion.STRING,  grupo: 'fiscal',      descripcion: 'RNC del emisor de e-CF', editable: true },

  // ── ECF
  { clave: 'ECF_AMBIENTE',           valor: 'pruebas',                tipo: TipoConfiguracion.STRING,  grupo: 'ecf',         descripcion: 'Ambiente e-CF: pruebas | produccion', editable: true },
  { clave: 'ECF_DIAS_ALERTA',        valor: '30',                     tipo: TipoConfiguracion.NUMBER,  grupo: 'ecf',         descripcion: 'Días anticipación alerta secuencias por vencer', editable: true },

  // ── Facturación
  { clave: 'FACTURA_PREFIJO',        valor: 'FAC',                    tipo: TipoConfiguracion.STRING,  grupo: 'facturacion', descripcion: 'Prefijo en folio de facturas', editable: true },
  { clave: 'COMPRA_PREFIJO',         valor: 'COM',                    tipo: TipoConfiguracion.STRING,  grupo: 'facturacion', descripcion: 'Prefijo en folio de compras', editable: true },
  { clave: 'ASIENTO_PREFIJO',        valor: 'AST',                    tipo: TipoConfiguracion.STRING,  grupo: 'facturacion', descripcion: 'Prefijo en número de asientos contables', editable: true },

  // ── Cuentas por Cobrar / Pagar
  { clave: 'CXC_DIAS_VENCIMIENTO',   valor: '30',                     tipo: TipoConfiguracion.NUMBER,  grupo: 'cxc',         descripcion: 'Días de vencimiento CxC por defecto', editable: true },
  { clave: 'CXP_DIAS_VENCIMIENTO',   valor: '30',                     tipo: TipoConfiguracion.NUMBER,  grupo: 'cxp',         descripcion: 'Días de vencimiento CxP por defecto', editable: true },

  // ── Nómina (Ley 87-01)
  { clave: 'NOMINA_SALARIO_MINIMO',  valor: '21000',                  tipo: TipoConfiguracion.NUMBER,  grupo: 'nomina',      descripcion: 'Salario mínimo sector privado grande (RD$)', editable: true },
  { clave: 'NOMINA_TSS_SFS_EMPL',    valor: '3.04',                   tipo: TipoConfiguracion.NUMBER,  grupo: 'nomina',      descripcion: 'TSS SFS empleado (%) — Ley 87-01', editable: false },
  { clave: 'NOMINA_TSS_AFP_EMPL',    valor: '2.87',                   tipo: TipoConfiguracion.NUMBER,  grupo: 'nomina',      descripcion: 'TSS AFP empleado (%) — Ley 87-01', editable: false },
  { clave: 'NOMINA_TSS_SFS_PATR',    valor: '7.09',                   tipo: TipoConfiguracion.NUMBER,  grupo: 'nomina',      descripcion: 'TSS SFS patronal (%) — Ley 87-01', editable: false },
  { clave: 'NOMINA_TSS_AFP_PATR',    valor: '7.10',                   tipo: TipoConfiguracion.NUMBER,  grupo: 'nomina',      descripcion: 'TSS AFP patronal (%) — Ley 87-01', editable: false },
  { clave: 'NOMINA_TSS_SRL_PATR',    valor: '1.20',                   tipo: TipoConfiguracion.NUMBER,  grupo: 'nomina',      descripcion: 'TSS SRL patronal (%) — Ley 87-01', editable: false },

  // ── Inventario
  { clave: 'INVENTARIO_ALERTAS',     valor: 'true',                   tipo: TipoConfiguracion.BOOLEAN, grupo: 'inventario',  descripcion: 'Activar alertas de stock bajo', editable: true },
  { clave: 'INVENTARIO_METODO',      valor: 'PROMEDIO',               tipo: TipoConfiguracion.STRING,  grupo: 'inventario',  descripcion: 'Método de costeo: PROMEDIO | FIFO | LIFO', editable: true },

  // ── Seguridad
  { clave: 'SESION_HORAS',           valor: '24',                     tipo: TipoConfiguracion.NUMBER,  grupo: 'seguridad',   descripcion: 'Duración sesión JWT (horas)', editable: true },
  { clave: 'MAX_INTENTOS_LOGIN',     valor: '5',                      tipo: TipoConfiguracion.NUMBER,  grupo: 'seguridad',   descripcion: 'Máximo intentos de login fallidos', editable: true },
  { clave: 'AUDITORIA_ACTIVA',       valor: 'true',                   tipo: TipoConfiguracion.BOOLEAN, grupo: 'seguridad',   descripcion: 'Registro de auditoría activo', editable: true },
];

@Injectable()
export class ConfiguracionService implements OnModuleInit {
  private readonly logger = new Logger(ConfiguracionService.name);

  constructor(
    @InjectRepository(Empresa)
    private empresaRepository: Repository<Empresa>,
    @InjectRepository(ConfiguracionSistema)
    private configRepository: Repository<ConfiguracionSistema>,
    @InjectRepository(Sucursal)
    private sucursalRepository: Repository<Sucursal>,
    private tenantService: TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Seed inicial
  // ──────────────────────────────────────────────────────────────────

  async onModuleInit() {
    // Empresa por defecto
    const totalEmpresas = await this.empresaRepository.count();
    if (totalEmpresas === 0) {
      const empresa = await this.empresaRepository.save(
        this.empresaRepository.create({
          rnc:             '000000001',
          nombre:          'HiCloud ERP Demo',
          nombreComercial: 'HiCloud Demo',
          direccion:       'Av. Principal #123, Santo Domingo',
          ciudad:          'Santo Domingo',
          provincia:       'Distrito Nacional',
          moneda:          'DOP',
          zonaHoraria:     'America/Santo_Domingo',
        }),
      );

      // Sucursal principal vinculada a la empresa demo
      await this.sucursalRepository.save(
        this.sucursalRepository.create({
          empresaId:   empresa.id,
          codigo:      'PRIN',
          nombre:      'Sucursal Principal',
          ciudad:      'Santo Domingo',
          esPrincipal: true,
        }),
      );
    }

    // Configuraciones del sistema
    for (const c of CONFIGS_DEFECTO) {
      const existe = await this.configRepository.findOne({ where: { clave: c.clave } });
      if (!existe) {
        await this.configRepository.save(this.configRepository.create(c));
      }
    }

    this.logger.log(`Configuración del sistema inicializada (${CONFIGS_DEFECTO.length} parámetros)`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Empresa
  // ──────────────────────────────────────────────────────────────────

  async getEmpresa(): Promise<Empresa> {
    const empresaId = this.tenantService.getEmpresaId();
    const empresa = await this.empresaRepository.findOne({ where: { id: empresaId, isActive: true } });
    if (!empresa) throw new NotFoundException('Empresa no configurada');
    return empresa;
  }

  async updateEmpresa(dto: UpdateEmpresaDto): Promise<Empresa> {
    const empresa = await this.getEmpresa();

    // ── Validación especial para cambio de RNC ─────────────────────────────
    if (dto.rnc !== undefined && dto.rnc !== empresa.rnc) {
      // Verificar que el nuevo RNC no esté en uso por otra empresa
      const rncExistente = await this.empresaRepository.findOne({
        where: { rnc: dto.rnc, isActive: true },
      });
      if (rncExistente && rncExistente.id !== empresa.id) {
        throw new ConflictException(
          `El RNC ${dto.rnc} ya está registrado para la empresa "${rncExistente.nombre}". ` +
          `Cada empresa debe tener un RNC único.`,
        );
      }
      this.logger.warn(
        `CAMBIO DE RNC | empresa #${empresa.id} "${empresa.nombre}" | ` +
        `${empresa.rnc} → ${dto.rnc}`,
      );
    }

    const allowed: (keyof Empresa)[] = [
      'rnc', 'nombre', 'nombreComercial', 'direccion', 'direccion2', 'ciudad',
      'provincia', 'codigoPostal', 'telefono', 'telefonoSecundario', 'email',
      'sitioWeb', 'logo', 'favicon', 'sector', 'regimenFiscal', 'tipoSociedad',
      'representanteLegal', 'cedulaRepresentante', 'fechaConstitucion',
      'actividadEconomica', 'moneda', 'zonaHoraria',
    ];

    const updateData: Partial<Empresa> = {};
    for (const field of allowed) {
      const val = (dto as any)[field];
      if (val !== undefined) (updateData as any)[field] = val;
    }

    if (dto.configuracion !== undefined) {
      updateData.configuracion = {
        ...(empresa.configuracion ?? {}),
        ...dto.configuracion,
      };
    }

    if (Object.keys(updateData).length > 0) {
      await this.empresaRepository.update(empresa.id, updateData as any);
    }

    return this.getEmpresa();
  }

  /**
   * Verifica si un RNC ya existe en otra empresa.
   * Usado por el frontend antes de mostrar el modal de confirmación.
   */
  async verificarRNC(rnc: string): Promise<{
    disponible: boolean;
    empresa?: { id: number; nombre: string };
    tieneEcfConfig?: boolean;
  }> {
    const empresaActual = await this.getEmpresa().catch(() => null);

    const existente = await this.empresaRepository.findOne({
      where: { rnc, isActive: true },
    });

    if (existente && existente.id !== empresaActual?.id) {
      return { disponible: false, empresa: { id: existente.id, nombre: existente.nombre } };
    }

    // Verificar si la empresa actual tiene config e-CF (para advertencia)
    let tieneEcfConfig = false;
    if (empresaActual) {
      const ecfCount = await this.empresaRepository.manager.count(
        'empresa_ecf_config' as any,
        { where: { empresaId: empresaActual.id, activo: true } } as any,
      ).catch(() => 0);
      tieneEcfConfig = ecfCount > 0;
    }

    return { disponible: true, tieneEcfConfig };
  }

  async uploadLogo(empresaId: number, fileBuffer: Buffer, mimetype: string): Promise<string> {
    const dataUri = `data:${mimetype};base64,${fileBuffer.toString('base64')}`;
    await this.empresaRepository.update(empresaId, { logo: dataUri });
    return dataUri;
  }

  async uploadFavicon(empresaId: number, fileBuffer: Buffer, mimetype: string): Promise<string> {
    const dataUri = `data:${mimetype};base64,${fileBuffer.toString('base64')}`;
    await this.empresaRepository.update(empresaId, { favicon: dataUri });
    return dataUri;
  }

  // ──────────────────────────────────────────────────────────────────
  // Configuraciones del sistema
  // ──────────────────────────────────────────────────────────────────

  async getConfiguraciones() {
    const configs = await this.configRepository.find({
      where: { isActive: true },
      order: { grupo: 'ASC', clave: 'ASC' },
    });

    // Agrupar por grupo para la UI
    const grupos: Record<string, typeof configs> = {};
    for (const c of configs) {
      if (!grupos[c.grupo]) grupos[c.grupo] = [];
      grupos[c.grupo].push(c);
    }

    return { configuraciones: configs, grupos };
  }

  async getConfiguracionesByGrupo(grupo: string) {
    return this.configRepository.find({
      where: { grupo, isActive: true },
      order: { clave: 'ASC' },
    });
  }

  async getValor(clave: string): Promise<string> {
    const config = await this.configRepository.findOne({
      where: { clave, isActive: true },
    });
    if (!config) throw new NotFoundException(`Configuración "${clave}" no encontrada`);
    return config.valor;
  }

  async getValorTipado(clave: string): Promise<string | number | boolean> {
    const config = await this.configRepository.findOne({
      where: { clave, isActive: true },
    });
    if (!config) throw new NotFoundException(`Configuración "${clave}" no encontrada`);

    switch (config.tipo) {
      case TipoConfiguracion.NUMBER:  return Number(config.valor);
      case TipoConfiguracion.BOOLEAN: return config.valor === 'true';
      case TipoConfiguracion.JSON:    return JSON.parse(config.valor) as string;
      default:                        return config.valor;
    }
  }

  async updateConfiguracion(clave: string, dto: UpdateConfiguracionDto): Promise<ConfiguracionSistema> {
    const config = await this.configRepository.findOne({
      where: { clave, isActive: true },
    });
    if (!config) throw new NotFoundException(`Configuración "${clave}" no encontrada`);
    if (!config.editable) throw new BadRequestException(`La configuración "${clave}" no es editable`);

    await this.configRepository.update(config.id, { valor: dto.valor });
    return this.configRepository.findOne({ where: { id: config.id } }) as Promise<ConfiguracionSistema>;
  }

  // ──────────────────────────────────────────────────────────────────
  // Sucursales
  // ──────────────────────────────────────────────────────────────────

  async getSucursales(): Promise<Sucursal[]> {
    const empresaId = this.tenantService.getEmpresaId();
    return this.sucursalRepository.find({
      where: { empresaId, isActive: true },
      order: { esPrincipal: 'DESC', nombre: 'ASC' },
    });
  }

  async createSucursal(dto: CreateSucursalDto): Promise<Sucursal> {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.sucursalRepository.findOne({ where: { codigo: dto.codigo, empresaId } });
    if (existe) throw new BadRequestException(`Código de sucursal "${dto.codigo}" ya existe`);

    if (dto.esPrincipal) {
      await this.sucursalRepository.update({ esPrincipal: true, empresaId }, { esPrincipal: false });
    }

    return this.sucursalRepository.save(this.sucursalRepository.create({ ...dto, empresaId }));
  }

  async updateSucursal(id: number, dto: Partial<CreateSucursalDto>): Promise<Sucursal> {
    const empresaId = this.tenantService.getEmpresaId();
    const suc = await this.sucursalRepository.findOne({ where: { id, empresaId, isActive: true } });
    if (!suc) throw new NotFoundException(`Sucursal #${id} no encontrada`);

    if (dto.esPrincipal) {
      await this.sucursalRepository.update({ esPrincipal: true, empresaId }, { esPrincipal: false });
    }

    await this.sucursalRepository.update(id, dto);
    return this.sucursalRepository.findOne({ where: { id } }) as Promise<Sucursal>;
  }

  // ──────────────────────────────────────────────────────────────────
  // Info pública del sistema (sin autenticación)
  // ──────────────────────────────────────────────────────────────────

  async getInfoPublica() {
    let empresa: Partial<Empresa> = { nombre: 'HiCloud ERP', ciudad: 'Santo Domingo' };
    let nombreSistema = 'HiCloud ERP';
    let version = '1.0.0';

    try {
      empresa = await this.getEmpresa();
      nombreSistema = (await this.getValor('NOMBRE_SISTEMA').catch(() => 'HiCloud ERP'));
      version       = (await this.getValor('VERSION').catch(() => '1.0.0'));
    } catch { /* silencioso en primer arranque */ }

    return {
      sistema:    nombreSistema,
      version,
      empresa:    empresa.nombre,
      ciudad:     empresa.ciudad,
      logo:       (empresa as Empresa).logo ?? null,
      pais:       'República Dominicana',
      moneda:     'DOP',
      zonaHoraria: 'America/Santo_Domingo',
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Panel completo (empresa + parámetros clave)
  // ──────────────────────────────────────────────────────────────────

  async getPanelCompleto() {
    const [empresa, configuraciones, sucursales] = await Promise.all([
      this.getEmpresa().catch(() => null),
      this.getConfiguraciones(),
      this.getSucursales(),
    ]);

    return { empresa, configuraciones, sucursales };
  }
}
