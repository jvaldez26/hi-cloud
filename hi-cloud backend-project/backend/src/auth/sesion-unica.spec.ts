import { readFileSync } from 'fs';
import { join } from 'path';
import { UnauthorizedException } from '@nestjs/common';

/**
 * Sesión única — contrato de EMISIÓN y VALIDACIÓN del sessionToken.
 *
 * Contexto: la sesión única estuvo rota en producción sin que nadie lo notara.
 * cambiarEmpresa y cambiarSucursal cargaban el usuario con findOneBy, que no
 * trae `sessionToken` (columna select:false), y emitían un JWT sin el campo.
 * JwtStrategy hacía `if (payload.sessionToken)`, así que ese token se saltaba la
 * validación entera: bastaba cambiar de empresa UNA vez para quedarse sin
 * protección de forma permanente, y en silencio.
 *
 * El primer intento de arreglo revisó los callers de buildToken UNO A UNO y se
 * dejó dos fuera. Por eso este test NO enumera caminos: los DESCUBRE. Cualquier
 * llamada nueva a buildToken que no propague el sessionToken rompe CI sola, sin
 * que nadie tenga que acordarse de añadirle un test.
 */
describe('Sesión única — contrato del sessionToken', () => {
  const rutaAuthService = join(__dirname, 'auth.service.ts');
  const rutaStrategy    = join(__dirname, 'strategies', 'jwt.strategy.ts');
  const authService     = readFileSync(rutaAuthService, 'utf8');
  const strategy        = readFileSync(rutaStrategy, 'utf8');
  const lineas          = authService.split('\n');

  /**
   * Quita comentarios antes de buscar patrones que NO deben existir.
   *
   * Sin esto el test da falsos positivos contra sí mismo: los comentarios de
   * jwt.strategy.ts citan el patrón antiguo `if (payload.sessionToken)` para
   * explicar por qué se cambió, y el regex lo encontraba ahí.
   */
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const strategyCodigo = sinComentarios(strategy);

  /**
   * Formas válidas de garantizar que `user` lleva sessionToken al llegar a
   * buildToken. Si aparece una forma legítima nueva, se añade aquí — que es una
   * decisión consciente, no un olvido.
   */
  const GARANTIAS = [
    /findByIdForAuth\s*\(/,        // carga con addSelect('u.sessionToken')
    /findByEmailForAuth\s*\(/,     // idem, por email (login)
    /\.sessionToken\s*=\s*/,       // asignación explícita tras initNewSession()
  ];

  /** Índice de la línea donde empieza la función que contiene `i`. */
  const inicioDeFuncion = (i: number): number => {
    for (let j = i; j >= 0; j--) {
      // Declaración de método de clase a dos espacios de indentación.
      if (/^ {2}(private |public |protected )?(async )?[a-zA-Z_][\w]*\s*\(/.test(lineas[j])) return j;
    }
    return 0;
  };

  const llamadasABuildToken = (): number[] =>
    lineas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /this\.buildToken\s*\(/.test(l))
      .map(({ i }) => i);

  it('encuentra las llamadas a buildToken (si no, el test no está midiendo nada)', () => {
    // Guarda contra un refactor que renombre buildToken y deje este test
    // pasando en vacío para siempre.
    expect(llamadasABuildToken().length).toBeGreaterThanOrEqual(5);
  });

  it('TODA llamada a buildToken propaga el sessionToken', () => {
    const fallos: string[] = [];

    for (const i of llamadasABuildToken()) {
      const desde   = inicioDeFuncion(i);
      const cuerpo  = lineas.slice(desde, i).join('\n');
      const cubierta = GARANTIAS.some(g => g.test(cuerpo));
      if (!cubierta) {
        fallos.push(
          `  auth.service.ts:${i + 1}  (función que empieza en la línea ${desde + 1})\n` +
          `      ${lineas[i].trim()}`,
        );
      }
    }

    expect(
      fallos.length === 0
        ? ''
        : 'Estas llamadas a buildToken() emiten un JWT que puede salir SIN sessionToken.\n' +
          'Un token así desactiva la sesión única para ese dispositivo, en silencio.\n' +
          'Carga el usuario con usersService.findByIdForAuth() o asígnale el token\n' +
          'desde initNewSession() antes de emitirlo.\n\n' +
          fallos.join('\n'),
    ).toBe('');
  });

  it('buildToken lanza si el usuario no trae sessionToken', () => {
    // Se verifica sobre el fuente: instanciar AuthService arrastraría media
    // aplicación (TypeORM, Redis, colas) para comprobar una guarda de 4 líneas.
    const cuerpo = authService.slice(authService.indexOf('private buildToken'));
    const hasta  = cuerpo.indexOf('\n  }');
    const fn     = cuerpo.slice(0, hasta);

    expect(fn).toMatch(/if\s*\(\s*!user\.sessionToken\s*\)/);
    expect(fn).toMatch(/throw new Error\(/);
    expect(fn).toContain('buildToken llamado sin sessionToken');
    // El throw debe estar ANTES de firmar, no después.
    expect(fn.indexOf('!user.sessionToken')).toBeLessThan(fn.indexOf('jwtService.sign'));
  });

  it('JwtStrategy rechaza un payload sin sessionToken (falla cerrado)', () => {
    // El agujero original era `if (payload.sessionToken) { validar }`: sin el
    // campo, no se validaba nada. Ahora debe ser al revés.
    expect(strategyCodigo).toMatch(/if\s*\(\s*!payload\.sessionToken\s*\)/);
    expect(strategyCodigo).toContain('TOKEN_OBSOLETO');

    // Y la validación NO puede volver a quedar dentro de un `if (payload.sessionToken)`.
    expect(strategyCodigo).not.toMatch(/if\s*\(\s*payload\.sessionToken\s*\)\s*\{/);

    // El rechazo va antes de la comparación con la BD.
    expect(strategyCodigo.indexOf('TOKEN_OBSOLETO'))
      .toBeLessThan(strategyCodigo.indexOf('SESION_DESPLAZADA'));
  });

  it('el guard usa códigos que el frontend sabe tratar', () => {
    // Si alguien renombra un código aquí sin tocar client.ts, el usuario se
    // queda con un 401 crudo en vez del logout limpio con su mensaje.
    const client = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'hi-cloud frontend-project', 'src', 'api', 'client.ts'),
      'utf8',
    );
    for (const codigo of ['SESION_DESPLAZADA', 'TOKEN_OBSOLETO']) {
      expect(strategy).toContain(codigo);
      expect(client).toContain(codigo);
    }
  });

  it('UnauthorizedException sigue siendo el tipo que produce un 401', () => {
    // Ancla el supuesto de todo lo anterior: que estos throws salen como 401.
    expect(new UnauthorizedException('X').getStatus()).toBe(401);
  });
});
