import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, ParseIntPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductoProveedorService } from './producto-proveedor.service';
import {
  ActualizarVinculoDto, ReposicionQueryDto, VincularProductosDto,
} from './dto/producto-proveedor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { TenantService } from '../tenant/tenant.service';

@ApiTags('Producto-Proveedor')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('producto-proveedor')
export class ProductoProveedorController {
  constructor(
    private readonly service: ProductoProveedorService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * La pantalla: qué le falta comprarle a este proveedor, en un almacén.
   *
   * El almacén sale de la query o del JWT, en ese orden. Si no hay ninguno se
   * responde 400 con el código ALMACEN_REQUERIDO para que la pantalla pregunte.
   *
   * Se verificó que el almacén del JWT puede faltar de verdad: sale de
   * `sucursal.almacenPrincipalId` en `resolverContextoSucursal()`, y hay tres
   * caminos que lo dejan indefinido (usuario sin sucursal y sin principal,
   * sucursal sin almacén principal, y el catch que devuelve {}). Por eso esto no
   * es defensa teórica.
   *
   * Lo que NO se hace es caer al stock global: el proveedor está parado en una
   * sucursal concreta y lo que importa es lo que falta AHÍ. Enseñarle el total
   * de la empresa sería el número equivocado dicho con toda la confianza.
   */
  @Get('proveedor/:proveedorId/reposicion')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Productos de un proveedor con existencia, mínimo y cuánto pedir en UN almacén' })
  async reposicion(
    @Param('proveedorId', ParseIntPipe) proveedorId: number,
    @Query() query: ReposicionQueryDto,
  ) {
    const almacenId = query.almacenId ?? this.tenantService.getAlmacenId();

    if (!almacenId) {
      throw new BadRequestException({
        codigo: 'ALMACEN_REQUERIDO',
        message:
          'No hay un almacén asociado a tu usuario. Elige el almacén desde el que ' +
          'vas a pedir: las existencias y los mínimos dependen de él.',
      });
    }

    const lineas = await this.service.listarPorProveedor(proveedorId, almacenId);
    return { almacenId, lineas };
  }

  @Get('producto/:productoId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Proveedores de un producto (preferente primero)' })
  porProducto(@Param('productoId', ParseIntPipe) productoId: number) {
    return this.service.listarPorProducto(productoId);
  }

  /**
   * Alta manual. Es el caso que motiva la función entera: el proveedor vende
   * algo que nunca le has comprado, así que ningún proceso automático lo sabe.
   */
  @Post('vincular')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Vincular productos del catálogo a un proveedor' })
  vincular(@Body() dto: VincularProductosDto) {
    const { proveedorId, productoIds, ...datos } = dto;
    return this.service.vincular(proveedorId, productoIds, datos as any);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Editar el vínculo (código del proveedor, precio, entrega, mínimos)' })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarVinculoDto,
  ) {
    return this.service.actualizar(id, dto as any);
  }

  @Patch(':id/preferente')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Marcar este proveedor como preferente para el producto' })
  async preferente(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.marcarPreferente(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Desvincular un producto de un proveedor (baja lógica)' })
  async desvincular(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.desvincular(id);
  }
}
