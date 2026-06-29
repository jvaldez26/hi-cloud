import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnidadMedida, TipoUnidad } from './entities/unidad-medida.entity';
import { ConversionUom } from './entities/conversion-uom.entity';
import { TenantService } from '../tenant/tenant.service';

const UNIDADES_BASE: Array<Omit<UnidadMedida, 'id'|'createdAt'|'updatedAt'|'isActive'|'empresaId'>> = [
  { codigo: 'KG',  nombre: 'Kilogramo',  simbolo: 'kg',   tipo: TipoUnidad.PESO,     activa: true, esBase: true,  permiteDecimales: true  },
  { codigo: 'G',   nombre: 'Gramo',      simbolo: 'g',    tipo: TipoUnidad.PESO,     activa: true, esBase: false, permiteDecimales: true  },
  { codigo: 'LB',  nombre: 'Libra',      simbolo: 'lb',   tipo: TipoUnidad.PESO,     activa: true, esBase: false, permiteDecimales: true  },
  { codigo: 'TON', nombre: 'Tonelada',   simbolo: 't',    tipo: TipoUnidad.PESO,     activa: true, esBase: false, permiteDecimales: true  },
  { codigo: 'L',   nombre: 'Litro',      simbolo: 'L',    tipo: TipoUnidad.VOLUMEN,  activa: true, esBase: true,  permiteDecimales: true  },
  { codigo: 'ML',  nombre: 'Mililitro',  simbolo: 'mL',   tipo: TipoUnidad.VOLUMEN,  activa: true, esBase: false, permiteDecimales: true  },
  { codigo: 'GAL', nombre: 'Galón',      simbolo: 'gal',  tipo: TipoUnidad.VOLUMEN,  activa: true, esBase: false, permiteDecimales: true  },
  { codigo: 'M',   nombre: 'Metro',      simbolo: 'm',    tipo: TipoUnidad.LONGITUD, activa: true, esBase: true,  permiteDecimales: true  },
  { codigo: 'CM',  nombre: 'Centímetro', simbolo: 'cm',   tipo: TipoUnidad.LONGITUD, activa: true, esBase: false, permiteDecimales: true  },
  { codigo: 'MM',  nombre: 'Milímetro',  simbolo: 'mm',   tipo: TipoUnidad.LONGITUD, activa: true, esBase: false, permiteDecimales: true  },
  { codigo: 'FT',  nombre: 'Pie',        simbolo: 'ft',   tipo: TipoUnidad.LONGITUD, activa: true, esBase: false, permiteDecimales: true  },
  { codigo: 'PZA', nombre: 'Pieza',      simbolo: 'pza',  tipo: TipoUnidad.CANTIDAD, activa: true, esBase: true,  permiteDecimales: false },
  { codigo: 'DOC', nombre: 'Docena',     simbolo: 'doc',  tipo: TipoUnidad.CANTIDAD, activa: true, esBase: false, permiteDecimales: false },
  { codigo: 'CAJ', nombre: 'Caja',       simbolo: 'caj',  tipo: TipoUnidad.CANTIDAD, activa: true, esBase: false, permiteDecimales: false },
  { codigo: 'PAL', nombre: 'Palet',      simbolo: 'pal',  tipo: TipoUnidad.CANTIDAD, activa: true, esBase: false, permiteDecimales: false },
  { codigo: 'PAR', nombre: 'Par',        simbolo: 'par',  tipo: TipoUnidad.CANTIDAD, activa: true, esBase: false, permiteDecimales: false },
  { codigo: 'HR',  nombre: 'Hora',       simbolo: 'h',    tipo: TipoUnidad.TIEMPO,   activa: true, esBase: true,  permiteDecimales: false },
  { codigo: 'DIA', nombre: 'Día',        simbolo: 'd',    tipo: TipoUnidad.TIEMPO,   activa: true, esBase: false, permiteDecimales: false },
  { codigo: 'MES', nombre: 'Mes',        simbolo: 'mes',  tipo: TipoUnidad.TIEMPO,   activa: true, esBase: false, permiteDecimales: false },
];

@Injectable()
export class UomService {
  constructor(
    @InjectRepository(UnidadMedida)  private unidadRepo: Repository<UnidadMedida>,
    @InjectRepository(ConversionUom) private convRepo:   Repository<ConversionUom>,
    private tenantService: TenantService,
  ) {}

  // ── Unidades ───────────────────────────────────────────────────────────────

  async inicializarUnidades() {
    const empresaId = this.tenantService.getEmpresaId();
    const existentes = await this.unidadRepo.count({ where: { empresaId, isActive: true } });
    if (existentes > 0) return { message: 'Ya inicializado', total: existentes };

    const unidades = UNIDADES_BASE.map(u => this.unidadRepo.create({ ...u, empresaId }));
    await this.unidadRepo.save(unidades);

    // Crear conversiones estándar automáticamente
    const all = await this.unidadRepo.find({ where: { empresaId, isActive: true } });
    const get = (cod: string) => all.find(u => u.codigo === cod)!;

    const conversiones = [
      // Peso
      { d: 'KG', h: 'G',   f: 1000 },     { d: 'G',   h: 'KG',  f: 0.001 },
      { d: 'KG', h: 'LB',  f: 2.20462 },  { d: 'LB',  h: 'KG',  f: 0.453592 },
      { d: 'TON',h: 'KG',  f: 1000 },     { d: 'KG',  h: 'TON', f: 0.001 },
      // Volumen
      { d: 'L',  h: 'ML',  f: 1000 },     { d: 'ML',  h: 'L',   f: 0.001 },
      { d: 'GAL',h: 'L',   f: 3.78541 },  { d: 'L',   h: 'GAL', f: 0.264172 },
      // Longitud
      { d: 'M',  h: 'CM',  f: 100 },      { d: 'CM',  h: 'M',   f: 0.01 },
      { d: 'M',  h: 'MM',  f: 1000 },     { d: 'MM',  h: 'M',   f: 0.001 },
      { d: 'FT', h: 'M',   f: 0.3048 },   { d: 'M',   h: 'FT',  f: 3.28084 },
      // Cantidad
      { d: 'DOC',h: 'PZA', f: 12 },       { d: 'PZA', h: 'DOC', f: 1/12 },
      // Tiempo
      { d: 'DIA',h: 'HR',  f: 8 },        { d: 'HR',  h: 'DIA', f: 1/8 },
      { d: 'MES',h: 'DIA', f: 30 },       { d: 'DIA', h: 'MES', f: 1/30 },
    ].filter(c => get(c.d) && get(c.h));

    const convs = conversiones.map(c =>
      this.convRepo.create({ unidadDesdeId: get(c.d).id, unidadHastaId: get(c.h).id, factor: c.f, empresaId }),
    );
    await this.convRepo.save(convs);

    return { message: 'Unidades e inicializadas', total: unidades.length, conversiones: convs.length };
  }

  async getUnidades(tipo?: TipoUnidad) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.unidadRepo.createQueryBuilder('u')
      .where('u.empresaId = :eid', { eid: empresaId })
      .andWhere('u.isActive = true AND u.activa = true');
    if (tipo) qb.andWhere('u.tipo = :tipo', { tipo });
    return qb.orderBy('u.tipo', 'ASC').addOrderBy('u.nombre', 'ASC').getMany();
  }

  async crearUnidad(dto: {
    codigo: string; nombre: string; simbolo?: string;
    tipo: TipoUnidad; esBase?: boolean;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe = await this.unidadRepo.findOne({ where: { codigo: dto.codigo, empresaId, isActive: true } });
    if (existe) throw new ConflictException(`Código "${dto.codigo}" ya existe`);
    const u = this.unidadRepo.create({ ...dto, empresaId, activa: true, esBase: dto.esBase ?? false });
    return this.unidadRepo.save(u);
  }

  async deleteUnidad(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.unidadRepo.update({ id, empresaId }, { isActive: false });
    return { message: 'Unidad eliminada' };
  }

  // ── Conversiones ───────────────────────────────────────────────────────────

  async getConversiones(unidadId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.convRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.unidadDesde', 'ud')
      .leftJoinAndSelect('c.unidadHasta', 'uh')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = true');
    if (unidadId) qb.andWhere('(c.unidadDesdeId = :uid OR c.unidadHastaId = :uid)', { uid: unidadId });
    return qb.orderBy('ud.nombre', 'ASC').getMany();
  }

  async crearConversion(dto: { unidadDesdeId: number; unidadHastaId: number; factor: number }) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = this.convRepo.create({ ...dto, empresaId });
    return this.convRepo.save(c);
  }

  async deleteConversion(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.convRepo.update({ id, empresaId }, { isActive: false });
    return { message: 'Conversión eliminada' };
  }

  // ── Convertir cantidad ─────────────────────────────────────────────────────

  async convertir(cantidad: number, desdeId: number, hastaId: number): Promise<{
    cantidad: number; resultado: number;
    desde: string; hasta: string; factor: number;
  }> {
    if (desdeId === hastaId) {
      const u = await this.unidadRepo.findOne({ where: { id: desdeId } });
      return { cantidad, resultado: cantidad, desde: u?.nombre ?? '', hasta: u?.nombre ?? '', factor: 1 };
    }

    const empresaId = this.tenantService.getEmpresaId();
    const conv = await this.convRepo.findOne({
      where: { unidadDesdeId: desdeId, unidadHastaId: hastaId, empresaId, isActive: true },
      relations: ['unidadDesde', 'unidadHasta'],
    });

    if (!conv) throw new NotFoundException(`No existe conversión directa entre las unidades. Agrega la conversión manualmente.`);

    const resultado = Number((cantidad * Number(conv.factor)).toFixed(8));
    return {
      cantidad,
      resultado,
      desde:  conv.unidadDesde.nombre,
      hasta:  conv.unidadHasta.nombre,
      factor: Number(conv.factor),
    };
  }
}
