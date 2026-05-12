import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface PostgresError extends Error {
  code?: string;
  detail?: string;
  column?: string;
  constraint?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    // Log diagnóstico — muestra endpoint + body + error
    if (process.env.NODE_ENV !== 'production') {
      const body = (request as any).body;
      this.logger.warn(
        `[ERROR] ${request.method} ${request.url} | ` +
        `body=${JSON.stringify(body)} | ` +
        `exception=${(exception as any)?.message ?? String(exception)}`
      );
    }

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';

    // ── HttpException: errores de negocio (400, 401, 403, 404, 409) ──
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = Array.isArray(resObj['message'])
          ? (resObj['message'] as string[])
          : (resObj['message'] as string) || exception.message;
      }
      return this.send(response, request, status, message);
    }

    // ── Errores de PostgreSQL (código de error estándar) ─────────────
    const pgErr = exception as PostgresError;
    if (pgErr?.code) {
      switch (pgErr.code) {
        case '23505': // unique_violation
          status  = HttpStatus.CONFLICT;
          message = pgErr.detail
            ? `Registro duplicado: ${pgErr.detail.replace(/[()]/g, '')}`
            : 'Ya existe un registro con esos datos';
          this.logger.warn(`UniqueViolation [${request.method} ${request.url}]: ${pgErr.detail}`);
          return this.send(response, request, status, message);

        case '23503': // foreign_key_violation
          status  = HttpStatus.BAD_REQUEST;
          message = pgErr.detail
            ? `Referencia inválida: ${pgErr.detail.replace(/[()]/g, '')}`
            : 'El registro relacionado no existe';
          this.logger.warn(`ForeignKeyViolation [${request.method} ${request.url}]: ${pgErr.detail}`);
          return this.send(response, request, status, message);

        case '23502': // not_null_violation
          status  = HttpStatus.BAD_REQUEST;
          message = pgErr.column
            ? `Campo requerido faltante: ${pgErr.column}`
            : 'Falta un campo requerido';
          this.logger.warn(`NotNullViolation [${request.method} ${request.url}]: column=${pgErr.column}`);
          return this.send(response, request, status, message);

        case '22P02': // invalid_text_representation (enum inválido)
          status  = HttpStatus.BAD_REQUEST;
          message = 'Valor inválido para un campo de tipo enumerado';
          this.logger.warn(`InvalidEnum [${request.method} ${request.url}]: ${pgErr.message}`);
          return this.send(response, request, status, message);

        case '42703': // undefined_column
          status  = HttpStatus.INTERNAL_SERVER_ERROR;
          message = `Error de configuración: columna no existe (${pgErr.message?.split('"')[1] ?? 'desconocida'})`;
          this.logger.error(`UndefinedColumn [${request.method} ${request.url}]: ${pgErr.message}`);
          return this.send(response, request, status, message);

        default:
          this.logger.error(`DBError[${pgErr.code}] [${request.method} ${request.url}]: ${pgErr.message}`, pgErr.stack);
      }
    }

    // ── Error genérico no manejado ────────────────────────────────────
    if (exception instanceof Error) {
      this.logger.error(
        `UnhandledError [${request.method} ${request.url}]: ${exception.message}`,
        exception.stack,
      );
      // En desarrollo exponer el mensaje; en producción ocultarlo
      if (process.env.NODE_ENV !== 'production') {
        message = `Error interno: ${exception.message}`;
      }
    }

    this.send(response, request, status, message);
  }

  private send(
    response: Response,
    request: Request,
    status: number,
    message: string | string[],
  ) {
    response.status(status).json({
      success:   false,
      statusCode: status,
      timestamp:  new Date().toISOString(),
      path:       request.url,
      method:     request.method,
      errors:     Array.isArray(message) ? message : [message],
    });
  }
}
