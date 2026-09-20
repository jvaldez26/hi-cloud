/** Errores de negocio tipados para ParametrosFiscalesService.resolver(). */

export class ParametroFiscalError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ParametroFiscalError';
  }
}

/** No hay ninguna fila de `clave` cuyo rango de vigencia cubra la fecha pedida. */
export class ParametroFiscalNoEncontradoError extends ParametroFiscalError {
  constructor(public readonly clave: string, public readonly fecha: string) {
    super(
      `No existe el parámetro fiscal "${clave}" vigente al ${fecha}. ` +
      `Un Super Admin debe crearlo en Configuración → Parámetros Fiscales.`,
      'PARAMETRO_FISCAL_NO_ENCONTRADO',
    );
  }
}

/** La fila vigente existe pero su estado es PENDIENTE_VALIDACION (valor sin confirmar). */
export class ParametroFiscalPendienteError extends ParametroFiscalError {
  constructor(public readonly clave: string, public readonly fecha: string) {
    super(
      `El parámetro fiscal "${clave}" vigente al ${fecha} está pendiente de validación. ` +
      `Un Super Admin debe confirmarlo antes de usarlo en un cálculo.`,
      'PARAMETRO_FISCAL_PENDIENTE',
    );
  }
}

/** Intento de editar en sitio una fila con vigencia ya cerrada, o de cerrar una que no está abierta. */
export class ParametroFiscalVigenciaError extends ParametroFiscalError {
  constructor(message: string) {
    super(message, 'PARAMETRO_FISCAL_VIGENCIA_INVALIDA');
  }
}
