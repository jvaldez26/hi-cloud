import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CwAdelanto } from '../entities/cw-adelanto.entity';
import { CwLavadoresService } from './cw-lavadores.service';
import { CajaService } from '../../caja/caja.service';
import { CategoriaRetiro } from '../../caja/entities/retiro-caja.entity';
import { CrearAdelantoDto } from '../dto/adelanto.dto';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

@Injectable()
export class CwAdelantosService {
  constructor(
    @InjectRepository(CwAdelanto) private readonly repo: Repository<CwAdelanto>,
    private readonly lavadoresService: CwLavadoresService,
    private readonly cajaService: CajaService,
  ) {}

  /**
   * Efectivo: el vale sale de caja YA, por el mecanismo existente de
   * retiros — no espera a la liquidación. Si no viene cajaId, se resuelve la
   * caja abierta del usuario; sin ninguna abierta, 400 explícito.
   * Transferencia: no toca caja — solo queda la referencia (y la cuenta
   * bancaria, si se pasó una).
   */
  async crear(empresaId: number, dto: CrearAdelantoDto, usuarioId: number): Promise<CwAdelanto> {
    const lavador = await this.lavadoresService.obtener(empresaId, dto.lavadorId);
    const metodoPago = dto.metodoPago ?? 'efectivo';

    let retiroCajaId: number | undefined;
    if (metodoPago === 'efectivo') {
      const cajaId = dto.cajaId ?? await this.resolverCajaAbierta(usuarioId);
      const retiro = await this.cajaService.registrarRetiro(
        cajaId,
        dto.monto,
        `Adelanto a lavador: ${lavador.nombre}${dto.motivo ? ' — ' + dto.motivo : ''}`,
        usuarioId,
        undefined,
        CategoriaRetiro.ADELANTO_LAVADOR,
      );
      retiroCajaId = (retiro as any).id;
    }

    return this.repo.save(this.repo.create({
      empresaId,
      lavadorId: dto.lavadorId,
      monto: dto.monto,
      fecha: dto.fecha ?? fechaHoyRD(),
      motivo: dto.motivo,
      usuarioId,
      metodoPago,
      referencia: metodoPago === 'transferencia' ? dto.referencia : undefined,
      cuentaBancariaId: metodoPago === 'transferencia' ? dto.cuentaBancariaId : undefined,
      retiroCajaId,
    }));
  }

  /** 400 explícito en vez de dejar que registrarRetiro reviente con "Caja #undefined no encontrada". */
  async resolverCajaAbierta(usuarioId: number): Promise<number> {
    const caja = await this.cajaService.getCajaHoyByUserId(usuarioId);
    if (!caja || !('id' in caja) || (caja as any).estado !== 'abierta') {
      throw new BadRequestException('Abra la caja para pagar en efectivo');
    }
    return (caja as any).id;
  }

  listarPorLavador(empresaId: number, lavadorId: number, desde: string, hasta: string): Promise<CwAdelanto[]> {
    return this.repo
      .createQueryBuilder('a')
      .where('a.empresaId = :empresaId', { empresaId })
      .andWhere('a.lavadorId = :lavadorId', { lavadorId })
      .andWhere('a.fecha >= :desde', { desde })
      .andWhere('a.fecha <= :hasta', { hasta })
      .orderBy('a.fecha', 'ASC')
      .getMany();
  }
}
