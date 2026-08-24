import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as forge from 'node-forge';

/**
 * Valida un certificado digital PFX/P12 EN MEMORIA y lo descarta.
 *
 * ── EL CERTIFICADO NO SE GUARDA. NUNCA. ────────────────────────────────────
 *
 * Ni en S3, ni en la base de datos, ni en un archivo temporal. Se recibe, se
 * abre para comprobar que es válido, se extraen tres metadatos no sensibles y
 * el buffer se sobrescribe antes de soltarlo.
 *
 * El PFX es la identidad fiscal de la empresa: con él se puede firmar cualquier
 * comprobante en su nombre. Guardar el de decenas de empresas solo tendría
 * sentido si algo lo necesitara después, y nada lo necesita — cuando llega el
 * momento de activar, el certificado se le pide al cliente por el canal que
 * corresponda y se carga en MSeller a mano.
 *
 * La clave tampoco se guarda. Ni cifrada. No hace falta para nada.
 *
 * Se usa node-forge porque parsea PKCS#12 en JavaScript puro, desde un Buffer.
 * La alternativa —invocar a OpenSSL— escribiría el PFX a disco, que es
 * exactamente lo que hay que evitar.
 */

/** Lo único que sobrevive a la validación. Nada de esto es sensible. */
export interface MetadatosCertificado {
  /** Se abrió con la clave Y no está vencido. Es lo que decide el precio. */
  valido: boolean;
  /** Fin de vigencia, para que el cliente y Jean sepan qué se está comprando. */
  venceEn: Date | null;
  /**
   * CN del sujeto. INFORMATIVO — no se usa para verificar que el certificado
   * pertenece a la empresa. El formato del CN varía entre emisores y validar
   * contra él acabaría rechazando certificados perfectamente buenos. Que lo vea
   * un humano y decida.
   */
  titular: string | null;
  /** Vencido pero por lo demás legible: se distingue de "no se pudo abrir". */
  vencido: boolean;
}

@Injectable()
export class CertificadoPfxService {
  private readonly logger = new Logger(CertificadoPfxService.name);

  /**
   * Abre el PFX, saca los metadatos y borra el rastro.
   *
   * Lanza BadRequestException con mensajes propios. NUNCA propaga el error de
   * node-forge tal cual: sus excepciones pueden arrastrar fragmentos del
   * contenido, y de ahí van al log y a Sentry.
   */
  validar(pfx: Buffer, clave: string): MetadatosCertificado {
    let claveMutable = clave;
    try {
      return this.extraerMetadatos(pfx, clave);
    } finally {
      // Se sobrescribe pase lo que pase, también si hubo excepción.
      //
      // Este proceso sirve a todas las empresas: un volcado de memoria tras un
      // crash acabaría en Sentry con el PFX dentro. El buffer es nuestro (lo
      // creó multer con memoryStorage), así que borrarlo es seguro.
      pfx.fill(0);
      claveMutable = '\0'.repeat(claveMutable.length);
      void claveMutable;   // que el compilador no elimine la asignación
    }
  }

  private extraerMetadatos(pfx: Buffer, clave: string): MetadatosCertificado {
    if (!pfx?.length) {
      throw new BadRequestException('El archivo del certificado llegó vacío.');
    }
    if (!clave) {
      throw new BadRequestException('Falta la clave del certificado.');
    }

    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      // 'binary' es lo que espera forge para DER. El PFX no sale de este ámbito.
      const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
      p12 = forge.pkcs12.pkcs12FromAsn1(asn1, clave);
    } catch (e: any) {
      // Se traga el error original A PROPÓSITO. node-forge puede incluir en el
      // mensaje trozos del ASN.1 que está parseando; ese texto acabaría en el
      // log y en Sentry. Solo se registra el tipo, sin contenido.
      this.logger.warn(`[Certificado] No se pudo abrir el PFX: ${e?.name ?? 'Error'}`);
      throw new BadRequestException(
        'No se pudo abrir el certificado con esa clave. Verifica que el archivo sea un ' +
        '.pfx o .p12 válido y que la contraseña sea la correcta.',
      );
    }

    const cert = this.primerCertificado(p12);
    if (!cert) {
      throw new BadRequestException(
        'El archivo se abrió pero no contiene ningún certificado. ' +
        'Verifica que sea el archivo que te entregó la entidad certificadora.',
      );
    }

    const venceEn = cert.validity?.notAfter ?? null;
    const titular = this.leerCN(cert);

    // Un PFX vencido es un archivo perfectamente válido que NO sirve para
    // facturar. Cobrar la tarifa reducida por él sería venderle al cliente algo
    // que no funciona: cuenta como "sin certificado".
    const vencido = !!venceEn && venceEn.getTime() < Date.now();

    return { valido: !vencido, venceEn, titular, vencido };
  }

  /** El primer certificado que aparezca en los bags. */
  private primerCertificado(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.Certificate | null {
    try {
      const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const lista = bags[forge.pki.oids.certBag] ?? [];
      for (const bag of lista) {
        if (bag?.cert) return bag.cert;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** CN del sujeto, si lo expone. Informativo — ver MetadatosCertificado. */
  private leerCN(cert: forge.pki.Certificate): string | null {
    try {
      const cn = cert.subject?.getField?.('CN');
      const valor = String(cn?.value ?? '').trim();
      return valor.length ? valor.substring(0, 200) : null;
    } catch {
      return null;
    }
  }
}
