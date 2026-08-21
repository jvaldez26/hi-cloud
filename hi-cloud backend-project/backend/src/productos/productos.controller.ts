import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ListProductosQueryDto } from './dto/list-productos-query.dto';
import { PreviewAjustePreciosDto, AplicarAjustePreciosDto } from './dto/ajuste-precios.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Productos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos')
export class ProductosController {
  constructor(private productosService: ProductosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Crear producto' })
  create(@Body() dto: CreateProductoDto) {
    return this.productosService.create(dto);
  }

  @Post('ajuste-precios/preview')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)   // toca precios de venta: solo ADMIN de la empresa
  @ApiOperation({
    summary: 'Preview del ajuste de precios al público (solo lectura, no escribe nada). ' +
             'Devuelve por producto el precio final actual y el propuesto, con la base despejada y verificada.',
  })
  previewAjustePrecios(@Body() dto: PreviewAjustePreciosDto) {
    return this.productosService.previewAjustePrecios(dto);
  }

  @Post('ajuste-precios/aplicar')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)   // solo ADMIN puede modificar precios de venta
  @ApiOperation({
    summary: 'Aplica el ajuste de precios previamente calculado en el preview.',
    description:
      'Actualiza precio (base imponible) de los productos indicados. ' +
      'El backend re-verifica que cada id pertenezca a la empresa del JWT. ' +
      'Devuelve { actualizados: N }.',
  })
  aplicarAjustePrecios(@Body() dto: AplicarAjustePreciosDto) {
    return this.productosService.aplicarAjustePrecios(dto);
  }

  @Get()
  @Throttle({ default: { limit: 300, ttl: 60_000 } }) // endpoint autenticado de catálogo — límite mayor que el global (100/60s)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar productos con paginación. Cuando hay almacenId en JWT, retorna solo productos con stock en ese almacén.' })
  findAll(@Query() query: ListProductosQueryDto) {
    const { incluirSinStock, tipo, ...pagination } = query;
    return this.productosService.findAll(pagination as PaginationDto, incluirSinStock === true, tipo);
  }

  @Get('catalogo-pos')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({
    summary: 'Catálogo completo para el POS — solo los campos que el POS lee.',
    description:
      'Mismos productos que GET /productos?incluirSinStock=true (incluye los de stock 0), ' +
      'pero sin las columnas que el POS nunca usa ni el stockPorAlmacen que se calculaba ' +
      'con un JOIN triple y se descartaba. Tampoco expone costo ni costoPromedio. ' +
      'El POS lo cachea en memoria: de ahí salen la búsqueda local y el escaneo instantáneo.',
  })
  catalogoPos() {
    return this.productosService.catalogoPos();
  }

  @Get('categorias')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Valores distintos de categoría en el catálogo (para Selects — todo el catálogo, no paginado)' })
  getCategorias() {
    return this.productosService.getCategorias();
  }

  @Get('marcas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Valores distintos de marca en el catálogo (para Selects — todo el catálogo, no paginado)' })
  getMarcas() {
    return this.productosService.getMarcas();
  }

  @Get('stock-bajo')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Productos con stock bajo o agotado' })
  findStockBajo() {
    return this.productosService.findStockBajo();
  }

  @Get('check-duplicado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Verificar si código o nombre ya existe (para validación en tiempo real)' })
  checkDuplicado(
    @Query('campo') campo: 'codigo' | 'nombre',
    @Query('valor') valor: string,
    @Query('excludeId') excludeId?: string,
  ) {
    if (!valor || valor === 'undefined' || valor === 'null' || valor.trim().length < 1) {
      return { data: { disponible: true } };
    }
    return this.productosService.checkDuplicado(campo, valor, excludeId ? Number(excludeId) : undefined);
  }

  @Get(':id/historial-compras')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Historial de compras por proveedor para un producto' })
  historialCompras(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.historialCompras(id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Obtener producto por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.findOne(id);
  }

  @Get('codigo/:codigo')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Buscar producto por código' })
  findByCodigo(@Param('codigo') codigo: string) {
    return this.productosService.findByCodigo(codigo);
  }

  @Post(':id/imagen')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Subir imagen del producto a S3 (multipart/form-data, campo "file", máx 2MB)' })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
      else cb(new BadRequestException('Solo imágenes JPG, PNG, WEBP o GIF'), false);
    },
  }))
  async subirImagen(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    if (!file) throw new BadRequestException('Campo "file" requerido');
    const url = await this.productosService.subirImagen(id, file.buffer, file.mimetype);
    return { url };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Actualizar producto' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductoDto) {
    return this.productosService.update(id, dto);
  }

  @Patch(':id/stock')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiOperation({ summary: 'Ajustar stock (positivo entrada, negativo salida)' })
  ajustarStock(
    @Param('id', ParseIntPipe) id: number,
    @Body('cantidad', ParseIntPipe) cantidad: number,
  ) {
    return this.productosService.ajustarStock(id, cantidad);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Eliminar producto (soft delete)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.remove(id);
  }
}
