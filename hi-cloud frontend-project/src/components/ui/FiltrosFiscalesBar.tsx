import { useState, type ReactNode } from 'react';
import { Input, Button, Popover, Space, Tag, Badge } from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

/**
 * Barra de filtros para listas de documentos fiscales (Notas de Crédito,
 * Notas de Débito, Devoluciones). Búsqueda y atajos de fecha SIEMPRE a la
 * vista; el resto (cliente, e-CF afectado, estado, monto...) vive detrás de
 * "Filtros" — cada página decide cuáles le aplican y las pasa como `extra`.
 *
 * Ningún filtro activo queda oculto: cada uno que aplique una página debe
 * traducirse en un chip aquí (fecha la arma este componente, el resto lo
 * arma la página que sabe qué representa cada valor).
 */

export type AtajoRango = 'mes' | 'mesAnterior' | 'anio' | 'todo';

export const ATAJOS_RANGO: { key: AtajoRango; label: string }[] = [
  { key: 'mes',         label: 'Este mes' },
  { key: 'mesAnterior', label: 'Mes anterior' },
  { key: 'anio',        label: 'Este año' },
  { key: 'todo',        label: 'Todo' },
];

/** 'todo' → sin filtro de fecha (desde/hasta undefined) — a propósito. */
export function calcularRangoAtajo(atajo: AtajoRango): { desde?: string; hasta?: string } {
  const hoy = dayjs();
  switch (atajo) {
    case 'mes':
      return { desde: hoy.startOf('month').format('YYYY-MM-DD'), hasta: hoy.endOf('month').format('YYYY-MM-DD') };
    case 'mesAnterior': {
      const m = hoy.subtract(1, 'month');
      return { desde: m.startOf('month').format('YYYY-MM-DD'), hasta: m.endOf('month').format('YYYY-MM-DD') };
    }
    case 'anio':
      return { desde: hoy.startOf('year').format('YYYY-MM-DD'), hasta: hoy.endOf('year').format('YYYY-MM-DD') };
    case 'todo':
    default:
      return {};
  }
}

export const ETIQUETA_ATAJO: Record<AtajoRango, string> = {
  mes: 'Este mes', mesAnterior: 'Mes anterior', anio: 'Este año', todo: 'Todo',
};

export interface FiltroChip { key: string; label: string; onClose: () => void; }

export function FiltrosFiscalesBar({
  search, onSearchChange, searchPlaceholder = 'Buscar...',
  atajo, onAtajoChange,
  chips, extra, extraCount = 0,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  atajo: AtajoRango;
  onAtajoChange: (a: AtajoRango) => void;
  /** Chips de filtros activos — la fecha la agrega la página (usa ETIQUETA_ATAJO), el resto también. */
  chips: FiltroChip[];
  /** Campos específicos de la página (cliente, e-CF afectado, estado, monto...) dentro del popover "Filtros". */
  extra?: ReactNode;
  /** Cuántos de esos campos extra están activos — se muestra como badge en el botón. */
  extraCount?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 16 }}>
      <Space wrap size={8} style={{ marginBottom: chips.length > 0 ? 8 : 0 }}>
        <Input
          placeholder={searchPlaceholder}
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          allowClear
          style={{ width: 260 }}
        />
        <Space.Compact>
          {ATAJOS_RANGO.map(a => (
            <Button key={a.key} type={atajo === a.key ? 'primary' : 'default'}
              onClick={() => onAtajoChange(a.key)}>
              {a.label}
            </Button>
          ))}
        </Space.Compact>
        {extra && (
          <Popover
            trigger="click"
            open={open}
            onOpenChange={setOpen}
            placement="bottomLeft"
            title="Más filtros"
            content={<div style={{ width: 280 }} onClick={e => e.stopPropagation()}>{extra}</div>}
          >
            <Badge count={extraCount} size="small" offset={[-4, 4]}>
              <Button icon={<FilterOutlined />}>Filtros</Button>
            </Badge>
          </Popover>
        )}
      </Space>
      {chips.length > 0 && (
        <Space wrap size={6}>
          {chips.map(c => (
            <Tag key={c.key} closable onClose={c.onClose} style={{ marginInlineEnd: 0 }}>
              {c.label}
            </Tag>
          ))}
        </Space>
      )}
    </div>
  );
}
