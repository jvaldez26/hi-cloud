import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtributosProductoService } from './atributos-producto.service';
import { AtributosProductoController } from './atributos-producto.controller';
import { AtributoProducto } from './entities/atributo-producto.entity';
import { ValorAtributo } from './entities/valor-atributo.entity';
import { ProductoVariante } from './entities/producto-variante.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AtributoProducto, ValorAtributo, ProductoVariante])],
  controllers: [AtributosProductoController],
  providers: [AtributosProductoService],
  exports: [AtributosProductoService],
})
export class AtributosProductoModule {}
