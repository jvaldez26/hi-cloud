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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Productos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos')
export class ProductosController {
  constructor(private productosService: ProductosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear producto' })
  create(@Body() dto: CreateProductoDto) {
    return this.productosService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar productos con paginación. Cuando hay almacenId en JWT, retorna solo productos con stock en ese almacén.' })
  findAll(@Query() query: ListProductosQueryDto) {
    const { incluirSinStock, ...pagination } = query;
    return this.productosService.findAll(pagination as PaginationDto, incluirSinStock === true);
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
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
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
