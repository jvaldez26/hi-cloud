import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Valida formato de NCF/e-NCF recibido de un TERCERO (proveedor) — el que se
 * reporta en el Formato 606. NO es el e-CF que HiCloud emite (ese tiene su
 * propio motor en declaraciones/), y NO es un campo de secuencia interna: es
 * lo que el usuario teclea desde el comprobante en papel o el correo del
 * proveedor.
 *
 * Dos formatos vigentes en RD, letra LITERAL (no cualquiera):
 *   - NCF impreso: B0100000001   → 'B' + 10 dígitos (11 caracteres)
 *   - e-NCF:       E310000000001 → 'E' + 12 dígitos (13 caracteres)
 *
 * Las posiciones 2-3 son el tipo de comprobante (31/32/33/34/41/43/44/46/47)
 * pero aquí NO se valida contra esa lista — es responsabilidad de la lógica
 * específica de cada flujo (606/607, ya en declaraciones/). Este validador
 * solo valida FORMATO: letra + longitud + solo dígitos en el resto.
 */
export function validarNCF(valor: string): boolean {
  const v = (valor ?? '').trim().toUpperCase();
  return /^E\d{12}$/.test(v) || /^B\d{10}$/.test(v);
}

@ValidatorConstraint({ name: 'IsValidNCF', async: false })
export class IsValidNCFConstraint implements ValidatorConstraintInterface {
  validate(value: string, _args: ValidationArguments): boolean {
    if (!value) return true; // @IsOptional() se encarga de null/undefined
    return validarNCF(value);
  }
  defaultMessage(_args: ValidationArguments): string {
    return 'NCF inválido — debe ser E + 12 dígitos (13 caracteres) o B + 10 dígitos (11 caracteres)';
  }
}

/** Decorador para usar en DTOs: @IsValidNCF() */
export function IsValidNCF(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target:           object.constructor,
      propertyName,
      options:          validationOptions,
      constraints:      [],
      validator:        IsValidNCFConstraint,
    });
  };
}
