import { getMetadataArgsStorage } from 'typeorm';
import { User } from './users.entity';

/**
 * Contrato de la columna User.sessionToken.
 *
 * JwtStrategy.validate() compara `payload.sessionToken` contra el valor que
 * findById() trae en la entidad, en vez de hacer un segundo SELECT a `users`
 * por cada request autenticado del ERP.
 *
 * Eso solo funciona mientras la columna se seleccione por defecto. Si alguien
 * le añade `select: false`, `user.sessionToken` llegaría `undefined` → dbToken
 * null → `!dbToken` lanza UnauthorizedException. El guard FALLA CERRADO: no
 * deja pasar sesiones viejas, echa a TODO el mundo con 401 en el primer request.
 * Ruidoso, sí, pero un incidente de producción en toda regla.
 *
 * Este test es la alarma temprana: si la columna cambia de configuración, CI
 * falla aquí y quien lo cambie ve exactamente qué se rompe y dónde, en vez de
 * enterarse cuando nadie pueda entrar al sistema.
 */
describe('User entity — contrato de sessionToken', () => {
  const columnaSessionToken = () =>
    getMetadataArgsStorage().columns.find(
      c => c.target === User && c.propertyName === 'sessionToken',
    );

  it('sessionToken existe como columna de la entidad User', () => {
    expect(columnaSessionToken()).toBeDefined();
  });

  it('sessionToken NO tiene select:false — JwtStrategy depende de que findById la traiga', () => {
    const col = columnaSessionToken();
    expect(col!.options.select).not.toBe(false);
  });

  it('las columnas realmente sensibles SÍ siguen con select:false', () => {
    // Guarda de contraste: prueba que el test anterior mide algo real y que
    // nadie "arregló" un fallo quitando select:false de todo el modelo.
    const ocultas = ['password', 'twoFactorSecret', 'googleAccessToken'];
    for (const nombre of ocultas) {
      const col = getMetadataArgsStorage().columns.find(
        c => c.target === User && c.propertyName === nombre,
      );
      expect(col).toBeDefined();
      expect(col!.options.select).toBe(false);
    }
  });
});
