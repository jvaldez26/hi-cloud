import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreferenciaUsuario } from './entities/preferencia-usuario.entity';
import { TenantService } from '../tenant/tenant.service';
import { UserRole } from '../users/enums/user-role.enum';
import {
  CLAVE_DASHBOARD_WIDGETS,
  MAX_WIDGETS,
  catalogoParaRol,
  defectoParaRol,
  existeWidget,
  widgetPermitido,
} from './dashboard-widgets.catalogo';

/** Sin migración, mismo criterio que CLAVE_DASHBOARD_WIDGETS: una fila más en preferencias_usuario. */
const CLAVE_SIDEBAR_COLAPSADO = 'sidebar.colapsado';

/**
 * Columnas de una tabla — el caso que la entidad ya anticipaba (ver su
 * comentario). Un módulo por tabla ('compra-items', …); el servidor decide
 * cuáles existen (MODULOS_COLUMNAS), no el cliente, mismo criterio que
 * existeWidget() para el dashboard.
 */
const CLAVE_COLUMNAS_PREFIJO = 'columnas.';
const MODULOS_COLUMNAS = new Set(['compra-items']);

@Injectable()
export class PreferenciasService {
  private readonly logger = new Logger(PreferenciasService.name);

  constructor(
    @InjectRepository(PreferenciaUsuario)
    private readonly repo: Repository<PreferenciaUsuario>,
    private readonly tenantService: TenantService,
  ) {}

  // ── Dashboard: que graficas ve este usuario en esta empresa ───────────────

  /**
   * Devuelve la seleccion guardada, o los defaults si nunca ha tocado nada.
   *
   * `porDefecto` le dice al frontend si esto es una eleccion de la persona o
   * simplemente lo que traia de fabrica — lo necesita para distinguir "no he
   * elegido todavia" de "las he quitado todas a proposito", que se pintan
   * distinto.
   *
   * Los slugs que ya no existen en el catalogo se ignoran al leer, en vez de
   * romper el panel. Retirar una grafica no obliga a migrar lo guardado.
   */
  async getWidgetsDashboard(): Promise<{
    widgets: string[];
    porDefecto: boolean;
    catalogo: { slug: string; titulo: string }[];
  }> {
    const userId    = this.exigirUserId();
    const empresaId = this.tenantService.getEmpresaId();
    const rol       = this.rolActual();

    const fila = await this.repo.findOne({
      where: { userId, empresaId, clave: CLAVE_DASHBOARD_WIDGETS, isActive: true },
    });

    const catalogo = catalogoParaRol(rol).map(w => ({ slug: w.slug, titulo: w.titulo }));

    if (!fila) {
      return { widgets: [...defectoParaRol(rol)], porDefecto: true, catalogo };
    }

    const guardados = Array.isArray(fila.valor) ? (fila.valor as unknown[]) : [];
    const widgets   = guardados
      .filter((s): s is string => typeof s === 'string')
      .filter(s => existeWidget(s) && widgetPermitido(s, rol));

    return { widgets, porDefecto: false, catalogo };
  }

  /**
   * Guarda la seleccion. Un array vacio es valido: significa "las quite todas",
   * y no es lo mismo que no haber elegido nunca.
   */
  async setWidgetsDashboard(widgets: unknown): Promise<{ widgets: string[] }> {
    const userId    = this.exigirUserId();
    const empresaId = this.tenantService.getEmpresaId();
    const rol       = this.rolActual();

    const limpios = this.validarWidgets(widgets, rol);

    // upsert sobre el UNIQUE (userId, empresaId, clave)
    await this.repo.upsert(
      { userId, empresaId, clave: CLAVE_DASHBOARD_WIDGETS, valor: limpios, isActive: true },
      { conflictPaths: ['userId', 'empresaId', 'clave'], skipUpdateIfNoValuesChanged: true },
    );

    return { widgets: limpios };
  }

  // ── Sidebar: colapsado o expandido, sincronizado entre dispositivos ────────

  /**
   * Preferencia del sidebar (colapsado/expandido) para este usuario en esta
   * empresa. Antes vivía SOLO en localStorage: cada dispositivo tenía su
   * propia preferencia, y un usuario que colapsaba el menú en su PC lo veía
   * expandido de nuevo al entrar desde el celular. `porDefecto: true` cuando
   * nunca lo ha tocado — el frontend sigue arrancando desde localStorage
   * (primer pintado sin esperar red) y reconcilia con esto en cuanto responde.
   */
  async getSidebarColapsado(): Promise<{ colapsado: boolean; porDefecto: boolean }> {
    const userId    = this.exigirUserId();
    const empresaId = this.tenantService.getEmpresaId();

    const fila = await this.repo.findOne({
      where: { userId, empresaId, clave: CLAVE_SIDEBAR_COLAPSADO, isActive: true },
    });

    if (!fila) return { colapsado: false, porDefecto: true };
    return { colapsado: fila.valor === true, porDefecto: false };
  }

  async setSidebarColapsado(colapsado: boolean): Promise<{ colapsado: boolean }> {
    const userId    = this.exigirUserId();
    const empresaId = this.tenantService.getEmpresaId();

    await this.repo.upsert(
      { userId, empresaId, clave: CLAVE_SIDEBAR_COLAPSADO, valor: colapsado, isActive: true },
      { conflictPaths: ['userId', 'empresaId', 'clave'], skipUpdateIfNoValuesChanged: true },
    );

    return { colapsado };
  }

  // ── Columnas de tabla: qué ve este usuario, sincronizado entre dispositivos ─

  /**
   * Se guarda el DIFF contra los defaults (ocultas/mostradas), no la lista de
   * visibles — mismo formato y misma razón que useColumnVisibility.ts en el
   * frontend: si se guardara la lista de visibles, una columna nueva no
   * estaría en la preferencia de nadie que ya hubiera tocado el selector, así
   * que nacería oculta para siempre. `porDefecto: true` = nunca lo ha tocado
   * (el frontend arranca de localStorage y reconcilia con esto al cargar).
   */
  async getColumnasOcultas(modulo: string): Promise<{ ocultas: string[]; mostradas: string[]; porDefecto: boolean }> {
    this.validarModuloColumnas(modulo);
    const userId    = this.exigirUserId();
    const empresaId = this.tenantService.getEmpresaId();

    const fila = await this.repo.findOne({
      where: { userId, empresaId, clave: CLAVE_COLUMNAS_PREFIJO + modulo, isActive: true },
    });
    if (!fila) return { ocultas: [], mostradas: [], porDefecto: true };

    const valor = fila.valor as any;
    return {
      ocultas:    this.filtrarClaves(valor?.ocultas),
      mostradas:  this.filtrarClaves(valor?.mostradas),
      porDefecto: false,
    };
  }

  async setColumnasOcultas(modulo: string, ocultas: unknown, mostradas: unknown): Promise<{ ocultas: string[]; mostradas: string[] }> {
    this.validarModuloColumnas(modulo);
    const userId    = this.exigirUserId();
    const empresaId = this.tenantService.getEmpresaId();

    const limpiasOcultas   = this.validarListaClaves(ocultas, 'ocultas');
    const limpiasMostradas = this.validarListaClaves(mostradas, 'mostradas');

    await this.repo.upsert(
      {
        userId, empresaId, clave: CLAVE_COLUMNAS_PREFIJO + modulo,
        valor: { ocultas: limpiasOcultas, mostradas: limpiasMostradas }, isActive: true,
      },
      { conflictPaths: ['userId', 'empresaId', 'clave'], skipUpdateIfNoValuesChanged: true },
    );

    return { ocultas: limpiasOcultas, mostradas: limpiasMostradas };
  }

  private validarModuloColumnas(modulo: string) {
    if (!MODULOS_COLUMNAS.has(modulo)) {
      throw new BadRequestException(`El módulo de columnas "${modulo}" no existe.`);
    }
  }

  /** Al leer: lo corrupto se ignora en silencio (no hay input del usuario que corregir). */
  private filtrarClaves(valor: unknown): string[] {
    return Array.isArray(valor) ? valor.filter((s): s is string => typeof s === 'string') : [];
  }

  /** Al escribir: lo inválido SÍ se rechaza — es el usuario mandándolo, no un dato viejo. */
  private validarListaClaves(valor: unknown, campo: string): string[] {
    if (!Array.isArray(valor)) {
      throw new BadRequestException(`\`${campo}\` debe ser un array de claves de columna.`);
    }
    if (valor.length > 50) {
      throw new BadRequestException(`Demasiadas columnas en "${campo}": ${valor.length}.`);
    }
    const vistos = new Set<string>();
    const out: string[] = [];
    for (const s of valor) {
      if (typeof s !== 'string' || s.length === 0 || s.length > 40) {
        throw new BadRequestException(`Cada clave de columna en "${campo}" debe ser texto de 1 a 40 caracteres.`);
      }
      if (vistos.has(s)) continue;   // repetir no es un error, es ruido: se colapsa
      vistos.add(s);
      out.push(s);
    }
    return out;
  }

  // ── Validacion ────────────────────────────────────────────────────────────

  /**
   * El navegador no decide que slugs existen.
   *
   * Se rechaza lo desconocido en vez de filtrarlo en silencio: si el frontend
   * manda un slug que el servidor no conoce, es un bug de despliegue (versiones
   * descompasadas) y hay que verlo, no taparlo.
   */
  private validarWidgets(valor: unknown, rol: UserRole): string[] {
    if (!Array.isArray(valor)) {
      throw new BadRequestException('`widgets` debe ser un array de identificadores.');
    }
    if (valor.length > MAX_WIDGETS) {
      throw new BadRequestException(
        `Demasiadas gráficas: ${valor.length}. El máximo es ${MAX_WIDGETS}.`,
      );
    }

    const vistos = new Set<string>();
    const out: string[] = [];

    for (const s of valor) {
      if (typeof s !== 'string') {
        throw new BadRequestException('Cada gráfica debe ser un identificador de texto.');
      }
      if (!existeWidget(s)) {
        throw new BadRequestException(`La gráfica "${s}" no existe.`);
      }
      if (!widgetPermitido(s, rol)) {
        throw new BadRequestException(`La gráfica "${s}" no está disponible para tu rol.`);
      }
      if (vistos.has(s)) continue;   // repetir no es un error, es ruido: se colapsa
      vistos.add(s);
      out.push(s);
    }

    return out;
  }

  // ── Contexto ──────────────────────────────────────────────────────────────

  private exigirUserId(): number {
    const id = this.tenantService.getUserId();
    if (!id) {
      // Sin usuario no hay preferencia posible. Igual que en restaurante: o hay
      // usuario real o no se toca la fila.
      throw new BadRequestException('No hay usuario en el contexto de la petición.');
    }
    return id;
  }

  /**
   * El rol dentro de ESTA empresa, no el global del usuario: alguien puede ser
   * admin en su ferreteria y viewer donde le dieron acceso de solo lectura.
   */
  private rolActual(): UserRole {
    return (this.tenantService.getRolEmpresa() as UserRole) ?? UserRole.VIEWER;
  }
}
