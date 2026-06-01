import { Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';

const BASE_URL = 'https://rnc.megaplus.com.do/api';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export interface RNCDatos {
  encontrado:             boolean;
  mensaje?:               string;
  rnc?:                   string;
  nombre?:                string;
  nombreComercial?:       string;
  estado?:                string;  // 'ACTIVO' | 'SUSPENDIDO' | 'DADO DE BAJA'
  regimenPagos?:          string;
  actividadEconomica?:    string;
  administracionLocal?:   string;
  facturadorElectronico?: boolean;
}

export interface RNCResultado {
  rnc:    string;
  nombre: string;
  estado: string;
}

@Injectable()
export class RncService {
  private readonly logger = new Logger(RncService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async consultarRNC(rnc: string): Promise<RNCDatos> {
    const cacheKey = `rnc:${rnc}`;

    // Intentar desde caché primero
    const cached = await this.cacheManager.get<RNCDatos>(cacheKey);
    if (cached) {
      this.logger.debug(`RNC ${rnc} — respondido desde caché`);
      return cached;
    }

    try {
      const response = await fetch(`${BASE_URL}/consulta?rnc=${encodeURIComponent(rnc)}`, {
        signal: AbortSignal.timeout(8_000),
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        this.logger.warn(`RNC ${rnc} — API respondió ${response.status}`);
        return { encontrado: false, mensaje: 'DGII no disponible en este momento' };
      }

      const data = await response.json() as Record<string, unknown>;

      if (data['error'] || !data['rnc_consultado']) {
        return { encontrado: false, mensaje: String(data['mensaje'] ?? 'RNC no encontrado') };
      }

      const resultado: RNCDatos = {
        encontrado:            true,
        rnc:                   String(data['rnc_consultado'] ?? ''),
        nombre:                String(data['nombre_razon_social'] ?? ''),
        nombreComercial:       data['nombre_comercial'] ? String(data['nombre_comercial']) : undefined,
        estado:                String(data['estado'] ?? '').toUpperCase(),
        regimenPagos:          data['regimen_de_pagos']   ? String(data['regimen_de_pagos'])   : undefined,
        actividadEconomica:    data['actividad_economica'] ? String(data['actividad_economica']) : undefined,
        administracionLocal:   data['administracion_local'] ? String(data['administracion_local']) : undefined,
        facturadorElectronico: String(data['facturador_electronico'] ?? '').toUpperCase() === 'SI',
      };

      await this.cacheManager.set(cacheKey, resultado, CACHE_TTL_MS);
      this.logger.log(`RNC ${rnc} — ${resultado.nombre} (${resultado.estado})`);
      return resultado;

    } catch (err: any) {
      this.logger.warn(`Error consultando RNC ${rnc}: ${err?.message}`);
      return { encontrado: false, mensaje: 'Error al consultar DGII' };
    }
  }

  async buscarPorNombre(buscar: string): Promise<RNCResultado[]> {
    if (!buscar || buscar.trim().length < 3) return [];

    try {
      const response = await fetch(
        `${BASE_URL}/consulta/nombres?buscar=${encodeURIComponent(buscar.trim())}`,
        { signal: AbortSignal.timeout(8_000), headers: { 'Accept': 'application/json' } },
      );

      if (!response.ok) return [];

      const data = await response.json() as Record<string, unknown>;
      const resultados = (data['resultados'] as any[]) ?? [];

      return resultados.map(r => ({
        rnc:    String(r.rnc    ?? r.cedula ?? ''),
        nombre: String(r.nombre ?? r.nombre_razon_social ?? ''),
        estado: String(r.estado ?? '').toUpperCase(),
      }));

    } catch (err: any) {
      this.logger.warn(`Error buscando nombre "${buscar}": ${err?.message}`);
      return [];
    }
  }
}
