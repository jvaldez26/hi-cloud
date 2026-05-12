import {
  WebSocketGateway, WebSocketServer,
  OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/realtime',
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private jwtService: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as any)?.token ??
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) { client.disconnect(); return; }

      const payload = this.jwtService.verify(token) as any;

      // Sala por empresa — solo usuarios de la misma empresa reciben eventos
      const empresaId =
        (client.handshake.auth as any)?.empresaId ??
        payload.empresaId;

      if (empresaId) {
        client.join(`empresa:${empresaId}`);
      }

      this.logger.debug(`WS conectado: user=${payload.sub} empresa=${empresaId}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`WS desconectado: ${client.id}`);
  }

  /** Emite un evento de cambio a todos los sockets de una empresa */
  notificar(
    empresaId: number,
    entidad: string,
    accion: 'created' | 'updated' | 'deleted',
    id?: number,
  ) {
    this.server
      .to(`empresa:${empresaId}`)
      .emit('cambio', { entidad, accion, id, ts: Date.now() });
  }
}
