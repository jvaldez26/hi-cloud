import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreditoCliente } from './entities/credito-cliente.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { TenantService } from '../tenant/tenant.service';

interface SetCreditoDto {
  limiteCredito: number;
  diasPlazo?:    number;
  notas?:        string;
}

@Injectable()
export class CreditoClienteService {
  constructor(
    @InjectRepository(CreditoCliente) private credRepo:    Repository<CreditoCliente>,
    @InjectRepository(Cliente)        private clienteRepo: Repository<Cliente>,
    private ds:        DataSource,
    private tenantSvc: TenantService,
  ) {}

  // ─── Configurar límite de crédito ─────────────────────────────────────────────

  async setCredito(clienteId: number, dto: SetCreditoDto) {
    const empresaId = this.tenantSvc.getEmpresaId();

    const cliente = await this.clienteRepo.findOne({ where: { id: clienteId, empresaId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    let credito = await this.credRepo.findOne({ where: { clienteId, empresaId } });

    if (credito) {
      await this.credRepo.update(credito.id, { limiteCredito: dto.limiteCredito, diasPlazo: dto.diasPlazo ?? credito.diasPlazo, notas: dto.notas });
      return this.credRepo.findOneByOrFail({ id: credito.id });
    } else {
      credito = await this.credRepo.save(
        this.credRepo.create({ empresaId, clienteId, limiteCredito: dto.limiteCredito, diasPlazo: dto.diasPlazo ?? 30, notas: dto.notas }),
      );
      return credito;
    }
  }

  // ─── Obtener estado de crédito ────────────────────────────────────────────────

  async getCredito(clienteId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    // CxC pendiente del cliente
    const cxcResult = await this.ds.query<{ total: string }[]>(`
      SELECT COALESCE(SUM("montoPendiente"), 0)::text AS total
      FROM cuentas_por_cobrar
      WHERE "clienteId" = $1 AND "empresaId" = $2
        AND estado IN ('pendiente', 'pagada_parcial') AND "isActive" = true
    `, [clienteId, empresaId]);

    const saldoUtilizado = +(cxcResult[0]?.total ?? 0);

    const credito = await this.credRepo.findOne({ where: { clienteId, empresaId } });

    if (!credito) {
      return { clienteId, limiteCredito: 0, saldoUtilizado, disponible: 0, diasPlazo: 30, activo: false, pctUtilizado: 0 };
    }

    // Actualizar saldo utilizado en la entidad
    await this.credRepo.update(credito.id, { saldoUtilizado });

    const limite      = Number(credito.limiteCredito);
    const disponible  = Math.max(0, limite - saldoUtilizado);
    const pctUtilizado = limite > 0 ? +((saldoUtilizado / limite) * 100).toFixed(1) : 0;

    return {
      ...credito,
      saldoUtilizado,
      disponible:    +disponible.toFixed(2),
      pctUtilizado,
      enRiesgo:      pctUtilizado >= 90,
      excedido:      saldoUtilizado > limite,
    };
  }

  // ─── Validar antes de facturar ────────────────────────────────────────────────

  async validarCredito(clienteId: number, montoNuevo: number): Promise<{
    aprobado: boolean; mensaje: string; detalle: any;
  }> {
    const estado = await this.getCredito(clienteId);

    if (!estado.activo || !estado.limiteCredito) {
      return { aprobado: true, mensaje: 'Sin límite de crédito configurado', detalle: estado };
    }

    const nuevaSaldoTotal = Number(estado.saldoUtilizado) + montoNuevo;

    if (nuevaSaldoTotal > Number(estado.limiteCredito)) {
      return {
        aprobado: false,
        mensaje:  `El monto supera el límite de crédito. Disponible: RD$ ${Number(estado.disponible).toLocaleString('es-DO')}`,
        detalle:  estado,
      };
    }

    return { aprobado: true, mensaje: 'Crédito disponible', detalle: estado };
  }

  // ─── Listar todos los clientes con crédito ────────────────────────────────────

  async listarCreditos() {
    const empresaId = this.tenantSvc.getEmpresaId();

    const creditos = await this.credRepo.find({
      where: { empresaId, isActive: true },
      order: { createdAt: 'ASC' },
    });

    // Actualizar saldos en batch
    const results = await Promise.all(
      creditos.map(c => this.getCredito(c.clienteId)),
    );

    // Obtener nombres de clientes
    const clienteIds = creditos.map(c => c.clienteId);
    const clientes   = clienteIds.length > 0
      ? await this.clienteRepo.find({ where: clienteIds.map(id => ({ id, empresaId })) as any })
      : [];
    const clienteMap = new Map(clientes.map(c => [c.id, c.nombre]));

    return results.map(r => ({
      ...r,
      clienteNombre: clienteMap.get(r.clienteId) ?? `Cliente #${r.clienteId}`,
    }));
  }

  // ─── Resumen global ───────────────────────────────────────────────────────────

  async resumen() {
    const creditos = await this.listarCreditos();
    const totalLimite     = creditos.reduce((s, c) => s + Number(c.limiteCredito),   0);
    const totalUtilizado  = creditos.reduce((s, c) => s + Number(c.saldoUtilizado),  0);
    const enRiesgo        = creditos.filter((c: any) => c.enRiesgo).length;
    const excedidos       = creditos.filter((c: any) => c.excedido).length;

    return {
      totalClientes:  creditos.length,
      totalLimite:    +totalLimite.toFixed(2),
      totalUtilizado: +totalUtilizado.toFixed(2),
      totalDisponible: +(totalLimite - totalUtilizado).toFixed(2),
      enRiesgo,
      excedidos,
    };
  }
}
