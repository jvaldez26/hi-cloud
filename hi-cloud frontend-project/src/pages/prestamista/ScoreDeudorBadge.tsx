import { useQuery } from '@tanstack/react-query';
import { Tag, Popover, Skeleton } from 'antd';
import { prestamistalApi } from '../../api/prestamista.api';

const bandaColor: Record<string, string> = { A: 'green', B: 'blue', C: 'gold', D: 'orange', E: 'red' };

/**
 * Badge + desglose del score crediticio del deudor (Etapa 7) — nunca
 * aprueba/rechaza nada, es una señal más para quien decide (ficha del
 * deudor, Solicitudes). El desglose SIEMPRE muestra los 5 factores con sus
 * puntos y su explicación — nunca un número sin poder auditar de dónde
 * salió. Ver docs/prestamista/etapa-7-scoring.md.
 */
export default function ScoreDeudorBadge({ deudorId }: { deudorId?: number | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['prestamista-score-deudor', deudorId],
    queryFn: () => prestamistalApi.getScoreDeudor(Number(deudorId)),
    enabled: !!deudorId,
  });

  if (!deudorId) return null;
  if (isLoading) return <Skeleton.Button active size="small" style={{ width: 110 }} />;
  if (!data) return null;

  const contenido = (
    <div style={{ maxWidth: 320 }}>
      {data.sinHistorial && (
        <p style={{ marginBottom: 8, color: 'var(--ant-color-text-tertiary, #888)' }}>
          Cliente nuevo — sin historial de préstamos todavía. Puntaje neutral hasta que genere historial.
        </p>
      )}
      {(data.factores ?? []).map((f: any) => (
        <div key={f.factor} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <strong>{f.etiqueta}</strong>
            <span>{f.puntos}/{f.max}{f.sinDato ? ' (estimado)' : ''}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary, #888)' }}>{f.detalle}</div>
        </div>
      ))}
      {data.alertaCambioPatron && (
        <Tag color="gold" style={{ marginTop: 4, whiteSpace: 'normal' }}>{data.alertaCambioPatronDetalle}</Tag>
      )}
    </div>
  );

  return (
    <Popover content={contenido} title={`Score: ${data.score}/100 (${data.banda}) — ${data.bandaEtiqueta}`} trigger="click">
      <Tag color={bandaColor[data.banda] ?? 'default'} style={{ cursor: 'pointer' }}>
        Score: {data.score}/100 ({data.banda})
      </Tag>
    </Popover>
  );
}
