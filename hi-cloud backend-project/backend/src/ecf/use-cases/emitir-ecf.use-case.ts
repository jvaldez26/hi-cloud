import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { ECF, EstadoDGII, DocumentoOrigenTipo } from '../entities/ecf.entity';
import { EcfEvento, TipoEcfEvento } from '../entities/ecf-evento.entity';
import { SecuenciaECF } from '../entities/secuencia-ecf.entity';
import { EmpresaEcfConfig } from '../entities/empresa-ecf-config.entity';
import { Factura } from '../../facturas/entities/factura.entity';
import { NotaDebito } from '../../notas-debito/entities/nota-debito.entity';
import { NotaCredito } from '../../notas-credito/entities/nota-credito.entity';
import { Compra } from '../../compras/entities/compra.entity';
import { Gasto } from '../../gastos/entities/gasto.entity';

import { ENCFGeneratorService } from '../services/encf-generator.service';
import { ECFBuilderService, ECFBuildInput, MSellerInfoReferencia, MSellerPayload } from '../services/ecf-builder.service';
import type { CompradorOriginal } from '../builders/base-ecf.builder';
import { MSellerClientService } from '../services/mseller-client.service';
import { esErrorYaExiste, consultarExistenciaEncf } from '../services/reconciliacion-ecf.helper';
import { EcfConfigService } from '../services/ecf-config.service';
import { RncService } from '../../rnc/rnc.service';
import { VinculoClienteCompradorService } from '../services/vinculo-cliente-comprador.service';
import {
  esCreditoFiscal, evaluarCompradorFiscal, payloadCompradorNoVigente,
} from '../rules/comprador-vigente.rule';

import {
  EcfDuplicadoError,
  EcfConfigFaltanteError,
  EcfComunicacionError,
  EcfValidacionError,
  EcfNcfReferenciadoError,
  EcfMontoAnulacionError,
} from '../errors/ecf.errors';
import { fmtFecha, razonSocialFiscal, normalizarRnc } from '../builders/base-ecf.builder';

const TIMEOUT_POS      = 8_000;
const TIMEOUT_REGULAR  = 30_000;

/**
 * Comprador declarado en un comprobante ya emitido, para referenciarlo desde
 * una nota de crédito o débito.
 *
 * Manda el snapshot fiscal de la factura (`rncComprador` /
 * `razonSocialComprador`): es el dueño del dato y no cambia aunque el cliente
 * vinculado cambie después. Ver el comentario en factura.entity.ts.
 *
 * Detrás va `jsonEnviado` —el JSON literal que se le mandó a MSeller, registro
 * fiel de lo que la DGII recibió— para las facturas que el backfill no alcanzó,
 * y por último las columnas denormalizadas del e-CF.
 *
 * Los dos campos se escriben siempre juntos y desde el mismo payload, así que
 * el COALESCE campo a campo no puede mezclar compradores de dos fuentes.
 *
 * Nunca cae al cliente vinculado: esa caída es exactamente la que hizo que la
 * NC E340000000009 saliera a "consumidor final" y la DGII la rechazara con 615.
 */
export function leerCompradorDeclarado(ecf: ECF, factura?: Factura | null): CompradorOriginal {
  const comprador = (ecf.jsonEnviado as any)?.ECF?.Encabezado?.Comprador ?? {};
  return {
    rnc:         factura?.rncComprador
                   ?? comprador.RNCComprador         ?? ecf.rncComprador,
    razonSocial: factura?.razonSocialComprador
                   ?? comprador.RazonSocialComprador ?? ecf.razonSocialComprador,
    direccion:   comprador.DireccionComprador        ?? ecf.direccionComprador,
  };
}

export interface DatosCompradorECF {
  rnc?:               string;
  cedula?:            string;
  razonSocial?:       string;
  direccion?:         string;
  numeroOrdenCompra?: string;
  /**
   * El usuario vio la advertencia de que el RNC no está vigente ante DGII y
   * decidió emitir igual. Ver comprador-vigente.rule.ts: se advierte, no se
   * impide, pero la decisión tiene que ser explícita y queda registrada.
   */
  confirmaRncNoVigente?: boolean;
}

export interface EmitirECFInput {
  empresaId:           number;
  documentoOrigenTipo: DocumentoOrigenTipo;
  documentoOrigenId:   number;
  tipoEcf:             number;   // 31 | 32 | 33 | 34 | 41 | 43 | 44 | 45 | 46 | 47
  modoSincrono?:       boolean;  // true = POS (timeout 8s)
  modoContingencia?:   boolean;  // true = crear e-CF en CONTINGENCIA sin llamar a MSeller
  datosComprador?:     DatosCompradorECF;   // POS: datos capturados en el momento de la venta
  infoReferencia?:     MSellerInfoReferencia;  // E33/E34
  nombreExtranjero?:   string;                 // E46/E47
  paisExtranjero?:     string;                 // E46/E47 — ISO 2 letras
}

export interface EmitirECFResult {
  ecf:          ECF;
  encf:         string;
  qrUrl?:       string;
  trackId?:     string;
  securityCode?: string;
  signedDate?:  string;
  estado:       EstadoDGII;
  idempotente:  boolean; // true si ya existía un e-CF aceptado
}

/**
 * Caso de uso principal para emitir un e-CF a través de MSeller.
 *
 * Flujo:
 *   1. Idempotencia — devuelve el existente si ya hay uno ACEPTADO.
 *   2. Carga recursos — factura, config MSeller, secuencia activa.
 *   3. Genera eNCF con lock atómico.
 *   4. Construye payload JSON (Strategy por tipo).
 *   5. Crea registro ECF en BD (PENDIENTE_ENVIO).
 *   6. Envía a MSeller (sincrónico o con timeout POS).
 *   7. Actualiza estado según respuesta.
 *   8. Registra eventos de auditoría.
 *   9. Devuelve resultado.
 */
@Injectable()
export class EmitirECFUseCase {
  private readonly logger = new Logger(EmitirECFUseCase.name);

  constructor(
    @InjectRepository(ECF)
    private readonly ecfRepo: Repository<ECF>,

    @InjectRepository(EcfEvento)
    private readonly eventoRepo: Repository<EcfEvento>,

    @InjectRepository(SecuenciaECF)
    private readonly secuenciaRepo: Repository<SecuenciaECF>,

    @InjectRepository(EmpresaEcfConfig)
    private readonly configRepo: Repository<EmpresaEcfConfig>,

    @InjectRepository(Factura)
    private readonly facturaRepo: Repository<Factura>,

    @InjectRepository(NotaDebito)
    private readonly notaDebitoRepo: Repository<NotaDebito>,

    @InjectRepository(NotaCredito)
    private readonly notaCreditoRepo: Repository<NotaCredito>,

    @InjectRepository(Compra)
    private readonly compraRepo: Repository<Compra>,

    @InjectRepository(Gasto)
    private readonly gastoRepo: Repository<Gasto>,

    private readonly generator:  ENCFGeneratorService,
    private readonly builder:    ECFBuilderService,
    private readonly mseller:    MSellerClientService,
    private readonly configSvc:  EcfConfigService,
    private readonly rncService: RncService,
    private readonly vinculoCliente: VinculoClienteCompradorService,
    private readonly ds:         DataSource,
  ) {}

  async execute(input: EmitirECFInput): Promise<EmitirECFResult> {
    const {
      empresaId, documentoOrigenTipo, documentoOrigenId, tipoEcf, modoSincrono,
      modoContingencia,
      datosComprador,
      infoReferencia: infoRefInput, nombreExtranjero, paisExtranjero,
    } = input;
    const timeout = modoSincrono ? TIMEOUT_POS : TIMEOUT_REGULAR;

    this.logger.log(
      `EmitirECF inicio | empresa #${empresaId} | ` +
      `${documentoOrigenTipo}#${documentoOrigenId} | tipo E${tipoEcf} | ` +
      `${modoContingencia ? 'CONTINGENCIA PROACTIVA' : modoSincrono ? 'SINCRONO (POS)' : 'REGULAR'}`,
    );

    // ── 1. IDEMPOTENCIA ───────────────────────────────────────────────────────
    const existente = await this.ecfRepo.findOne({
      where: { documentoOrigenTipo, documentoOrigenId, empresaId },
      order: { createdAt: 'DESC' },
    });

    if (existente) {
      if (existente.estadoDGII === EstadoDGII.ACEPTADO) {
        this.logger.log(`Idempotencia: ya existe e-CF aceptado ${existente.numero}`);
        return this.toResult(existente, true);
      }
      // RECHAZADO → se permite reintento con nuevo eNCF (continúa flujo normal)
      if ([EstadoDGII.RECHAZADO, EstadoDGII.CONTINGENCIA].includes(existente.estadoDGII)) {
        this.logger.log(
          `Documento ${documentoOrigenTipo}#${documentoOrigenId} tenía e-CF ` +
          `${existente.estadoDGII} (${existente.numero}). Reintentando con nuevo eNCF.`,
        );
      }
    }

    // ── 2. CARGA DE RECURSOS ──────────────────────────────────────────────────
    const [factura, config, secuencia] = await Promise.all([
      this.cargarDocumentoOrigen(documentoOrigenTipo, documentoOrigenId, empresaId),
      this.configRepo.findOne({ where: { empresaId, activo: true } }),
      this.secuenciaRepo.findOne({
        where: { empresaId, isActiva: true, isAgotada: false },
        relations: ['tipoECF'],
        order: { createdAt: 'DESC' },
      }),
    ]);

    // Merge datos del comprador capturados en POS (sobrescriben al cliente guardado).
    // La razón social tecleada en el POS va a `razonSocial` (el campo fiscal, que
    // es de donde el builder toma el RazonSocialComprador) y también a `nombre`,
    // que es lo que leen el ticket y otras vistas. Escribir solo en `nombre` haría
    // que un cliente con razón social fiscal cargada ignorara lo que tecleó el cajero.
    if (datosComprador) {
      const f = factura as any;
      f.cliente = {
        ...(f.cliente ?? {}),
        ...(datosComprador.rnc         ? { rncReceptor: datosComprador.rnc }           : {}),
        ...(datosComprador.razonSocial ? { razonSocial: datosComprador.razonSocial,
                                           nombre:      datosComprador.razonSocial }   : {}),
        ...(datosComprador.direccion   ? { direccion:   datosComprador.direccion }      : {}),
        ...(datosComprador.numeroOrdenCompra ? { numeroOrdenCompra: datosComprador.numeroOrdenCompra } : {}),
      };
    }

    if (!config) throw new EcfConfigFaltanteError(empresaId);
    if (!config.rncEmisor || !config.razonSocialEmisor) {
      throw new BadRequestException(
        `La configuración e-CF de empresa #${empresaId} no tiene RNC o Razón Social del emisor.`,
      );
    }

    // Obtener la fecha de vencimiento de la secuencia activa para ese tipo
    const secParaTipo = await this.secuenciaRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.tipoECF', 'tipo')
      .where('s.empresaId = :e', { e: empresaId })
      .andWhere('tipo.codigo = :codigo', { codigo: `E${String(tipoEcf).padStart(2, '0')}` })
      .andWhere('s.isActiva = true')
      .andWhere('s.isAgotada = false')
      .getOne();

    // Anclar al mediodía RD (16:00 UTC) para evitar cruce de día por desfase UTC-4
    const fechaVencSec = (() => {
      if (!secParaTipo) return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const raw = secParaTipo.fechaVencimiento;
      const s = raw instanceof Date ? raw.toISOString().substring(0, 10) : String(raw).substring(0, 10);
      const [y, m, d] = s.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d, 16));
    })();

    // ── 3. (el eNCF ya NO se pide aquí) ──────────────────────────────────────
    //
    // Antes se pedía en este punto, ANTES de las validaciones que vienen abajo.
    // Siete de ellas pueden abortar la emisión, y como el número ya estaba
    // consumido y commiteado, cada aborto dejaba un hueco en la secuencia sin
    // ninguna fila que lo respaldara: nada que enseñarle a la DGII.
    //
    // Los siete casos eran: nota sin factura original, e-CF original rechazado,
    // NCF referenciado inexistente, NC de anulación total con monto distinto,
    // monto de NC sobre el saldo disponible, RNC del comprador no vigente en el
    // padrón, y RNC requerido (E32 ≥ 250.000 y el resto de builders).
    //
    // Ahora el número se pide en el paso 6, cuando lo único que puede fallar ya
    // es el envío a MSeller — y para eso la fila del e-CF ya existe.

    // ── 4. RESOLVER infoReferencia para E33/E34 ──────────────────────────────
    let infoReferencia = infoRefInput;
    // Comprador tal como se le declaró a la DGII en el comprobante que la nota
    // modifica. Es la fuente del RNCComprador de la nota — ver paso 4-ter.
    let compradorOriginal: CompradorOriginal | undefined;
    // Auto-resolver cuando: (a) no se proporcionó infoReferencia, o (b) se proporcionó
    // solo CodigoModificacion sin NCFModificado (caso típico del controller).
    if ((tipoEcf === 33 || tipoEcf === 34) && !infoReferencia?.NCFModificado) {
      const nota = factura as unknown as (NotaDebito | NotaCredito);
      const facturaOrigId = (nota as any).facturaOriginalId as number | undefined;
      if (!facturaOrigId) {
        throw new BadRequestException(
          `La nota #${documentoOrigenId} no tiene factura original asociada. ` +
          `Proporcione infoReferencia manualmente.`,
        );
      }
      // Solo aceptar ECF con estados activos — RECHAZADO excluido intencionalmente:
      // una factura rechazada por DGII no puede ser referenciada en NC/ND.
      const ecfOriginal = await this.ecfRepo.findOne({
        where: [
          { facturaId: facturaOrigId, estadoDGII: EstadoDGII.ACEPTADO,       empresaId },
          { facturaId: facturaOrigId, estadoDGII: EstadoDGII.ENVIADO,         empresaId },
          { facturaId: facturaOrigId, estadoDGII: EstadoDGII.PENDIENTE_ENVIO, empresaId },
          { facturaId: facturaOrigId, estadoDGII: EstadoDGII.OBSERVADO,       empresaId },
        ],
        order: { createdAt: 'DESC' },
      });
      if (!ecfOriginal) {
        // Verificar si existe un e-CF rechazado para dar un mensaje más claro
        const ecfRechazado = await this.ecfRepo.findOne({
          where: { facturaId: facturaOrigId, estadoDGII: EstadoDGII.RECHAZADO, empresaId },
          order: { createdAt: 'DESC' },
        });
        if (ecfRechazado) {
          throw new BadRequestException(
            `No se puede emitir NC/ND: el e-CF ${ecfRechazado.numero} de la factura original fue RECHAZADO por DGII. ` +
            `Corrija y reenvíe la factura original antes de emitir la nota.`,
          );
        }
        throw new EcfNcfReferenciadoError(facturaOrigId);
      }

      const facturaOrig = await this.facturaRepo.findOne({ where: { id: facturaOrigId, empresaId } });

      // Cambio 2 — guard real antes de enviar a MSeller:
      // DGII compara el MontoTotal del XML de la NC contra el MontoTotal del e-CF
      // original (error 615 si no coinciden exactamente). Usar ecfOriginal.montoTotal
      // como fuente primaria porque es lo que DGII tiene registrado.
      if (tipoEcf === 34 && infoRefInput?.CodigoModificacion === '1') {
        const montoNota = Number((nota as any).total);
        const montoOrig = Number(ecfOriginal.montoTotal ?? facturaOrig?.total ?? 0);
        if (montoNota !== montoOrig) {
          throw new BadRequestException(
            `NC de anulación total (codigoMod=1): el monto (${montoNota}) debe ser ` +
            `exactamente igual al monto del e-CF original ${ecfOriginal.numero} (${montoOrig}). ` +
            `DGII rechaza cualquier diferencia (error 615). Para ajuste parcial use codigoMod=3.`,
          );
        }
      }

      // Cambio 3 — balance para codigoMod≠1: verificar que el monto de la NC no
      // supere el saldo disponible según DGII (solo NCs aceptadas/observadas cuentan).
      if (tipoEcf === 34 && infoRefInput?.CodigoModificacion && infoRefInput.CodigoModificacion !== '1') {
        const [{ ncAplicadas }] = await this.ds.query<{ ncAplicadas: string }[]>(
          `SELECT COALESCE(SUM(e."montoTotal"), 0)::numeric AS "ncAplicadas"
           FROM ecf e
           JOIN notas_credito nc ON nc.id = e."documentoOrigenId"
                                 AND e."documentoOrigenTipo" = 'NOTA_CREDITO'
           WHERE nc."facturaOriginalId" = $1
             AND nc."empresaId" = $2
             AND e."estadoDGII" IN ('aceptado', 'observado')`,
          [facturaOrigId, empresaId],
        );
        const montoNota       = Number((nota as any).total);
        const montoOriginal   = Number(ecfOriginal.montoTotal ?? 0);
        const totalAplicado   = Number(ncAplicadas);
        const saldoDisponible = +Math.max(0, montoOriginal - totalAplicado).toFixed(2);
        if (montoNota > saldoDisponible + 0.005) {
          throw new BadRequestException(
            `El monto de la NC (${montoNota}) supera el saldo disponible del e-CF ` +
            `${ecfOriginal.numero} (${saldoDisponible} = ${montoOriginal} − ${totalAplicado} ya aplicado).`,
          );
        }
      }

      infoReferencia = {
        NCFModificado:      ecfOriginal.numero,
        FechaNCFModificado: fmtFecha(ecfOriginal.fechaUso ?? facturaOrig?.fecha ?? ecfOriginal.createdAt),
        // Preservar CodigoModificacion del input si fue proporcionado; default '3'
        CodigoModificacion: infoRefInput?.CodigoModificacion ?? '3',
      };
      compradorOriginal = leerCompradorDeclarado(ecfOriginal, facturaOrig);
    }

    // ── 4-ter. COMPRADOR DE LA NOTA = EL DEL COMPROBANTE QUE MODIFICA ────────
    //
    // La DGII compara el RNCComprador de una E33/E34 contra el de la factura
    // referenciada, y si difieren rechaza con código 615 — quemando el número.
    // El builder venía leyéndolo del cliente vinculado a la nota, que no es la
    // misma cosa: cuando el POS cobra a un RNC tecleado, la factura queda
    // apuntando al cliente genérico "consumidor final" aunque el XML haya
    // salido a nombre de un contribuyente real. La nota heredaba ese cliente y
    // salía a nombre equivocado.
    //
    // El e-CF guardado es la verdad de lo que se declaró, así que de ahí sale.
    // Si el llamador trajo su propio NCFModificado, el bloque anterior no cargó
    // nada: se busca por número para que la guarda cubra también ese camino.
    if ((tipoEcf === 33 || tipoEcf === 34) && infoReferencia?.NCFModificado && !compradorOriginal) {
      const ecfRef = await this.ecfRepo.findOne({
        where: { numero: infoReferencia.NCFModificado, empresaId },
        order: { createdAt: 'DESC' },
      });
      if (ecfRef) {
        const facturaRef = ecfRef.documentoOrigenId
          ? await this.facturaRepo.findOne({ where: { id: ecfRef.documentoOrigenId, empresaId } })
          : null;
        compradorOriginal = leerCompradorDeclarado(ecfRef, facturaRef);
      }
    }

    // ── 4-bis. COMPRADOR VIGENTE ANTE LA DGII ────────────────────────────────
    // Un RNC suspendido o dado de baja no puede recibir crédito fiscal (E31/E44/
    // E45). El POS ya mostraba el estado al digitarlo, pero dejaba emitir igual.
    // Falla ABIERTA: si el padrón no responde, no se encuentra el RNC o el estado
    // es desconocido, se emite — un servicio externo caído no puede frenar la
    // facturación. Ver rules/comprador-vigente.rule.ts.
    await this.validarCompradorVigente(
      tipoEcf, factura, datosComprador?.confirmaRncNoVigente === true,
    );

    // ── 5. VALIDAR EL PAYLOAD EN SECO, SIN CONSUMIR NÚMERO ───────────────────
    //
    // Los builders validan reglas que hacen fallar la emisión: el RNC del
    // comprador obligatorio en E31/E34/E41/E44/E45/E46, y en E32 a partir de
    // RD$250.000. Esas reglas viven en siete builders distintos; sacarlas de ahí
    // para comprobarlas antes significaría duplicarlas siete veces y que se
    // separen con el tiempo.
    //
    // En su lugar se construye el payload DOS veces. `buildECF` es una función
    // pura —sin consultas, sin escrituras, sin fechas ni aleatorios— y el eNCF
    // solo se copia al resultado, así que una construcción con un número de
    // marcador ejecuta exactamente las mismas validaciones. Si lanza, no se ha
    // tocado la secuencia. Este payload se descarta.
    const armarPayload = (numeroEcf: string): MSellerPayload => {
      const buildInput: ECFBuildInput = {
        encf:              numeroEcf,
        factura:           factura as Factura,
        config,
        fechaVencSec,
        infoReferencia,
        compradorOriginal,
        nombreExtranjero,
        paisExtranjero,
      };
      return this.builder.build(tipoEcf, buildInput);
    };

    // El marcador nunca sale de aquí. Mismo formato que un eNCF real para que
    // cualquier validación de forma se comporte igual.
    armarPayload(`E${String(tipoEcf).padStart(2, '0')}${'0'.repeat(10)}`);

    // ── 6. PEDIR EL NÚMERO Y CREAR LA FILA — UNA SOLA TRANSACCIÓN ────────────
    //
    // Aquí ya no queda ninguna validación que pueda abortar: lo único que puede
    // fallar a partir de este punto es el envío a MSeller, y para eso la fila ya
    // existe (queda en error, que es lo correcto: un número emitido SIEMPRE
    // tiene su fila).
    //
    // El incremento de la secuencia y el INSERT del e-CF van en la MISMA
    // transacción. Antes el incremento commiteaba por su cuenta y la fila se
    // creaba después: si algo fallaba en medio, el número quedaba huérfano. Un
    // fallo aquí revierte las dos cosas y la secuencia no avanza.
    const tipoEcfEntity = secParaTipo?.tipoECF
      ?? await this.ds.getRepository('tipos_ecf').findOne({ where: { codigo: `E${String(tipoEcf).padStart(2,'0')}` } }) as any;

    const { subtotal, iva, total } = factura as Factura;
    const montoGravado = Number(subtotal);
    const montoItbis   = Number(iva);
    const montoTotal   = Number(total);

    const { encf, payload, ecfSaved } = await this.ds.transaction(async (manager) => {
      const numero = await this.generator.generateNextEnTransaccion(manager, empresaId, tipoEcf);
      this.logger.log(`eNCF generado: ${numero}`);

      const payloadReal = armarPayload(numero);
      this.logger.debug(
        `[E${tipoEcf}] Payload JSON → MSeller:\n${JSON.stringify(payloadReal, null, 2)}`,
      );

      const fila = this.construirRegistroEcf({
        encf: numero, payload: payloadReal, empresaId, tipoEcfEntity, secParaTipo,
        factura: factura as Factura, documentoOrigenTipo, documentoOrigenId,
        montoGravado, montoItbis, montoTotal, infoReferencia,
      });

      const guardado = await manager.save(ECF, fila) as unknown as ECF;

      // ── SNAPSHOT FISCAL EN LA FACTURA ────────────────────────────────────
      //
      // Congelar en la factura el comprador que acaba de irse en el XML. Se
      // toma del payload, no del cliente: el payload ES lo declarado, así que
      // factura y e-CF no pueden divergir.
      //
      // Va en esta transacción a propósito. Si se escribiera después y algo
      // fallara en medio, quedaría un e-CF declarando un comprador y una
      // factura sin saber cuál — que es la situación que este campo viene a
      // eliminar.
      //
      // Se escribe UNA vez y no se vuelve a tocar: es el dueño fiscal del dato.
      // El vínculo comercial (clienteId) tiene otro dueño y otro momento, y no
      // reescribe esto nunca. Ver el comentario en factura.entity.ts.
      if (documentoOrigenTipo === DocumentoOrigenTipo.FACTURA
          || documentoOrigenTipo === DocumentoOrigenTipo.VENTA_POS) {
        const declarado = (payloadReal.ECF?.Encabezado as any)?.Comprador ?? {};
        // El RNC de todo ceros es el centinela de "sin comprador identificado",
        // no un dato: guardarlo haría que la guarda de las notas creyera que el
        // comprobante se declaró a consumidor final a propósito.
        const rncDeclarado   = normalizarRnc(declarado.RNCComprador);
        const razonDeclarada = String(declarado.RazonSocialComprador ?? '').trim();
        if (rncDeclarado || razonDeclarada) {
          await manager.update(Factura, { id: documentoOrigenId, empresaId }, {
            ...(rncDeclarado   ? { rncComprador:         rncDeclarado }   : {}),
            ...(razonDeclarada ? { razonSocialComprador: razonDeclarada } : {}),
          });
        }
      }

      return { encf: numero, payload: payloadReal, ecfSaved: guardado };
    });

    await this.registrarEvento(ecfSaved.id, TipoEcfEvento.CREADO, {
      encf, tipoEcf, documentoOrigenTipo, documentoOrigenId,
    });

    // ── 6-bis. VÍNCULO COMERCIAL ────────────────────────────────────────────
    //
    // El snapshot de arriba resuelve lo fiscal; esto resuelve lo comercial. Sin
    // él la venta a un RNC tecleado en el POS no aparece en el estado de cuenta
    // del cliente, ni en top clientes, ni en su historial: la factura sigue
    // apuntando al genérico.
    //
    // Fuera de la transacción y fallando abierta a propósito: es un dato
    // comercial y no puede tumbar una emisión fiscal que ya salió bien. Y no
    // escribe el snapshot — otro dueño, otro momento. Ver el servicio.
    if (documentoOrigenTipo === DocumentoOrigenTipo.FACTURA
        || documentoOrigenTipo === DocumentoOrigenTipo.VENTA_POS) {
      await this.vinculoCliente.vincular(documentoOrigenId, empresaId);
    }

    // ── 7. MODO CONTINGENCIA PROACTIVO — no enviar a MSeller ────────────────
    //    El administrador activó "Modo contingencia" en Configuración → POS.
    //    Se guarda en CONTINGENCIA directamente. El cron de rescate (cada 30 min)
    //    lo reintentará cuando MSeller/DGII vuelva a estar disponible.
    if (modoContingencia) {
      await this.ecfRepo.update(ecfSaved.id, {
        estadoDGII: EstadoDGII.CONTINGENCIA,
        errorEnvio: 'Modo contingencia activado por el administrador.',
      });
      await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ESTADO_CAMBIADO, {
        de: EstadoDGII.PENDIENTE_ENVIO, a: EstadoDGII.CONTINGENCIA,
        motivo: 'modoContingencia=true — configuración POS',
      });
      this.logger.log(`e-CF ${encf} → CONTINGENCIA (proactivo por config)`);
      return {
        encf,
        securityCode: undefined,
        qrUrl:        undefined,
        estado:       EstadoDGII.CONTINGENCIA,
        idempotente:  false,
        ecf:          { ...ecfSaved, estadoDGII: EstadoDGII.CONTINGENCIA } as ECF,
      };
    }

    // ── 8. ENVIAR A MSELLER ───────────────────────────────────────────────────
    try {
      const t0 = Date.now();
      const respuesta = await this.mseller.enviarDocumento(payload, empresaId, timeout);
      const latencia  = Date.now() - t0;

      // ── 9. ACTUALIZAR ESTADO → ACEPTADO (MSeller recibió el documento) ────
      const fechaFirmaECF = parseMSellerSignedDate(respuesta.signedDate);
      await this.ecfRepo.update(ecfSaved.id, {
        estadoDGII:         EstadoDGII.ENVIADO,
        trackId:            respuesta.internalTrackId,
        qrUrl:              respuesta.qr_url,
        codigoSeguridad:    respuesta.securityCode,
        respuestaMSeller:   respuesta as any,
        intentosEnvio:      1,
        ultimoIntentoEnvio: new Date(),
        ...(fechaFirmaECF && { fechaFirma: fechaFirmaECF }),
      } as any);

      await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ENVIADO, {
        trackId:      respuesta.internalTrackId,
        latenciaMs:   latencia,
        securityCode: respuesta.securityCode,
      });

      // anulacionPendiente=true ya fue puesto por notas-credito.service.emitir()
      // antes de llamar al use-case. No se repite aquí.

      const ecfFinal = await this.ecfRepo.findOne({ where: { id: ecfSaved.id }, relations: ['tipoECF'] });
      this.logger.log(`EmitirECF OK | ${encf} | trackId=${respuesta.internalTrackId} | estado=ENVIADO`);

      // Poll diferido: solo en modo NO-POS para no bloquear al cajero.
      // En POS el cron consultar-estado-ecf.job actualizará el estado en ~5 min.
      if (!modoSincrono) {
        this.pollDiferido(ecfSaved.id, encf, respuesta.internalTrackId, empresaId);
      }

      return this.toResult(ecfFinal!, false);

    } catch (err) {
      // ── "Ya existe en el sistema" NO es rechazo real ─────────────────────
      // MSeller ya procesó un envío previo de este eNCF (respuesta perdida por
      // timeout). Consultar el estado real y adoptarlo — NUNCA marcar RECHAZADO.
      if (err instanceof EcfValidacionError && esErrorYaExiste(err)) {
        const real = await consultarExistenciaEncf(this.mseller, encf, empresaId);
        if (real.tipo === 'existe') {
          // ACEPTADO/OBSERVADO = veredicto final → comprobante válido.
          // ENVIADO (PROCESANDO/RECIBIDO/EN PROCESO) = en tránsito → el
          // consultar-estado-ecf.job (cada 2 min, recoge los ENVIADO) seguirá
          // consultando hasta el veredicto final. fechaUso SOLO en ACEPTADO.
          await this.ecfRepo.update(ecfSaved.id, {
            estadoDGII:         real.estado,
            errorEnvio:         undefined,
            intentosEnvio:      1,
            ultimoIntentoEnvio: new Date(),
            ...(real.estado === EstadoDGII.ACEPTADO ? { fechaUso: new Date() } : {}),
          });
          await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ESTADO_CAMBIADO,
            { via: 'ya-existe', estado: real.estado },
            `MSeller respondió "ya existe" → adoptado estado real ${real.estado}`);
          this.logger.log(`[ECF] ${encf} "ya existe" → adoptado ${real.estado} (no rechazado)`);
          const ecfReal = await this.ecfRepo.findOne({ where: { id: ecfSaved.id }, relations: ['tipoECF'] });
          return this.toResult(ecfReal!, false);
        }
        // Fail-safe: "ya existe" pero la consulta no confirma el estado →
        // NO rechazar ni aceptar; dejar PENDIENTE_ENVIO para que el job reconsulte.
        await this.ecfRepo.update(ecfSaved.id, {
          estadoDGII:         EstadoDGII.PENDIENTE_ENVIO,
          errorEnvio:         err.message,
          intentosEnvio:      1,
          ultimoIntentoEnvio: new Date(),
        });
        await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ERROR,
          { tipo: 'YA_EXISTE_SIN_CONFIRMAR' }, err.message);
        this.logger.warn(`[ECF] ${encf} "ya existe" pero consulta no concluyente — PENDIENTE_ENVIO`);
        if (modoSincrono) {
          const ecfPendiente = await this.ecfRepo.findOne({ where: { id: ecfSaved.id }, relations: ['tipoECF'] });
          return this.toResult(ecfPendiente!, false);
        }
        throw err;
      }

      // ── Errores de validación MSeller (4xx) → RECHAZADO ──────────────────
      if (err instanceof EcfValidacionError) {
        // Guardamos el JSON enviado en el campo `xml` para diagnóstico.
        // Cuando MSeller rechaza en 4xx nunca genera XML firmado, así que
        // usamos este campo para mostrar información útil en "Ver XML".
        const xmlDiag = `<!-- e-CF RECHAZADO POR MSELLER [${(err as any).statusCode}]
   Motivo: ${(err as any).detalle}
   Fecha: ${new Date().toISOString()}
-->
<!-- JSON enviado a MSeller (para diagnóstico): -->
${JSON.stringify(payload, null, 2)}`;

        await this.ecfRepo.update(ecfSaved.id, {
          estadoDGII:    EstadoDGII.RECHAZADO,
          errorEnvio:    err.message,
          xml:           xmlDiag,
          intentosEnvio: 1,
          ultimoIntentoEnvio: new Date(),
          respuestaMSeller: { status: (err as any).statusCode, detalle: (err as any).detalle, errores: (err as any).erroresValidacion } as any,
        } as any);
        await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ERROR, {
          tipo: 'VALIDACION', statusCode: err.statusCode, detalle: err.detalle,
        }, err.message);
        throw err;
      }

      // ── Timeout / error de red → PENDIENTE_ENVIO para que el job reintente
      if (err instanceof EcfComunicacionError) {
        await this.ecfRepo.update(ecfSaved.id, {
          estadoDGII:    EstadoDGII.PENDIENTE_ENVIO,
          errorEnvio:    err.message,
          intentosEnvio: 1,
          ultimoIntentoEnvio: new Date(),
        });
        await this.registrarEvento(ecfSaved.id, TipoEcfEvento.ERROR, {
          tipo: 'COMUNICACION',
        }, err.message);

        // En modo POS devolvemos el comprobante en PENDIENTE — la venta sí se completa
        if (modoSincrono) {
          const ecfPendiente = await this.ecfRepo.findOne({ where: { id: ecfSaved.id }, relations: ['tipoECF'] });
          this.logger.warn(`POS: e-CF en PENDIENTE_ENVIO (MSeller no disponible). eNCF=${encf}`);
          return this.toResult(ecfPendiente!, false);
        }
        throw err;
      }

      // Error inesperado — loggear siempre como ERROR (nunca silencioso)
      this.logger.error(
        `[ECF] Error inesperado para ${encf} [${(err as any)?.constructor?.name}]: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.ecfRepo.update(ecfSaved.id, {
        estadoDGII: EstadoDGII.PENDIENTE_ENVIO,
        errorEnvio: (err as Error).message,
        intentosEnvio: 1,
        ultimoIntentoEnvio: new Date(),
      });
      throw err;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Rechaza la emisión de un comprobante de crédito fiscal cuando el padrón de
   * la DGII declara al comprador SUSPENDIDO o DADO DE BAJA.
   *
   * Cualquier fallo consultando el padrón se registra y se deja pasar: la regla
   * protege del error fiscal, no puede convertirse en un punto de caída de la
   * facturación.
   */
  /**
   * Arma la fila del e-CF. Extraído tal cual estaba en el flujo, sin cambiar un
   * solo campo, para que el INSERT pueda ejecutarse dentro de la transacción
   * que incrementa la secuencia.
   */
  private construirRegistroEcf(p: {
    encf: string;
    payload: MSellerPayload;
    empresaId: number;
    tipoEcfEntity: any;
    secParaTipo: SecuenciaECF | null;
    factura: Factura;
    documentoOrigenTipo: DocumentoOrigenTipo;
    documentoOrigenId: number;
    montoGravado: number;
    montoItbis: number;
    montoTotal: number;
    infoReferencia?: MSellerInfoReferencia;
  }): ECF {
    return this.ecfRepo.create({
      empresaId:           p.empresaId,
      numero:              p.encf,
      tipoECFId:           p.tipoEcfEntity?.id ?? 0,
      secuenciaId:         p.secParaTipo?.id ?? 0,
      facturaId:           p.documentoOrigenTipo === DocumentoOrigenTipo.FACTURA ? p.documentoOrigenId : undefined,
      documentoOrigenTipo: p.documentoOrigenTipo,
      documentoOrigenId:   p.documentoOrigenId,
      estadoDGII:          EstadoDGII.PENDIENTE_ENVIO,
      codigoSeguridad:     String(Math.floor(100000 + Math.random() * 900000)),
      // `?? rfc` no es cosmético: la mayoría de los clientes guarda el RNC en
      // `rfc` y no en `rncReceptor`, así que sin esa rama la columna quedaba
      // vacía en 13.453 de 13.565 e-CF aceptados — y es la primera fuente de
      // la cascada que leen el PDF y las vistas para el RNC del comprador.
      // Los builders siempre miraron `rncReceptor ?? rfc`; esto los iguala.
      rncComprador:        p.factura.cliente?.rncReceptor
                             ?? p.factura.cliente?.rfc
                             ?? p.factura.rncComprador
                             ?? undefined,
      // Misma fuente que el RazonSocialComprador del XML, para que el registro
      // guardado (y el PDF, que lo lee de aquí) no diverja de lo declarado
      razonSocialComprador: razonSocialFiscal(
        p.factura.cliente,
        p.factura.cliente?.nombre ?? '',
      ) || undefined,
      direccionComprador:  p.factura.cliente?.direccion ?? undefined,
      montoExento:         0,
      montoGravado:        p.montoGravado,
      montoItbis:          p.montoItbis,
      montoTotal:          p.montoTotal,
      jsonEnviado:         p.payload as unknown as Record<string, unknown>,
      intentosEnvio:       0,
      // Campos específicos por tipo
      ...(p.infoReferencia ? {
        ncfModificado:      p.infoReferencia.NCFModificado,
        codigoModificacion: p.infoReferencia.CodigoModificacion,
      } : {}),
    } as any) as unknown as ECF;
  }

  private async validarCompradorVigente(
    tipoEcf: number,
    documento: any,
    confirmado = false,
  ): Promise<void> {
    if (!esCreditoFiscal(tipoEcf)) return;

    const rnc = String(
      documento?.rncComprador ??
      documento?.cliente?.rncReceptor ??
      documento?.cliente?.rfc ?? '',
    ).replace(/\D/g, '');

    if (!/^\d{9}$|^\d{11}$/.test(rnc)) return;   // sin RNC válido no hay nada que verificar

    let padron: { encontrado?: boolean; estado?: string } | undefined;
    try {
      padron = await this.rncService.consultarRNC(rnc);
    } catch (err) {
      this.logger.warn(
        `[ECF] No se pudo verificar el RNC ${rnc} en el padrón: ${(err as Error).message}. Se emite igual.`,
      );
      return;
    }

    const veredicto = evaluarCompradorFiscal(tipoEcf, padron, confirmado);

    if (veredicto.bloquear) {
      this.logger.warn(
        `[ECF] E${tipoEcf} requiere confirmación: RNC ${rnc} está ${veredicto.estado}`,
      );
      // El código permite al frontend distinguir "hay que confirmar" de un
      // error cualquiera, y ofrecer la casilla en vez de un mensaje sin salida.
      throw new BadRequestException(payloadCompradorNoVigente(veredicto, rnc));
    }

    // Emitido a pesar de la advertencia: queda constancia de la decisión.
    // El usuario que la tomó sale del contexto de la request (pino la incluye).
    if (veredicto.confirmado) {
      this.logger.warn(
        `[ECF] E${tipoEcf} emitido a RNC ${rnc} ${veredicto.estado} ante DGII — ` +
        'el usuario confirmó la advertencia explícitamente',
      );
    }
  }

  private async cargarDocumentoOrigen(
    tipo: DocumentoOrigenTipo,
    id:   number,
    empresaId: number,
  ): Promise<Factura | Record<string, unknown>> {
    if (tipo === DocumentoOrigenTipo.FACTURA) {
      const f = await this.facturaRepo.findOne({
        where: { id, empresaId },
        relations: ['cliente', 'detalles', 'detalles.producto'],
      });
      if (!f) throw new NotFoundException(`Factura #${id} no encontrada para empresa #${empresaId}`);
      return f;
    }

    if (tipo === DocumentoOrigenTipo.NOTA_DEBITO) {
      const nota = await this.notaDebitoRepo.findOne({
        where: { id, empresaId },
        relations: ['cliente', 'detalles'],
      });
      if (!nota) throw new NotFoundException(`Nota de Débito #${id} no encontrada para empresa #${empresaId}`);
      // Adaptar NotaDebito → forma compatible con Factura (iva→importeIva ya lo maneja buildItemsFromDetalles)
      return {
        ...nota,
        // Exponer iva como campo estándar
        iva: nota.iva,
      } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.NOTA_CREDITO) {
      const nota = await this.notaCreditoRepo.findOne({
        where: { id, empresaId },
        relations: ['cliente', 'detalles'],
      });
      if (!nota) throw new NotFoundException(`Nota de Crédito #${id} no encontrada para empresa #${empresaId}`);

      // D-débil: si no hay base gravada pero hay ITBIS, el XML E34 sería fiscalmente inválido.
      // Regla parcial — no atrapa facturas mixtas. La validación fuerte (línea a línea)
      // queda pendiente de la migración facturaDetalleId.
      const montoGravadoDetalles = (nota.detalles ?? []).reduce(
        (s: number, d: any) => Number(d.porcentajeIva) > 0 ? s + Number(d.precioUnitario) * Number(d.cantidad) : s,
        0,
      );
      if (montoGravadoDetalles === 0 && Number(nota.iva) > 0) {
        throw new BadRequestException(
          `La Nota de Crédito #${nota.id} tiene ITBIS (${nota.iva}) pero ningún ítem gravado. ` +
          `Verifique las tasas de ITBIS en los ítems antes de emitir el e-CF.`,
        );
      }

      return {
        ...nota,
        iva: nota.iva,
      } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.COMPRA) {
      const compra = await this.compraRepo.findOne({
        where: { id, empresaId },
        relations: ['proveedor', 'detalles'],
      });
      if (!compra) throw new NotFoundException(`Compra #${id} no encontrada para empresa #${empresaId}`);

      return {
        ...compra,
        cliente: {
          id:          compra.proveedor?.id,
          nombre:      compra.proveedor?.nombre,
          rncReceptor: compra.proveedor?.rnc,
          direccion:   compra.proveedor?.direccion,
        },
        detalles: (compra.detalles ?? []).map(d => ({
          ...d,
          porcentajeIva: (d as any).porcentajeItbis,
          importeIva:    (d as any).importeItbis,
        })),
        iva:      compra.itbis,
        subtotal: compra.subtotal,
        total:    compra.total,
        fecha:    compra.fecha,
      } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.GASTO) {
      const gasto = await this.gastoRepo.findOne({ where: { id, empresaId } });
      if (!gasto) throw new NotFoundException(`Gasto #${id} no encontrado para empresa #${empresaId}`);

      // Gastos menores: sin array de detalles → crear ítem sintético exento
      return {
        fecha:    gasto.fecha,
        cliente: {
          rncReceptor: gasto.rncProveedor ?? undefined,
          nombre:      gasto.proveedor ?? 'Proveedor Informal',
        },
        detalles: [{
          descripcion:    gasto.descripcion,
          cantidad:       1,
          precioUnitario: Number(gasto.monto),
          porcentajeIva:  0,   // gastos menores: exento
          importeIva:     0,
          subtotal:       Number(gasto.monto),
        }],
        iva:      gasto.itbis ?? 0,
        subtotal: gasto.monto,
        total:    gasto.total,
      } as unknown as Factura;
    }

    if (tipo === DocumentoOrigenTipo.PAGO_PRESTAMO) {
      const rows = await this.ds.query<any[]>(
        `SELECT p.*, d.nombre AS deudor_nombre, d.rnc AS deudor_rnc,
                d.cedula AS deudor_cedula, d.direccion AS deudor_direccion,
                pr.numero AS prestamo_numero
         FROM pr_pagos p
         JOIN pr_deudores d  ON d.id  = p."deudorId"  AND d."empresaId"  = $2
         JOIN pr_prestamos pr ON pr.id = p."prestamoId" AND pr."empresaId" = $2
         WHERE p.id = $1 AND p."empresaId" = $2`,
        [id, empresaId],
      );
      if (!rows.length) throw new NotFoundException(`Pago préstamo #${id} no encontrado para empresa #${empresaId}`);
      const pag = rows[0];
      const interes = Number(pag.aplicadoInteres ?? 0);
      return {
        fecha: pag.createdat ?? new Date(),
        cliente: {
          rncReceptor: pag.deudor_rnc ?? undefined,
          cedula:      pag.deudor_cedula ?? undefined,
          nombre:      pag.deudor_nombre,
          direccion:   pag.deudor_direccion ?? undefined,
        },
        detalles: [{
          descripcion:    `Interés préstamo ${pag.prestamo_numero}`,
          cantidad:       1,
          precioUnitario: interes,
          porcentajeIva:  0,  // interés financiero: exento ITBIS
          importeIva:     0,
          subtotal:       interes,
        }],
        iva:      0,
        subtotal: interes,
        total:    interes,
      } as unknown as Factura;
    }

    // VENTA_POS — placeholder; se poblará con los datos del ticket POS
    return {
      id,
      total: 0,
      subtotal: 0,
      iva: 0,
      cliente: null,
      detalles: [],
      fecha: new Date(),
    };
  }

  /** Poll diferido — corre en background, no bloquea al caller */
  private pollDiferido(ecfId: number, encf: string, trackId: string, empresaId: number): void {
    const ESTADO_MAP: Record<string, EstadoDGII> = {
      ACEPTADO:   EstadoDGII.ACEPTADO,
      RECHAZADO:  EstadoDGII.RECHAZADO,
      OBSERVADO:  EstadoDGII.OBSERVADO,
      PROCESANDO: EstadoDGII.ENVIADO,
      RECIBIDO:   EstadoDGII.ENVIADO,
    };
    // Esperar 3s y consultar — sin await para no bloquear
    setTimeout(async () => {
      try {
        const resp = await this.mseller.consultarEstado(trackId, empresaId);
        const estado = ESTADO_MAP[resp.status?.toUpperCase()] ?? EstadoDGII.ENVIADO;
        if (estado !== EstadoDGII.ENVIADO) {
          await this.ecfRepo.update(ecfId, {
            estadoDGII: estado,
            ...(estado === EstadoDGII.ACEPTADO ? { fechaUso: new Date() } : {}),
          });
          this.logger.log(`Poll diferido ${encf}: ${resp.status} → ${estado}`);
        }
      } catch {
        // Silencioso — el cron job lo recogerá
      }
    }, 3_000);
  }

  private async registrarEvento(
    comprobanteId: number,
    evento:        TipoEcfEvento,
    payload?:      Record<string, unknown>,
    mensaje?:      string,
  ): Promise<void> {
    await this.eventoRepo.save(
      this.eventoRepo.create({ comprobanteId, evento, payload, mensaje }),
    );
  }

  /** Construye un EmitirECFResult desde un e-CF ya existente (para flujos que
   *  reconcilian/reenvían sin pasar por execute(), p. ej. el botón "Emitir"). */
  resultadoDe(ecf: ECF, idempotente: boolean): EmitirECFResult {
    return this.toResult(ecf, idempotente);
  }

  private toResult(ecf: ECF, idempotente: boolean): EmitirECFResult {
    return {
      ecf,
      encf:         ecf.numero,
      qrUrl:        ecf.qrUrl,
      trackId:      ecf.trackId,
      securityCode: (ecf.respuestaMSeller as any)?.securityCode,
      signedDate:   (ecf.respuestaMSeller as any)?.signedDate,
      estado:       ecf.estadoDGII,
      idempotente,
    };
  }
}

// "DD-MM-YYYY HH:MM:SS" → Date en RD (UTC-4). Returns undefined si no parseable.
function parseMSellerSignedDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}-04:00`);
}
