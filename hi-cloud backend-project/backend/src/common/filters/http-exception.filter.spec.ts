import { MulterError } from 'multer';
import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * MulterError es un Error plano, no una HttpException — sin la rama
 * dedicada, subir un archivo de más de 5 MB (o más archivos de los
 * permitidos) caía al "error genérico" y el cliente veía un 500 "contacte
 * soporte" en vez de un 400 claro. Afecta a TODOS los FileInterceptor del
 * backend (comprobantes de pago, adjuntos de soporte, etc.), no uno solo.
 */

function fakeHost(): { host: ArgumentsHost; getBody: () => any; getStatus: () => number } {
  let body: any;
  let status = 0;
  const response = {
    status: (s: number) => { status = s; return response; },
    json:   (b: any) => { body = b; return response; },
  };
  const request = { method: 'POST', url: '/soporte/tickets', headers: {} };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest:  () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, getBody: () => body, getStatus: () => status };
}

describe('HttpExceptionFilter — MulterError', () => {
  it('LIMIT_FILE_SIZE → 400 con mensaje claro, no 500', () => {
    const filter = new HttpExceptionFilter();
    const { host, getBody, getStatus } = fakeHost();

    filter.catch(new MulterError('LIMIT_FILE_SIZE'), host);

    expect(getStatus()).toBe(400);
    expect(getBody().errors[0]).toMatch(/pesa más/i);
  });

  it('LIMIT_UNEXPECTED_FILE (más archivos de los permitidos) → 400', () => {
    const filter = new HttpExceptionFilter();
    const { host, getBody, getStatus } = fakeHost();

    filter.catch(new MulterError('LIMIT_UNEXPECTED_FILE'), host);

    expect(getStatus()).toBe(400);
    expect(getBody().errors[0]).toMatch(/demasiados|más archivos/i);
  });

  it('un código de MulterError sin mensaje mapeado igual da 400, no 500', () => {
    const filter = new HttpExceptionFilter();
    const { host, getStatus } = fakeHost();

    filter.catch(new MulterError('LIMIT_FIELD_COUNT'), host);

    expect(getStatus()).toBe(400);
  });
});

describe('HttpExceptionFilter — no regresiones', () => {
  it('un Error genérico (no MulterError, no HttpException) sigue devolviendo 500', () => {
    const filter = new HttpExceptionFilter();
    const { host, getStatus } = fakeHost();

    filter.catch(new Error('algo explotó'), host);

    expect(getStatus()).toBe(500);
  });

  it('una HttpException normal (ej. BadRequestException) sigue con su propio status', () => {
    const filter = new HttpExceptionFilter();
    const { host, getBody, getStatus } = fakeHost();

    filter.catch(new BadRequestException('mensaje de negocio'), host);

    expect(getStatus()).toBe(400);
    expect(getBody().errors[0]).toBe('mensaje de negocio');
  });
});
