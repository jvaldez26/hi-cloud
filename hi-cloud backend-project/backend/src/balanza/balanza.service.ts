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
      const suma = dto.prefijo.length + dto.longitudPlu + dto.longitudValor + 1;
      if (suma !== dto.longitudTotal) {
        throw new BadRequestException(
          `Geometría inválida: prefijo(${dto.prefijo.length}) + PLU(${dto.longitudPlu}) + valor(${dto.longitudValor}) + 1 = ${suma} ≠ longitudTotal(${dto.longitudTotal})`,
        );
      }
    }
    if (dto.tipoDato === 'precio' && dto.unidadPeso) {
      throw new BadRequestException('unidadPeso debe ser null cuando tipoDato = "precio"');
    }
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
