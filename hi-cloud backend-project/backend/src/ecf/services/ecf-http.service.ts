import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, catchError } from 'rxjs';
import { AxiosError } from 'axios';

export interface RespuestaProveedor {
  referencia: string;
  xmlRespuesta: string;
  firmaDigital?: string;
  estado: string;
  mensaje?: string;
}

export interface EstadoProveedor {
  estado: string;
  xmlRespuesta?: string;
  mensaje?: string;
}

@Injectable()
export class ECFHttpService {
  private readonly logger = new Logger(ECFHttpService.name);

  constructor(private readonly httpService: HttpService) {}

  async enviarECF(
    xml: string,
    apiUrl: string,
    apiKey: string,
  ): Promise<RespuestaProveedor> {
    this.logger.log(`Enviando e-CF a proveedor: ${apiUrl}`);

    const response = await firstValueFrom(
      this.httpService
        .post<RespuestaProveedor>(
          `${apiUrl}/ecf/enviar`,
          { xml },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30_000,
          },
        )
        .pipe(
          catchError((err: AxiosError) => {
            const detalle =
              (err.response?.data as Record<string, string>)?.mensaje ??
              err.message;
            this.logger.error(`Error enviando e-CF: ${detalle}`);
            throw new BadGatewayException(
              `Error comunicando con proveedor e-CF: ${detalle}`,
            );
          }),
        ),
    );

    this.logger.log(`e-CF enviado. Referencia: ${response.data.referencia}`);
    return response.data;
  }

  async consultarEstado(
    referencia: string,
    apiUrl: string,
    apiKey: string,
  ): Promise<EstadoProveedor> {
    this.logger.log(`Consultando estado e-CF ref: ${referencia}`);

    const response = await firstValueFrom(
      this.httpService
        .get<EstadoProveedor>(`${apiUrl}/ecf/estado/${referencia}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 30_000,
        })
        .pipe(
          catchError((err: AxiosError) => {
            const detalle =
              (err.response?.data as Record<string, string>)?.mensaje ??
              err.message;
            this.logger.error(`Error consultando estado: ${detalle}`);
            throw new BadGatewayException(
              `Error consultando estado en proveedor: ${detalle}`,
            );
          }),
        ),
    );

    return response.data;
  }
}
