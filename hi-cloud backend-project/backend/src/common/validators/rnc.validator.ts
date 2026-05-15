import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';

/** Valida el dígito verificador de RNC/Cédula dominicana (Módulo 11). */
export function validarRNC(rnc: string): boolean {
  const digits = rnc.replace(/\D/g, '');

  if (digits.length === 9) {
    // RNC jurídico — pesos: 7,9,8,6,7,5,4,3,2
    const pesos = [7, 9, 8, 6, 7, 5, 4, 3, 2];
    const suma  = digits.slice(0, 8).split('').reduce((acc, d, i) => acc + parseInt(d) * pesos[i], 0);
    const mod   = suma % 11;
    const verif = mod < 2 ? mod : 11 - mod;
    return verif === parseInt(digits[8]);
  }

  if (digits.length === 11) {
    // Cédula personal — Luhn mod 10 estilo dominicano
    const pesos = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
    const suma  = digits.slice(0, 10).split('').reduce((acc, d, i) => {
      const prod = parseInt(d) * pesos[i];
      return acc + (prod > 9 ? prod - 9 : prod);
    }, 0);
    const verif = (10 - (suma % 10)) % 10;
    return verif === parseInt(digits[10]);
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
    return 'El RNC/Cédula no tiene un dígito verificador válido';
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
