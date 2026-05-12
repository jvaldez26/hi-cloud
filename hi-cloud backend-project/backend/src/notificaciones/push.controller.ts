import {
  Controller, Post, Delete, Get, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { PushService, PushSubscriptionData } from './push.service';

class SubscribeDto {
  @IsString()    endpoint!: string;
  @IsObject()    keys!: { p256dh: string; auth: string };
}

class UnsubscribeDto {
  @IsString() endpoint!: string;
}

@ApiTags('Push Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private svc: PushService) {}

  @Get('vapid-key')
  @ApiOperation({ summary: 'Obtener clave pública VAPID para suscripción push' })
  getVapidKey() {
    return { publicKey: this.svc.getPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suscribir dispositivo a notificaciones push' })
  async subscribe(@Body() dto: SubscribeDto, @GetUser() user: User) {
    await this.svc.suscribir(user.id, dto as PushSubscriptionData);
    return { ok: true, message: 'Suscrito a notificaciones push' };
  }

  @Delete('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar suscripción push' })
  async unsubscribe(@Body() dto: UnsubscribeDto) {
    await this.svc.desuscribir(dto.endpoint);
    return { ok: true };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar notificación push de prueba' })
  async test(@GetUser() user: User) {
    await this.svc.notificarUsuario(user.id, {
      title: '✅ HiCloud ERP — Notificaciones activas',
      body:  'Las alertas push están configuradas correctamente.',
      url:   '/dashboard',
    });
    return { ok: true };
  }
}
