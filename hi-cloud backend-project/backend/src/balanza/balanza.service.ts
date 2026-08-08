import {
  Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { BalanzaPatron } from './entities/balanza-patron.entity';
import { BalanzaFormatoExportacion } from './entities/balanza-formato-exportacion.entity';
import { CreatePatronDto } from './dto/create-patron.dto';
import { CreateFormatoDto } from './dto/create-formato.dto';
import {
  parsearCodigoBalanza,
  inferirPatrones,
  filtrarCandidatos,
  validarEAN,
  BalanzaPatronConfig,
  CandidatoPatron,
  TipoDatoBal,
} from './utils/balanza-parser';

@Injectable()
export class BalanzaService {
  private readonly logger = new Logger(BalanzaService.name);

  constructor(
    @InjectRepository(BalanzaPatron)
    private readonly patronRepo: Repository<BalanzaPatron>,
    @InjectRepository(BalanzaFormatoExportacion)
    private readonly formatoRepo: Repository<BalanzaFormatoExportacion>,
    private readonly cls: ClsService,
  ) {}

  private get empresaId(): number {
    const id = this.cls.get<number>('empresaId');
    if (!id) throw new ForbiddenException('Empresa no identificada');
    return id;
  }

  // ── Patrones ──────────────────────────────────────────────────────────────

  async listarPatrones(): Promise<BalanzaPatron[]> {
    return this.patronRepo.find({
      where: { empresaId: this.empresaId, isActive: true },
      order: { prioridad: 'ASC', id: 'ASC' },
    });
  }

  async crearPatron(dto: CreatePatronDto): Promise<BalanzaPatron> {
    this.validarGeometriaPatron(dto);
    const patron = this.patronRepo.create({
      ...dto,
      empresaId: this.empresaId,
    });
    return this.patronRepo.save(patron);
  }

  async actualizarPatron(id: number, dto: Partial<CreatePatronDto>): Promise<BalanzaPatron> {
    const patron = await this.patronRepo.findOne({
      where: { id, empresaId: this.empresaId, isActive: true },
    });
    if (!patron) throw new NotFoundException(`Patrón ${id} no encontrado`);
    const actualizado = this.patronRepo.merge(patron, dto);
    this.validarGeometriaPatron(actualizado);
    return this.patronRepo.save(actualizado);
  }

  async eliminarPatron(id: number): Promise<void> {
    const patron = await this.patronRepo.findOne({
      where: { id, empresaId: this.empresaId, isActive: true },
    });
    if (!patron) throw new NotFoundException(`Patrón ${id} no encontrado`);
    patron.isActive = false;
    await this.patronRepo.save(patron);
  }

  private validarGeometriaPatron(dto: Partial<CreatePatronDto>): void {
    if (
      dto.prefijo !== undefined &&
      dto.longitudPlu !== undefined &&
      dto.longitudValor !== undefined &&
      dto.longitudTotal !== undefined
    ) {
      // Invariante: prefijo + PLU + valor + (tieneCheckValor ? 1 : 0) + 1 = total
      // longitudValor = dígitos de valor PUROS (sin incluir check interno)
      const checkBonus = dto.tieneCheckValor === true ? 1 : 0;
      const suma = dto.prefijo.length + dto.longitudPlu + dto.longitudValor + checkBonus + 1;
      if (suma !== dto.longitudTotal) {
        throw new BadRequestException(
          `Geometría inválida: prefijo(${dto.prefijo.length}) + PLU(${dto.longitudPlu}) + valor(${dto.longitudValor}) + checkBonus(${checkBonus}) + 1 = ${suma} ≠ longitudTotal(${dto.longitudTotal})`,
        );
      }
    }
    if (dto.tipoDato === 'precio' && dto.unidadPeso) {
      throw new BadRequestException('unidadPeso debe ser null cuando tipoDato = "precio"');
    }
  }

  // ── Diagnóstico ───────────────────────────────────────────────────────────

  /**
   * Retorna los productos pesables que no están completamente configurados:
   *  - Sin PLU: la balanza no puede identificar el producto
   *  - Unidad no encontrada en catálogo UOM o no es de tipo peso (advertencia)
   *
   * Accessible para ADMIN/CONTADOR/VENDEDOR — es lectura.
   */
  async productosSinConfigurar(): Promise<{
    id: number;
    codigo: string;
    nombre: string;
    unidadMedida: string;
    plu: number | null;
    sinPlu: boolean;
    advertenciaUnidad: string | null;
  }[]> {
    const empresaId = this.empresaId;
    const rows = await this.patronRepo.manager.query<any[]>(
      `SELECT p.id, p.codigo, p.nombre, p."unidadMedida", p.plu,
              u.codigo AS uomCodigo, u."permiteDecimales", u.tipo AS uomTipo
       FROM productos p
       LEFT JOIN unidades_medida u
             ON LOWER(u.codigo) = LOWER(p."unidadMedida")
            AND u."empresaId" = p."empresaId"
            AND u."isActive" = true
       WHERE p."esPesable" = true
         AND p."empresaId" = $1
         AND p."isActive" = true
       ORDER BY p.nombre`,
      [empresaId],
    );

    return rows.map(r => {
      let advertenciaUnidad: string | null = null;
      if (!r.uomCodigo) {
        advertenciaUnidad = `La unidad '${r.unidadMedida}' no está registrada en el catálogo UOM`;
      } else if (r.uomTipo !== 'peso' || !r.permiteDecimales) {
        advertenciaUnidad = `La unidad '${r.unidadMedida}' no es de tipo peso con decimales`;
      }
      return {
        id:                r.id,
        codigo:            r.codigo,
        nombre:            r.nombre,
        unidadMedida:      r.unidadMedida,
        plu:               r.plu ?? null,
        sinPlu:            r.plu == null,
        advertenciaUnidad,
      };
    });
  }

  /**
   * Retorna todos los productos pesables con PLU asignado,
   * listos para exportar al catálogo de la balanza.
   * Solo accesible para ADMIN/CONTADOR (contiene precio).
   */
  async catalogoPesables(): Promise<{
    id: number;
    plu: number;
    nombre: string;
    precio: number;
    iva: number;
    categoria: string | null;
    codigo: string;
    codigoBarras: string | null;
    unidadMedida: string;
  }[]> {
    const empresaId = this.empresaId;
    return this.patronRepo.manager.query<any[]>(
      `SELECT p.id, p.plu, p.nombre, CAST(p.precio AS FLOAT) AS precio,
              p."porcentajeIva" AS iva, p.categoria, p.codigo,
              p."codigoBarras", p."unidadMedida"
       FROM productos p
       WHERE p."esPesable" = true
         AND p.plu IS NOT NULL
         AND p."empresaId" = $1
         AND p."isActive" = true
       ORDER BY p.plu`,
      [empresaId],
    );
  }

  // ── Formatos de exportación ────────────────────────────────────────────────

  async listarFormatos(): Promise<BalanzaFormatoExportacion[]> {
    return this.formatoRepo.find({
      where: { empresaId: this.empresaId, isActive: true },
      order: { id: 'ASC' },
    });
  }

  async crearFormato(dto: CreateFormatoDto): Promise<BalanzaFormatoExportacion> {
    const formato = this.formatoRepo.create({ ...dto, empresaId: this.empresaId });
    return this.formatoRepo.save(formato);
  }

  async actualizarFormato(id: number, dto: CreateFormatoDto): Promise<BalanzaFormatoExportacion> {
    const formato = await this.formatoRepo.findOne({
      where: { id, empresaId: this.empresaId, isActive: true },
    });
    if (!formato) throw new NotFoundException(`Formato ${id} no encontrado`);
    Object.assign(formato, dto);
    return this.formatoRepo.save(formato);
  }

  async eliminarFormato(id: number): Promise<void> {
    const formato = await this.formatoRepo.findOne({
      where: { id, empresaId: this.empresaId, isActive: true },
    });
    if (!formato) throw new NotFoundException(`Formato ${id} no encontrado`);
    formato.isActive = false;
    await this.formatoRepo.save(formato);
  }

  // ── Probador de códigos ────────────────────────────────────────────────────

  /**
   * Probador: interpreta un código de barras contra los patrones de la empresa.
   * Accesible para VENDEDOR: no modifica datos, es solo diagnóstico.
   *
   * Retorna:
   *  - eanValido: si el código pasa la validación EAN
   *  - resultado: interpretación exitosa (o null)
   *  - candidatos: lista de TODAS las interpretaciones posibles (asistente calibración)
   */
  async probarCodigo(codigo: string): Promise<{
    codigo:       string;
    eanValido:    boolean;
    resultado:    ReturnType<typeof parsearCodigoBalanza>;
    candidatos:   CandidatoPatron[];
  }> {
    const eanValido = validarEAN(codigo);
    const patrones  = await this.listarPatrones() as unknown as BalanzaPatronConfig[];
    const resultado = eanValido ? parsearCodigoBalanza(codigo, patrones) : null;
    const candidatos = inferirPatrones(codigo);
    return { codigo, eanValido, resultado, candidatos };
  }

  /**
   * Paso del asistente de calibración: recibe un código escaneado y los valores
   * reales confirmados por el usuario (PLU, valor y tipo de dato).
   * Retorna la lista filtrada de candidatos que coinciden.
   */
  async calibrarFiltrar(
    codigo:        string,
    pluEsperado:   number,
    valorEsperado: number,
    tipoDato:      TipoDatoBal,
  ): Promise<CandidatoPatron[]> {
    const candidatos = inferirPatrones(codigo);
    return filtrarCandidatos(candidatos, pluEsperado, valorEsperado, tipoDato);
  }
}
