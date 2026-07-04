import { useState } from 'react';
import { Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { productosApi } from '../api/productos.api';
import type { Producto } from '../types';

interface Props {
  /** ID del producto seleccionado (compatible con Form.Item) */
  value?: number;
  /** Callback con el ID — Form.Item lo usa automáticamente */
  onChange?: (value: number | undefined) => void;
  /** Callback adicional con el objeto completo al seleccionar */
  onProductoSelect?: (producto: Producto) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
}

/**
 * Selector de producto con búsqueda server-side.
 * Incluye productos sin stock (incluirSinStock=true) y soporta catálogos
 * de cualquier tamaño — busca en el backend al escribir 2+ letras.
 *
 * Compatible con Ant Design Form.Item (recibe value/onChange automáticamente).
 */
export default function ProductoSelect({
  value,
  onChange,
  onProductoSelect,
  style,
  placeholder,
  disabled,
  allowClear,
}: Props) {
  const [search, setSearch] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>();

  const { data, isFetching } = useQuery({
    queryKey: ['producto-select-search', search],
    queryFn:  () => productosApi.list(1, 50, search, true),
    enabled:  search.length >= 2,
    staleTime: 30_000,
  });

  const list: Producto[] = data?.data ?? [];

  const opts = list.map(p => ({
    value: p.id,
    label: p.codigo ? `${p.codigo} — ${p.nombre}` : p.nombre,
  }));

  // Mantener label del producto ya seleccionado aunque cambie la búsqueda
  const options = (() => {
    if (!value || !selectedLabel) return opts;
    if (opts.some(o => o.value === value)) return opts;
    return [{ value, label: selectedLabel }, ...opts];
  })();

  return (
    <Select
      style={style}
      value={value}
      showSearch
      allowClear={allowClear}
      placeholder={placeholder ?? 'Escribe para buscar...'}
      filterOption={false}
      onSearch={setSearch}
      loading={isFetching}
      notFoundContent={search.length < 2 ? 'Escribe al menos 2 letras' : 'Sin resultados'}
      options={options}
      popupMatchSelectWidth={false}
      dropdownStyle={{ minWidth: 360 }}
      disabled={disabled}
      onChange={(v) => {
        if (v === undefined) {
          onChange?.(undefined);
          setSelectedLabel(undefined);
          return;
        }
        const prod = list.find(p => p.id === v);
        if (prod) {
          const lbl = prod.codigo ? `${prod.codigo} — ${prod.nombre}` : prod.nombre;
          setSelectedLabel(lbl);
          onProductoSelect?.(prod);
        }
        onChange?.(v);
      }}
    />
  );
}
