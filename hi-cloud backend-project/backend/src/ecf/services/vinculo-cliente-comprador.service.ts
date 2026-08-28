import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Factura } from '../../facturas/entities/factura.entity';
import { Cliente, TipoClienteECF } from '../../clientes/entities/cliente.entity';
import { normalizarRnc } from '../builders/base-ecf.builder';

/** Nombres que no identifican a nadie: no sirven para bautizar un cliente. */
const GENERICO = /^\s*consumidor\s*final\s*$/i;

export type ResultadoVinculo =
  | 'vinculado'          // había exactamente un cliente con ese RNC
  | 'creado'             // no había ninguno: se creó y se vinculó
  | 'ambiguo'            // había varios: no se adivina, queda para revisión
  | 'sin_rnc'            // la factura no declaró comprador identificado
  | 'ya_correcto'        // el cliente vinculado ya es el del RNC declarado
  | 'cliente_propio';    // el cliente vinculado no es genérico: no se toca

/**
 * Vínculo COMERCIAL de una factura con su cliente real.
 *
 * Cuando el cajero cobra en el POS tecleando un RNC, la factura se emite a ese
 * contribuyente pero queda apuntando al cliente genérico "consumidor final".
 * Fiscalmente da igual —para eso está el snapshot— pero comercialmente la venta
 * desaparece: no sale en el estado de cuenta del cliente, ni en top clientes,
 * ni en su historial.
 *
 * ══ ESTE SERVICIO NO TOCA EL SNAPSHOT ══
 *
 * `factura.rncComprador` y `factura.razonSocialComprador` tienen otro dueño (la
 * emisión del e-CF) y otro momento (al emitir, una sola vez). Aquí solo se
 * escribe `clienteId`. Son dos campos con dos dueños: si mañana el cliente
 * cambia de razón social, la nota de crédito de una factura vieja tiene que
 * seguir saliendo con el nombre con el que se emitió, o la DGII la rechaza con
 * código 615. Ver el comentario en factura.entity.ts.
 *
 * Si estás aquí porque quieres "sincronizarlos": no. Ese es el bug.
 *
 * ══ RESOLUCIÓN POR RNC ══
 *
 *   uno    → vincula
 *   ninguno→ crea el cliente y vincula
 *   varios → no adivina; lo deja como está y registra el caso
 *
 * Lo de "varios" no es teórico: hay clientes distintos que comparten RNC —
 * sucursales de un mismo contribuyente que se registran por separado para
 * llevar dirección, contacto y cuenta por cobrar propias. Elegir una al azar
 * mandaría la venta a la cuenta equivocada, que es peor que no vincular.
 * Esos casos los levanta la alerta `comprador-sin-vincular` para que alguien
 * los resuelva a mano.
 */
@Injectable()
export class VinculoClienteCompradorService {
  private readonly logger = new Logger(VinculoClienteCompradorService.name);

  constructor(
    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,

    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,
  ) {}

  /**
   * Apunta la factura al cliente real del comprador declarado.
   *
   * Falla ABIERTA: es un dato comercial, no puede tumbar una emisión fiscal que
   * ya salió bien. El llamador no necesita capturar nada.
   */
  async vincular(facturaId: number, empresaId: number): Promise<ResultadoVinculo> {
    try {
      return await this.resolver(facturaId, empresaId);
    } catch (err) {
      this.logger.error(
        `[Vínculo] factura #${facturaId} (empresa #${empresaId}): ${(err as Error).message}`,
        (err as Error).stack,
      );
      return 'ambiguo';
    }
  }

  private async resolver(facturaId: number, empresaId: number): Promise<ResultadoVinculo> {
    const factura = await this.facturaRepo.findOne({
      where: { id: facturaId, empresaId },
      relations: ['cliente'],
    });
    if (!factura) return 'sin_rnc';

    const rnc = normalizarRnc(factura.rncComprador);
    if (!rnc) return 'sin_rnc';

    // El cliente que ya tiene la factura. Solo se repunta si es genérico: si el
    // usuario eligió un cliente con RNC propio, esa decisión manda sobre
    // cualquier resolución automática.
    const rncActual = normalizarRnc(
      factura.cliente?.rncReceptor ?? factura.cliente?.rfc,
    );
    if (rncActual === rnc) return 'ya_correcto';
    if (rncActual)          return 'cliente_propio';

    const candidatos = await this.clienteRepo
      .createQueryBuilder('c')
      .where('c."empresaId" = :empresaId', { empresaId })
      .andWhere('c."isActive" = true')
      .andWhere(
        `regexp_replace(COALESCE(NULLIF(c."rncReceptor", ''), NULLIF(c.rfc, ''), ''), '^0+$', '') = :rnc`,
        { rnc },
      )
      .orderBy('c.id', 'ASC')
      .getMany();

    if (candidatos.length > 1) {
      // No adivinar. La alerta `comprador-sin-vincular` lo levanta a partir de
      // los mismos datos, así que no hace falta una tabla de pendientes: en
      // cuanto alguien deja un solo cliente activo con ese RNC, el caso
      // desaparece solo.
      this.logger.warn(
        `[Vínculo] RNC ${rnc} tiene ${candidatos.length} clientes activos en la ` +
        `empresa #${empresaId} (ids: ${candidatos.map(c => c.id).join(', ')}). ` +
        `La factura #${facturaId} (${factura.folio}) queda sin vincular — ` +
        `elegir uno al azar mandaría la venta a la cuenta equivocada.`,
      );
      return 'ambiguo';
    }

    const cliente = candidatos[0] ?? await this.crearCliente(rnc, factura, empresaId);

    await this.facturaRepo.update({ id: facturaId, empresaId }, { clienteId: cliente.id });

    const accion = candidatos.length === 1 ? 'vinculado' : 'creado';
    this.logger.log(
      `[Vínculo] factura #${facturaId} (${factura.folio}) → cliente #${cliente.id} ` +
      `"${cliente.nombre}" RNC ${rnc} [${accion}]`,
    );
    return accion;
  }

  private async crearCliente(rnc: string, factura: Factura, empresaId: number): Promise<Cliente> {
    // `razonSocial` es el nombre fiscal registrado para el RNC; `nombre` es el
    // interno y arranca igual, pero puede editarse después para distinguir
    // sucursales sin que eso afecte a lo que se declara.
    //
    // "Consumidor final" se descarta como nombre aunque venga en el snapshot:
    // es lo que quedó declarado cuando el cajero tecleó el RNC sin esperar al
    // padrón, y crear un cliente identificado que se llame así lo vuelve
    // imposible de distinguir del genérico. Mejor el RNC a secas, que se ve
    // raro y por eso invita a corregirlo.
    const declarada = (factura.razonSocialComprador ?? '').trim();
    const razon = (!declarada || GENERICO.test(declarada)) ? `RNC ${rnc}` : declarada;
    return this.clienteRepo.save(this.clienteRepo.create({
      empresaId,
      nombre:      razon,
      razonSocial: razon,
      rncReceptor: rnc,
      rfc:         rnc,
      // 11 dígitos = cédula (persona física); 9 = RNC de empresa.
      tipoCliente: rnc.length === 11
        ? TipoClienteECF.PERSONA_FISICA
        : TipoClienteECF.PERSONA_JURIDICA,
    }));
  }
}
