import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestauranteController } from './restaurante.controller';
import { RestauranteService } from './restaurante.service';
import { RestaurantePdfService } from './restaurante-pdf.service';
import { RsArea } from './entities/rs-area.entity';
import { RsMesa } from './entities/rs-mesa.entity';
import { RsCategoriaMenu } from './entities/rs-categoria-menu.entity';
import { RsMenuItem } from './entities/rs-menu-item.entity';
import { RsModificador } from './entities/rs-modificador.entity';
import { RsCombo, RsComboItem } from './entities/rs-combo.entity';
import { RsReservacion } from './entities/rs-reservacion.entity';
import { RsComanda, RsComandaItem } from './entities/rs-comanda.entity';
import { RsPedidoDelivery } from './entities/rs-delivery.entity';
import { RsTurno } from './entities/rs-turno.entity';
import { RsKdsEstacion } from './entities/rs-kds.entity';
import { RsPropina } from './entities/rs-propina.entity';
import { TenantModule } from '../tenant/tenant.module';
import { ModulosAddonModule } from '../modulos-addon/modulos-addon.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RsArea, RsMesa, RsCategoriaMenu, RsMenuItem, RsModificador,
      RsCombo, RsComboItem, RsReservacion, RsComanda, RsComandaItem,
      RsPedidoDelivery, RsTurno, RsKdsEstacion, RsPropina,
    ]),
    TenantModule,
    ModulosAddonModule,
  ],
  controllers: [RestauranteController],
  providers: [RestauranteService, RestaurantePdfService],
})
export class RestauranteModule {}
