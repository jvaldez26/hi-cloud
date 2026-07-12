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
import { EcfError } from '../../ecf/errors/ecf.errors';

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

    // Log diagnóstico para HttpException — siempre activo (incluye producción)
    // para permitir diagnóstico vía pm2 logs sin exponer detalle al cliente.
    // NO se incluye el body completo para evitar datos sensibles; solo user/empresa/endpoint/error.
    if (exception instanceof HttpException) {
      const res     = exception.getResponse();
      const detalle = typeof res === 'object' && res !== null
        ? (() => { const m = (res as any).message; return Array.isArray(m) ? m.join('; ') : (typeof m === 'string' ? m : exception.message); })()
        : (typeof res === 'string' ? res : exception.message);
      this.logger.warn(
        `[${exception.getStatus()}] ${request.method} ${request.url} | ` +
        `user=#${(request as any).user?.id ?? 'anon'} empresa=#${(request as any).user?.empresaId ?? '-'} | ` +
        `${detalle}`,
      );
    }

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';

    // ── HttpException: errores de negocio (400, 401, 403, 404, 409) ──
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      let extra: Record<string, unknown> | undefined;
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        if (Array.isArray(resObj['message'])) {
          message = resObj['message'] as string[];
        } else if (typeof resObj['message'] === 'string') {
          message = resObj['message'];
        } else if (typeof resObj['mensaje'] === 'string') {
          // Errores estructurados con campo 'mensaje' (ej: LIMITE_USUARIOS, LIMITE_INGRESOS)
          message = resObj['mensaje'] as string;
        } else {
          message = exception.message;
        }
        // Preservar campos extra del body (ej: remainingSeconds para bloqueo de login)
        const { message: _m, statusCode: _s, error: _e, mensaje: _mj, ...rest } = resObj;
        if (Object.keys(rest).length > 0) extra = rest;
      }
      return this.send(response, request, status, message, extra);
    }

    // ── Errores de PostgreSQL (código de error estándar) ─────────────
    const pgErr = exception as PostgresError;
    if (pgErr?.code) {
      switch (pgErr.code) {
        case '23505': // unique_violation
          status  = HttpStatus.CONFLICT;
          // M-04: pgErr.detail puede contener valores de datos — solo loguear, no exponer en prod
          this.logger.warn(`UniqueViolation [${request.method} ${request.url}]: ${pgErr.detail}`);
          message = (process.env.NODE_ENV !== 'production' && pgErr.detail)
            ? `Registro duplicado: ${pgErr.detail.replace(/[()]/g, '')}`
            : 'Ya existe un registro con esos datos';
          return this.send(response, request, status, message);

        case '23503': // foreign_key_violation
          status  = HttpStatus.BAD_REQUEST;
          this.logger.warn(
            `ForeignKeyViolation [${request.method} ${request.url}]` +
            ` table=${(pgErr as any).table ?? '?'} constraint=${(pgErr as any).constraint ?? '?'}` +
            `: ${pgErr.detail}`,
          );
          message = (process.env.NODE_ENV !== 'production' && pgErr.detail)
            ? `Referencia inválida: ${pgErr.detail.replace(/[()]/g, '')}`
            : 'El registro relacionado no existe';
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

    // ── EcfError: errores de negocio del módulo ECF (configuración, secuencias, validación) ──
    // Son errores conocidos con mensajes claros y accionables — se exponen al cliente.
    if (exception instanceof EcfError) {
      status  = HttpStatus.UNPROCESSABLE_ENTITY;
      message = exception.message;
      this.logger.warn(
        `EcfError[${exception.code}] [${request.method} ${request.url}]: ${exception.message}`,
      );
      return this.send(response, request, status, message);
    }

    // ── Error genérico no manejado ────────────────────────────────────
    if (exception instanceof Error) {
      this.logger.error(
        `UnhandledError [${request.method} ${request.url}]: ${exception.message}`,
        exception.stack,
      );
      // En producción nunca exponer detalles internos; en desarrollo sí para facilitar diagnóstico
      message = process.env.NODE_ENV !== 'production'
        ? `Error interno: ${exception.message}`
        : 'Error interno del servidor. Contacte soporte si persiste.';
    }

    this.send(response, request, status, message);
  }

  private send(
    response: Response,
    request: Request,
    status: number,
    message: string | string[],
    extra?: Record<string, unknown>,
  ) {
    response.status(status).json({
      success:    false,
      statusCode: status,
      timestamp:  new Date().toISOString(),
      path:       request.url,
      method:     request.method,
      errors:     Array.isArray(message) ? message : [message],
      ...extra,
    });
  }
}
