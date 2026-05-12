import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { notification } from 'antd';
import api from '../api/client';

export interface Alerta {
  id:          string;
  tipo:        string;
  severidad:   'alta' | 'media' | 'baja';
  titulo:      string;
  descripcion: string;
  cantidad?:   number;
  monto?:      number;
  ruta:        string;
  emoji:       string;
}

interface AlertasResult {
  alertas:  Alerta[];
  total:    number;
  criticas: number;
}

async function fetchAlertas(): Promise<AlertasResult> {
  try {
    const res = await api.get('/alertas-sistema');
    // ResponseInterceptor envuelve: { success, data: AlertasResult, timestamp }
    const payload = (res as any).data?.data ?? (res as any).data;
    return payload as AlertasResult;
  } catch {
    return { alertas: [], total: 0, criticas: 0 };
  }
}

export function useAlertas() {
  const prevTotalRef = useRef<number>(0);

  const query = useQuery<AlertasResult>({
    queryKey:        ['alertas-sistema'],
    queryFn:         fetchAlertas,
    refetchInterval: 90_000, // cada 90 segundos
    staleTime:       60_000,
  });

  useEffect(() => {
    if (!query.data) return;
    const curr  = query.data;
    const prev  = prevTotalRef.current;

    if (prev > 0 && curr.criticas > 0 && curr.total > prev) {
      notification.warning({
        message:     '⚠️ Nueva alerta crítica',
        description: curr.alertas.find(a => a.severidad === 'alta')?.descripcion ?? 'Hay nuevas alertas en el sistema',
        placement:   'bottomRight',
        duration:    10,
      });
    }

    prevTotalRef.current = curr.total;
  }, [query.data]);

  return {
    alertas:  query.data?.alertas ?? [],
    total:    query.data?.total    ?? 0,
    criticas: query.data?.criticas ?? 0,
    isLoading: query.isLoading,
  };
}
