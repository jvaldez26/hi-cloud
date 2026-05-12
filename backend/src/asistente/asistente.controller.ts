import {
  Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsString, ValidateNested, IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AsistenteService, MensajeChat } from './asistente.service';

class MensajeChatDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() content!: string;
}

class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MensajeChatDto)
  @IsOptional()
  historial?: MensajeChat[];

  @IsString() mensaje!: string;
}

@ApiTags('Asistente IA')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('asistente')
export class AsistenteController {
  constructor(private svc: AsistenteService) {}

  @Get('status')
  @ApiOperation({ summary: 'Verificar si el asistente IA está disponible' })
  status() {
    return { disponible: this.svc.isAvailable() };
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chat con el asistente financiero IA' })
  async chat(@Body() dto: ChatDto) {
    const respuesta = await this.svc.chat(dto.historial ?? [], dto.mensaje);
    return { respuesta };
  }

  @Get('pyl')
  @ApiOperation({ summary: 'Generar análisis P&L con IA' })
  async analizarPyL() {
    const analisis = await this.svc.analizarPyL();
    return { analisis };
  }
}
