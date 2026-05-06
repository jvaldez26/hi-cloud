import {
  Controller, Post, Delete, Get, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { TwoFactorService } from './two-factor.service';

class VerifyCodeDto {
  @IsString()
  @Length(6, 6)
  codigo!: string;
}

@ApiTags('2FA')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private svc: TwoFactorService) {}

  @Get('status')
  @ApiOperation({ summary: 'Estado de 2FA del usuario autenticado' })
  status(@GetUser() user: User) {
    return this.svc.getStatus(user.id);
  }

  @Post('setup')
  @ApiOperation({ summary: 'Generar QR para configurar 2FA' })
  setup(@GetUser() user: User) {
    return this.svc.generarSecreto(user.id);
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar 2FA con el código del autenticador' })
  activate(@Body() dto: VerifyCodeDto, @GetUser() user: User) {
    return this.svc.activar(user.id, dto.codigo);
  }

  @Delete('deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar 2FA (requiere código actual)' })
  deactivate(@Body() dto: VerifyCodeDto, @GetUser() user: User) {
    return this.svc.desactivar(user.id, dto.codigo);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar código TOTP' })
  async verify(@Body() dto: VerifyCodeDto, @GetUser() user: User) {
    const ok = await this.svc.verificarCodigo(user.id, dto.codigo);
    return { valido: ok };
  }
}
