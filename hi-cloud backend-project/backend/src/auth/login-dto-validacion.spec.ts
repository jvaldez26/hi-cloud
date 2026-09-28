import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './dto/login.dto';

/**
 * Valida contra el DTO REAL (import directo de login.dto.ts, no una copia)
 * con las MISMAS opciones que el ValidationPipe global de main.ts
 * (whitelist + forbidNonWhitelisted). Existe porque un test que simula la
 * respuesta del backend no habría detectado esto: el modal de reingreso del
 * POS mandaba `{ email, password }`, pero el campo real es `identificador`
 * (renombrado hace tiempo — ver el comentario en login.dto.ts) y
 * forbidNonWhitelisted lo rechazaba en producción con 400 "property email
 * should not exist" — un cajero con la contraseña correcta no podía
 * desbloquear. Cualquier otro call site que cometa el mismo error de nombre
 * de campo lo atrapa aquí, sin necesidad de levantar el servidor.
 */
const OPCIONES_REALES = { whitelist: true, forbidNonWhitelisted: true };

describe('LoginDto — validación real (main.ts ValidationPipe)', () => {
  it('RECHAZA "email" — el bug real: el campo se llama "identificador"', async () => {
    const errores = await validate(
      plainToInstance(LoginDto, { email: 'cajero@empresa.com', password: 'secreta123' }),
      OPCIONES_REALES,
    );
    expect(errores.length).toBeGreaterThan(0);
    expect(errores.some(e => e.property === 'email')).toBe(true);
  });

  it('ACEPTA "identificador" — el campo real que espera el endpoint', async () => {
    const errores = await validate(
      plainToInstance(LoginDto, { identificador: 'cajero@empresa.com', password: 'secreta123' }),
      OPCIONES_REALES,
    );
    expect(errores).toHaveLength(0);
  });

  it('identificador acepta también un username (no exige formato de correo)', async () => {
    const errores = await validate(
      plainToInstance(LoginDto, { identificador: 'caja01', password: 'secreta123' }),
      OPCIONES_REALES,
    );
    expect(errores).toHaveLength(0);
  });

  it('rechaza sin password', async () => {
    const errores = await validate(
      plainToInstance(LoginDto, { identificador: 'cajero@empresa.com' }),
      OPCIONES_REALES,
    );
    expect(errores.some(e => e.property === 'password')).toBe(true);
  });

  it('forceLogin es opcional y, si viene, debe ser boolean', async () => {
    const sinForceLogin = await validate(
      plainToInstance(LoginDto, { identificador: 'x@x.com', password: 'y' }),
      OPCIONES_REALES,
    );
    expect(sinForceLogin).toHaveLength(0);

    const conForceLoginValido = await validate(
      plainToInstance(LoginDto, { identificador: 'x@x.com', password: 'y', forceLogin: true }),
      OPCIONES_REALES,
    );
    expect(conForceLoginValido).toHaveLength(0);

    const conForceLoginInvalido = await validate(
      plainToInstance(LoginDto, { identificador: 'x@x.com', password: 'y', forceLogin: 'si' }),
      OPCIONES_REALES,
    );
    expect(conForceLoginInvalido.some(e => e.property === 'forceLogin')).toBe(true);
  });
});
