import { Logger } from '@nestjs/common';
import { EcfCompradorNotaError } from '../../errors/ecf.errors';

const compradorLogger = new Logger('ECFComprador');

/** RNC genérico DGII para gastos menores (E43) */
export const COMPRADOR_GASTOS_MENORES = {
  RNCComprador:         '131880657',
  RazonSocialComprador: 'CLIENTES DE LA ADMINISTRACION',
} as const;

/** Comprador consumidor final genérico (E32 sin RNC identificado) */
export const COMPRADOR_CONSUMIDOR_FINAL = {
  RNCComprador:         '00000000000',
  RazonSocialComprador: 'Consumidor Final',
} as const;

/**
 * Razón social que va al XML como RazonSocialComprador.
 *
 * Ante DGII el nombre debe ser la razón social REGISTRADA para ese RNC. El
 * campo `nombre` del cliente es de uso interno y puede distinguir sucursales
 * que comparten contribuyente — p. ej. varias escuelas de un mismo distrito
 * educativo facturan bajo el RNC del distrito pero se registran por separado
 * para llevar dirección, contacto y cuenta por cobrar propias. Todas deben
 * declarar la MISMA razón social.
 *
 * Fallback a `nombre` porque la inmensa mayoría de clientes no tiene la razón
 * social fiscal cargada, y en esos casos `nombre` es exactamente lo que se
 * venía enviando.
 */
export function razonSocialFiscal(
  cliente?: { razonSocial?: string | null; nombre?: string | null },
  porDefecto = 'Sin nombre',
): string {
  const fiscal = (cliente?.razonSocial ?? '').trim();
  if (fiscal) return fiscal;
  return (cliente?.nombre ?? '').trim() || porDefecto;
}

/** Comprador con RNC identificado — E31, E32 con RNC, E33, E34, E41, E44, E45 */
export function buildCompradorRNC(
  rnc:         string,
  razonSocial: string,
  extras?:     Record<string, unknown>,
  encf = '',
): Record<string, unknown> {
  const rncLimpio = rnc.replace(/\D/g, '');
  if (rncLimpio.length !== 9 && rncLimpio.length !== 11) {
    compradorLogger.warn(
      `[${encf || 'sin-encf'}] RNCComprador con formato inválido: "${rnc}" ` +
      `(${rncLimpio.length} dígitos; esperado 9=RNC o 11=cédula). ` +
      `Razón social: "${razonSocial.trim()}". Revisar datos del cliente.`,
    );
  }
  return {
    RNCComprador:         rncLimpio || rnc,
    RazonSocialComprador: razonSocial.trim(),
    ...(extras ?? {}),
  };
}

/**
 * Comprador extranjero — E46 (Exportaciones) y E47 (Pagos al Exterior).
 *
 * CASO A — Cliente extranjero (exportación estándar):
 *   IdentificadorExtranjero + RazonSocialComprador + PaisComprador
 *
 * CASO B — Zona Franca / residente RD con régimen especial:
 *   RNCComprador + RazonSocialComprador + PaisComprador
 */
export function buildCompradorExtranjero(
  nombre:                  string,
  paisISO:                 string,   // código ISO 2 letras: 'US', 'MX', 'ES'…
  identificadorExtranjero?: string,  // ID fiscal del cliente en su país
  rncComprador?:            string,  // RNC si es Zona Franca (residente RD)
): Record<string, unknown> {
  const comp: Record<string, unknown> = {};
  if (rncComprador) {
    comp['RNCComprador'] = rncComprador;
  } else if (identificadorExtranjero) {
    comp['IdentificadorExtranjero'] = identificadorExtranjero;
  }
  comp['RazonSocialComprador'] = nombre.trim();
  comp['PaisComprador']        = paisISO;
  return comp;
}

// ── Comprador de notas de débito/crédito (E33 / E34) ──────────────────────────


/**
 * Snapshot del comprador tal como se le declaró a la DGII en el comprobante que
 * una nota modifica. Se lee del e-CF original, NO del cliente vinculado hoy:
 * el cliente de la factura puede ser el genérico "consumidor final" aunque el
 * XML haya salido a nombre de un contribuyente real.
 */
export interface CompradorOriginal {
  rnc?:         string | null;
  razonSocial?: string | null;
  direccion?:   string | null;
}

/**
 * Normaliza un RNC/cédula para compararlo: solo dígitos, y los centinelas de
 * "sin comprador identificado" (todo ceros, en cualquier largo) colapsan a ''.
 *
 * Sin esto, '000000000' (9 ceros, que es lo que llevan varios clientes
 * genéricos) y '00000000000' (11 ceros, el centinela que usaba el código)
 * parecen valores distintos y las comprobaciones de "¿tiene RNC?" no disparan.
 */
export function normalizarRnc(rnc?: string | null): string {
  const digitos = String(rnc ?? '').replace(/\D/g, '');
  return /^0*$/.test(digitos) ? '' : digitos;
}

/**
 * Resuelve el comprador de una nota (E33/E34) y verifica que sea el mismo que
 * el del comprobante que modifica.
 *
 * La fuente es el e-CF original, no el cliente vinculado a la nota. Lo que se
 * declaró a la DGII es lo que la DGII tiene registrado; el cliente de la
 * factura puede no serlo — y de hecho a menudo no lo es, porque el POS mezcla
 * los datos del comprador en memoria sin persistir el vínculo.
 *
 * Si el original no dejó comprador identificado, se cae al cliente: no hay
 * nada mejor y el comportamiento queda como estaba.
 *
 * Lanza `EcfCompradorNotaError` cuando el RNC resuelto no coincide con el del
 * original. Los builders son puros y se ejecutan en seco antes de pedir número
 * (ver paso 5 de emitir-ecf.use-case), así que un desajuste aborta la emisión
 * sin quemar secuencia — que es exactamente lo que la DGII sí haría al
 * rechazar con código 615.
 */
export function resolverCompradorNota(
  tipoEcf:        33 | 34,
  encfModificado: string,
  cliente:        { rncReceptor?: string | null; rfc?: string | null;
                    razonSocial?: string | null; nombre?: string | null;
                    direccion?: string | null } | undefined,
  original:       CompradorOriginal | undefined,
): { rnc: string; razonSocial: string; direccion?: string } {
  const rncCliente = normalizarRnc(cliente?.rncReceptor ?? cliente?.rfc);

  const compradorDelCliente = () => ({
    rnc:         rncCliente || '00000000000',
    razonSocial: razonSocialFiscal(cliente),
    direccion:   cliente?.direccion ?? undefined,
  });

  // Sin snapshot del original no hay nada que comparar ni de dónde leer: se cae
  // al cliente, exactamente como antes. Pasa cuando el llamador construye el
  // payload sin referencia (el reintento de un e-CF ya emitido, las pruebas) o
  // cuando el e-CF original es tan viejo que no guardó jsonEnviado.
  // `rnc` ausente ≠ `rnc` en ceros: lo segundo SÍ es un dato — dice que el
  // comprobante se declaró sin comprador identificado.
  if (original?.rnc == null) return compradorDelCliente();

  const rncOriginal = normalizarRnc(original.rnc);

  // El original salió a consumidor final. Una nota a nombre de un contribuyente
  // real no cuadra con lo que la DGII tiene registrado.
  if (!rncOriginal) {
    if (rncCliente) {
      throw new EcfCompradorNotaError(tipoEcf, encfModificado, '', rncCliente);
    }
    return compradorDelCliente();
  }

  // El original sí identificó al comprador. Si el cliente vinculado apunta a
  // OTRO contribuyente, la nota saldría a nombre equivocado: abortar. Que el
  // cliente no tenga RNC (el genérico) no es un conflicto — es la ausencia de
  // dato que el snapshot del original viene justamente a cubrir.
  if (rncCliente && rncCliente !== rncOriginal) {
    throw new EcfCompradorNotaError(tipoEcf, encfModificado, rncOriginal, rncCliente);
  }

  return {
    rnc:         rncOriginal,
    razonSocial: (original.razonSocial ?? '').trim() || razonSocialFiscal(cliente),
    direccion:   original.direccion ?? cliente?.direccion ?? undefined,
  };
}
