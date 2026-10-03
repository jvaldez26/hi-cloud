import { Injectable } from '@nestjs/common';

export type ValidadorOrigenFactura = (origenId: number, empresaId: number) => Promise<void>;

/**
 * Registro de validadores por `origenTipo` de Factura.origenId — permite que
 * un módulo externo (Car Wash, y cualquier otro add-on que cobre vía el POS)
 * valide su propio origen (que exista, que pertenezca a la empresa, que no
 * esté ya cerrado) SIN que FacturasService conozca ese módulo. Si no hay
 * validador registrado para un `origenTipo`, se deja pasar (forward
 * compatible con orígenes que todavía no registran validación).
 */
@Injectable()
export class OrigenFacturaValidadoresRegistry {
  private readonly validadores = new Map<string, ValidadorOrigenFactura>();

  registrar(origenTipo: string, validador: ValidadorOrigenFactura): void {
    this.validadores.set(origenTipo, validador);
  }

  async validar(origenTipo: string | undefined, origenId: number | undefined, empresaId: number): Promise<void> {
    if (!origenTipo || origenId == null) return;
    const validador = this.validadores.get(origenTipo);
    if (validador) await validador(origenId, empresaId);
  }
}
