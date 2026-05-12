import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

const ALGO      = 'aes-256-gcm';
const IV_LEN    = 12;   // 96 bits — recomendado para GCM
const TAG_LEN   = 16;   // 128 bits auth tag

/**
 * Cifrado simétrico AES-256-GCM para API keys y contraseñas en reposo.
 *
 * Formato almacenado: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * Clave: variable de entorno ECF_ENCRYPTION_KEY (32 bytes en base64).
 *
 * Generar clave:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
@Injectable()
export class EcfEncryptionService {
  private readonly logger = new Logger(EcfEncryptionService.name);
  private readonly key: Buffer;

  constructor(private config: ConfigService) {
    const raw = this.config.get<string>('ECF_ENCRYPTION_KEY');
    if (!raw) {
      this.logger.warn(
        'ECF_ENCRYPTION_KEY no configurada — el cifrado de credenciales MSeller NO funcionará.',
      );
      this.key = Buffer.alloc(32); // clave vacía como fallback (NO usar en producción)
    } else {
      this.key = Buffer.from(raw, 'base64');
      if (this.key.length !== 32) {
        throw new InternalServerErrorException(
          `ECF_ENCRYPTION_KEY debe ser exactamente 32 bytes en base64 (actual: ${this.key.length} bytes)`,
        );
      }
    }
  }

  /** Cifra un string plano. Devuelve "<iv>:<authTag>:<ciphertext>" en hex. */
  encrypt(plaintext: string): string {
    const iv     = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv, { authTagLength: TAG_LEN });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Descifra un string en el formato "<iv>:<authTag>:<ciphertext>" hex.
   * Lanza error si el formato es inválido o la autenticación falla.
   */
  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException('Formato de dato cifrado inválido.');
    }
    const [ivHex, tagHex, dataHex] = parts;
    const iv      = Buffer.from(ivHex,  'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const data    = Buffer.from(dataHex,'hex');

    const decipher = createDecipheriv(ALGO, this.key, iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Error al descifrar credencial — posible corrupción o clave incorrecta.',
      );
    }
  }

  /** Cifra solo si el valor no está vacío; devuelve undefined si está vacío. */
  encryptOptional(value: string | undefined | null): string | undefined {
    if (!value) return undefined;
    return this.encrypt(value);
  }

  decryptOptional(value: string | undefined | null): string | undefined {
    if (!value) return undefined;
    return this.decrypt(value);
  }
}
