import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ParametroFiscal, EstadoParametroFiscal } from './entities/parametro-fiscal.entity';
import { CrearParametroFiscalDto } from './dto/crear-parametro-fiscal.dto';
import {
  ParametroFiscalNoEncontradoError,
  ParametroFiscalPendienteError,
  ParametroFiscalVigenciaError,
} from './errors/parametro-fiscal.errors';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/entities/audit-log.entity';

@Injectable()
export class ParametrosFiscalesService {
  constructor(
    @InjectRepository(ParametroFiscal)
    private repo: Repository<ParametroFiscal>,
    private dataSource: DataSource,
    private auditoria: AuditoriaService,
  ) {}

  /**
   * El parámetro `clave` vigente en `fecha` (YYYY-MM-DD). Lanza un error
   * explícito si no hay ninguna fila cuyo rango cubra esa fecha, o si la
   * fila vigente todavía está PENDIENTE_VALIDACION — nunca devuelve `null`
   * en silencio para que un cálculo lo arrastre sin darse cuenta.
   */
  async resolver(clave: string, fecha: string): Promise<unknown> {
    const fila = await this.repo.createQueryBuilder('p')
      .where('p.clave = :clave', { clave })
      .andWhere('p."vigenciaDesde" <= :fecha', { fecha })
      .andWhere('(p."vigenciaHasta" IS NULL OR p."vigenciaHasta" >= :fecha)', { fecha })
      .orderBy('p."vigenciaDesde"', 'DESC')
      .getOne();

    if (!fila) throw new ParametroFiscalNoEncontradoError(clave, fecha);
    if (fila.estado !== EstadoParametroFiscal.VALIDADO) {
      throw new ParametroFiscalPendienteError(clave, fecha);
    }
    return fila.valor;
  }

  /** Todas las versiones de una clave, o todo el catálogo si no se filtra. Para el panel de administración. */
  async listar(clave?: string): Promise<ParametroFiscal[]> {
    return this.repo.find({
      where: clave ? { clave } : {},
      order: { clave: 'ASC', vigenciaDesde: 'DESC' },
    });
  }

  /** Todos los parámetros PENDIENTE_VALIDACION — el punchlist que Jean tiene que revisar. */
  async listarPendientes(): Promise<ParametroFiscal[]> {
    return this.repo.find({
      where: { estado: EstadoParametroFiscal.PENDIENTE_VALIDACION },
      order: { clave: 'ASC', vigenciaDesde: 'DESC' },
    });
  }

  /**
   * Crea una nueva versión de `clave`. Si ya hay una fila abierta
   * (vigenciaHasta IS NULL), la cierra el día ANTERIOR a la nueva
   * vigenciaDesde — nunca se edita el valor de una fila existente, se
   * cierra y se crea otra. Transaccional: cerrar la vieja y crear la
   * nueva se confirman juntas o ninguna.
   */
  async crearVersion(dto: CrearParametroFiscalDto, userId: number, userName?: string): Promise<ParametroFiscal> {
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(ParametroFiscal);

      const abierta = await repo.findOne({
        where: { clave: dto.clave, vigenciaHasta: null as any },
      });

      if (abierta) {
        if (abierta.vigenciaDesde >= dto.vigenciaDesde) {
          throw new ParametroFiscalVigenciaError(
            `La versión vigente de "${dto.clave}" empieza el ${abierta.vigenciaDesde}, después o el mismo ` +
            `día que la nueva (${dto.vigenciaDesde}). La nueva vigencia debe ser posterior.`,
          );
        }
        const diaAnterior = new Date(dto.vigenciaDesde + 'T12:00:00Z');
        diaAnterior.setUTCDate(diaAnterior.getUTCDate() - 1);
        const vigenciaHastaCierre = diaAnterior.toISOString().slice(0, 10);

        await repo.update(abierta.id, { vigenciaHasta: vigenciaHastaCierre });

        await this.auditoria.registrar({
          userId, userName,
          accion:      AccionAuditoria.UPDATE,
          modulo:      'parametros-fiscales',
          entidad:     'ParametroFiscal',
          entidadId:   String(abierta.id),
          descripcion: `Cierra vigencia de "${dto.clave}" (id ${abierta.id}) en ${vigenciaHastaCierre} al crear una nueva versión`,
          valorAnterior: JSON.stringify({ vigenciaHasta: abierta.vigenciaHasta }),
          valorNuevo:    JSON.stringify({ vigenciaHasta: vigenciaHastaCierre }),
          metodo: 'POST', ruta: '/admin/parametros-fiscales', exitoso: true,
        });
      }

      const nueva = await repo.save(repo.create({
        clave:         dto.clave,
        valor:         (dto.valor ?? null) as any,
        vigenciaDesde: dto.vigenciaDesde,
        vigenciaHasta: null,
        baseLegal:     dto.baseLegal,
        fuente:        dto.fuente,
        estado:        EstadoParametroFiscal.PENDIENTE_VALIDACION,
      }));

      await this.auditoria.registrar({
        userId, userName,
        accion:      AccionAuditoria.CREATE,
        modulo:      'parametros-fiscales',
        entidad:     'ParametroFiscal',
        entidadId:   String(nueva.id),
        descripcion: `Crea versión de "${dto.clave}" vigente desde ${dto.vigenciaDesde}`,
        valorNuevo:  JSON.stringify(nueva.valor),
        metodo: 'POST', ruta: '/admin/parametros-fiscales', exitoso: true,
      });

      return nueva;
    });
  }

  /**
   * Marca una fila como VALIDADO — el paso donde Jean confirma el número.
   * No cambia `valor` ni la vigencia: si el número está mal, se crea una
   * versión nueva con `crearVersion()`, no se corrige esta.
   */
  async validar(id: number, userId: number, userName?: string): Promise<ParametroFiscal> {
    const fila = await this.repo.findOneOrFail({ where: { id } });
    const anterior = fila.estado;

    fila.estado      = EstadoParametroFiscal.VALIDADO;
    fila.validadoPor = userId;
    fila.validadoEn  = new Date();
    const guardada = await this.repo.save(fila);

    await this.auditoria.registrar({
      userId, userName,
      accion:      AccionAuditoria.UPDATE,
      modulo:      'parametros-fiscales',
      entidad:     'ParametroFiscal',
      entidadId:   String(id),
      descripcion: `Valida "${fila.clave}" (id ${id})`,
      valorAnterior: JSON.stringify({ estado: anterior }),
      valorNuevo:    JSON.stringify({ estado: EstadoParametroFiscal.VALIDADO }),
      metodo: 'PATCH', ruta: `/admin/parametros-fiscales/${id}/validar`, exitoso: true,
    });

    return guardada;
  }
}
