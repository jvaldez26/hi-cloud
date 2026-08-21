import { getMetadataArgsStorage } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { User } from './users.entity';

/**
 * Contrato de la columna User.sessionToken.
 *
 * sessionToken es el secreto que sostiene la sesión única: si el valor del JWT
 * no coincide con el de la BD, JwtStrategy lanza SESION_DESPLAZADA. Por eso
 * tiene DOS requisitos que se contradicen a primera vista, y este test fija los
 * dos para que nadie arregle uno rompiendo el otro:
 *
 *  1. select:false — no debe salir en respuestas HTTP. Sin esto, /auth/me y
 *     GET /users/:id lo serializaban y el frontend lo guardaba en localStorage
 *     ('auth_user'), legible por cualquier XSS.
 *
 *  2. Quien lo necesita debe pedirlo con addSelect. Son exactamente dos sitios:
 *     JwtStrategy (validar la sesión) y buildAccessTokenForUser (propagarlo al
 *     JWT renovado en /auth/refresh). Si el segundo lo perdiera, el token
 *     renovado saldría sin sessionToken y la sesión única quedaría desactivada
 *     EN SILENCIO para toda sesión ya refrescada.
 */
describe('User entity — contrato de sessionToken', () => {
  const columna = (nombre: string) =>
    getMetadataArgsStorage().columns.find(
      c => c.target === User && c.propertyName === nombre,
    );

  it('sessionToken existe como columna de la entidad User', () => {
    expect(columna('sessionToken')).toBeDefined();
  });

  it('sessionToken tiene select:false — no debe viajar al cliente', () => {
    expect(columna('sessionToken')!.options.select).toBe(false);
  });

  it('las demás columnas sensibles siguen con select:false', () => {
    // Guarda de contraste: si alguien "arregla" un fallo quitando select:false
    // del modelo entero, esto lo caza.
    for (const nombre of ['password', 'twoFactorSecret', 'googleAccessToken']) {
      expect(columna(nombre)).toBeDefined();
      expect(columna(nombre)!.options.select).toBe(false);
    }
  });

  // ── Los dos consumidores legítimos deben pedirlo explícitamente ────────────
  // Se leen los fuentes en vez de instanciar Nest: este test debe correr en CI
  // sin base de datos ni contenedor de DI.
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');

  it('findByIdForAuth hace addSelect de sessionToken', () => {
    const src = leer('users.service.ts');
    const cuerpo = src.slice(src.indexOf('async findByIdForAuth'));
    expect(cuerpo).toMatch(/addSelect\(\s*['"]u\.sessionToken['"]\s*\)/);
  });

  it('JwtStrategy usa findByIdForAuth, no findById', () => {
    const src = leer('..', 'auth', 'strategies', 'jwt.strategy.ts');
    expect(src).toContain('findByIdForAuth(payload.sub)');
    expect(src).not.toContain('usersService.findById(payload.sub)');
  });

  it('JwtStrategy borra sessionToken antes de devolver el user', () => {
    // Lo que devuelve validate() acaba en request.user y en la respuesta de
    // cualquier endpoint que haga `return @GetUser() user`.
    const src = leer('..', 'auth', 'strategies', 'jwt.strategy.ts');
    expect(src).toMatch(/delete\s*\(user as any\)\.sessionToken/);
  });

  it('buildAccessTokenForUser usa findByIdForAuth — /auth/refresh conserva la sesión única', () => {
    const src = leer('..', 'auth', 'auth.service.ts');
    const cuerpo = src.slice(src.indexOf('async buildAccessTokenForUser'));
    const fin = cuerpo.indexOf('\n  }');
    expect(cuerpo.slice(0, fin)).toContain('findByIdForAuth(userId)');
  });
});
