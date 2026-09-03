import {
  WebSocketGateway, WebSocketServer,
  OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://hicloudrd.com', 'https://www.hicloudrd.com']
      : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    credentials: true,
  },
  namespace: '/realtime',
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private jwtService: JwtService) {}

  handleConnection(client: Socket) {
    try {
      // Prioridad de token:
      // 1. auth.token explícito (legado)
      // 2. Authorization header
      // 3. Cookie httpOnly access_token (migración S-23)
      let token: string | undefined =
        (client.handshake.auth as any)?.token ??
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        // Leer cookie access_token del handshake (withCredentials: true en el cliente)
        const rawCookie: string = (client.handshake.headers as any).cookie ?? '';
        const match = rawCookie.split(';').map(c => c.trim())
          .find(c => c.startsWith('access_token='));
        token = match?.split('=').slice(1).join('='); // soporta '=' en el valor
      }

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

  /**
   * Avisa de que hay un mensaje nuevo del Super Admin.
   *
   * El evento va VACÍO a propósito: solo dice "consulta otra vez". El contenido
   * y —sobre todo— el filtrado por destinatario siguen ocurriendo en el
   * servidor cuando el cliente pregunta. Así nadie recibe por el socket un
   * mensaje que no era para él, ni siquiera su título.
   *
   * Por eso el caso `todas` puede emitirse a todo el namespace sin riesgo: el
   * que no tenga mensajes pendientes preguntará y recibirá una lista vacía.
   *
   * @param empresaIds lista de empresas destinatarias, o 'todas'
   */
  notificarMensajeNuevo(empresaIds: number[] | 'todas') {
    const evento = { ts: Date.now() };
    if (empresaIds === 'todas') {
      this.server.emit('mensaje:nuevo', evento);
      return;
    }
    for (const id of empresaIds) {
      this.server.to(`empresa:${id}`).emit('mensaje:nuevo', evento);
    }
  }

  /** Notifica al POS sobre el estado del e-CF (para UX optimista) */
  notificarPOS(
    empresaId: number,
    facturaId: number,
    payload: { tipo: 'ECF_ACEPTADO' | 'ECF_RECHAZADO' | 'ECF_ENVIADO'; encf: string; trackId?: string; qrUrl?: string; mensaje?: string },
  ) {
    this.server
      .to(`empresa:${empresaId}`)
      .emit('pos:ecf', { facturaId, ...payload, ts: Date.now() });
  }
}
