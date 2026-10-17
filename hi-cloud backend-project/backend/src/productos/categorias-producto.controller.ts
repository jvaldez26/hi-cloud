import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CategoriasProductoService } from './categorias-producto.service';
import { CreateCategoriaProductoDto, UpdateCategoriaProductoDto, FusionarCategoriaDto } from './dto/categoria-producto.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

/**
 * Catálogo de categorías de producto — "Inventario & Logística → Categorías".
 * Leer el catálogo (para el selector del formulario de producto) lo puede
 * hacer cualquiera con acceso a productos; crear/editar/desactivar/fusionar
 * es solo ADMIN/CONTADOR (no hay un permiso más granular "de inventario" en
 * el sistema hoy — ver el mismo criterio en los endpoints sensibles de
 * ProductosController: costo-manual, quitar-stock-minimo, Delete).
 */
@ApiTags('Categorías de producto')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('categorias-productos')
export class CategoriasProductoController {
  constructor(private readonly svc: CategoriasProductoService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Catálogo de categorías de la empresa, con "Padre › Hija" ya armado.' })
  listar(@Query('incluirInactivas') incluirInactivas?: string) {
    return this.svc.listar({ incluirInactivas: incluirInactivas === 'true' });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear categoría — también la usa el "+ Nueva categoría" del selector, si el usuario tiene el rol.' })
  crear(@Body() dto: CreateCategoriaProductoDto) {
    return this.svc.crear(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Editar nombre, descripción o padre.' })
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoriaProductoDto) {
    return this.svc.actualizar(id, dto);
  }

  @Patch(':id/desactivar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Desactiva la categoría — nunca se borra. Los productos que la tenían la conservan.' })
  desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.desactivar(id);
  }

  @Patch(':id/activar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Reactiva una categoría desactivada.' })
  activar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.activar(id);
  }

  @Patch(':id/fusionar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Fusiona esta categoría DENTRO de otra — reasigna productos y subcategorías, y la desactiva.' })
  fusionar(@Param('id', ParseIntPipe) id: number, @Body() dto: FusionarCategoriaDto) {
    return this.svc.fusionar(id, dto.categoriaDestinoId);
  }
}
