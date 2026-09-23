// Tabla genérica de "casillas" del IT-1/Anexo A — cada fila es una casilla
// oficial del formulario DGII (IT-1-2020.xls), con su número visible para
// que un contador pueda ubicarla en el formulario real.
//
// estado='no_aplica'/'requiere_revision': se muestra SIEMPRE con su nota —
// nunca oculta la fila ni la deja en 0 mudo (pedido explícito del usuario,
// mismo criterio que ya aplica el backend).

import { useState } from 'react';
import { Table, Tag, Tooltip, Typography, Button } from 'antd';
import { InfoCircleOutlined, WarningOutlined, FileSearchOutlined } from '@ant-design/icons';
import { fmt } from '../../utils/formatters';
import { CasillaSourceDrawer } from './CasillaSourceDrawer';
import type { FuenteCasilla } from './casillasFuente';

const { Text } = Typography;

export interface ConteoDocumentos {
  facturas?: number;
  notasCredito?: number;
  notasDebito?: number;
  compras?: number;
  gastosOperativos?: number;
}

export interface CasillaRaw {
  casilla: number;
  monto: number;
  estado?: 'calculada' | 'no_aplica' | 'requiere_revision';
  cantidad?: number;
  nota?: string;
  conteo?: ConteoDocumentos;
}

export interface CasillaFila extends CasillaRaw {
  label: string;
}

/** Recorre un objeto de sección (posiblemente anidado en subgrupos) y saca cada {casilla,monto,estado} — no depende de saber los nombres de las claves intermedias. */
export function flattenCasillas(obj: any): CasillaRaw[] {
  const out: CasillaRaw[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.casilla === 'number' && typeof node.monto === 'number') { out.push(node); return; }
    for (const k of Object.keys(node)) {
      if (k === 'avisos' || k.startsWith('_')) continue;
      walk(node[k]);
    }
  };
  walk(obj);
  return out.sort((a, b) => a.casilla - b.casilla);
}

export function conLabels(rows: CasillaRaw[], labels: Record<number, string>): CasillaFila[] {
  return rows.map(r => ({ ...r, label: labels[r.casilla] ?? `Casilla ${r.casilla}` }));
}

/** Motivo por defecto cuando el backend no trae `nota` explícita en la casilla — los avisos generales de la sección ya cubren el detalle. */
const ESTADO_TAG: Record<string, { color: string; texto: string; icono: JSX.Element }> = {
  no_aplica:         { color: 'default', texto: 'No aplica',         icono: <InfoCircleOutlined /> },
  requiere_revision: { color: 'orange',  texto: 'Requiere revisión', icono: <WarningOutlined /> },
};

export function CasillaTable({ rows, conCantidad = false, avisos = [], fuenteMap, periodo, todasLasCasillas }: {
  rows: CasillaFila[];
  conCantidad?: boolean;
  avisos?: string[];
  /** Metadata de fórmula/enlace por casilla — si no se pasa, no aparece el ícono de origen (misma tabla sirve sin el visor). */
  fuenteMap?: Record<number, FuenteCasilla>;
  periodo?: { mes: number; anio: number };
  /** Todas las casillas del documento (no solo las de esta tabla) — para resolver la cadena de referencias con su monto real. */
  todasLasCasillas?: CasillaFila[];
}) {
  const [casillaAbierta, setCasillaAbierta] = useState<CasillaFila | null>(null);

  const buscarAviso = (r: CasillaFila) => {
    if (r.nota) return r.nota;
    // Los avisos generales de la sección suelen citar "Casilla N" — se
    // engancha aquí para no duplicar el texto en cada fila.
    return avisos.find(a => a.includes(`Casilla ${r.casilla} `) || a.includes(`Casillas `) && a.includes(`${r.casilla}`));
  };

  const conVisorOrigen = !!fuenteMap && !!periodo;

  const columns = [
    { title: 'Casilla', dataIndex: 'casilla', width: 90,
      render: (v: number) => <Text strong style={{ fontFamily: 'monospace' }}>Casilla {v}</Text> },
    { title: 'Concepto', dataIndex: 'label' },
    ...(conCantidad ? [{ title: 'Cantidad', dataIndex: 'cantidad', width: 90, align: 'right' as const,
      render: (v?: number) => v ?? '—' }] : []),
    { title: 'Monto', dataIndex: 'monto', width: 150, align: 'right' as const,
      render: (v: number, r: CasillaFila) => (
        <Text strong={r.estado !== 'no_aplica'} type={r.estado && r.estado !== 'calculada' ? 'secondary' : undefined}>
          {/* Casilla 54 del Anexo A (Coeficiente de Proporcionalidad) es el
              único porcentaje entre las casillas de monto — todo lo demás
              es dinero. */}
          {r.casilla === 54 ? `${v.toFixed(2)}%` : fmt.money(v)}
        </Text>
      ) },
    { title: 'Estado', dataIndex: 'estado', width: 220,
      render: (v: string | undefined, r: CasillaFila) => {
        if (!v || v === 'calculada') return <Tag color="green">Calculada</Tag>;
        const cfg = ESTADO_TAG[v] ?? { color: 'default', texto: v, icono: <InfoCircleOutlined /> };
        const motivo = buscarAviso(r);
        const tag = <Tag color={cfg.color} icon={cfg.icono}>{cfg.texto}</Tag>;
        return motivo ? <Tooltip title={motivo}>{tag}</Tooltip> : tag;
      } },
    // Mismo gesto para toda la tabla, calculada o no — pedido explícito:
    // las 'no_aplica'/'requiere_revision' abren el mismo drawer, ya con su
    // nota (no hace falta fórmula ni enlace para esas).
    ...(conVisorOrigen ? [{ title: '', key: 'origen', width: 48, align: 'center' as const,
      render: (_: any, r: CasillaFila) => (
        <Tooltip title="Ver origen del dato">
          <Button type="text" size="small" icon={<FileSearchOutlined />} onClick={() => setCasillaAbierta(r)} />
        </Tooltip>
      ) }] : []),
  ];

  return (
    <>
      <Table
        rowKey="casilla" size="small" pagination={false}
        scroll={{ x: 'max-content' }}
        columns={columns}
        dataSource={rows}
      />
      {conVisorOrigen && (
        <CasillaSourceDrawer
          open={!!casillaAbierta}
          onClose={() => setCasillaAbierta(null)}
          casilla={casillaAbierta}
          fuente={casillaAbierta ? fuenteMap![casillaAbierta.casilla] : undefined}
          todasLasCasillas={todasLasCasillas ?? rows}
          periodo={periodo!}
          avisoNota={casillaAbierta ? buscarAviso(casillaAbierta) : undefined}
        />
      )}
    </>
  );
}
