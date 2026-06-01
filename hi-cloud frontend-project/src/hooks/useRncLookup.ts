import { useState, useCallback, useRef } from 'react';
import api from '../api/client';

export interface RNCDatos {
  encontrado:             boolean;
  mensaje?:               string;
  rnc?:                   string;
  nombre?:                string;
  nombreComercial?:       string;
  estado?:                string;
  regimenPagos?:          string;
  actividadEconomica?:    string;
  facturadorElectronico?: boolean;
}

export function useRncLookup() {
  const [datos,   setDatos]   = useState<RNCDatos | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const consultar = useCallback(async (rnc: string) => {
    if (!rnc || !/^\d{9}$|^\d{11}$/.test(rnc)) {
      setDatos(null);
      return;
    }
    setLoading(true);
    try {
      const r = await api.get(`/rnc/consultar?rnc=${encodeURIComponent(rnc)}`);
      setDatos(r.data?.data ?? r.data ?? null);
    } catch {
      setDatos({ encontrado: false, mensaje: 'Error al consultar DGII' });
    } finally {
      setLoading(false);
    }
  }, []);

  /** Versión con debounce de 600ms para uso en onChange */
  const consultarDebounced = useCallback((rnc: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDatos(null);
    if (!rnc || !/^\d{9}$|^\d{11}$/.test(rnc)) return;
    debounceRef.current = setTimeout(() => consultar(rnc), 600);
  }, [consultar]);

  const limpiar = useCallback(() => setDatos(null), []);

  return { datos, loading, consultar, consultarDebounced, limpiar };
}
