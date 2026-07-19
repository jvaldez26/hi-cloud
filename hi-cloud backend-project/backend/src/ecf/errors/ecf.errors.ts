/** Errores de negocio tipados para el módulo ECF — permiten manejar casos específicos en la capa de orquestación. */

export class EcfError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'EcfError';
  }
}

/** No existe una secuencia activa para el tipo de e-CF y empresa solicitados. */
export class EcfSecuenciaSinConfigError extends EcfError {
  constructor(empresaId: number, tipoEcf: number) {
    super(
      `No hay secuencia activa para tipo E${tipoEcf} en empresa #${empresaId}. ` +
      `Configure un rango autorizado por DGII en el panel Super Admin.`,
      'ECF_SIN_SECUENCIA',
    );
  }
}

/** La secuencia está agotada (secuenciaActual > secuenciaFinal). */
export class EcfSecuenciaAgotadaError extends EcfError {
  constructor(secuenciaFinal: number) {
    super(
      `La secuencia activa está agotada (último número: ${secuenciaFinal}). ` +
      `Solicite un nuevo rango autorizado a la DGII.`,
      'ECF_SECUENCIA_AGOTADA',
    );
  }
}

/** La fecha de vencimiento de la secuencia ya expiró. */
export class EcfSecuenciaVencidaError extends EcfError {
  constructor(fechaVencimiento: Date) {
    super(
      `La secuencia activa venció el ${fechaVencimiento.toLocaleDateString('es-DO')}. ` +
      `Solicite una renovación del rango autorizado a la DGII.`,
      'ECF_SECUENCIA_VENCIDA',
    );
  }
}

/** El documento ya tiene un e-CF aceptado (idempotencia). */
export class EcfDuplicadoError extends EcfError {
  constructor(encf: string, documentoOrigenId: number | string) {
    super(
      `El documento origen #${documentoOrigenId} ya tiene un e-CF aceptado: ${encf}`,
      'ECF_DUPLICADO',
    );
    this.encf = encf;
  }
  encf: string;
}

/** MSeller rechazó el documento por error de validación (4xx — no reintentable). */
export class EcfValidacionError extends EcfError {
  constructor(
    public readonly statusCode: number,
    public readonly detalle: string,
    public readonly erroresValidacion?: unknown[],
  ) {
    super(`MSeller rechazó el documento [${statusCode}]: ${detalle}`, 'ECF_VALIDACION');
  }
}

/** Error de red/timeout al comunicarse con MSeller (reintentable). */
export class EcfComunicacionError extends EcfError {
  constructor(message: string) {
    super(message, 'ECF_COMUNICACION');
  }
}

/** Empresa no tiene configuración MSeller activa. */
export class EcfConfigFaltanteError extends EcfError {
  constructor(empresaId: number) {
    super(
      `La empresa #${empresaId} no tiene configuración e-CF activa. ` +
      `Un Super Admin debe configurar las credenciales MSeller.`,
      'ECF_CONFIG_FALTANTE',
    );
  }
}

/** E31 sin RNC del comprador, o E32 >= 250K sin identificación. */
export class EcfRncRequeridoError extends EcfError {
  constructor(tipoEcf: number, monto: number) {
    const motivos: Record<number, string> = {
      31: 'Las Facturas de Crédito Fiscal (E31) requieren el RNC del comprador.',
      41: 'Los Comprobantes de Compras (E41) requieren el RNC del proveedor.',
      44: 'Los Comprobantes de Regímenes Especiales (E44) requieren el RNC del comprador.',
      45: 'Los Comprobantes Gubernamentales (E45) requieren el RNC de la entidad.',
    };
    const motivo = motivos[tipoEcf]
      ?? `Las Facturas de Consumo (E32) con monto ≥ RD$250,000 (monto: ${monto.toLocaleString('es-DO')}) requieren el RNC o cédula del comprador.`;
    super(motivo, 'ECF_RNC_REQUERIDO');
  }
}

/** El e-NCF referenciado en una nota de débito/crédito no existe o no está ACEPTADO. */
export class EcfNcfReferenciadoError extends EcfError {
  constructor(facturaOrigenId: number) {
    super(
      `No se encontró un e-CF ACEPTADO para el documento origen #${facturaOrigenId}. ` +
      `Solo se puede emitir nota sobre comprobantes previamente aceptados por la DGII.`,
      'ECF_NCF_REFERENCIADO_NO_ENCONTRADO',
    );
  }
}

/** E34 con código 1 (anulación total) pero el monto no coincide con el original. */
export class EcfMontoAnulacionError extends EcfError {
  constructor(montoNota: number, montoOriginal: number) {
    super(
      `Anulación total (E34 código 1): el monto de la nota (${montoNota}) debe ser igual al del comprobante original (${montoOriginal}).`,
      'ECF_MONTO_ANULACION_INVALIDO',
    );
  }
}

/** El documento origen fue modificado después de emitir el e-CF en CONTINGENCIA — el XML sería diferente al original. */
export class EcfDocumentoModificadoError extends EcfError {
  constructor(numero: string) {
    super(
      `El documento origen del e-CF ${numero} fue modificado después de su emisión en contingencia. ` +
      `No se puede reenviar: el XML resultante diferiría del emitido originalmente.`,
      'ECF_DOCUMENTO_MODIFICADO',
    );
  }
}
