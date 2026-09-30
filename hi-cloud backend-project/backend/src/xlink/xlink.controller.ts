import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { XlinkService } from './xlink.service';
import { XlinkPublicarService } from './xlink-publicar.service';
import { VincularXlinkDto } from './dto/vincular-xlink.dto';
import { PublicarXlinkDto } from './dto/publicar-xlink.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/users.entity';
import { XlinkDirectorioThrottlerGuard } from './guards/xlink-directorio-throttler.guard';

@ApiTags('HiCloud Xlink')
@Controller('xlink')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class XlinkController {
  constructor(
    private xlinkService: XlinkService,
    private xlinkPublicarService: XlinkPublicarService,
  ) {}

  @Patch('visibilidad')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activar/desactivar la visibilidad de la empresa en el directorio de HiCloud Xlink (solo ADMIN)' })
  actualizarVisibilidad(@Body() body: { visible: boolean }, @GetUser() usuario: User) {
    if (typeof body.visible !== 'boolean') throw new BadRequestException('visible debe ser boolean');
    return this.xlinkService.actualizarVisibilidad(body.visible, {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
    });
  }

  @Get('directorio')
  @UseGuards(XlinkDirectorioThrottlerGuard)
  @ApiOperation({ summary: 'Directorio de empresas visibles en HiCloud Xlink' })
  getDirectorio(
    @Query('q') q?: string,
    @Query('soloRegistradas') soloRegistradas?: string,
    @Query('page') page?: string,
  ) {
    return this.xlinkService.getDirectorio({
      q,
      soloRegistradas: soloRegistradas === 'true',
      page: page ? Number(page) : undefined,
    });
  }

  @Post('vincular')
  @ApiOperation({ summary: 'Vincula (o crea) un cliente/proveedor propio con la empresa contraparte' })
  vincular(@Body() dto: VincularXlinkDto) {
    return this.xlinkService.vincular(dto);
  }

  @Post('publicar')
  @ApiOperation({ summary: 'Publica/envía documentos por HiCloud Xlink — cada uno se procesa de forma independiente' })
  publicar(@Body() dto: PublicarXlinkDto, @GetUser() usuario: User) {
    return this.xlinkPublicarService.publicar(dto, {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
    });
  }

  @Delete('enviados/:id')
  @ApiOperation({ summary: 'Retira un documento enviado — solo si el receptor aún no lo procesó' })
  eliminarEnviado(@Param('id', ParseIntPipe) id: number) {
    return this.xlinkPublicarService.eliminarEnviado(id);
  }
}
