import {
  Controller, Get, Post, Patch, Body, Param,
  Query, ParseIntPipe, HttpCode, HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DemoService } from './demo.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { EstadoDemo } from './entities/demo-request.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Demo Requests (Ventas)')
@Controller('demo')
export class DemoController {
  constructor(private demoService: DemoService) {}

  // ── Público — sin autenticación ────────────────────────────────────────────

  @Post('solicitar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Solicitar demo — endpoint público, sin autenticación' })
  crear(@Body() dto: CreateDemoRequestDto) {
    return this.demoService.crear(dto);
  }

  // ── Administración (solo equipo HiCloud) ───────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar solicitudes de demo (solo ADMIN)' })
  listar(
    @Query('page')   page?:   number,
    @Query('limite') limite?: number,
    @Query('estado') estado?: EstadoDemo,
  ) {
    return this.demoService.listar({ page, limit: limite, estado });
  }

  @Get('estadisticas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Estadísticas del pipeline de demos' })
  getEstadisticas() {
    return this.demoService.getEstadisticas();
  }

  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar estado y notas de una solicitud' })
  actualizarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { estado?: EstadoDemo; notasInternas?: string; asignadoA?: string },
  ) {
    return this.demoService.actualizarEstado(id, body);
  }
}
