import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Producto } from '../productos/entities/producto.entity';
import { TenantService } from '../tenant/tenant.service';

export interface ImportResult {
  total:     number;
  exitosos:  number;
  errores:   number;
  detalles:  Array<{ fila: number; error?: string; estado: 'ok' | 'error' }>;
}

@Injectable()
export class ImportacionService {
  private readonly logger = new Logger(ImportacionService.name);

  constructor(
    @InjectRepository(Cliente)
    private clienteRepository: Repository<Cliente>,
    @InjectRepository(Producto)
    private productoRepository: Repository<Producto>,
    private tenantService: TenantService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Parser CSV genérico
  // ──────────────────────────────────────────────────────────────────

  private parsearCSV(buffer: Buffer): string[][] {
    const texto  = buffer.toString('utf-8');
    const lineas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return lineas
      .map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
      .filter(l => l.some(c => c.length > 0));
  }

  // ──────────────────────────────────────────────────────────────────
  // Plantillas CSV
  // ──────────────────────────────────────────────────────────────────

  getPlantillaClientes(): string {
    return [
      'nombre,rfc,email,telefono,direccion,ciudad,regimenFiscal',
      'Empresa Ejemplo S.R.L.,101234567,empresa@email.com,809-555-0000,Av. Principal #1,Santo Domingo,',
      'Cliente Individual,00112345678,cliente@email.com,809-555-0001,Calle 1 #2,Santiago,',
    ].join('\n');
  }

  getPlantillaProductos(): string {
    return [
      'codigo,nombre,precio,porcentajeIva,unidadMedida,stockMinimo,categoria,descripcion',
      'PROD001,Producto Ejemplo,1500.00,18,PZA,5,General,Descripción del producto',
      'SERV001,Servicio Ejemplo,2500.00,18,HR,0,Servicios,Descripción del servicio',
    ].join('\n');
  }

  // ──────────────────────────────────────────────────────────────────
  // Importar Clientes
  // ──────────────────────────────────────────────────────────────────

  async importarClientes(buffer: Buffer): Promise<ImportResult> {
    const filas   = this.parsearCSV(buffer);
    const result: ImportResult = { total: 0, exitosos: 0, errores: 0, detalles: [] };

    if (filas.length < 2) {
      throw new BadRequestException('El archivo debe tener encabezado y al menos una fila de datos');
    }

    const headers = filas[0].map(h => h.toLowerCase());
    const required = ['nombre', 'rfc'];
    const missing  = required.filter(r => !headers.includes(r));
    if (missing.length) {
      throw new BadRequestException(`Columnas requeridas faltantes: ${missing.join(', ')}`);
    }

    const idx = (name: string) => headers.indexOf(name);

    for (let i = 1; i < filas.length; i++) {
      result.total++;
      const fila = filas[i];
      const fNum = i + 1;

      try {
        const nombre = fila[idx('nombre')];
        const rfc    = fila[idx('rfc')];

        if (!nombre || !rfc) throw new Error('nombre y rfc son obligatorios');
        if (nombre.length > 200) throw new Error('nombre muy largo (máx 200 chars)');

        // Verificar si ya existe
        const existe = await this.clienteRepository.findOne({ where: { rfc } });
        if (existe) {
          result.errores++;
          result.detalles.push({ fila: fNum, error: `RFC ${rfc} ya existe`, estado: 'error' });
          continue;
        }

        await this.clienteRepository.save(
          this.clienteRepository.create({
            nombre,
            rfc,
            email:        fila[idx('email')]    || undefined,
            telefono:     fila[idx('telefono')] || undefined,
            direccion:    fila[idx('direccion')]|| undefined,
            ciudad:       fila[idx('ciudad')]   || undefined,
            regimenFiscal:fila[idx('regimenfiscal')] || undefined,
          }),
        );

        result.exitosos++;
        result.detalles.push({ fila: fNum, estado: 'ok' });
      } catch (err) {
        result.errores++;
        result.detalles.push({ fila: fNum, error: (err as Error).message, estado: 'error' });
      }
    }

    this.logger.log(`Importación clientes: ${result.exitosos} ok, ${result.errores} errores`);
    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // Importar Productos
  // ──────────────────────────────────────────────────────────────────

  async importarProductos(buffer: Buffer): Promise<ImportResult> {
    const filas   = this.parsearCSV(buffer);
    const result: ImportResult = { total: 0, exitosos: 0, errores: 0, detalles: [] };

    if (filas.length < 2) {
      throw new BadRequestException('El archivo debe tener encabezado y al menos una fila de datos');
    }

    const headers = filas[0].map(h => h.toLowerCase());
    const required = ['codigo', 'nombre', 'precio'];
    const missing  = required.filter(r => !headers.includes(r));
    if (missing.length) {
      throw new BadRequestException(`Columnas requeridas faltantes: ${missing.join(', ')}`);
    }

    const idx = (name: string) => headers.indexOf(name);

    for (let i = 1; i < filas.length; i++) {
      result.total++;
      const fila = filas[i];
      const fNum = i + 1;

      try {
        const codigo = fila[idx('codigo')];
        const nombre = fila[idx('nombre')];
        const precio = parseFloat(fila[idx('precio')]);

        if (!codigo || !nombre) throw new Error('codigo y nombre son obligatorios');
        if (isNaN(precio) || precio < 0) throw new Error('precio inválido');

        const existe = await this.productoRepository.findOne({ where: { codigo } });
        if (existe) {
          result.errores++;
          result.detalles.push({ fila: fNum, error: `Código ${codigo} ya existe`, estado: 'error' });
          continue;
        }

        const pIva = idx('porcentajeiva') >= 0 ? parseFloat(fila[idx('porcentajeiva')]) : 18;
        const sMin = idx('stockminimo')   >= 0 ? parseInt(fila[idx('stockminimo')])     : 0;

        await this.productoRepository.save(
          this.productoRepository.create({
            codigo,
            nombre,
            precio,
            porcentajeIva:  isNaN(pIva) ? 18 : pIva,
            unidadMedida:   fila[idx('unidadmedida')] || 'PZA',
            stockMinimo:    isNaN(sMin) ? 0  : sMin,
            categoria:      fila[idx('categoria')]    || undefined,
            descripcion:    fila[idx('descripcion')]  || undefined,
          }),
        );

        result.exitosos++;
        result.detalles.push({ fila: fNum, estado: 'ok' });
      } catch (err) {
        result.errores++;
        result.detalles.push({ fila: fNum, error: (err as Error).message, estado: 'error' });
      }
    }

    this.logger.log(`Importación productos: ${result.exitosos} ok, ${result.errores} errores`);
    return result;
  }
}
