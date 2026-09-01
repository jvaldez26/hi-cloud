import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cliente }   from '../clientes/entities/cliente.entity';
import { Producto }  from '../productos/entities/producto.entity';
import { Proveedor } from '../proveedores/entities/proveedor.entity';
import { TenantService } from '../tenant/tenant.service';
import { ProductoProveedorService } from '../productos/producto-proveedor.service';

export interface ImportResult {
  total:     number;
  exitosos:  number;
  errores:   number;
  /**
   * Filas que se importaron bien pero con una salvedad — hoy solo un proveedor
   * que no se pudo resolver. Se cuentan aparte de `errores` a propósito: la fila
   * entró, y mezclarlas haría que un CSV correcto pareciera fallido.
   */
  avisos?:   number;
  detalles:  Array<{ fila: number; error?: string; aviso?: string; estado: 'ok' | 'error' }>;
}

@Injectable()
export class ImportacionService {
  private readonly logger = new Logger(ImportacionService.name);

  constructor(
    @InjectRepository(Cliente)   private clienteRepository:   Repository<Cliente>,
    @InjectRepository(Producto)  private productoRepository:  Repository<Producto>,
    @InjectRepository(Proveedor) private proveedorRepository: Repository<Proveedor>,
    @InjectDataSource()          private ds: DataSource,
    private tenantService: TenantService,
    private productoProveedorSvc: ProductoProveedorService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Parser CSV genérico
  // ──────────────────────────────────────────────────────────────────

  private decodeBuffer(buffer: Buffer): { texto: string; encoding: 'utf-8' | 'windows-1252' } {
    const utf8 = buffer.toString('utf-8');
    if (!utf8.includes('�')) return { texto: utf8, encoding: 'utf-8' };
    // CP1252 mapea correctamente 0x80-0x9F (€ 0x80, comillas tipográficas 0x91-0x94,
    // guion largo 0x97, etc.). Latin-1 los trata como control chars — silencioso y erróneo.
    let cp1252: string;
    try {
      cp1252 = new TextDecoder('windows-1252').decode(buffer);
    } catch {
      cp1252 = buffer.toString('latin1'); // fallback si ICU no disponible
    }
    return { texto: cp1252, encoding: 'windows-1252' };
  }

  private parsearCSV(buffer: Buffer): string[][] {
    let { texto } = this.decodeBuffer(buffer);
    texto = texto.replace(/^﻿/, ''); // strip BOM
    const lineas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return lineas
      .map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
      .filter(l => l.some(c => c.length > 0))
      .filter(l => !l[0].toLowerCase().startsWith('sep='));
  }

  previewImportacion(buffer: Buffer): {
    encoding: 'utf-8' | 'windows-1252';
    headers: string[];
    rows: string[][];
  } {
    let { texto, encoding } = this.decodeBuffer(buffer);
    texto = texto.replace(/^﻿/, '');
    const lineas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const filas = lineas
      .map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
      .filter(l => l.some(c => c.length > 0))
      .filter(l => !l[0].toLowerCase().startsWith('sep='));
    return { encoding, headers: filas[0] ?? [], rows: filas.slice(1, 6) };
  }

  // ──────────────────────────────────────────────────────────────────
  // Plantillas CSV
  // ──────────────────────────────────────────────────────────────────

  getPlantillaClientes(): string {
    return [
      'sep=,',
      'nombre,rnc,email,telefono,direccion,ciudad',
      'Empresa Ejemplo S.R.L.,101234567,empresa@email.com,809-555-0000,Av. Principal #1,Santo Domingo',
      'Juan Perez,00112345678,juan@email.com,809-555-0001,Calle 1 #2,Santiago',
    ].join('\r\n');
  }

  getPlantillaProductos(): string {
    return [
      'sep=,',
      'codigo,nombre,precio,precio2,precio3,porcentajeItbis,unidadMedida,stock,stockMinimo,categoria,descripcion,tipo,almacen,proveedor',
      'PROD001,Producto Ejemplo,1500.00,1400.00,1300.00,18,PZA,50,5,General,Descripcion del producto,producto,Principal,Ferreteria Central SRL',
      'SERV001,Servicio Ejemplo,2500.00,,,18,HR,0,0,Servicios,Descripcion del servicio,servicio,,',
    ].join('\r\n');
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

        // Duplicado real = mismo RNC Y mismo nombre entre clientes ACTIVOS.
        // El RNC repetido con nombre distinto se importa: varias escuelas de un
        // mismo distrito educativo facturan bajo el RNC del distrito y son
        // clientes distintos. Un cliente borrado tampoco bloquea la reimportación.
        const existe = await this.clienteRepository
          .createQueryBuilder('c')
          .where('c.empresaId = :empresaId', { empresaId })
          .andWhere('c.isActive = true')
          .andWhere('c.rfc = :rnc', { rnc })
          .andWhere('lower(btrim(c.nombre)) = lower(btrim(:nombre))', { nombre })
          .getOne();
        if (existe) {
          result.errores++;
          result.detalles.push({
            fila:   fNum,
            error:  `Ya existe un cliente activo "${nombre}" con RNC/Cédula ${rnc} en esta empresa`,
            estado: 'error',
          });
          continue;
        }

        // Si el RNC ya lo usan otros clientes (escuelas del mismo distrito), se
        // hereda su razón social fiscal: ante DGII un RNC es un contribuyente y
        // todos deben declarar la misma. Sin esto, cada fila importada caería al
        // fallback de `nombre` y declararía algo distinto.
        const razonSocialGrupo = (await this.clienteRepository
          .createQueryBuilder('c')
          .select('DISTINCT btrim(c.razonSocial)', 'razonSocial')
          .where('c.empresaId = :empresaId', { empresaId })
          .andWhere('c.isActive = true')
          .andWhere('c.rfc = :rnc', { rnc })
          .andWhere("btrim(COALESCE(c.razonSocial, '')) <> ''")
          .getRawMany<{ razonSocial: string }>())
          .map(r => r.razonSocial);

        if (razonSocialGrupo.length > 1) {
          result.errores++;
          result.detalles.push({
            fila:   fNum,
            error:  `El RNC ${rnc} ya se declara con ${razonSocialGrupo.length} razones ` +
                    `sociales distintas (${razonSocialGrupo.join(', ')}). Unifícalas antes de importar.`,
            estado: 'error',
          });
          continue;
        }

        await this.clienteRepository.save(
          this.clienteRepository.create({
            empresaId,
            nombre,
            rfc:      rnc,
            razonSocial: razonSocialGrupo[0] ?? undefined,
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
    const userId    = this.tenantService.getUserId() ?? 1;
    const filas     = this.parsearCSV(buffer);
    const result: ImportResult = { total: 0, exitosos: 0, errores: 0, detalles: [] };

    if (filas.length < 2) {
      throw new BadRequestException('El archivo debe tener encabezado y al menos una fila de datos');
    }

    const headers = filas[0].map(h => h.toLowerCase().replace(/\s/g, ''));
    const required = ['nombre', 'precio'];
    const missing  = required.filter(r => !headers.includes(r));
    if (missing.length) {
      throw new BadRequestException(`Columnas requeridas faltantes: ${missing.join(', ')}`);
    }

    const idx = (name: string) => headers.indexOf(name.toLowerCase());

    // Acepta porcentajeItbis o porcentajeIva (compatibilidad)
    const idxItbis = idx('porcentajeitbis') >= 0 ? idx('porcentajeitbis') : idx('porcentajeiva');

    for (let i = 1; i < filas.length; i++) {
      result.total++;
      const fila = filas[i];
      const fNum = i + 1;

      try {
        const codigo = idx('codigo') >= 0 ? fila[idx('codigo')]?.trim() || undefined : undefined;
        const nombre = fila[idx('nombre')]?.trim();
        const precio = parseFloat(fila[idx('precio')]);

        if (!nombre) throw new Error('nombre es obligatorio');
        if (isNaN(precio) || precio < 0) throw new Error('precio inválido');

        // Duplicado estricto por empresa (solo si tiene código)
        if (codigo) {
          const existe = await this.productoRepository.findOne({ where: { codigo, empresaId } });
          if (existe) {
            result.errores++;
            result.detalles.push({ fila: fNum, error: `Código ${codigo} ya existe en esta empresa`, estado: 'error' });
            continue;
          }
        }

        const pItbis    = idxItbis >= 0 ? parseFloat(fila[idxItbis]) : 18;
        const sMin      = idx('stockminimo')   >= 0 ? parseFloat(fila[idx('stockminimo')])   : 0;
        const tipoRaw   = idx('tipo') >= 0 ? fila[idx('tipo')]?.toLowerCase().trim() : 'producto';
        const tipo      = tipoRaw === 'servicio' ? 'servicio' : 'producto';

        const p2Raw = idx('precio2') >= 0 ? fila[idx('precio2')] : '';
        const p3Raw = idx('precio3') >= 0 ? fila[idx('precio3')] : '';
        const precio2 = p2Raw?.trim() ? parseFloat(p2Raw) : undefined;
        const precio3 = p3Raw?.trim() ? parseFloat(p3Raw) : undefined;

        const stockInicial  = tipo === 'servicio' ? 0 : (idx('stock') >= 0 ? parseFloat(fila[idx('stock')]) || 0 : 0);
        const almacenNombre = idx('almacen') >= 0 ? fila[idx('almacen')]?.trim() || '' : '';

        const producto = await this.productoRepository.save(
          this.productoRepository.create({
            empresaId,
            codigo:       codigo ?? null,
            nombre,
            precio,
            precio2:      !isNaN(precio2!) ? precio2 : undefined,
            precio3:      !isNaN(precio3!) ? precio3 : undefined,
            porcentajeIva: isNaN(pItbis) ? 18 : pItbis,
            unidadMedida: idx('unidadmedida') >= 0 ? (fila[idx('unidadmedida')] || 'PZA') : 'PZA',
            stockMinimo:  isNaN(sMin) ? 0 : sMin,
            categoria:    idx('categoria')   >= 0 ? (fila[idx('categoria')]    || undefined) : undefined,
            descripcion:  idx('descripcion') >= 0 ? (fila[idx('descripcion')]  || undefined) : undefined,
            tipo,
            stock: 0,
          } as any),
        ) as unknown as Producto;

        // Registrar stock inicial en almacén (solo productos con stock > 0)
        if (tipo === 'producto' && stockInicial > 0) {
          let almacenId: number | null = null;

          if (almacenNombre) {
            const rows = await this.ds.query(
              `SELECT id FROM almacenes WHERE "empresaId" = $1 AND LOWER(nombre) = LOWER($2) AND "isActive" = true LIMIT 1`,
              [empresaId, almacenNombre],
            );
            if (rows.length) almacenId = rows[0].id;
          }

          if (!almacenId) {
            const rows = await this.ds.query(
              `SELECT id FROM almacenes WHERE "empresaId" = $1 AND "isActive" = true ORDER BY id ASC LIMIT 1`,
              [empresaId],
            );
            if (rows.length) almacenId = rows[0].id;
          }

          if (almacenId) {
            await this.ds.query(`
              INSERT INTO stock_almacen (
                "empresaId", "almacenId", "productoId", stock, "stockMinimo", "isActive", "createdAt", "updatedAt"
              ) VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
              ON CONFLICT ("almacenId", "productoId") DO UPDATE SET
                stock = EXCLUDED.stock, "updatedAt" = NOW()
            `, [empresaId, almacenId, producto.id, stockInicial, isNaN(sMin) ? 0 : sMin]);

            await this.productoRepository.update(producto.id, { stock: stockInicial });

            await this.ds.query(`
              INSERT INTO movimientos_inventario (
                "empresaId", "productoId", tipo, cantidad, "cantidadAnterior", "cantidadNueva",
                motivo, "almacenId", "userId", "isActive", "createdAt", "updatedAt"
              ) VALUES ($1, $2, 'entrada', $3, 0, $3, $4, $5, $6, true, NOW(), NOW())
            `, [empresaId, producto.id, stockInicial, 'Stock inicial por importación CSV', almacenId, userId]);
          }
        }

        // ── Vínculo con el proveedor (columna opcional) ─────────────────────
        //
        // A diferencia de `almacen`, aquí NO hay respaldo si el nombre no cuadra.
        // Un almacén equivocado es recuperable —el stock está en algún sitio y se
        // mueve—, pero un proveedor equivocado ensucia la pantalla de reposición
        // con productos que ese proveedor no vende, y nadie lo va a notar: no hay
        // ningún síntoma hasta que alguien pide de más a quien no debía.
        //
        // Se avisa en el detalle de la fila, que se importó igual: el producto es
        // el dato importante y el vínculo es accesorio.
        const proveedorNombre = idx('proveedor') >= 0 ? fila[idx('proveedor')]?.trim() || '' : '';
        let avisoProveedor: string | undefined;

        if (proveedorNombre) {
          const [prov] = await this.ds.query<{ id: number }[]>(
            `SELECT id FROM proveedores
              WHERE "empresaId" = $1 AND LOWER(nombre) = LOWER($2) AND "isActive" = true
              LIMIT 1`,
            [empresaId, proveedorNombre],
          );

          if (prov) {
            await this.productoProveedorSvc.vincularAlCrear(producto.id, prov.id);
          } else {
            avisoProveedor = `Proveedor "${proveedorNombre}" no encontrado — el producto se importó sin vincular`;
            result.avisos = (result.avisos ?? 0) + 1;
          }
        }

        result.exitosos++;
        result.detalles.push({ fila: fNum, estado: 'ok', ...(avisoProveedor ? { aviso: avisoProveedor } : {}) });
      } catch (err) {
        this.logger.error(`[Import Productos] fila ${fNum}: ${(err as Error).message}`);
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
      'sep=,',
      'nombre,rnc,telefono,email,direccion,contacto,categoria,diasPago',
      'Proveedor Ejemplo S.R.L.,101234567,809-555-0000,proveedor@email.com,Av. Principal #1,Juan Perez,Materia prima,30',
      'Servicios Generales,00112345678,829-555-0001,info@servicios.com,Calle 2 #5,Maria Lopez,Servicios,15',
    ].join('\r\n');
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
