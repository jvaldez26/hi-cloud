import {
  Controller, Get, Post, Patch, Body, Param,
  Query, ParseIntPipe, HttpCode, HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { DemoService } from './demo.service';
import { CreateDemoRequestDto } from './dto/create-demo-request.dto';
import { EstadoDemo } from './entities/demo-request.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import type { User } from '../users/users.entity';

class AgregarNotaDto {
  @IsString() @IsNotEmpty() @MaxLength(2000)
  texto!: string;
}

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

  // ── Administración (super_admin del equipo HiCloud) ────────────────────────
  // S-62: estos endpoints exponen los LEADS COMERCIALES de HiCloud (nombre, email,
  // teléfono, notas internas de ventas) y el pipeline completo. No son datos de
  // ninguna empresa cliente: aceptaban UserRole.ADMIN, el rol del admin de
  // cualquier empresa, que podía listarlos y mover su estado. Solo super_admin.

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar solicitudes de demo (super_admin)' })
  listar(
    @Query('page')   page?:   number,
    @Query('limit')  limit?:  number,
    @Query('estado') estado?: EstadoDemo,
    @Query('search') search?: string,
    @Query('desde')  desde?:  string,
    @Query('hasta')  hasta?:  string,
  ) {
    return this.demoService.listar({ page, limit, estado, search, desde, hasta });
  }

  @Get('estadisticas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Estadísticas del pipeline de demos' })
  getEstadisticas() {
    return this.demoService.getEstadisticas();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Detalle de una solicitud de demo' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.demoService.findOne(id);
  }

  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar estado y campos de una solicitud' })
  actualizarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { estado?: EstadoDemo; notasInternas?: string; asignadoA?: string },
    @GetUser() user: User,
  ) {
    return this.demoService.actualizarEstado(id, {
      ...body,
      atendidoPor: user?.id,
    });
  }

  @Post(':id/notas')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Agregar nota interna a una solicitud de demo' })
  agregarNota(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarNotaDto,
    @GetUser() user: User,
  ) {
    return this.demoService.agregarNota(id, dto.texto, user?.id, user?.nombre ?? 'Admin');
  }
}
