/**
 * HiCloud ERP — Servicio de Push Notifications
 * Usa Web Push API (RFC 8030) para alertas al navegador del usuario.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { TenantService } from '../tenant/tenant.service';

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Entidad para almacenar suscripciones push
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index,
} from 'typeorm';

@Entity('push_subscriptions')
@Index(['userId', 'empresaId'])
export class PushSubscription {
  @PrimaryGeneratedColumn() id!: number;
  @Column() userId!: number;
  @Column({ nullable: true }) empresaId?: number;
  @Column({ type: 'text' }) endpoint!: string;
  @Column({ type: 'text' }) p256dh!: string;
  @Column({ type: 'text' }) auth!: string;
  @Column({ default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private vapidConfigured = false;

  constructor(
    @InjectRepository(PushSubscription)
    private subRepo: Repository<PushSubscription>,
    private configService: ConfigService,
    private tenantService: TenantService,
    private dataSource: DataSource,
  ) {}

  onModuleInit() {
    const publicKey  = this.configService.get('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get('VAPID_PRIVATE_KEY');
    const email      = this.configService.get('VAPID_EMAIL', 'valdezgonzalez01@gmail.com');

    if (publicKey && privateKey && !publicKey.includes('generate')) {
      webPush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
      this.vapidConfigured = true;
      this.logger.log('Web Push VAPID configurado correctamente');
    } else {
      this.logger.warn('VAPID no configurado — push notifications desactivadas. Genera las claves con: npx web-push generate-vapid-keys');
    }
  }

  /** Retorna la clave pública VAPID para el frontend */
  getPublicKey(): string {
    return this.configService.get('VAPID_PUBLIC_KEY', '');
  }

  /** Guarda la suscripción push de un usuario */
  async suscribir(userId: number, sub: PushSubscriptionData): Promise<void> {
    const empresaId = (() => { try { return this.tenantService.getEmpresaId(); } catch { return undefined; } })();

    // Eliminar suscripción anterior del mismo endpoint
    await this.subRepo.delete({ endpoint: sub.endpoint });

    await this.subRepo.save(this.subRepo.create({
      userId,
      empresaId,
      endpoint: sub.endpoint,
      p256dh:   sub.keys.p256dh,
      auth:     sub.keys.auth,
    }));
    this.logger.debug(`Push subscription guardada para user #${userId}`);
  }

  /** Elimina la suscripción push */
  async desuscribir(endpoint: string): Promise<void> {
    await this.subRepo.delete({ endpoint });
  }

  /** Envía notificación push a todos los usuarios de una empresa */
  async notificarEmpresa(
    empresaId: number,
    payload: { title: string; body: string; url?: string; icon?: string },
  ): Promise<void> {
    if (!this.vapidConfigured) return;

    const subs = await this.subRepo.find({
      where: { empresaId, isActive: true },
    });

    if (subs.length === 0) return;

    const message = JSON.stringify({
      title: payload.title,
      body:  payload.body,
      url:   payload.url ?? '/',
      icon:  payload.icon ?? '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      timestamp: Date.now(),
    });

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            message,
            { TTL: 86400 }, // 24h
          );
        } catch (err: any) {
          // Subscription expirada — eliminar
          if (err.statusCode === 410 || err.statusCode === 404) {
            await this.subRepo.delete(sub.id);
          }
          throw err;
        }
      }),
    );

    const ok = results.filter(r => r.status === 'fulfilled').length;
    this.logger.debug(`Push enviado: ${ok}/${subs.length} exitosos para empresa #${empresaId}`);
  }

  /** Envía notificación a un usuario específico */
  async notificarUsuario(
    userId: number,
    payload: { title: string; body: string; url?: string },
  ): Promise<void> {
    if (!this.vapidConfigured) return;
    const subs = await this.subRepo.find({ where: { userId, isActive: true } });
    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ ...payload, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }),
        );
      } catch {}
    }
  }

  /** Envía alertas programadas: CxC vencidas, stock bajo, CxP próximas */
  async enviarAlertasEmpresa(empresaId: number): Promise<void> {
    if (!this.vapidConfigured) return;
    try {
      const [cxcRes, stockRes, cxpRes] = await Promise.all([
        this.dataSource.query<{c:string;t:string}[]>(
          `SELECT COUNT(id)::text AS c, COALESCE(SUM("montoPendiente"),0)::text AS t
           FROM cuentas_por_cobrar WHERE "empresaId"=$1 AND estado IN ('pendiente','pagada_parcial')
           AND "fechaVencimiento" < CURRENT_DATE AND "isActive"=true`, [empresaId]),
        this.dataSource.query<{c:string}[]>(
          `SELECT COUNT(id)::text AS c FROM productos
           WHERE "empresaId"=$1 AND "isActive"=true AND stock <= "stockMinimo"`, [empresaId]),
        this.dataSource.query<{c:string}[]>(
          `SELECT COUNT(id)::text AS c FROM cuentas_por_pagar
           WHERE "empresaId"=$1 AND estado IN ('pendiente','pagada_parcial')
           AND "fechaVencimiento" BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '3 days'
           AND "isActive"=true`, [empresaId]),
      ]);

      const cxc   = Number(cxcRes[0]?.c ?? 0);
      const stock = Number(stockRes[0]?.c ?? 0);
      const cxp   = Number(cxpRes[0]?.c ?? 0);

      if (cxc > 0) await this.notificarEmpresa(empresaId, {
        title: `💰 ${cxc} factura(s) por cobrar vencidas`,
        body:  `Monto pendiente: RD$ ${Number(cxcRes[0]?.t ?? 0).toLocaleString('es-DO', {minimumFractionDigits:2})}`,
        url:   '/cxc',
      });

      if (stock > 0) await this.notificarEmpresa(empresaId, {
        title: `📦 ${stock} producto(s) con stock bajo`,
        body:  'Revisa el inventario antes de que se agoten',
        url:   '/inventario',
      });

      if (cxp > 0) await this.notificarEmpresa(empresaId, {
        title: `💳 ${cxp} pago(s) a proveedores vencen pronto`,
        body:  'Vencen en los próximos 3 días',
        url:   '/cxp',
      });
    } catch (err) {
      this.logger.error(`Error alertas push empresa #${empresaId}: ${(err as Error).message}`);
    }
  }
}
