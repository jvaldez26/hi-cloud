/**
 * HiCloud ERP — Asistente Financiero con Claude AI
 * Analiza datos financieros de la empresa y responde preguntas en lenguaje natural.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { TenantService } from '../tenant/tenant.service';

export interface MensajeChat {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AsistenteService {
  private readonly logger = new Logger(AsistenteService.name);
  private client: Anthropic | null = null;

  constructor(
    private config: ConfigService,
    private ds: DataSource,
    private tenant: TenantService,
  ) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY', '');
    if (apiKey && !apiKey.includes('tu_anthropic')) {
      this.client = new Anthropic({ apiKey });
      this.logger.log('Claude AI configurado correctamente');
    } else {
      this.logger.warn('ANTHROPIC_API_KEY no configurada — asistente IA desactivado');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /** Obtiene snapshot financiero del mes actual de la empresa */
  private async getContextoFinanciero(empresaId: number): Promise<string> {
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const anio = hoy.getFullYear();

    try {
      const [ventas, compras, cxc, cxp, gastos, caja, stockBajo, factBorrador] = await Promise.all([
        this.ds.query<any[]>(`
          SELECT COALESCE(SUM("montoTotal"),0)::numeric AS total,
                 COUNT(id) AS cantidad,
                 COALESCE(SUM(CASE WHEN estado='pagada' THEN "montoTotal" ELSE 0 END),0)::numeric AS cobradas
          FROM facturas
          WHERE "empresaId"=$1 AND "isActive"=true AND estado != 'anulada'
            AND EXTRACT(MONTH FROM "fechaEmision")=$2 AND EXTRACT(YEAR FROM "fechaEmision")=$3
        `, [empresaId, mesActual, anio]),

        this.ds.query<any[]>(`
          SELECT COALESCE(SUM(total),0)::numeric AS total, COUNT(id) AS cantidad
          FROM compras
          WHERE "empresaId"=$1 AND "isActive"=true AND estado != 'anulada'
            AND EXTRACT(MONTH FROM fecha)=$2 AND EXTRACT(YEAR FROM fecha)=$3
        `, [empresaId, mesActual, anio]),

        this.ds.query<any[]>(`
          SELECT COALESCE(SUM("montoPendiente"),0)::numeric AS pendiente,
                 COUNT(id) AS cantidad,
                 COUNT(CASE WHEN "fechaVencimiento" < CURRENT_DATE THEN 1 END) AS vencidas
          FROM cuentas_por_cobrar
          WHERE "empresaId"=$1 AND "isActive"=true AND estado IN ('pendiente','pagada_parcial')
        `, [empresaId]),

        this.ds.query<any[]>(`
          SELECT COALESCE(SUM("montoPendiente"),0)::numeric AS pendiente,
                 COUNT(id) AS cantidad
          FROM cuentas_por_pagar
          WHERE "empresaId"=$1 AND "isActive"=true AND estado IN ('pendiente','pagada_parcial')
        `, [empresaId]),

        this.ds.query<any[]>(`
          SELECT COALESCE(SUM(monto),0)::numeric AS total, COUNT(id) AS cantidad
          FROM gastos
          WHERE "empresaId"=$1 AND "isActive"=true
            AND EXTRACT(MONTH FROM fecha)=$2 AND EXTRACT(YEAR FROM fecha)=$3
        `, [empresaId, mesActual, anio]),

        this.ds.query<any[]>(`
          SELECT COALESCE(SUM("saldoActual"),0)::numeric AS saldo
          FROM cuentas_bancarias
          WHERE "empresaId"=$1 AND "isActive"=true
        `, [empresaId]),

        this.ds.query<any[]>(`
          SELECT COUNT(id) AS cantidad FROM productos
          WHERE "empresaId"=$1 AND "isActive"=true AND stock <= "stockMinimo"
        `, [empresaId]),

        this.ds.query<any[]>(`
          SELECT COUNT(id) AS cantidad FROM facturas
          WHERE "empresaId"=$1 AND "isActive"=true AND estado='borrador'
        `, [empresaId]),
      ]);

      const v = ventas[0];
      const c = compras[0];
      const utilidadBruta = Number(v.total) - Number(c.total) - Number(gastos[0].total);

      return `
SNAPSHOT FINANCIERO — ${new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }).toUpperCase()}

VENTAS:
- Total facturado: RD$ ${Number(v.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
- Cantidad de facturas: ${v.cantidad}
- Facturas cobradas: RD$ ${Number(v.cobradas).toLocaleString('es-DO', { minimumFractionDigits: 2 })}

COMPRAS:
- Total compras: RD$ ${Number(c.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
- Cantidad de compras: ${c.cantidad}

GASTOS DEL MES:
- Total gastos: RD$ ${Number(gastos[0].total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}

RESULTADO ESTIMADO:
- Utilidad bruta: RD$ ${utilidadBruta.toLocaleString('es-DO', { minimumFractionDigits: 2 })}

CUENTAS POR COBRAR (pendientes totales):
- Monto pendiente: RD$ ${Number(cxc[0].pendiente).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
- Facturas pendientes: ${cxc[0].cantidad}
- Facturas vencidas: ${cxc[0].vencidas}

CUENTAS POR PAGAR (pendientes totales):
- Monto por pagar: RD$ ${Number(cxp[0].pendiente).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
- Facturas a pagar: ${cxp[0].cantidad}

LIQUIDEZ:
- Saldo bancario total: RD$ ${Number(caja[0].saldo).toLocaleString('es-DO', { minimumFractionDigits: 2 })}

ALERTAS:
- Productos con stock bajo: ${stockBajo[0].cantidad}
- Facturas en borrador: ${factBorrador[0].cantidad}
`.trim();
    } catch (err: any) {
      this.logger.warn(`Error obteniendo contexto financiero: ${err.message}`);
      return 'No se pudo obtener el contexto financiero completo.';
    }
  }

  /** Chat con el asistente — envía historial + nuevo mensaje del usuario */
  async chat(
    mensajes: MensajeChat[],
    mensajeUsuario: string,
  ): Promise<string> {
    if (!this.client) {
      return 'El asistente de IA no está configurado. Agrega tu ANTHROPIC_API_KEY en el archivo .env del servidor.';
    }

    const empresaId = this.tenant.getEmpresaId();
    const contexto = await this.getContextoFinanciero(empresaId);

    const systemPrompt = `Eres el asistente financiero de HiCloud ERP, un sistema ERP dominicano.
Eres un experto en contabilidad, finanzas y gestión empresarial con enfoque en el mercado dominicano.
Hablas siempre en español y usas pesos dominicanos (RD$) como moneda.
Eres conciso, práctico y orientado a dar recomendaciones accionables.

Tienes acceso a los siguientes datos actualizados de la empresa:

${contexto}

Instrucciones:
- Responde preguntas sobre los datos financieros de la empresa
- Ofrece análisis, tendencias y recomendaciones basadas en los datos
- Si el usuario hace preguntas generales de contabilidad o finanzas, respóndelas con contexto dominicano
- No inventes datos que no estén en el snapshot
- Sé directo y conciso (máximo 3-4 párrafos por respuesta)
- Usa formato markdown para respuestas largas (listas, negritas)`;

    const historial = mensajes.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...historial,
          { role: 'user', content: mensajeUsuario },
        ],
      });

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('');

      return text;
    } catch (err: any) {
      this.logger.error(`Error en Claude API: ${err.message}`);
      if (err.status === 401) {
        return 'API key de Anthropic inválida. Verifica tu ANTHROPIC_API_KEY en el .env del servidor.';
      }
      return `Error al procesar tu pregunta. Por favor intenta de nuevo. (${err.message})`;
    }
  }

  /** Genera análisis P&L completo del mes */
  async analizarPyL(): Promise<string> {
    if (!this.client) {
      return 'El asistente de IA no está configurado.';
    }

    const empresaId = this.tenant.getEmpresaId();
    const contexto = await this.getContextoFinanciero(empresaId);

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `Analiza los siguientes datos financieros y genera un análisis P&L detallado con:
1. Resumen ejecutivo (2-3 oraciones)
2. Análisis de ventas vs costos
3. Situación de liquidez y flujo de caja
4. Alertas y riesgos identificados
5. Recomendaciones prioritarias (máximo 5)

Datos:
${contexto}

Responde en español, usa formato markdown con emojis apropiados. Sé específico con los números.`,
        }],
      });

      return response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('');
    } catch (err: any) {
      return `Error generando análisis: ${err.message}`;
    }
  }
}
