import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { EmpresaEcfConfig, ModoEcf } from '../entities/empresa-ecf-config.entity';
import { SecuenciaECF } from '../entities/secuencia-ecf.entity';
import { EcfEncryptionService } from './ecf-encryption.service';
import { EmailService } from '../../notificaciones/services/email.service';
import { CreateEmpresaEcfConfigDto } from '../dto/create-empresa-ecf-config.dto';
import { UpdateEmpresaEcfConfigDto } from '../dto/update-empresa-ecf-config.dto';
import { CreateSecuenciaAdminDto } from '../dto/create-secuencia-admin.dto';

/** Mapeo del enum ModoEcf al segmento de ruta de la API MSeller. */
const MSELLER_ENV_PATH: Record<ModoEcf, string> = {
  [ModoEcf.TEST]:          'TesteCF',
  [ModoEcf.CERTIFICACION]: 'CerteCF',
  [ModoEcf.PRODUCCION]:    'eCF',
};

/** Fallos consecutivos del botón Test por empresa (in-memory, se resetea en success). */
const testFailCounts = new Map<number, number>();
const MAX_TEST_FAILS = 3; // pre-activa CB antes de que Cognito bloquee

@Injectable()
export class EcfConfigService {
  private readonly logger = new Logger(EcfConfigService.name);

  constructor(
    @InjectRepository(EmpresaEcfConfig)
    private configRepo: Repository<EmpresaEcfConfig>,

    @InjectRepository(SecuenciaECF)
    private secuenciaRepo: Repository<SecuenciaECF>,

    private encryption: EcfEncryptionService,
    private http: HttpService,
    private ds: DataSource,
    private emailSvc: EmailService,
    private configSvc: ConfigService,
  ) {}

  // ── CRUD EmpresaEcfConfig ─────────────────────────────────────────────────

  async listar(): Promise<Omit<EmpresaEcfConfig, 'msellerPasswordEnc' | 'msellerApiKeyEnc'>[]> {
    const rows = await this.configRepo.find({ order: { empresaId: 'ASC' } });
    return rows.map(r => this.sanitize(r));
  }

  async obtenerPorEmpresa(empresaId: number): Promise<EmpresaEcfConfig> {
    const cfg = await this.configRepo.findOne({ where: { empresaId } });
    if (!cfg) throw new NotFoundException(`Sin configuración e-CF para empresa #${empresaId}`);
    return cfg;
  }

  async crear(dto: CreateEmpresaEcfConfigDto): Promise<EmpresaEcfConfig> {
    const exists = await this.configRepo.findOne({ where: { empresaId: dto.empresaId } });
    // Upsert: si ya existe la config, actualizar en lugar de lanzar 409
    if (exists) {
      this.logger.log(`Empresa #${dto.empresaId} ya tiene config e-CF — haciendo upsert`);
      const updateDto: UpdateEmpresaEcfConfigDto = {
        msellerEmail:      dto.msellerEmail,
        msellerPassword:   dto.msellerPassword,
        msellerApiKey:     dto.msellerApiKey,
        msellerUrlBase:    dto.msellerUrlBase,
        modo:              dto.modo,
        rncEmisor:         dto.rncEmisor,
        razonSocialEmisor: dto.razonSocialEmisor,
        nombreComercial:   dto.nombreComercial,
        direccionEmisor:   dto.direccionEmisor,
        municipio:         dto.municipio,
        provincia:         dto.provincia,
      };
      return this.actualizar(dto.empresaId, updateDto);
    }

    this.validarRangoFechaVencimiento(dto.msellerPassword);   // placeholder — reusamos el helper abajo

    const cfg = this.configRepo.create({
      empresaId:           dto.empresaId,
      msellerEmail:        dto.msellerEmail,
      msellerPasswordEnc:  this.encryption.encrypt(dto.msellerPassword),
      msellerApiKeyEnc:    this.encryption.encrypt(dto.msellerApiKey),
      msellerUrlBase:      dto.msellerUrlBase ?? 'https://ecf.api.mseller.app',
      modo:                dto.modo ?? ModoEcf.TEST,
      rncEmisor:           dto.rncEmisor,
      razonSocialEmisor:   dto.razonSocialEmisor,
      nombreComercial:     dto.nombreComercial,
      direccionEmisor:     dto.direccionEmisor,
      municipio:           dto.municipio,
      provincia:           dto.provincia,
      activo:              true,
    });

    const saved = await this.configRepo.save(cfg);
    this.logger.log(`Config e-CF creada para empresa #${dto.empresaId} modo ${cfg.modo}`);
    return this.sanitize(saved);
  }

  async actualizar(empresaId: number, dto: UpdateEmpresaEcfConfigDto): Promise<EmpresaEcfConfig> {
    const cfg = await this.obtenerPorEmpresa(empresaId);

    if (dto.msellerEmail)    cfg.msellerEmail    = dto.msellerEmail;
    if (dto.msellerPassword) cfg.msellerPasswordEnc = this.encryption.encrypt(dto.msellerPassword);
    if (dto.msellerApiKey)   cfg.msellerApiKeyEnc   = this.encryption.encrypt(dto.msellerApiKey);
    if (dto.msellerUrlBase)  cfg.msellerUrlBase  = dto.msellerUrlBase;
    if (dto.modo)            cfg.modo            = dto.modo;
    if (dto.rncEmisor)       cfg.rncEmisor       = dto.rncEmisor;
    if (dto.razonSocialEmisor) cfg.razonSocialEmisor = dto.razonSocialEmisor;
    if (dto.nombreComercial) cfg.nombreComercial  = dto.nombreComercial;
    if (dto.direccionEmisor) cfg.direccionEmisor  = dto.direccionEmisor;
    if (dto.municipio)       cfg.municipio        = dto.municipio;
    if (dto.provincia)       cfg.provincia        = dto.provincia;
    if (typeof dto.activo === 'boolean') cfg.activo = dto.activo;

    const saved = await this.configRepo.save(cfg);
    this.logger.log(`Config e-CF actualizada para empresa #${empresaId}`);
    return this.sanitize(saved);
  }

  async eliminar(empresaId: number): Promise<void> {
    const cfg = await this.obtenerPorEmpresa(empresaId);
    await this.configRepo.remove(cfg);
    this.logger.log(`Config e-CF eliminada para empresa #${empresaId}`);
  }

  // ── Test de conexión con MSeller ──────────────────────────────────────────

  /**
   * Descifra las credenciales y realiza la autenticación contra MSeller.
   * Si obtiene el idToken con éxito, la configuración es válida.
   */
  async probarConexion(empresaId: number): Promise<{
    ok: boolean;
    modo: ModoEcf;
    ambiente: string;
    mensaje: string;
  }> {
    // ── Circuit breaker: rechazar si la cuenta ya está bloqueada ──────────────
    if (await this.isEmpresaBloqueada(empresaId)) {
      const cfg0 = await this.configRepo.findOne({ where: { empresaId } });
      const msRestantes = cfg0?.bloqueadoHasta
        ? Math.max(0, Math.ceil((new Date(cfg0.bloqueadoHasta).getTime() - Date.now()) / 60_000))
        : 30;
      throw new BadRequestException(
        `La cuenta MSeller está temporalmente bloqueada por intentos fallidos. ` +
        `Espera ${msRestantes} minuto(s) antes de volver a intentar.`,
      );
    }

    const cfg = await this.obtenerPorEmpresa(empresaId);

    if (!cfg.msellerEmail || !cfg.msellerPasswordEnc || !cfg.msellerApiKeyEnc) {
      throw new BadRequestException('La configuración está incompleta (faltan credenciales MSeller).');
    }

    const password = this.encryption.decrypt(cfg.msellerPasswordEnc);
    const envPath  = MSELLER_ENV_PATH[cfg.modo];
    const authUrl  = `${cfg.msellerUrlBase}/${envPath}/customer/authentication`;

    try {
      const response = await firstValueFrom(
        this.http.post(
          authUrl,
          { email: cfg.msellerEmail, password },
          { timeout: 10_000, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const { idToken } = response.data as { idToken?: string };

      if (!idToken) {
        throw new BadRequestException('MSeller no devolvió idToken — credenciales incorrectas.');
      }

      // Éxito → resetear contador de fallos
      testFailCounts.delete(empresaId);
      this.logger.log(`Test MSeller OK para empresa #${empresaId} en ${envPath}`);
      return {
        ok:       true,
        modo:     cfg.modo,
        ambiente: envPath,
        mensaje:  `Conexión exitosa con MSeller en modo ${cfg.modo}.`,
      };
    } catch (err: any) {
      // No re-manejar si fue el BadRequestException del circuit breaker de arriba
      if (err?.constructor?.name === 'BadRequestException' && !err?.response?.data) {
        throw err;
      }

      const status  = err?.status ?? err?.response?.status;
      const resData = err?.response?.data ?? err?.response;

      // Loguear el body completo de MSeller para diagnóstico
      this.logger.warn(
        `Test MSeller FALLÓ para empresa #${empresaId}: [${status}] body=${JSON.stringify(resData)} msg=${err?.message}`,
      );

      // Extraer mensaje legible — MSeller puede usar distintos campos
      const detail =
        resData?.message ??
        resData?.error ??
        resData?.errors?.[0] ??
        (typeof resData === 'string' ? resData : null) ??
        err?.message ??
        'Error desconocido';

      // Incrementar contador de fallos consecutivos
      const fallos = (testFailCounts.get(empresaId) ?? 0) + 1;
      testFailCounts.set(empresaId, fallos);

      // Pre-activar circuit breaker si detecta bloqueo de Cognito o si alcanza el límite
      const esBloqueoCognito = typeof detail === 'string' && detail.toLowerCase().includes('password attempts exceeded');
      if (esBloqueoCognito || fallos >= MAX_TEST_FAILS) {
        const hasta = new Date(Date.now() + 30 * 60_000);
        await this.setBloqueadoHasta(empresaId, hasta);
        testFailCounts.delete(empresaId);
        const razon = esBloqueoCognito
          ? 'Cognito reportó cuenta bloqueada'
          : `${fallos} intentos fallidos consecutivos`;
        this.logger.warn(`[CircuitBreaker] Empresa #${empresaId}: ${razon} — bloqueada 30 min`);
      }

      // Mensaje claro con advertencia de bloqueo
      const fallosRestantes = MAX_TEST_FAILS - (testFailCounts.get(empresaId) ?? 0);
      const advertencia = fallosRestantes > 0 && fallosRestantes < MAX_TEST_FAILS
        ? ` ⚠️ ${fallosRestantes} intento(s) más y la cuenta se bloqueará temporalmente.`
        : '';

      throw new BadRequestException(
        `Credenciales MSeller incorrectas — verifica usuario y contraseña.${advertencia} (${detail})`,
      );
    }
  }

  // ── CRUD Secuencias (Super Admin) ─────────────────────────────────────────

  async listarSecuencias(empresaId: number): Promise<SecuenciaECF[]> {
    return this.secuenciaRepo.find({
      where: { empresaId },
      relations: ['tipoECF'],
      order: { createdAt: 'DESC' },
    });
  }

  async crearSecuencia(dto: CreateSecuenciaAdminDto, adminUserId: number): Promise<SecuenciaECF> {
    if (dto.secuenciaFinal <= dto.secuenciaInicial) {
      throw new BadRequestException('secuenciaFinal debe ser mayor que secuenciaInicial.');
    }

    // Validar que la fecha de vencimiento sea futura
    const vence = new Date(dto.fechaVencimiento);
    if (vence <= new Date()) {
      throw new BadRequestException('La fecha de vencimiento debe ser futura.');
    }

    // Verificar solapamiento de rangos para el mismo tipo y empresa
    const solapadas = await this.ds.query<{ id: number }[]>(`
      SELECT id FROM secuencias_ecf
      WHERE "empresaId" = $1
        AND "tipoECFId" = $2
        AND "isActive"  = true
        AND "isAgotada" = false
        AND NOT ("secuenciaFinal" < $3 OR "secuenciaInicial" > $4)
    `, [dto.empresaId, dto.tipoECFId, dto.secuenciaInicial, dto.secuenciaFinal]);

    if (solapadas.length > 0) {
      throw new ConflictException(
        `El rango [${dto.secuenciaInicial}–${dto.secuenciaFinal}] se solapa con ` +
        `una secuencia existente (id: ${solapadas.map(s => s.id).join(', ')}) ` +
        `para el mismo tipo de e-CF y empresa.`,
      );
    }

    // Desactivar cualquier secuencia activa previa para este tipo/empresa
    // (solo puede haber una activa — la nueva desplaza a la anterior)
    await this.secuenciaRepo.update(
      { empresaId: dto.empresaId, tipoECFId: dto.tipoECFId, isActiva: true },
      { isActiva: false },
    );

    const secuencia = this.secuenciaRepo.create({
      empresaId:        dto.empresaId,
      tipoECFId:        dto.tipoECFId,
      secuenciaInicial: dto.secuenciaInicial,
      secuenciaFinal:   dto.secuenciaFinal,
      secuenciaActual:  dto.secuenciaInicial,
      fechaVencimiento: vence,
      isActiva:         true,
      isAgotada:        false,
      alertaEnviada:    false,
      userId:           adminUserId,
    });

    const saved = await this.secuenciaRepo.save(secuencia);
    this.logger.log(
      `Secuencia tipo ${dto.tipoECFId} creada para empresa #${dto.empresaId}: ` +
      `[${dto.secuenciaInicial}–${dto.secuenciaFinal}]`,
    );
    return saved;
  }

  async desactivarSecuencia(secuenciaId: number): Promise<SecuenciaECF> {
    const sec = await this.secuenciaRepo.findOne({
      where: { id: secuenciaId },
      relations: ['tipoECF'],
    });
    if (!sec) throw new NotFoundException(`Secuencia #${secuenciaId} no encontrada`);

    sec.isActiva = false;
    const saved = await this.secuenciaRepo.save(sec);
    this.logger.log(`Secuencia #${secuenciaId} desactivada`);
    return saved;
  }

  // ── Dashboard global de e-CF (Super Admin) ────────────────────────────────

  async dashboardGlobal(): Promise<{
    totalHoy:    number;
    totalMes:    number;
    pctAceptados: number;
    erroresPorEmpresa: { empresaId: number; rechazados: number; contingencia: number }[];
    empresasConfiguradas: number;
    empresasSinConfig:    number;
  }> {
    const [totals, errors, cfgCount] = await Promise.all([
      this.ds.query<{ hoy: string; mes: string; aceptados: string; total: string }[]>(`
        SELECT
          COUNT(CASE WHEN DATE("createdAt") = CURRENT_DATE THEN 1 END)::int AS hoy,
          COUNT(CASE WHEN EXTRACT(MONTH FROM "createdAt") = EXTRACT(MONTH FROM CURRENT_DATE)
                     AND EXTRACT(YEAR  FROM "createdAt") = EXTRACT(YEAR  FROM CURRENT_DATE)
                THEN 1 END)::int AS mes,
          COUNT(CASE WHEN "estadoDGII" = 'aceptado' THEN 1 END)::int AS aceptados,
          COUNT(*)::int AS total
        FROM ecf
        WHERE "fechaUso" >= CURRENT_DATE - INTERVAL '30 days'
           OR "fechaUso" IS NULL
      `),
      this.ds.query<{ empresaId: number; rechazados: number; contingencia: number }[]>(`
        SELECT
          "empresaId",
          COUNT(CASE WHEN "estadoDGII" = 'rechazado'    THEN 1 END)::int AS rechazados,
          COUNT(CASE WHEN "estadoDGII" = 'contingencia' THEN 1 END)::int AS contingencia
        FROM ecf
        WHERE ("fechaUso" >= CURRENT_DATE - INTERVAL '30 days' OR "fechaUso" IS NULL)
          AND "estadoDGII" IN ('rechazado','contingencia')
        GROUP BY "empresaId"
        HAVING COUNT(*) > 0
        ORDER BY (COUNT(CASE WHEN "estadoDGII" = 'rechazado' THEN 1 END) +
                  COUNT(CASE WHEN "estadoDGII" = 'contingencia' THEN 1 END)) DESC
      `),
      this.configRepo.count({ where: { activo: true } }),
    ]);

    const t = totals[0];
    const total      = Number(t?.total    ?? 0);
    const aceptados  = Number(t?.aceptados ?? 0);

    return {
      totalHoy:             Number(t?.hoy ?? 0),
      totalMes:             Number(t?.mes ?? 0),
      pctAceptados:         total > 0 ? Math.round((aceptados / total) * 100) : 0,
      erroresPorEmpresa:    errors,
      empresasConfiguradas: cfgCount,
      empresasSinConfig:    0, // calculable con JOIN a empresa — extensión futura
    };
  }

  // ── Circuit breaker ───────────────────────────────────────────────────────

  /** Activa el circuit breaker para la empresa hasta la fecha indicada. */
  async setBloqueadoHasta(empresaId: number, hasta: Date): Promise<void> {
    const cfg = await this.configRepo.findOne({ where: { empresaId } });
    await this.configRepo.update({ empresaId }, { bloqueadoHasta: hasta });
    this.logger.warn(
      `Circuit breaker activado para empresa #${empresaId} — ` +
      `reintentos pausados hasta ${hasta.toISOString()}`,
    );

    // Notificar al Super Admin por email
    const adminEmail = this.configSvc.get<string>('NOTIF_ADMIN_EMAIL', '');
    if (adminEmail) {
      const hastaLocal = hasta.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' });
      await this.emailSvc.enviar({
        to:      adminEmail,
        subject: `⚠️ e-CF bloqueado — Empresa #${empresaId} (${cfg?.msellerEmail ?? 'sin email'})`,
        html: `
<p>El sistema e-CF detectó que la cuenta MSeller de la empresa <strong>#${empresaId}</strong>
(${cfg?.msellerEmail ?? 'sin email'}) fue bloqueada por Cognito por intentos fallidos de autenticación.</p>
<p>Los reintentos automáticos han sido pausados hasta <strong>${hastaLocal}</strong>.</p>
<ul>
  <li>Verifica que las credenciales MSeller sean correctas en <em>Super Admin → Configuraciones e-CF</em>.</li>
  <li>Si la contraseña fue cambiada en el portal MSeller, actualízala en HiCloud.</li>
  <li>Tras corregir las credenciales, el cron retomará automáticamente al expirar el bloqueo.</li>
</ul>
<p style="color:#888;font-size:12px">HiCloud ERP — Alerta automática de circuito e-CF</p>`,
      }).catch((e: Error) => this.logger.error(`Error enviando alerta circuit breaker: ${e.message}`));
    }
  }

  /** Devuelve true si la empresa tiene el circuit breaker activo en este momento. */
  async isEmpresaBloqueada(empresaId: number): Promise<boolean> {
    const cfg = await this.configRepo.findOne({
      where: { empresaId },
      select: ['bloqueadoHasta'] as any,
    });
    if (!cfg?.bloqueadoHasta) return false;
    return new Date(cfg.bloqueadoHasta) > new Date();
  }

  // ── Utilidades internas ───────────────────────────────────────────────────

  /** Elimina los campos cifrados antes de devolver al cliente. */
  private sanitize(cfg: EmpresaEcfConfig): EmpresaEcfConfig {
    const out = { ...cfg };
    delete (out as any).msellerPasswordEnc;
    delete (out as any).msellerApiKeyEnc;
    return out;
  }

  /** Devuelve las credenciales descifradas — uso interno únicamente. */
  async getCredencialesDescifradas(empresaId: number): Promise<{
    email: string;
    password: string;
    apiKey: string;
    urlBase: string;
    modo: ModoEcf;
    envPath: string;
  }> {
    const cfg = await this.obtenerPorEmpresa(empresaId);

    if (!cfg.activo) {
      throw new BadRequestException(`La configuración e-CF de la empresa #${empresaId} está inactiva.`);
    }
    if (!cfg.msellerEmail || !cfg.msellerPasswordEnc || !cfg.msellerApiKeyEnc) {
      throw new BadRequestException(`Credenciales MSeller incompletas para empresa #${empresaId}.`);
    }

    return {
      email:    cfg.msellerEmail,
      password: this.encryption.decrypt(cfg.msellerPasswordEnc),
      apiKey:   this.encryption.decrypt(cfg.msellerApiKeyEnc),
      urlBase:  cfg.msellerUrlBase,
      modo:     cfg.modo,
      envPath:  MSELLER_ENV_PATH[cfg.modo],
    };
  }

  // Placeholder para satisfacer el compilador
  private validarRangoFechaVencimiento(_: string) { /* no-op */ }
}
