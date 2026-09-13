/**
 * AuthService.resendVerificationEmail — el rate limit de 5 minutos nunca
 * actuaba: el `select` explícito de la consulta no incluía
 * `emailVerificationExpires` (select:false en la entidad), así que
 * `(user as any).emailVerificationExpires` era SIEMPRE undefined y
 * `tokenReciente` siempre falso — cualquiera podía pedir reenvío en cada
 * request que el @Throttle de la ruta (3/hora por IP) dejara pasar.
 *
 * Detectado al tocar este método para aceptar userId además de email (login
 * por username nunca tiene el correo real del usuario — ver login() paso 6).
 */
import { AuthService } from './auth.service';

function makeAuthService(usuario: any) {
  const userRepository = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.id != null)    return usuario?.id === where.id ? usuario : null;
      if (where.email != null) return usuario ? usuario : null; // ILike — el fake no necesita replicarlo
      return null;
    }),
  };

  const noop = {} as any;
  const svc = new AuthService(
    noop, noop, noop, noop, noop, noop, noop,
    userRepository, noop, noop, noop, noop, noop, noop, noop,
  );
  (svc as any).sendVerificationEmail = jest.fn().mockResolvedValue(undefined);

  return { svc, userRepository };
}

const MENSAJE_NEUTRO = 'Si el correo existe y no está verificado, recibirás un nuevo enlace.';

describe('AuthService.resendVerificationEmail — rate limit de 5 minutos', () => {
  it('reenvía si nunca se había pedido antes (sin token previo)', async () => {
    const usuario = { id: 1, nombre: 'Carlos', email: 'carlos@x.com', emailVerifiedAt: null, emailVerificationExpires: null };
    const { svc } = makeAuthService(usuario);

    await svc.resendVerificationEmail({ email: 'carlos@x.com' });

    expect((svc as any).sendVerificationEmail).toHaveBeenCalledWith(1, 'carlos@x.com', 'Carlos');
  });

  it('NO reenvía mientras el token anterior siga vigente (el bug hacía que esto nunca se cumpliera)', async () => {
    const expiraEn24h = new Date(Date.now() + 24 * 3_600_000); // token recién emitido, expira en 24h — sigue vivo
    const usuario = { id: 1, nombre: 'Carlos', email: 'carlos@x.com', emailVerifiedAt: null, emailVerificationExpires: expiraEn24h };
    const { svc } = makeAuthService(usuario);

    await svc.resendVerificationEmail({ email: 'carlos@x.com' });

    expect((svc as any).sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('SÍ reenvía si el token anterior ya expiró hace más de 5 minutos', async () => {
    // La comparación real es existingExpires > (ahora - 5min): un token
    // vivo (expiresAt en el futuro) SIEMPRE cae de ese lado y bloquea el
    // reenvío hasta que ya haya expirado hace rato — no es "emitido hace
    // menos de 5 min", es "cuya expiración quedó a más de 5 min en el
    // pasado". Con el select roto esto no se podía distinguir de ningún caso.
    const expiroHaceRato = new Date(Date.now() - 10 * 60_000);
    const usuario = { id: 1, nombre: 'Carlos', email: 'carlos@x.com', emailVerifiedAt: null, emailVerificationExpires: expiroHaceRato };
    const { svc } = makeAuthService(usuario);

    await svc.resendVerificationEmail({ email: 'carlos@x.com' });

    expect((svc as any).sendVerificationEmail).toHaveBeenCalled();
  });

  it('funciona igual por userId (camino usado por el login con username)', async () => {
    const usuario = { id: 7, nombre: 'Ana', email: 'ana@x.com', emailVerifiedAt: null, emailVerificationExpires: null };
    const { svc, userRepository } = makeAuthService(usuario);

    await svc.resendVerificationEmail({ userId: 7 });

    expect(userRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, isActive: true },
        select: expect.arrayContaining(['emailVerificationExpires']),
      }),
    );
    expect((svc as any).sendVerificationEmail).toHaveBeenCalledWith(7, 'ana@x.com', 'Ana');
  });

  it('respuesta neutra si el correo ya está verificado — no revela nada distinto', async () => {
    const usuario = { id: 1, nombre: 'Carlos', email: 'carlos@x.com', emailVerifiedAt: new Date(), emailVerificationExpires: null };
    const { svc } = makeAuthService(usuario);

    await expect(svc.resendVerificationEmail({ email: 'carlos@x.com' })).resolves.toEqual({ message: MENSAJE_NEUTRO });
    expect((svc as any).sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('respuesta neutra si la cuenta no existe — mismo mensaje, no hay forma de distinguir', async () => {
    const { svc } = makeAuthService(null);

    await expect(svc.resendVerificationEmail({ email: 'nadie@existe.com' })).resolves.toEqual({ message: MENSAJE_NEUTRO });
    expect((svc as any).sendVerificationEmail).not.toHaveBeenCalled();
  });
});
