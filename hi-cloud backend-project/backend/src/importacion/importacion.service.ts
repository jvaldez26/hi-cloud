import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente }   from '../clientes/entities/cliente.entity';
import { Producto }  from '../productos/entities/producto.entity';
import { Proveedor } from '../proveedores/entities/proveedor.entity';
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
    @InjectRepository(Cliente)   private clienteRepository:   Repository<Cliente>,
    @InjectRepository(Producto)  private productoRepository:  Repository<Producto>,
    @InjectRepository(Proveedor) private proveedorRepository: Repository<Proveedor>,
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
      'nombre,rnc,email,telefono,direccion,ciudad',
      'Empresa Ejemplo S.R.L.,101234567,empresa@email.com,809-555-0000,Av. Principal #1,Santo Domingo',
      'Juan Pérez,00112345678,juan@email.com,809-555-0001,Calle 1 #2,Santiago',
    ].join('\n');
  }

  getPlantillaProductos(): string {
    return [
      'codigo,nombre,precio,porcentajeIva,unidadMedida,stockMinimo,categoria,descripcion,tipo',
      'PROD001,Producto Ejemplo,1500.00,18,PZA,5,General,Descripción del producto,producto',
      'SERV001,Servicio Ejemplo,2500.00,18,HR,0,Servicios,Descripción del servicio,servicio',
    ].join('\n');
  }

  // ──────────────────────────────────────────────────────────────────
  // Importar Clientes
  // ──────────────────────────────────────────────────────────────────

  async importarClientes(buffer: Buffer): Promise<ImportResult> {
    const empresaId = this.tenantService.getEmpresaId();
    const filas     = this.parsearCSV(buffer);
    const result: ImportResult = { total: 0, exitosos: 0, errores: 0, detalles: [] };

    if (filas.length < 2) {
      throw new BadRequestException('El archivo debe tener encabezado y al menos una fila de datos');
    }

    const headers = filas[0].map(h => h.toLowerCase().replace(/\s/g, ''));
    // Aceptar columna "rnc" o "rfc" para compatibilidad
    const tieneRnc = headers.includes('rnc') || headers.includes('rfc');
    if (!headers.includes('nombre') || !tieneRnc) {
      throw new BadRequestException('Columnas requeridas faltantes: nombre, rnc');
    }

    const idx = (name: string) => {
      const i = headers.indexOf(name);
      return i >= 0 ? i : -1;
    };
    const idxRnc = idx('rnc') >= 0 ? idx('rnc') : idx('rfc');

    for (let i = 1; i < filas.length; i++) {
      result.total++;
      const fila = filas[i];
      const fNum = i + 1;

      try {
        const nombre = fila[idx('nombre')]?.trim();
        const rnc    = fila[idxRnc]?.replace(/\D/g, '');

        if (!nombre) throw new Error('nombre es obligatorio');
        if (nombre.length > 200) throw new Error('nombre muy largo (máx 200 chars)');
        if (!rnc || (rnc.length !== 9 && rnc.length !== 11)) {
          throw new Error('RNC/Cédula debe tener 9 dígitos (empresa) u 11 dígitos (persona)');
        }

        // Duplicado estricto por empresa
        const existe = await this.clienteRepository.findOne({ where: { rfc: rnc, empresaId } });
        if (existe) {
          result.errores++;
          result.detalles.push({ fila: fNum, error: `RNC/Cédula ${rnc} ya existe en esta empresa`, estado: 'error' });
          continue;
        }

        await this.clienteRepository.save(
          this.clienteRepository.create({
            empresaId,
            nombre,
            rfc:      rnc,
            email:    idx('email')    >= 0 ? (fila[idx('email')]    || undefined) : undefined,
            telefono: idx('telefono') >= 0 ? (fila[idx('telefono')] || undefined) : undefined,
            direccion:idx('direccion')>= 0 ? (fila[idx('direccion')]|| undefined) : undefined,
            ciudad:   idx('ciudad')   >= 0 ? (fila[idx('ciudad')]   || undefined) : undefined,
          } as any),
        );

        result.exitosos++;
        result.detalles.push({ fila: fNum, estado: 'ok' });
      } catch (err) {
        result.errores++;
        result.detalles.push({ fila: fNum, error: (err as Error).message, estado: 'error' });
      }
    }

    this.logger.log(`[Import Clientes] empresa=${empresaId}: ${result.exitosos} ok, ${result.errores} errores`);
    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // Importar Productos
  // ──────────────────────────────────────────────────────────────────

  async importarProductos(buffer: Buffer): Promise<ImportResult> {
    const empresaId = this.tenantService.getEmpresaId();
    const filas     = this.parsearCSV(buffer);
    const result: ImportResult = { total: 0, exitosos: 0, errores: 0, detalles: [] };

    if (filas.length < 2) {
      throw new BadRequestException('El archivo debe tener encabezado y al menos una fila de datos');
    }

    const headers = filas[0].map(h => h.toLowerCase().replace(/\s/g, ''));
    const required = ['codigo', 'nombre', 'precio'];
    const missing  = required.filter(r => !headers.includes(r));
    if (missing.length) {
      throw new BadRequestException(`Columnas requeridas faltantes: ${missing.join(', ')}`);
    }

    const idx = (name: string) => headers.indexOf(name.toLowerCase());

    for (let i = 1; i < filas.length; i++) {
      result.total++;
      const fila = filas[i];
      const fNum = i + 1;

      try {
        const codigo = fila[idx('codigo')]?.trim();
        const nombre = fila[idx('nombre')]?.trim();
        const precio = parseFloat(fila[idx('precio')]);

        if (!codigo || !nombre) throw new Error('codigo y nombre son obligatorios');
        if (isNaN(precio) || precio < 0) throw new Error('precio inválido');

        // Duplicado estricto por empresa
        const existe = await this.productoRepository.findOne({ where: { codigo, empresaId } });
        if (existe) {
          result.errores++;
          result.detalles.push({ fila: fNum, error: `Código ${codigo} ya existe en esta empresa`, estado: 'error' });
          continue;
        }

        const pIva  = idx('porcentajeiva') >= 0 ? parseFloat(fila[idx('porcentajeiva')]) : 18;
        const sMin  = idx('stockminimo')   >= 0 ? parseInt(fila[idx('stockminimo')])     : 0;
        const tipoRaw = idx('tipo') >= 0 ? fila[idx('tipo')]?.toLowerCase().trim() : 'producto';
        const tipo  = tipoRaw === 'servicio' ? 'servicio' : 'producto';

        await this.productoRepository.save(
          this.productoRepository.create({
            empresaId,
            codigo,
            nombre,
            precio,
            porcentajeIva:  isNaN(pIva) ? 18 : pIva,
            unidadMedida:   idx('unidadmedida') >= 0 ? (fila[idx('unidadmedida')] || 'PZA') : 'PZA',
            stockMinimo:    isNaN(sMin) ? 0 : sMin,
            categoria:      idx('categoria')   >= 0 ? (fila[idx('categoria')]    || undefined) : undefined,
            descripcion:    idx('descripcion') >= 0 ? (fila[idx('descripcion')]  || undefined) : undefined,
            tipo,
          } as any),
        );

        result.exitosos++;
        result.detalles.push({ fila: fNum, estado: 'ok' });
      } catch (err) {
        result.errores++;
        result.detalles.push({ fila: fNum, error: (err as Error).message, estado: 'error' });
      }
    }

    this.logger.log(`[Import Productos] empresa=${empresaId}: ${result.exitosos} ok, ${result.errores} errores`);
    return result;
  }

  // ──────────────────────────────────────────────────────────────────
  // Plantilla y Importar Proveedores
  // ──────────────────────────────────────────────────────────────────

  getPlantillaProveedores(): string {
    return [
      'nombre,rnc,telefono,email,direccion,contacto,categoria,diasPago',
      'Proveedor Ejemplo S.R.L.,101234567,809-555-0000,proveedor@email.com,Av. Principal #1,Juan Pérez,Materia prima,30',
      'Servicios Generales,00112345678,829-555-0001,info@servicios.com,Calle 2 #5,María López,Servicios,15',
    ].join('\n');
  }

  async importarProveedores(buffer: Buffer): Promise<ImportResult> {
    const filas  = this.parsearCSV(buffer);
    const result: ImportResult = { total: 0, exitosos: 0, errores: 0, detalles: [] };
    const empresaId = this.tenantService.getEmpresaId();

    if (filas.length < 2) {
      throw new BadRequestException('El archivo debe tener encabezado y al menos una fila de datos');
    }

    const headers  = filas[0].map(h => h.toLowerCase().replace(/\s/g, ''));
    const required = ['nombre', 'rnc'];
    const missing  = required.filter(r => !headers.includes(r));
    if (missing.length) {
      throw new BadRequestException(`Columnas requeridas faltantes: ${missing.join(', ')}`);
    }

    const idx = (name: string) => headers.indexOf(name.toLowerCase());

    for (let i = 1; i < filas.length; i++) {
      result.total++;
      const fila = filas[i];
      const fNum = i + 1;

      try {
        const nombre = fila[idx('nombre')]?.trim();
        const rnc    = fila[idx('rnc')]?.replace(/\D/g, '');

        if (!nombre) throw new Error('nombre es obligatorio');
        if (!rnc || (rnc.length !== 9 && rnc.length !== 11)) throw new Error('RNC debe tener 9 u 11 dígitos');

        const existe = await this.proveedorRepository.findOne({ where: { rnc, empresaId } });
        if (existe) {
          result.errores++;
          result.detalles.push({ fila: fNum, error: `RNC ${rnc} ya existe en esta empresa`, estado: 'error' });
          continue;
        }

        const diasPago = idx('diaspago') >= 0 ? parseInt(fila[idx('diaspago')]) : undefined;

        await this.proveedorRepository.save(
          this.proveedorRepository.create({
            empresaId,
            nombre,
            rnc,
            telefono:  idx('telefono')  >= 0 ? (fila[idx('telefono')]  || undefined) : undefined,
            email:     idx('email')     >= 0 ? (fila[idx('email')]     || undefined) : undefined,
            direccion: idx('direccion') >= 0 ? (fila[idx('direccion')] || undefined) : undefined,
            contacto:  idx('contacto')  >= 0 ? (fila[idx('contacto')]  || undefined) : undefined,
            categoria: idx('categoria') >= 0 ? (fila[idx('categoria')] || undefined) : undefined,
            diasPago:  !isNaN(diasPago!) ? diasPago : undefined,
          }),
        );

        result.exitosos++;
        result.detalles.push({ fila: fNum, estado: 'ok' });
      } catch (err) {
        result.errores++;
        result.detalles.push({ fila: fNum, error: (err as Error).message, estado: 'error' });
      }
    }

    this.logger.log(`[Import Proveedores] empresa=${empresaId}: ${result.exitosos} ok, ${result.errores} errores`);
    return result;
  }
}
