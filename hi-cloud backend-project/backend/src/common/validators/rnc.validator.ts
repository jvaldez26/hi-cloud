import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Valida formato de RNC/Cédula dominicana.
 *
 * No se valida dígito verificador: la DGII no publica el algoritmo oficial
 * y existen inconsistencias entre RNCs de distintas épocas. El único validador
 * 100% confiable es consultar directamente la API de DGII.
 *
 * Reglas de formato:
 *   - RNC jurídico (9 dígitos): primer dígito debe ser 1, 4 o 5
 *   - Cédula personal (11 dígitos): no puede ser todo ceros
 */
export function validarRNC(rnc: string): boolean {
  const digits = rnc.replace(/\D/g, '');

  if (digits.length === 9) {
    return ['1', '4', '5'].includes(digits[0]);
  }

  if (digits.length === 11) {
    return digits !== '00000000000';
  }

  return false;
}

@ValidatorConstraint({ name: 'IsValidRNC', async: false })
export class IsValidRNCConstraint implements ValidatorConstraintInterface {
  validate(value: string, _args: ValidationArguments): boolean {
    if (!value) return true; // @IsOptional() se encarga de null/undefined
    return validarRNC(value);
  }
  defaultMessage(_args: ValidationArguments): string {
    return 'El RNC debe tener 9 dígitos (empresa) u 11 dígitos (cédula)';
  }
}

/** Decorador para usar en DTOs: @IsValidRNC() */
export function IsValidRNC(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target:           object.constructor,
      propertyName,
      options:          validationOptions,
      constraints:      [],
      validator:        IsValidRNCConstraint,
    });
  };
}
