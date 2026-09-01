import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  JWT_EXPIRES_IN_DEFAULT,
  JWT_EXPIRES_IN_DEFAULT_MS,
} from './auth.constants';

/**
 * JWT_EXPIRES_IN — un solo valor, en todas partes.
 *
 * Contexto: este ajuste estuvo definido en CINCO sitios con DOS valores
 * distintos. Los tres del despliegue decían `1d` y los tres del código `15m`.
 * Ganaba el despliegue, así que en producción el access token vivía un día
 * mientras el código afirmaba «access token de corta duración (S-28)».
 *
 * Nadie lo detectó porque cada sitio, leído solo, era coherente consigo mismo.
 *
 * Igual que sesion-unica.spec.ts, este test NO enumera los sitios buenos: busca
 * los malos. Si alguien añade un cuarto default en el código o cambia el compose
 * sin cambiar la constante, CI lo dice sin que nadie se acuerde de este archivo.
 */
describe('JWT_EXPIRES_IN — definición única', () => {
  const raizRepo    = join(__dirname, '..', '..', '..', '..');
  const raizBackend = join(__dirname, '..', '..');

  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('la constante y su versión en ms no se han desincronizado', () => {
    const m = JWT_EXPIRES_IN_DEFAULT.match(/^(\d+)(s|m|h|d)$/);
    expect(m).not.toBeNull();

    const n = parseInt(m![1], 10);
    const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m![2] as 's'|'m'|'h'|'d'];
    expect(n * factor).toBe(JWT_EXPIRES_IN_DEFAULT_MS);
  });

  it('ningún archivo de despliegue fija un valor distinto al de la constante', () => {
    const candidatos = [
      join(raizRepo, '.env.example'),
      join(raizRepo, 'docker-compose.yml'),
      join(raizRepo, 'docker-compose.dev.yml'),
      join(raizBackend, '.env.example'),
    ].filter(existsSync);

    // Si esto falla es que el layout del repo cambió — el test se estaría
    // saltando los archivos que debe vigilar, que es peor que fallar.
    expect(candidatos.length).toBeGreaterThanOrEqual(3);

    const desviados: string[] = [];
    for (const ruta of candidatos) {
      const texto = readFileSync(ruta, 'utf8');
      // Captura tanto `JWT_EXPIRES_IN=15m` como `JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-15m}`
      for (const linea of texto.split('\n')) {
        if (!linea.includes('JWT_EXPIRES_IN')) continue;
        if (linea.trimStart().startsWith('#')) continue;
        const valor = linea.match(/(?::-|=|:\s+)([0-9]+[smhd])\s*\}?\s*$/)?.[1];
        if (valor && valor !== JWT_EXPIRES_IN_DEFAULT) {
          desviados.push(`${ruta}: ${linea.trim()}`);
        }
      }
    }

    expect(desviados).toEqual([]);
  });

  it('el código no repite el default en literales sueltos', () => {
    const fuentes = [
      join(__dirname, 'auth.module.ts'),
      join(__dirname, 'auth.controller.ts'),
      join(__dirname, '..', 'app.module.ts'),
    ];

    const culpables: string[] = [];
    for (const ruta of fuentes) {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
      // Un literal de duración pegado a JWT_EXPIRES_IN es un default duplicado.
      const lineas = codigo.split('\n').filter(l => l.includes('JWT_EXPIRES_IN'));
      for (const linea of lineas) {
        if (/['"`][0-9]+[smhd]['"`]/.test(linea)) culpables.push(`${ruta}: ${linea.trim()}`);
      }
    }

    expect(culpables).toEqual([]);
  });

  it('JWT_REFRESH_EXPIRES_IN no ha vuelto: era un mando desconectado', () => {
    // Se validaba en app.module y no lo leía nadie. Reconectarlo crearía una
    // cuarta duración compitiendo con SESION_HORAS por lo mismo; si algún día
    // hace falta, que sea una decisión consciente y no un revert accidental.
    const src = join(__dirname, '..');
    const appModule = readFileSync(join(src, 'app.module.ts'), 'utf8');
    expect(sinComentarios(appModule)).not.toContain('JWT_REFRESH_EXPIRES_IN');
  });
});
