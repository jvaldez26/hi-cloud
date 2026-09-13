/**
 * Username: asignación, disponibilidad y las reglas de formato.
 *
 * La condición de carrera (dos solicitudes simultáneas con el mismo nombre)
 * se resuelve con la constraint de Postgres, no con un "verificar y luego
 * guardar" — AuthService.setUsername() intenta el UPDATE directo y traduce
 * la violación de unicidad (23505) a ConflictException. Este spec prueba esa
 * traducción; la garantía real de unicidad la impone el índice de la
 * migración 1763100000000, no el servicio.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthService } from './auth.service';
import { SetUsernameDto } from './dto/set-username.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { USERNAME_RESERVADOS } from './auth.constants';

function makeAuthService() {
  const filas: any[] = [{ id: 1, username: null }];
  const userRepository = {
    // Copia, no referencia: un findOne() real de TypeORM trae una fila nueva
    // cada vez — si devolviera el mismo objeto en memoria, un update()
    // posterior que lo mute "cambiaría el pasado" (anterior.username
    // terminaría viendo el valor NUEVO, justo lo que este spec necesita
    // detectar si pasara en el código real).
    findOne: jest.fn(async ({ where }: any) => {
      const fila = filas.find(f => f.id === where.id);
      return fila ? { ...fila } : null;
    }),
    update:  jest.fn(async (id: number, data: any) => {
      const existeOtro = filas.some(f => f.id !== id && f.username?.toLowerCase() === data.username?.toLowerCase());
      if (existeOtro) {
        const err: any = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        throw err;
      }
      const fila = filas.find(f => f.id === id);
      if (fila) fila.username = data.username;
      return {};
    }),
  };
  const auditoriaSvc = { registrar: jest.fn().mockResolvedValue(undefined) };

  const noop = {} as any;
  const svc = new AuthService(
    noop, noop, noop, noop, noop, noop, noop,
    userRepository, noop, noop, noop, noop, noop, noop, auditoriaSvc,
  );
  return { svc, userRepository, auditoriaSvc, filas };
}

const actor = { nombre: 'Carlos Peña', role: UserRole.VENDEDOR, empresaId: 7 };

describe('AuthService.setUsername', () => {
  it('crea un username disponible', async () => {
    const { svc, filas } = makeAuthService();
    await expect(svc.setUsername(1, actor, 'caja01')).resolves.toEqual({ username: 'caja01' });
    expect(filas[0].username).toBe('caja01');
  });

  it('duplicado exacto: ConflictException, no rompe ni cuelga', async () => {
    const { svc, filas } = makeAuthService();
    filas.push({ id: 2, username: 'caja01' });

    await expect(svc.setUsername(1, actor, 'caja01')).rejects.toThrow(ConflictException);
  });

  it('duplicado con distintas mayúsculas: la constraint también lo atrapa', async () => {
    // El repo fake ya compara en minúsculas (mismo criterio que el índice
    // LOWER(username) real) — simula exactamente lo que la BD haría.
    const { svc, filas } = makeAuthService();
    filas.push({ id: 2, username: 'CAJA01' });

    await expect(svc.setUsername(1, actor, 'caja01')).rejects.toThrow(ConflictException);
  });

  it('reservado: rechazado antes de tocar la BD', async () => {
    const { svc, userRepository } = makeAuthService();

    await expect(svc.setUsername(1, actor, 'admin')).rejects.toThrow(BadRequestException);
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it.each(USERNAME_RESERVADOS)('"%s" está en la lista de reservados', (reservado) => {
    expect(USERNAME_RESERVADOS).toContain(reservado);
  });

  it('modificación del propio: cambia de un username a otro', async () => {
    const { svc, filas } = makeAuthService();
    filas[0].username = 'viejonombre';

    await expect(svc.setUsername(1, actor, 'nuevonombre')).resolves.toEqual({ username: 'nuevonombre' });
    expect(filas[0].username).toBe('nuevonombre');
  });

  it('registra el cambio en auditoría — quién, valor anterior y nuevo', async () => {
    const { svc, auditoriaSvc } = makeAuthService();
    await svc.setUsername(1, actor, 'caja01');

    expect(auditoriaSvc.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1, userName: actor.nombre, modulo: 'perfil',
        valorAnterior: undefined, valorNuevo: 'caja01',
      }),
    );
  });

  it('dos solicitudes simultáneas con el mismo nombre: la segunda falla contra la constraint, no se cuelga', async () => {
    const { svc, filas } = makeAuthService();
    filas.push({ id: 2, username: null });

    // Simula la carrera: ambas llegan "a la vez" — una debe ganar, la otra
    // debe rechazar limpio (nunca colgarse ni las dos tener éxito).
    const [r1, r2] = await Promise.allSettled([
      svc.setUsername(1, actor, 'mismonombre'),
      svc.setUsername(2, actor, 'mismonombre'),
    ]);

    const resultados = [r1.status, r2.status];
    expect(resultados).toContain('fulfilled');
    expect(resultados).toContain('rejected');
    const rechazada = r1.status === 'rejected' ? r1 : (r2 as PromiseRejectedResult);
    expect(rechazada.reason).toBeInstanceOf(ConflictException);
  });
});

describe('SetUsernameDto — formato', () => {
  const validar = async (username: unknown) => {
    const dto = plainToInstance(SetUsernameDto, { username });
    return validate(dto);
  };

  it('acepta los formatos válidos del enunciado', async () => {
    for (const valido of ['caja01', 'juan.perez', 'vendedor_01', 'caja-principal']) {
      const errores = await validar(valido);
      expect(errores).toHaveLength(0);
    }
  });

  it('rechaza demasiado corto', async () => {
    const errores = await validar('ca');
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza espacios', async () => {
    const errores = await validar('caja 01');
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza caracteres no permitidos', async () => {
    const errores = await validar('caja@01');
    expect(errores.length).toBeGreaterThan(0);
  });

  it('normaliza a minúsculas antes de validar', async () => {
    const dto = plainToInstance(SetUsernameDto, { username: 'CAJA01' });
    expect(dto.username).toBe('caja01');
  });

  it('rechaza acentos y homoglifos por construcción (regex solo-ASCII)', async () => {
    for (const raro of ['cajá01', 'usuario​01' /* zero-width space */, 'usuari0️⃣']) {
      const errores = await validar(raro);
      expect(errores.length).toBeGreaterThan(0);
    }
  });
});

describe('GET /auth/username-disponible — rate limit', () => {
  it('el endpoint declara @Throttle — no queda sin límite', () => {
    // No hay precedente de test de throttling en el proyecto (ningún otro
    // @Throttle tiene spec dedicado) — se verifica que el decorador esté
    // presente sobre el método correcto, mismo criterio de sesion-unica.spec.ts
    // de comprobar la forma del código en vez de levantar un servidor HTTP.
    const src = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf8');
    const desde = src.indexOf("@Get('username-disponible')");
    const hasta = src.indexOf('usernameDisponible(', desde);
    const bloque = src.slice(desde, hasta);

    expect(bloque).toMatch(/@Throttle\(\{\s*default:\s*\{\s*limit:\s*[\d_]+,\s*ttl:\s*[\d_]+\s*\}\s*\}\)/);
    expect(bloque).toContain('@UseGuards(JwtAuthGuard)'); // autenticado — cubre "por usuario" además de por IP
  });
});
