import { ValidationPipe, BadRequestException, ArgumentMetadata } from '@nestjs/common';
import { RegistrarEntradaDto } from './registrar-entrada.dto';

/**
 * Reproduce el bug real (Centro de Auditoría — Elvia Aquino Lopez, admin,
 * 17/10/2026, POST /inventario/entrada → 400 "costoUnitario must be a
 * number conforming to the specified constraints", al menos 2 intentos).
 *
 * Usa el MISMO ValidationPipe que main.ts (whitelist + transform +
 * enableImplicitConversion) contra el payload tal como lo arma
 * inventarioApi.entrada() — no solo class-validator.validate() suelto
 * (ver cantidad-maxima.spec.ts) — para que un cambio futuro en esa
 * configuración global no deje pasar sin aviso un caso que en producción
 * sí rompe.
 *
 * Causa real: costoPromedio vive en BD con 4 decimales (AVCO,
 * numeric(14,4)) pero este DTO solo acepta 2 — InventarioPage.tsx
 * pre-llenaba "Costo unitario" con ese valor sin redondear
 * (costoInicialEntrada.ts, ya corregido).
 */
const pipe = new ValidationPipe({
  whitelist:            true,
  forbidNonWhitelisted: true,
  transform:             true,
  transformOptions:      { enableImplicitConversion: true },
});

const metadata: ArgumentMetadata = { type: 'body', metatype: RegistrarEntradaDto };

async function validarPayload(body: Record<string, unknown>) {
  try {
    await pipe.transform(body, metadata);
    return { ok: true as const, mensajes: undefined as string[] | undefined };
  } catch (e) {
    const respuesta = (e as BadRequestException).getResponse() as any;
    const mensajes  = Array.isArray(respuesta?.message) ? respuesta.message : [respuesta?.message];
    return { ok: false as const, mensajes };
  }
}

describe('RegistrarEntradaDto — contrato con el payload real del formulario (ValidationPipe completo)', () => {
  const base = { productoId: 7, cantidad: 10, motivo: 'Compra al proveedor' };

  it('sin costoUnitario (campo opcional, el usuario lo dejó vacío): válido', async () => {
    expect((await validarPayload({ ...base })).ok).toBe(true);
  });

  it('con costoUnitario de 2 decimales (lo normal — InputNumber precision=2): válido', async () => {
    expect((await validarPayload({ ...base, costoUnitario: 95.58 })).ok).toBe(true);
  });

  it('con costoUnitario entero (sin decimales): válido', async () => {
    expect((await validarPayload({ ...base, costoUnitario: 100 })).ok).toBe(true);
  });

  it('BUG REAL: costoUnitario con 4 decimales (costoPromedio AVCO prellenado sin redondear) — así llegaba antes del fix', async () => {
    const r = await validarPayload({ ...base, costoUnitario: 95.5833 });
    expect(r.ok).toBe(false);
    expect(r.mensajes?.[0]).toContain('costoUnitario must be a number conforming to the specified constraints');
  });

  it('costoUnitario con coma decimal en vez de punto: rechazado con un 400 claro, no un NaN silencioso', async () => {
    const r = await validarPayload({ ...base, costoUnitario: '95,50' });
    expect(r.ok).toBe(false);
  });

  it('costoUnitario=0 explícito: válido — se acepta, se ignora río abajo (no toca el promedio)', async () => {
    expect((await validarPayload({ ...base, costoUnitario: 0 })).ok).toBe(true);
  });

  it('motivo y referencia ausentes (ambos opcionales): válido', async () => {
    expect((await validarPayload({ productoId: 7, cantidad: 10 })).ok).toBe(true);
  });

  it('cantidad con 4 decimales (el máximo que admite el DTO): válido', async () => {
    expect((await validarPayload({ ...base, cantidad: 10.1234 })).ok).toBe(true);
  });
});
