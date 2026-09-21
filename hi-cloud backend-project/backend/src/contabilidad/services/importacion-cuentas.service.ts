import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import * as XLSX from 'xlsx';
import {
  CuentaContable, TipoCuenta, NaturalezaCuenta, AnexoIR2, TIPOS_POR_ANEXO_IR2, ClasificacionResultado,
} from '../entities/cuenta-contable.entity';
import { CuentaAnexoIR2 } from '../entities/cuenta-anexo-ir2.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { TenantService } from '../../tenant/tenant.service';
import { SaldosCuentasService } from '../../reportes-financieros/saldos-cuentas.service';
import { AuditoriaService, CreateAuditLogDto } from '../../auditoria/auditoria.service';
import { AccionAuditoria } from '../../auditoria/entities/audit-log.entity';
import { PLAN_CUENTAS } from './contabilidad.service';

// ── Límite de filas ──────────────────────────────────────────────────────────
// Una empresa real no tiene más de unos pocos cientos de cuentas — 2,000 ya
// es holgado. Sin tope, un archivo corrupto o mal armado (miles de filas
// vacías arrastradas por Excel) procesaría en silencio durante minutos.
const LIMITE_FILAS = 2000;

// ── Columnas de la plantilla — fuente única ──────────────────────────────────
// getPlantilla(), parsearFilas() y validarFila() leen TODOS de esta lista, así
// que agregar una columna nueva (obligatoria o no) se hace en un solo lugar y
// se refleja en los tres a la vez — nunca queda la plantilla desincronizada
// del validador.
interface ColumnaImport {
  header: string;
  campo: string;
  requerido: boolean;
  descripcion: string;
}

const COLUMNAS: ColumnaImport[] = [
  { header: 'Código', campo: 'codigo', requerido: true,
    descripcion: 'Código de la cuenta, único dentro de la empresa. Formatea esta columna como TEXTO en Excel antes de escribir — si no, un código como "0501" pierde el cero.' },
  { header: 'Nombre', campo: 'nombre', requerido: true,
    descripcion: 'Nombre de la cuenta.' },
  { header: 'Tipo', campo: 'tipo', requerido: true,
    descripcion: `Uno de: ${Object.values(TipoCuenta).join(', ')} (así, en minúsculas — "patrimonio", no "capital").` },
  { header: 'Naturaleza', campo: 'naturaleza', requerido: true,
    descripcion: `Uno de: ${Object.values(NaturalezaCuenta).join(', ')}.` },
  { header: 'Código cuenta madre', campo: 'codigoMadre', requerido: false,
    descripcion: 'Código de la cuenta padre. Vacío = cuenta de primer nivel. La madre debe existir ya en el catálogo o venir en este mismo archivo (en cualquier fila, el orden no importa).' },
  { header: 'Es cuenta grupo', campo: 'esCuentaGrupo', requerido: false,
    descripcion: 'SI o NO (vacío = NO). Las cuentas grupo agrupan a sus hijas y no reciben movimientos contables directos.' },
  { header: 'Anexo IR-2', campo: 'anexoIR2', requerido: false,
    descripcion: `A1 (Balance General), B1 (Estado de Resultados), D (Costo de Venta), o vacío. Debe ser coherente con el Tipo — A1: ${TIPOS_POR_ANEXO_IR2[AnexoIR2.A1].join('/')}; B1: ${TIPOS_POR_ANEXO_IR2[AnexoIR2.B1].join('/')}; D: ${TIPOS_POR_ANEXO_IR2[AnexoIR2.D].join('/')}.` },
  { header: 'Activa', campo: 'activa', requerido: false,
    descripcion: 'SI o NO (vacío = SI).' },
  { header: 'Moneda', campo: 'moneda', requerido: false,
    descripcion: 'Vacío o DOP. El plan de cuentas todavía no soporta cuentas en moneda extranjera — cualquier otro valor se rechaza esa fila.' },
  { header: 'Clasificación resultado', campo: 'clasificacionResultado', requerido: false,
    descripcion: 'Solo para Tipo ingreso, costo o gasto (se rechaza esa fila si viene en cualquier otro tipo). OPERACIONAL, NO OPERACIONAL, o vacío = hereda de la cuenta madre (sin madre, o si ninguna en la cadena lo especifica: OPERACIONAL). Distingue "Ingresos"/"Gastos" de "Otros Ingresos"/"Otros Gastos" en el Estado de Resultados — basta marcar UNA cuenta madre para clasificar todas sus hijas.' },
];

const SI_NO = { SI: true, NO: false } as const;

export interface ErrorFilaImport { fila: number; motivo: string; }
export interface AdvertenciaFilaImport { fila: number; codigo: string; motivo: string; }
export interface CambioCampoImport { campo: string; antes: unknown; despues: unknown; }
export interface CuentaACrearImport {
  fila: number; codigo: string; nombre: string; tipo: string; naturaleza: string;
  codigoMadre?: string; esCuentaGrupo: boolean; anexoIR2?: string; activa: boolean;
  clasificacionResultado?: ClasificacionResultado;
}
export interface CuentaAActualizarImport { fila: number; codigo: string; nombre: string; cambios: CambioCampoImport[]; }

export interface PreviewImportacionCuentas {
  totalFilas: number;
  crear: CuentaACrearImport[];
  actualizar: CuentaAActualizarImport[];
  errores: ErrorFilaImport[];
  advertencias: AdvertenciaFilaImport[];
  /** Cuentas del catálogo actual cuyo código NO aparece en el archivo — se dejan intactas. */
  noTocadas: number;
}

export interface ResultadoImportacionCuentas extends PreviewImportacionCuentas {
  creadas: number;
  actualizadas: number;
}

/** Una fila ya parseada y con los tipos básicos validados (no implica que sea importable). */
interface FilaParseada {
  fila: number;
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  naturaleza: NaturalezaCuenta;
  codigoMadre?: string;
  esCuentaGrupo: boolean;
  anexoIR2?: AnexoIR2;
  activa: boolean;
  clasificacionResultado?: ClasificacionResultado;
}

@Injectable()
export class ImportacionCuentasService {
  private readonly logger = new Logger(ImportacionCuentasService.name);

  constructor(
    @InjectRepository(CuentaContable) private cuentaRepository: Repository<CuentaContable>,
    @InjectRepository(CuentaAnexoIR2) private anexoRepository: Repository<CuentaAnexoIR2>,
    @InjectRepository(AsientoLinea) private lineaRepository: Repository<AsientoLinea>,
    private tenantService: TenantService,
    private saldosService: SaldosCuentasService,
    private auditoriaService: AuditoriaService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  private get eid(): number {
    return this.tenantService.getEmpresaId();
  }

  // ── Plantilla ────────────────────────────────────────────────────────────

  /**
   * 8-10 filas de ejemplo con jerarquía real de 3 niveles — tomadas del
   * mismo plan de cuentas dominicano que ya se siembra a cada empresa nueva
   * (ver PLAN_CUENTAS_BASE en contabilidad.service.ts), no inventadas.
   */
  private filasEjemplo(): string[][] {
    return [
      ['1.1',       'Activo Corriente',        'activo',  'deudora',   '',      'SI', 'A1', 'SI', '', ''],
      ['1.1.1',     'Efectivo y Equivalentes',  'activo',  'deudora',   '1.1',   'SI', '',   'SI', '', ''],
      ['1.1.1.01',  'Caja General',             'activo',  'deudora',   '1.1.1', 'NO', '',   'SI', '', ''],
      ['1.1.1.02',  'Bancos',                   'activo',  'deudora',   '1.1.1', 'NO', '',   'SI', '', ''],
      ['2.1',       'Pasivo Corriente',         'pasivo',  'acreedora', '',      'SI', 'A1', 'SI', '', ''],
      ['2.1.1.01',  'Proveedores Locales',      'pasivo',  'acreedora', '2.1',   'NO', '',   'SI', '', ''],
      ['4.1',       'Ingresos Operacionales',   'ingreso', 'acreedora', '',      'SI', 'B1', 'SI', '', ''],
      ['4.1.1.01',  'Ventas de Contado',        'ingreso', 'acreedora', '4.1',   'NO', '',   'SI', '', ''],
      ['6.1',       'Gastos Operativos',        'gasto',   'deudora',   '',      'SI', 'B1', 'SI', '', ''],
      ['6.1.1.05',  'Sueldos y Salarios',       'gasto',   'deudora',   '6.1',   'NO', '',   'SI', '', 'OPERACIONAL'],
    ];
  }

  /** Genera el .xlsx de la plantilla — dos hojas: Cuentas (con ejemplos) e Instrucciones. */
  getPlantilla(): Buffer {
    const wb = XLSX.utils.book_new();

    const encabezados = COLUMNAS.map(c => c.header);
    const wsCuentas = XLSX.utils.aoa_to_sheet([encabezados, ...this.filasEjemplo()]);
    // Código como TEXTO explícito — si no, Excel puede reinterpretar "1.1.1"
    // como fecha o número y perder el formato al reabrir el archivo.
    const numFilas = 1 + this.filasEjemplo().length;
    for (let r = 1; r < numFilas; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: 0 });
      if (wsCuentas[ref]) wsCuentas[ref].z = '@';
    }
    wsCuentas['!cols'] = COLUMNAS.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, wsCuentas, 'Cuentas');

    const filasInstrucciones: string[][] = [
      ['Columna', 'Obligatoria', 'Qué significa / valores válidos'],
      ...COLUMNAS.map(c => [c.header, c.requerido ? 'Sí' : 'No', c.descripcion]),
      [''],
      ['Reglas'],
      ['La cuenta madre debe existir ya en el catálogo, o venir en este mismo archivo (el orden de las filas no importa — se procesan madres primero automáticamente).'],
      ['El código debe ser único dentro de la empresa. Si el código ya existe, esa fila ACTUALIZA la cuenta (no la duplica).'],
      ['Una cuenta con movimientos contables registrados no puede cambiar de Tipo ni de Naturaleza (cambiaría el signo de reportes históricos ya cerrados) — sí se le puede cambiar el Nombre.'],
      ['Las cuentas del catálogo actual que NO aparezcan en el archivo se dejan intactas — esta importación nunca borra ni desactiva nada por omisión.'],
      ['Antes de escribirse nada, la pantalla de importación muestra una vista previa (qué se crea, qué se actualiza, qué fila tiene error) para confirmar.'],
    ];
    const wsInstrucciones = XLSX.utils.aoa_to_sheet(filasInstrucciones);
    wsInstrucciones['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ── Parseo ───────────────────────────────────────────────────────────────

  /**
   * Acepta .xlsx (hoja "Cuentas" si existe, si no la primera) y .csv (XLSX.read
   * detecta el formato solo). Opciones que apagan parseo de fórmulas/VBA/
   * estilos: la librería xlsx tiene CVEs conocidos de ReDoS/prototype
   * pollution sobre esas rutas — no hay versión parcheada en npm (SheetJS
   * movió los fixes a su propio registro), así que se reduce la superficie
   * de ataque a lo mínimo que este caso de uso necesita (valores de celda).
   */
  private parsearArchivo(buffer: Buffer): string[][] {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, {
        type: 'buffer', cellFormula: false, cellHTML: false, cellStyles: false,
        bookVBA: false, bookFiles: false, bookProps: false,
      });
    } catch {
      throw new BadRequestException('No se pudo leer el archivo — ¿es un .xlsx o .csv válido?');
    }
    const nombreHoja = wb.SheetNames.includes('Cuentas') ? 'Cuentas' : wb.SheetNames[0];
    if (!nombreHoja) throw new BadRequestException('El archivo no tiene ninguna hoja de datos');
    const hoja = wb.Sheets[nombreHoja];
    const filas = XLSX.utils.sheet_to_json<string[]>(hoja, { header: 1, raw: false, defval: '' });
    return filas
      .map(fila => (fila as unknown[]).map(c => String(c ?? '').trim()))
      .filter(fila => fila.some(c => c.length > 0));
  }

  /** Índice de columna por header, insensible a mayúsculas/tildes básicas. */
  private mapearEncabezados(headerRow: string[]): { idx: (campo: string) => number; faltantes: string[] } {
    const normalizado = (s: string) => s.toLowerCase().trim();
    const headers = headerRow.map(normalizado);
    const idx = (campo: string) => {
      const col = COLUMNAS.find(c => c.campo === campo)!;
      return headers.indexOf(normalizado(col.header));
    };
    const faltantes = COLUMNAS.filter(c => c.requerido && idx(c.campo) === -1).map(c => c.header);
    return { idx, faltantes };
  }

  // ── Validación de una fila ───────────────────────────────────────────────

  private parsearFila(fNum: number, raw: string[], idx: (campo: string) => number): { fila?: FilaParseada; error?: string } {
    const get = (campo: string) => { const i = idx(campo); return i >= 0 ? (raw[i] ?? '').trim() : ''; };

    const codigo = get('codigo');
    const nombre = get('nombre');
    const tipoRaw = get('tipo').toLowerCase();
    const naturalezaRaw = get('naturaleza').toLowerCase();
    const codigoMadre = get('codigoMadre') || undefined;
    const esCuentaGrupoRaw = get('esCuentaGrupo').toUpperCase() || 'NO';
    const anexoRaw = get('anexoIR2').toUpperCase() || undefined;
    const activaRaw = get('activa').toUpperCase() || 'SI';
    const monedaRaw = get('moneda').toUpperCase();
    const clasifRaw = get('clasificacionResultado').toUpperCase().replace(/\s+/g, '_');

    if (!codigo) return { error: 'Código vacío — es obligatorio' };
    if (!nombre) return { error: 'Nombre vacío — es obligatorio' };
    if (!Object.values(TipoCuenta).includes(tipoRaw as TipoCuenta)) {
      return { error: `Tipo "${get('tipo')}" inválido — debe ser uno de: ${Object.values(TipoCuenta).join(', ')}` };
    }
    if (!Object.values(NaturalezaCuenta).includes(naturalezaRaw as NaturalezaCuenta)) {
      return { error: `Naturaleza "${get('naturaleza')}" inválida — debe ser deudora o acreedora` };
    }
    if (esCuentaGrupoRaw !== 'SI' && esCuentaGrupoRaw !== 'NO') {
      return { error: `"Es cuenta grupo" debe ser SI o NO (vino "${get('esCuentaGrupo')}")` };
    }
    if (activaRaw !== 'SI' && activaRaw !== 'NO') {
      return { error: `"Activa" debe ser SI o NO (vino "${get('activa')}")` };
    }
    if (monedaRaw && monedaRaw !== 'DOP') {
      return { error: `Moneda "${get('moneda')}" no soportada — el plan de cuentas todavía solo maneja DOP` };
    }
    let anexoIR2: AnexoIR2 | undefined;
    if (anexoRaw) {
      if (!Object.values(AnexoIR2).includes(anexoRaw as AnexoIR2)) {
        return { error: `Anexo IR-2 "${anexoRaw}" inválido — debe ser A1, B1, D o vacío` };
      }
      anexoIR2 = anexoRaw as AnexoIR2;
      const tiposValidos = TIPOS_POR_ANEXO_IR2[anexoIR2];
      if (!tiposValidos.includes(tipoRaw as TipoCuenta)) {
        return { error: `Anexo IR-2 ${anexoIR2} no aplica a cuentas de tipo ${tipoRaw} (válido: ${tiposValidos.join(', ')})` };
      }
    }

    let clasificacionResultado: ClasificacionResultado | undefined;
    if (clasifRaw) {
      const TIPOS_CON_CLASIFICACION: TipoCuenta[] = [TipoCuenta.INGRESO, TipoCuenta.COSTO, TipoCuenta.GASTO];
      if (!TIPOS_CON_CLASIFICACION.includes(tipoRaw as TipoCuenta)) {
        return { error: `"Clasificación resultado" solo aplica a cuentas de tipo ingreso, costo o gasto (vino en una cuenta de tipo "${tipoRaw}")` };
      }
      if (clasifRaw !== 'OPERACIONAL' && clasifRaw !== 'NO_OPERACIONAL') {
        return { error: `"Clasificación resultado" "${get('clasificacionResultado')}" inválida — debe ser OPERACIONAL, NO OPERACIONAL, o vacío` };
      }
      clasificacionResultado = clasifRaw === 'OPERACIONAL' ? ClasificacionResultado.OPERACIONAL : ClasificacionResultado.NO_OPERACIONAL;
    }

    return {
      fila: {
        fila: fNum, codigo, nombre,
        tipo: tipoRaw as TipoCuenta, naturaleza: naturalezaRaw as NaturalezaCuenta,
        codigoMadre, esCuentaGrupo: SI_NO[esCuentaGrupoRaw as 'SI' | 'NO'],
        anexoIR2, activa: SI_NO[activaRaw as 'SI' | 'NO'], clasificacionResultado,
      },
    };
  }

  // ── Orden topológico + detección de ciclos ───────────────────────────────

  /**
   * Devuelve las filas en orden madre-antes-que-hija (Kahn/DFS clásico) y el
   * conjunto de códigos que participan en una jerarquía circular — una
   * cuenta cuyo ancestro (por códigoMadre, siguiendo la cadena DENTRO del
   * archivo) es ella misma. Las madres que ya existen en la BD no entran en
   * este grafo — no necesitan orden, ya están.
   */
  private ordenarTopologicamente(filas: FilaParseada[]): { orden: FilaParseada[]; enCiclo: Set<string> } {
    const porCodigo = new Map(filas.map(f => [f.codigo, f]));
    const visitado = new Set<string>();
    const enProceso = new Set<string>();
    const enCiclo = new Set<string>();
    const orden: FilaParseada[] = [];

    const visitar = (codigo: string) => {
      if (visitado.has(codigo)) return;
      const fila = porCodigo.get(codigo);
      if (!fila) return;
      if (enProceso.has(codigo)) { enCiclo.add(codigo); return; }
      enProceso.add(codigo);
      if (fila.codigoMadre && porCodigo.has(fila.codigoMadre)) {
        visitar(fila.codigoMadre);
        if (enCiclo.has(fila.codigoMadre)) enCiclo.add(codigo);
      }
      enProceso.delete(codigo);
      if (!enCiclo.has(codigo)) { visitado.add(codigo); orden.push(fila); }
    };

    for (const f of filas) visitar(f.codigo);
    return { orden, enCiclo };
  }

  // ── Preview / ejecución (comparten toda la lógica salvo el paso final) ──

  private async procesar(buffer: Buffer, ejecutar: boolean, usuario?: { id: number; nombre: string }): Promise<ResultadoImportacionCuentas | PreviewImportacionCuentas> {
    const empresaId = this.eid;
    const filasRaw = this.parsearArchivo(buffer);
    if (filasRaw.length === 0) {
      throw new BadRequestException('El archivo está vacío');
    }
    if (filasRaw.length < 2) {
      throw new BadRequestException('El archivo solo tiene encabezado, sin ninguna fila de datos');
    }
    const { idx, faltantes } = this.mapearEncabezados(filasRaw[0]);
    if (faltantes.length > 0) {
      throw new BadRequestException(`Columnas obligatorias faltantes: ${faltantes.join(', ')}`);
    }
    const filasDatos = filasRaw.slice(1);
    if (filasDatos.length > LIMITE_FILAS) {
      throw new BadRequestException(`El archivo tiene ${filasDatos.length} filas — el máximo por importación es ${LIMITE_FILAS}`);
    }

    const errores: ErrorFilaImport[] = [];
    const parseadas: FilaParseada[] = [];
    const codigosMencionados = new Set<string>(); // toda fila que TRAE un código, aunque falle — para "no tocadas"
    const idxCodigo = idx('codigo');
    for (let i = 0; i < filasDatos.length; i++) {
      const fNum = i + 2; // fila 1 = encabezado
      const codigoRaw = idxCodigo >= 0 ? (filasDatos[i][idxCodigo] ?? '').trim() : '';
      if (codigoRaw) codigosMencionados.add(codigoRaw);
      const { fila, error } = this.parsearFila(fNum, filasDatos[i], idx);
      if (error) errores.push({ fila: fNum, motivo: error });
      else parseadas.push(fila!);
    }

    // Código duplicado DENTRO del archivo — se rechazan TODAS las filas que
    // comparten el código, ninguna versión es más confiable que la otra.
    const porCodigoTodas = new Map<string, FilaParseada[]>();
    for (const f of parseadas) {
      const arr = porCodigoTodas.get(f.codigo) ?? [];
      arr.push(f);
      porCodigoTodas.set(f.codigo, arr);
    }
    const validasSinDuplicado: FilaParseada[] = [];
    for (const [codigo, grupo] of porCodigoTodas) {
      if (grupo.length > 1) {
        const filasDup = grupo.map(g => g.fila).join(', ');
        for (const g of grupo) errores.push({ fila: g.fila, motivo: `Código "${codigo}" duplicado en las filas ${filasDup} de este archivo` });
      } else {
        validasSinDuplicado.push(grupo[0]);
      }
    }

    // Cuentas existentes de la empresa — una sola consulta, se usa para
    // resolver madres y para decidir crear/actualizar más abajo.
    const existentes = await this.cuentaRepository.find({ where: { empresaId } });
    const existentesPorCodigo = new Map(existentes.map(c => [c.codigo, c]));

    // Código madre debe existir: activo en la BD, o presente (sin error propio) en el archivo.
    const codigosValidosEnArchivo = new Set(validasSinDuplicado.map(f => f.codigo));
    const conMadreResuelta: FilaParseada[] = [];
    for (const f of validasSinDuplicado) {
      if (f.codigoMadre) {
        const madreEnDB = existentesPorCodigo.get(f.codigoMadre);
        const madreEnArchivo = codigosValidosEnArchivo.has(f.codigoMadre);
        if (!madreEnArchivo && (!madreEnDB || !madreEnDB.isActive)) {
          errores.push({ fila: f.fila, motivo: `La cuenta madre "${f.codigoMadre}" no existe en el catálogo ni viene en este archivo` });
          continue;
        }
      }
      conMadreResuelta.push(f);
    }

    // Jerarquía circular.
    const { orden, enCiclo } = this.ordenarTopologicamente(conMadreResuelta);
    for (const codigo of enCiclo) {
      const f = conMadreResuelta.find(x => x.codigo === codigo)!;
      errores.push({ fila: f.fila, motivo: `Jerarquía circular: "${codigo}" termina siendo ancestro de sí misma a través de su cadena de cuentas madre` });
    }

    // Movimientos por cuenta existente — una sola consulta para todas.
    const idsExistentes = existentes.map(c => c.id);
    const conteoLineas = idsExistentes.length
      ? await this.lineaRepository
          .createQueryBuilder('l')
          .select('l.cuentaContableId', 'cuentaContableId')
          .addSelect('COUNT(*)', 'n')
          .where('l.cuentaContableId IN (:...ids)', { ids: idsExistentes })
          .groupBy('l.cuentaContableId')
          .getRawMany<{ cuentaContableId: number; n: string }>()
      : [];
    const tieneMovimientos = new Set(conteoLineas.map(r => Number(r.cuentaContableId)));

    // Saldos — para la advertencia de "inactivar con saldo distinto de cero". Una sola consulta.
    const saldos = await this.saldosService.obtenerSaldos(empresaId);
    const saldoPorCodigo = new Map(saldos.map(s => [s.codigo, s.saldo]));

    const crear: CuentaACrearImport[] = [];
    const actualizar: CuentaAActualizarImport[] = [];
    const advertencias: AdvertenciaFilaImport[] = [];
    // codigo -> nivel resuelto, para las cuentas que se van a crear en esta
    // misma corrida (las existentes ya traen su nivel en `existentes`).
    const nivelResuelto = new Map<string, number>();
    for (const c of existentes) nivelResuelto.set(c.codigo, c.nivel);

    const paraEjecutar: FilaParseada[] = [];

    for (const f of orden) {
      const nivel = f.codigoMadre ? (nivelResuelto.get(f.codigoMadre) ?? 1) + 1 : 1;
      nivelResuelto.set(f.codigo, nivel);

      const existente = existentesPorCodigo.get(f.codigo);
      if (!existente) {
        crear.push({
          fila: f.fila, codigo: f.codigo, nombre: f.nombre, tipo: f.tipo, naturaleza: f.naturaleza,
          codigoMadre: f.codigoMadre, esCuentaGrupo: f.esCuentaGrupo, anexoIR2: f.anexoIR2, activa: f.activa,
          clasificacionResultado: f.clasificacionResultado,
        });
        paraEjecutar.push(f);
        continue;
      }

      // Cuenta con movimientos: no se le puede cambiar tipo ni naturaleza —
      // cambiaría el signo de reportes históricos ya cerrados. Se rechaza LA
      // FILA completa (no solo esos dos campos) — renombrar sin tocar
      // tipo/naturaleza sigue siendo un "actualizar" normal, sin pasar por aquí.
      const cambiaTipoONaturaleza = existente.tipo !== f.tipo || existente.naturaleza !== f.naturaleza;
      if (cambiaTipoONaturaleza && tieneMovimientos.has(existente.id)) {
        errores.push({
          fila: f.fila,
          motivo: `"${f.codigo}" tiene movimientos contables registrados — no se le puede cambiar el tipo ni la naturaleza (cambiaría el signo de reportes históricos). Se puede renombrar sin tocar esas dos columnas.`,
        });
        continue;
      }

      const permiteMovimientosNuevo = !f.esCuentaGrupo;
      const padreIdNuevo = f.codigoMadre ? (existentesPorCodigo.get(f.codigoMadre)?.id) : undefined;
      const cambios: CambioCampoImport[] = [];
      const comparar = (campo: string, antes: unknown, despues: unknown) => {
        if (antes !== despues) cambios.push({ campo, antes, despues });
      };
      comparar('nombre', existente.nombre, f.nombre);
      comparar('tipo', existente.tipo, f.tipo);
      comparar('naturaleza', existente.naturaleza, f.naturaleza);
      comparar('permiteMovimientos', existente.permiteMovimientos, permiteMovimientosNuevo);
      comparar('cuentaPadreId', existente.cuentaPadreId ?? null, padreIdNuevo ?? null);
      comparar('isActive', existente.isActive, f.activa);
      comparar('clasificacionResultado', existente.clasificacionResultado ?? null, f.clasificacionResultado ?? null);

      if (existente.isActive && !f.activa) {
        const saldo = saldoPorCodigo.get(f.codigo) ?? 0;
        if (Math.abs(saldo) > 0.01) {
          advertencias.push({
            fila: f.fila, codigo: f.codigo,
            motivo: `Se va a inactivar con saldo distinto de cero (${saldo.toFixed(2)}) — no se bloquea, pero confírmalo.`,
          });
        }
      }

      if (cambios.length > 0) {
        actualizar.push({ fila: f.fila, codigo: f.codigo, nombre: f.nombre, cambios });
        paraEjecutar.push(f);
      }
      // Sin cambios: no se toca — ni "crear" ni "actualizar", como una
      // cuenta que no vino en el archivo (noTocadas la cuenta igual, ver abajo).
    }

    const noTocadas = existentes.filter(c => !codigosMencionados.has(c.codigo)).length;

    const preview: PreviewImportacionCuentas = {
      totalFilas: filasDatos.length, crear, actualizar, errores, advertencias, noTocadas,
    };

    if (!ejecutar) return preview;

    // ── Ejecución — transacción única, madres antes que hijas ────────────
    let creadas = 0, actualizadas = 0;
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const cuentaRepo = manager.getRepository(CuentaContable);
      const anexoRepo = manager.getRepository(CuentaAnexoIR2);
      const idPorCodigo = new Map(existentes.map(c => [c.codigo, c.id]));

      for (const f of paraEjecutar) {
        const existente = existentesPorCodigo.get(f.codigo);
        const nivel = nivelResuelto.get(f.codigo)!;
        const cuentaPadreId = f.codigoMadre ? idPorCodigo.get(f.codigoMadre) : undefined;

        if (!existente) {
          const guardada = await cuentaRepo.save(cuentaRepo.create({
            empresaId, codigo: f.codigo, nombre: f.nombre, tipo: f.tipo, naturaleza: f.naturaleza,
            nivel, permiteMovimientos: !f.esCuentaGrupo, cuentaPadreId, isActive: f.activa,
            clasificacionResultado: f.clasificacionResultado,
          }));
          idPorCodigo.set(f.codigo, guardada.id);
          creadas++;
          if (f.anexoIR2) {
            await anexoRepo.save(anexoRepo.create({ cuentaContableId: guardada.id, empresaId, anexoIR2: f.anexoIR2 }));
          }
        } else {
          await cuentaRepo.update(existente.id, {
            nombre: f.nombre, tipo: f.tipo, naturaleza: f.naturaleza,
            permiteMovimientos: !f.esCuentaGrupo, cuentaPadreId, isActive: f.activa,
            // TypeORM tipa la columna nullable como `T | undefined`, no admite
            // `null` en el DeepPartial de .update() aunque la BD sí lo acepte.
            clasificacionResultado: (f.clasificacionResultado ?? null) as ClasificacionResultado,
          });
          idPorCodigo.set(f.codigo, existente.id);
          actualizadas++;
          // El anexo del import es un solo valor — reemplaza lo que hubiera.
          await anexoRepo.update({ cuentaContableId: existente.id }, { isActive: false });
          if (f.anexoIR2) {
            await anexoRepo.save(anexoRepo.create({ cuentaContableId: existente.id, empresaId, anexoIR2: f.anexoIR2 }));
          }
        }
      }
    });

    const auditLog: CreateAuditLogDto = {
      userId: usuario?.id, userName: usuario?.nombre, empresaId,
      accion: AccionAuditoria.CREATE, nivel: 'IMPORTANTE', modulo: 'contabilidad', entidad: 'CuentaContable',
      descripcion: `Importación de Plan de Cuentas: ${creadas} cuenta(s) creada(s), ${actualizadas} actualizada(s)`,
      metodo: 'POST', ruta: '/contabilidad/cuentas/importar', exitoso: true,
    };
    await this.auditoriaService.registrar(auditLog);

    return { ...preview, creadas, actualizadas };
  }

  async previsualizar(buffer: Buffer): Promise<PreviewImportacionCuentas> {
    return this.procesar(buffer, false) as Promise<PreviewImportacionCuentas>;
  }

  async ejecutar(buffer: Buffer, usuario: { id: number; nombre: string }): Promise<ResultadoImportacionCuentas> {
    return this.procesar(buffer, true, usuario) as Promise<ResultadoImportacionCuentas>;
  }

  // ── "Completar con el catálogo estándar" (enriquecimiento del catálogo, 2026-09-21) ──
  //
  // Genera, EN MEMORIA, el mismo archivo que produciría un usuario llenando
  // la plantilla a mano con el catálogo estándar completo (PLAN_CUENTAS,
  // contabilidad.service.ts) — y lo pasa por el MISMO previsualizar()/
  // ejecutar() de arriba. Cero código de importación nuevo: todo lo que
  // valida/inserta/ordena topológicamente ya existe y ya está probado.
  //
  // El archivo generado SOLO trae códigos que la empresa NO tiene todavía
  // — nunca una cuenta ya existente, aunque el nombre/tipo/etc. hayan sido
  // editados a mano — así que estructuralmente esta importación NUNCA
  // puede proponer una actualización, solo altas. Es una garantía de
  // construcción, no una regla aparte que haya que mantener sincronizada
  // con el motor.
  //
  // Limitación conocida y aceptada: la plantilla de importación solo admite
  // UN Anexo IR-2 por fila. Las 4 cuentas de Inventario (1.1.3.01-.04) del
  // catálogo estándar llevan DOS anexos (A1 y D) — este camino solo
  // asignaría A1 si alguna de esas 4 le faltara a la empresa. Se documenta
  // aquí en vez de tocar el motor de importación para este caso puntual.
  private generarArchivoEstandar(codigosExistentes: Set<string>): Buffer {
    const faltantes = PLAN_CUENTAS.filter(c => !codigosExistentes.has(c.codigo));

    const filas = faltantes.map(c => {
      const codigoMadre = c.codigo.includes('.') ? c.codigo.split('.').slice(0, -1).join('.') : '';
      const clasif = c.clasificacionResultado === ClasificacionResultado.NO_OPERACIONAL
        ? 'NO OPERACIONAL'
        : c.clasificacionResultado === ClasificacionResultado.OPERACIONAL ? 'OPERACIONAL' : '';
      return [
        c.codigo, c.nombre, c.tipo, c.naturaleza, codigoMadre,
        c.permiteMovimientos ? 'NO' : 'SI',
        c.anexos?.[0]?.anexoIR2 ?? '',
        'SI', '', clasif,
      ];
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([COLUMNAS.map(col => col.header), ...filas]);
    XLSX.utils.book_append_sheet(wb, ws, 'Cuentas');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private static readonly PREVIEW_VACIO: PreviewImportacionCuentas = {
    totalFilas: 0, crear: [], actualizar: [], errores: [], advertencias: [], noTocadas: 0,
  };

  async previsualizarEstandar(): Promise<PreviewImportacionCuentas> {
    const empresaId = this.eid;
    const existentes = await this.cuentaRepository.find({ where: { empresaId } });
    const codigosExistentes = new Set(existentes.map(c => c.codigo));
    // Sin faltantes: un archivo de solo-encabezado haría fallar procesar()
    // ("sin ninguna fila de datos") — se corta aquí, sin tocar el motor.
    if (PLAN_CUENTAS.every(c => codigosExistentes.has(c.codigo))) {
      return { ...ImportacionCuentasService.PREVIEW_VACIO, noTocadas: existentes.length };
    }
    const buffer = this.generarArchivoEstandar(codigosExistentes);
    return this.previsualizar(buffer);
  }

  async completarEstandar(usuario: { id: number; nombre: string }): Promise<ResultadoImportacionCuentas> {
    const empresaId = this.eid;
    const existentes = await this.cuentaRepository.find({ where: { empresaId } });
    const codigosExistentes = new Set(existentes.map(c => c.codigo));
    if (PLAN_CUENTAS.every(c => codigosExistentes.has(c.codigo))) {
      return { ...ImportacionCuentasService.PREVIEW_VACIO, noTocadas: existentes.length, creadas: 0, actualizadas: 0 };
    }
    const buffer = this.generarArchivoEstandar(codigosExistentes);
    return this.ejecutar(buffer, usuario);
  }
}
