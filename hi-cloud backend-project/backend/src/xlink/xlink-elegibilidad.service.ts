import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { TenantService } from '../tenant/tenant.service';
import { XlinkDocumentosRepository } from './xlink-documentos.repository';
import { XlinkTipoDocumento } from './entities/xlink-documento.entity';
import { ESTADOS_ECF_ACEPTABLES } from './xlink-publicar.service';
import { EstadoXlinkDto, EstadoXlinkItem } from './dto/estado-xlink.dto';

interface FilaElegibilidad {
  id: number;
  estado: string;
  tipoPago?: string | null;
  estadoDGII?: string | null;
  xlinkEmpresaXlinkId: string | null;
  destinoNombreError: string;
}

/**
 * Consulta de SOLO LECTURA: "¿puedo enviar este documento por HiCloud Xlink
 * ahora mismo, y si no, por qué?" — en lote, para la columna Xlink de los
 * listados y el envío masivo (Fase 2a, auditoría HiCloud Xlink 2026-10-03).
 *
 * Es una heurística de UX, igual que EnviarPorXlinkButton: la barrera REAL
 * sigue siendo XlinkPublicarService.publicar() — este servicio nunca
 * escribe nada, solo explica. Reutiliza ESTADOS_ECF_ACEPTABLES de
 * xlink-publicar.service.ts como única fuente de verdad de qué estado DGII
 * cuenta como aceptado — nunca duplicado con su propio criterio.
 */
@Injectable()
export class XlinkElegibilidadService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    @InjectRepository(Empresa) private empresaRepository: Repository<Empresa>,
    private tenantService: TenantService,
    private xlinkRepo: XlinkDocumentosRepository,
  ) {}

  async estadoDeDocumentos(dto: EstadoXlinkDto): Promise<EstadoXlinkItem[]> {
    const empresaId = this.tenantService.getEmpresaId();

    const [miEmpresa, estadosEnviados, filas] = await Promise.all([
      this.empresaRepository.findOne({ where: { id: empresaId } }),
      this.xlinkRepo.buscarEstadosPorOrigenes(dto.tipoDocumento, dto.documentoIds),
      this.resolverBulk(dto.tipoDocumento, dto.documentoIds, empresaId),
    ]);
    const miEmpresaVisible = miEmpresa?.xlinkVisible === true;

    const xlinkIds = [...new Set(filas.map(f => f.xlinkEmpresaXlinkId).filter((x): x is string => !!x))];
    const contrapartes = xlinkIds.length > 0
      ? await this.ds.query<{ xlinkId: string; isActive: boolean; xlinkVisible: boolean }[]>(
          `SELECT "xlinkId", "isActive", "xlinkVisible" FROM empresa WHERE "xlinkId" = ANY($1)`,
          [xlinkIds],
        )
      : [];
    const contraparteMap = new Map(contrapartes.map(c => [c.xlinkId, c]));
    const filasMap = new Map(filas.map(f => [f.id, f]));

    return dto.documentoIds.map((id): EstadoXlinkItem => {
      const enviado = estadosEnviados.get(id);
      if (enviado) {
        return { id, yaEnviado: true, estadoReceptor: enviado.estadoReceptor, numeroGenerado: enviado.numeroGenerado, elegible: false, motivo: 'Ya enviado' };
      }

      const fila = filasMap.get(id);
      if (!fila) {
        return { id, yaEnviado: false, elegible: false, motivo: 'Documento no encontrado' };
      }

      const motivo = this.calcularMotivo(dto.tipoDocumento, fila, miEmpresaVisible, contraparteMap);
      return { id, yaEnviado: false, elegible: !motivo, motivo: motivo ?? undefined };
    });
  }

  private calcularMotivo(
    tipo: XlinkTipoDocumento,
    f: FilaElegibilidad,
    miEmpresaVisible: boolean,
    contraparteMap: Map<string, { isActive: boolean; xlinkVisible: boolean }>,
  ): string | null {
    if (!miEmpresaVisible) return 'Active HiCloud Xlink para su empresa';

    const estadoAnulado = tipo === XlinkTipoDocumento.NOTA_CREDITO ? 'anulada' : 'cancelada';
    if (f.estado === estadoAnulado) return 'El documento está anulado';

    if (tipo === XlinkTipoDocumento.ORDEN_COMPRA) {
      if (f.estado !== 'enviada') return 'La orden debe estar en estado Enviada';
      if (!f.tipoPago) return 'Falta el término de pago';
    }

    if (tipo === XlinkTipoDocumento.FACTURA_CREDITO) {
      if (String(f.tipoPago).toLowerCase() !== 'credito') return 'Solo se pueden enviar facturas a crédito';
    }

    if (tipo === XlinkTipoDocumento.FACTURA_CREDITO || tipo === XlinkTipoDocumento.NOTA_CREDITO) {
      if (!f.estadoDGII || !ESTADOS_ECF_ACEPTABLES.includes(f.estadoDGII)) {
        return 'El e-CF debe estar aceptado por DGII';
      }
    }

    if (!f.xlinkEmpresaXlinkId) {
      return `${f.destinoNombreError} no está vinculado en HiCloud Xlink`;
    }

    const contraparte = contraparteMap.get(f.xlinkEmpresaXlinkId);
    if (!contraparte || !contraparte.isActive || !contraparte.xlinkVisible) {
      return `${f.destinoNombreError} ya no está visible en HiCloud Xlink`;
    }

    return null;
  }

  private async resolverBulk(
    tipo: XlinkTipoDocumento,
    ids: number[],
    empresaId: number,
  ): Promise<FilaElegibilidad[]> {
    switch (tipo) {
      case XlinkTipoDocumento.FACTURA_CREDITO: {
        const rows = await this.ds.query(
          `
          SELECT f.id, f.estado, f."tipoPago", e."estadoDGII",
                 cl."xlinkEmpresaXlinkId", cl.nombre AS "clienteNombre"
          FROM facturas f
          LEFT JOIN clientes cl ON cl.id = f."clienteId"
          LEFT JOIN ecf e ON e."facturaId" = f.id AND e."isActive" = true
          WHERE f.id = ANY($1) AND f."empresaId" = $2 AND f."isActive" = true
          `,
          [ids, empresaId],
        );
        return rows.map((r: any) => ({ ...r, destinoNombreError: r.clienteNombre ? `El cliente "${r.clienteNombre}"` : 'El cliente de esta factura' }));
      }
      case XlinkTipoDocumento.NOTA_CREDITO: {
        const rows = await this.ds.query(
          `
          SELECT nc.id, nc.estado, e."estadoDGII",
                 cl."xlinkEmpresaXlinkId", cl.nombre AS "clienteNombre"
          FROM notas_credito nc
          LEFT JOIN clientes cl ON cl.id = nc."clienteId"
          LEFT JOIN ecf e ON e."documentoOrigenId" = nc.id AND e."documentoOrigenTipo" = 'NOTA_CREDITO' AND e."isActive" = true
          WHERE nc.id = ANY($1) AND nc."empresaId" = $2 AND nc."isActive" = true
          `,
          [ids, empresaId],
        );
        return rows.map((r: any) => ({ ...r, destinoNombreError: r.clienteNombre ? `El cliente "${r.clienteNombre}"` : 'El cliente de esta NC' }));
      }
      case XlinkTipoDocumento.ORDEN_COMPRA: {
        const rows = await this.ds.query(
          `
          SELECT c.id, c.estado, c."tipoPago",
                 pr."xlinkEmpresaXlinkId", pr.nombre AS "proveedorNombre"
          FROM compras c
          LEFT JOIN proveedores pr ON pr.id = c."proveedorId"
          WHERE c.id = ANY($1) AND c."empresaId" = $2 AND c."isActive" = true
          `,
          [ids, empresaId],
        );
        return rows.map((r: any) => ({ ...r, destinoNombreError: r.proveedorNombre ? `El proveedor "${r.proveedorNombre}"` : 'El proveedor de esta Compra' }));
      }
    }
  }
}
