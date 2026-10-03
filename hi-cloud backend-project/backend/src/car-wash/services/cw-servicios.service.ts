import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CwServicio } from '../entities/cw-servicio.entity';
import { CwServicioPrecio } from '../entities/cw-servicio-precio.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { CrearServicioDto, ActualizarServicioDto } from '../dto/servicio.dto';

@Injectable()
export class CwServiciosService {
  constructor(
    @InjectRepository(CwServicio) private readonly servicioRepo: Repository<CwServicio>,
    @InjectRepository(CwServicioPrecio) private readonly precioRepo: Repository<CwServicioPrecio>,
    @InjectRepository(Producto) private readonly productoRepo: Repository<Producto>,
  ) {}

  async listar(empresaId: number): Promise<Array<CwServicio & { precios: CwServicioPrecio[] }>> {
    const servicios = await this.servicioRepo.find({ where: { empresaId }, order: { nombre: 'ASC' } });
    return this.conPrecios(servicios);
  }

  async obtener(empresaId: number, id: number): Promise<CwServicio & { precios: CwServicioPrecio[] }> {
    const servicio = await this.servicioRepo.findOne({ where: { id, empresaId } });
    if (!servicio) throw new NotFoundException(`Servicio #${id} no encontrado`);
    const [conPrecio] = await this.conPrecios([servicio]);
    return conPrecio;
  }

  async crear(empresaId: number, dto: CrearServicioDto): Promise<CwServicio & { precios: CwServicioPrecio[] }> {
    let productoId = dto.productoId;
    if (!productoId) {
      const precioBase = dto.precios[0].precio;
      const producto = await this.productoRepo.save(this.productoRepo.create({
        empresaId,
        tipo: 'servicio',
        nombre: dto.nombre,
        precio: precioBase,
        unidadMedida: 'SERV',
      }));
      productoId = producto.id;
    }

    const servicio = await this.servicioRepo.save(
      this.servicioRepo.create({ empresaId, nombre: dto.nombre, productoId }),
    );
    await this.precioRepo.save(dto.precios.map(p => this.precioRepo.create({ servicioId: servicio.id, ...p })));
    return this.obtener(empresaId, servicio.id);
  }

  async actualizar(empresaId: number, id: number, dto: ActualizarServicioDto): Promise<CwServicio & { precios: CwServicioPrecio[] }> {
    const servicio = await this.servicioRepo.findOne({ where: { id, empresaId } });
    if (!servicio) throw new NotFoundException(`Servicio #${id} no encontrado`);

    if (dto.nombre !== undefined) servicio.nombre = dto.nombre;
    if (dto.activo !== undefined) servicio.activo = dto.activo;
    await this.servicioRepo.save(servicio);

    if (dto.precios) {
      await this.precioRepo.delete({ servicioId: id });
      await this.precioRepo.save(dto.precios.map(p => this.precioRepo.create({ servicioId: id, ...p })));
    }
    return this.obtener(empresaId, id);
  }

  /** Lee precio/duración de un servicio para un tipo de vehículo — usado al
   *  recibir un turno, para congelar el valor en cw_turno_servicios. */
  async precioPara(empresaId: number, servicioId: number, tipoVehiculo: string): Promise<CwServicioPrecio> {
    const servicio = await this.servicioRepo.findOne({ where: { id: servicioId, empresaId } });
    if (!servicio) throw new NotFoundException(`Servicio #${servicioId} no encontrado`);
    const precio = await this.precioRepo.findOne({ where: { servicioId, tipoVehiculo: tipoVehiculo as any } });
    if (!precio) throw new NotFoundException(`El servicio "${servicio.nombre}" no tiene precio definido para ${tipoVehiculo}`);
    return precio;
  }

  private async conPrecios(servicios: CwServicio[]): Promise<Array<CwServicio & { precios: CwServicioPrecio[] }>> {
    if (!servicios.length) return [];
    const precios = await this.precioRepo.find({ where: servicios.map(s => ({ servicioId: s.id })) });
    return servicios.map(s => ({ ...s, precios: precios.filter(p => p.servicioId === s.id) }));
  }
}
