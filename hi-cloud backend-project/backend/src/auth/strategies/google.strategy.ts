import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackURL:  process.env.GOOGLE_CALLBACK_URL  ?? 'https://hicloudrd.com/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email      = profile.emails?.[0]?.value;
      const googleId   = profile.id;
      const nombre     = profile.displayName ?? email;

      if (!email) return done(new Error('Google no proporcionó email'), undefined);

      const user = await this.authService.findOrCreateFromGoogle({
        email, googleId, nombre,
      });

      done(null, user);
    } catch (err: any) {
      // Pasar el código de error como objeto-usuario para que el controller
      // pueda hacer redirect. Si pasamos el error a done() el AuthGuard retorna
      // JSON 401 antes de que el controller pueda interceptarlo.
      const code = err?.message ?? 'google_failed';
      done(null, { _googleError: code } as any);
    }
  }
}
