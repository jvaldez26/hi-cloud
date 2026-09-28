import sharp from 'sharp';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SoporteAdjuntosService, MAX_ADJUNTOS_POR_TICKET, MAX_BYTES_POR_ADJUNTO } from './soporte-adjuntos.service';

/**
 * SoporteAdjuntosService — reglas de seguridad para imágenes adjuntas a un
 * ticket de soporte (ver soporte-tickets.md / spec del feature):
 *   - El tipo se valida por el CONTENIDO real (magic bytes), nunca por la
 *     extensión ni por el Content-Type declarado.
 *   - Máximo 5 archivos por ticket, 5 MB cada uno — reforzado en backend,
 *     no solo en frontend.
 *   - El re-procesado con sharp descarta TODO metadato EXIF (GPS incluido).
 *   - Nunca se persiste una URL de S3 — solo la key; la URL se firma
 *     on-demand con TTL corto.
 */

function fakeRepo() {
  let seq = 1;
  const filas: any[] = [];
  return {
    create: (data: any) => ({ id: undefined, isActive: true, ...data }),
    save: async (entity: any) => {
      const guardada = { ...entity, id: entity.id ?? seq++ };
      filas.push(guardada);
      return guardada;
    },
    find: async ({ where }: any) => filas.filter(f => f.ticketId === where.ticketId && f.isActive === where.isActive),
    findOne: async ({ where }: any) =>
      filas.find(f => f.id === where.id && f.ticketId === where.ticketId && f.isActive === where.isActive) ?? null,
    filas,
  };
}

function fakeS3(habilitado = true) {
  const subidas: any[] = [];
  return {
    isEnabled: habilitado,
    uploadKey: jest.fn(async (buffer: Buffer, originalName: string, contentType: string, folder: string, empresaId?: number) => {
      if (!habilitado) return null;
      subidas.push({ buffer, originalName, contentType, folder, empresaId });
      return `${folder}/${empresaId}/fake-${subidas.length}.${originalName.split('.').pop()}`;
    }),
    getSignedUrl: jest.fn(async (key: string) => `https://s3.fake/${key}?firmada`),
    subidas,
  };
}

function makeService(s3 = fakeS3()) {
  const repo = fakeRepo();
  const svc = new SoporteAdjuntosService(repo as any, s3 as any);
  return { svc, repo, s3 };
}

async function pngValido(width = 100, height = 100): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
}
async function jpegValido(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 0, b: 0 } } }).jpeg().toBuffer();
}
async function webpValido(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 200, b: 0 } } }).webp().toBuffer();
}
function archivo(buffer: Buffer, originalname: string, mimetype: string) {
  return { buffer, originalname, mimetype, size: buffer.length };
}

describe('SoporteAdjuntosService.procesarYGuardar — tipos válidos', () => {
  it.each([
    ['PNG',  pngValido,  'foto.png',  'image/png'],
    ['JPEG', jpegValido, 'foto.jpg',  'image/jpeg'],
    ['WEBP', webpValido, 'foto.webp', 'image/webp'],
  ])('acepta un %s real y lo guarda con su tipoMime detectado', async (_label, factory, nombre, mimeEsperado) => {
    const buffer = await (factory as () => Promise<Buffer>)();
    const { svc, s3 } = makeService();

    const filas = await svc.procesarYGuardar(1, 7, [archivo(buffer, nombre, mimeEsperado)]);

    expect(filas).toHaveLength(1);
    expect(filas[0].tipoMime).toBe(mimeEsperado);
    expect(filas[0].empresaId).toBe(7);
    expect(filas[0].ticketId).toBe(1);
    expect(s3.uploadKey).toHaveBeenCalledTimes(1);
    // La ruta guardada es la KEY que devuelve S3, nunca una URL.
    expect(filas[0].ruta).not.toMatch(/^https?:\/\//);
  });

  it('sin archivos: no llama a S3 y devuelve []', async () => {
    const { svc, s3 } = makeService();
    const filas = await svc.procesarYGuardar(1, 7, []);
    expect(filas).toEqual([]);
    expect(s3.uploadKey).not.toHaveBeenCalled();
  });
});

describe('SoporteAdjuntosService.procesarYGuardar — magic bytes, no extensión ni Content-Type', () => {
  it('extensión .jpg con contenido que NO es una imagen real: rechazado', async () => {
    const { svc, s3 } = makeService();
    const noEsUnaImagen = Buffer.from('esto es texto plano, no una imagen, por mas que diga .jpg');

    await expect(
      svc.procesarYGuardar(1, 7, [archivo(noEsUnaImagen, 'captura.jpg', 'image/jpeg')]),
    ).rejects.toThrow(BadRequestException);
    expect(s3.uploadKey).not.toHaveBeenCalled();
  });

  it('Content-Type declarado como image/png pero el contenido real es otra cosa: rechazado igual', async () => {
    const { svc } = makeService();
    // Un PDF real (magic bytes %PDF) con mimetype falseado a image/png.
    const pdfBuffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(50)]);

    await expect(
      svc.procesarYGuardar(1, 7, [archivo(pdfBuffer, 'documento.png', 'image/png')]),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SoporteAdjuntosService.procesarYGuardar — límites', () => {
  it(`más de ${MAX_ADJUNTOS_POR_TICKET} archivos: rechazado antes de subir ninguno`, async () => {
    const { svc, s3 } = makeService();
    const buffer = await pngValido();
    const archivos = Array.from({ length: MAX_ADJUNTOS_POR_TICKET + 1 }, (_, i) => archivo(buffer, `f${i}.png`, 'image/png'));

    await expect(svc.procesarYGuardar(1, 7, archivos)).rejects.toThrow(BadRequestException);
    expect(s3.uploadKey).not.toHaveBeenCalled();
  });

  it('exactamente el máximo permitido: se acepta', async () => {
    const { svc } = makeService();
    const buffer = await pngValido();
    const archivos = Array.from({ length: MAX_ADJUNTOS_POR_TICKET }, (_, i) => archivo(buffer, `f${i}.png`, 'image/png'));

    const filas = await svc.procesarYGuardar(1, 7, archivos);
    expect(filas).toHaveLength(MAX_ADJUNTOS_POR_TICKET);
  });

  it(`archivo de más de 5 MB (> ${MAX_BYTES_POR_ADJUNTO} bytes): rechazado — límite también en backend, no solo frontend`, async () => {
    const { svc, s3 } = makeService();
    const buffer = await pngValido();
    const archivoGigante = { ...archivo(buffer, 'grande.png', 'image/png'), size: MAX_BYTES_POR_ADJUNTO + 1 };

    await expect(svc.procesarYGuardar(1, 7, [archivoGigante])).rejects.toThrow(BadRequestException);
    expect(s3.uploadKey).not.toHaveBeenCalled();
  });
});

describe('SoporteAdjuntosService.procesarYGuardar — EXIF y redimensionado', () => {
  it('descarta el EXIF (incluida ubicación GPS) al procesar la imagen', async () => {
    const base = await jpegValido();
    const conExifGps = await sharp(base)
      .withMetadata({
        exif: {
          IFD0: { Copyright: 'Foto de un cliente' },
          GPS:  { GPSLatitude: '18/1 30/1 0/1', GPSLatitudeRef: 'N', GPSLongitude: '69/1 55/1 0/1', GPSLongitudeRef: 'W' },
        },
      })
      .jpeg()
      .toBuffer();

    // Confirma que el fixture realmente trae EXIF antes de procesar —
    // si esto fallara, el test de abajo no probaría nada.
    const metaOriginal = await sharp(conExifGps).metadata();
    expect(metaOriginal.exif).toBeDefined();

    const { svc, s3 } = makeService();
    await svc.procesarYGuardar(1, 7, [archivo(conExifGps, 'foto-con-ubicacion.jpg', 'image/jpeg')]);

    const bufferSubido: Buffer = s3.subidas[0].buffer;
    const metaProcesada = await sharp(bufferSubido).metadata();
    expect(metaProcesada.exif).toBeUndefined();
  });

  it('redimensiona a un máximo de 2000px de ancho cuando la imagen es más grande', async () => {
    const grande = await sharp({ create: { width: 2500, height: 1200, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg().toBuffer();

    const { svc, s3 } = makeService();
    await svc.procesarYGuardar(1, 7, [archivo(grande, 'pantallazo-grande.jpg', 'image/jpeg')]);

    const bufferSubido: Buffer = s3.subidas[0].buffer;
    const meta = await sharp(bufferSubido).metadata();
    expect(meta.width).toBeLessThanOrEqual(2000);
  });

  it('una imagen ya pequeña NO se agranda (withoutEnlargement)', async () => {
    const chica = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg().toBuffer();

    const { svc, s3 } = makeService();
    await svc.procesarYGuardar(1, 7, [archivo(chica, 'chica.jpg', 'image/jpeg')]);

    const bufferSubido: Buffer = s3.subidas[0].buffer;
    const meta = await sharp(bufferSubido).metadata();
    expect(meta.width).toBe(50);
  });
});

describe('SoporteAdjuntosService — S3 no configurado', () => {
  it('S3 deshabilitado: rechaza con error claro en vez de guardar en un sitio inseguro', async () => {
    const { svc } = makeService(fakeS3(false));
    const buffer = await pngValido();

    await expect(svc.procesarYGuardar(1, 7, [archivo(buffer, 'foto.png', 'image/png')])).rejects.toThrow(BadRequestException);
  });
});

describe('SoporteAdjuntosService — acceso a adjuntos', () => {
  it('unoDeTicket: 404 si el adjunto pertenece a OTRO ticket, aunque el id exista', async () => {
    const { svc } = makeService();
    const buffer = await pngValido();
    const [adjunto] = await svc.procesarYGuardar(1, 7, [archivo(buffer, 'foto.png', 'image/png')]);

    await expect(svc.unoDeTicket(2, adjunto.id)).rejects.toThrow(NotFoundException);
    await expect(svc.unoDeTicket(1, adjunto.id)).resolves.toMatchObject({ id: adjunto.id });
  });

  it('conUrlFirmada: nunca expone la ruta/key cruda, solo la URL firmada', async () => {
    const { svc } = makeService();
    const buffer = await pngValido();
    const [adjunto] = await svc.procesarYGuardar(1, 7, [archivo(buffer, 'foto.png', 'image/png')]);

    const [conUrl] = await svc.conUrlFirmada([adjunto]);
    expect(conUrl.url).toContain('firmada');
    expect((conUrl as any).ruta).toBeUndefined();
  });
});
