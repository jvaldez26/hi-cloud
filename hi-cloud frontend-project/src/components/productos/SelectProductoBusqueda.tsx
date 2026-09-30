import { useState, useMemo } from 'react';
import { Select } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../../hooks/useDebounce';
import { productosApi } from '../../api/productos.api';

/**
 * Selector de producto con búsqueda EN SERVIDOR.
 *
 * Nace de un caso real (2026-09-30): el modal "Registrar Entrada" de
 * Inventario → Movimientos no encontraba el producto 7465622022077 al teclear
 * su código de barras. Precargaba una lista y filtraba en el cliente por la
 * etiqueta `codigo — nombre (Stock: n)`, donde el código de BARRAS no aparece:
 * el producto existía, se veía en el POS, y aquí salía "No hay datos". Además
 * la lista venía recortada, así que un catálogo grande dejaba fuera productos
 * aunque se buscaran por nombre.
 *
 * El backend ya busca por nombre, código, categoría y codigoBarras
 * (productos.service.ts findAll), que es lo que usa el POS. Aquí se consume ese
 * mismo endpoint con filterOption={false}: quien filtra es el servidor, nunca
 * una lista parcial en memoria.
 *
 * Pensado también para pistola de código de barras: el escáner teclea rápido y
 * cierra con Enter, así que el Enter no espera al debounce — consulta el
 * término tal cual está escrito y, si hay UNA coincidencia exacta de código o
 * código de barras, la selecciona sola.
 */

export interface ProductoBuscado {
  id: number;
  codigo?: string;
  codigoBarras?: string;
  nombre: string;
  stock?: number;
  costoPromedio?: number;
}

/** Normaliza para comparar códigos: sin espacios alrededor y sin mayúsculas. */
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** true si el término es exactamente el código o el código de barras. */
export function esCoincidenciaExacta(p: ProductoBuscado, termino: string): boolean {
  const t = norm(termino);
  if (!t) return false;
  return norm(p.codigo) === t || norm(p.codigoBarras) === t;
}

/**
 * Las coincidencias exactas de código primero. El servidor ordena por nombre,
 * que con una búsqueda por código deja el producto escaneado en cualquier
 * posición de la lista.
 */
export function ordenarExactoPrimero<T extends ProductoBuscado>(
  productos: T[],
  termino: string,
): T[] {
  const exactos = productos.filter(p => esCoincidenciaExacta(p, termino));
  if (exactos.length === 0) return productos;
  return [...exactos, ...productos.filter(p => !esCoincidenciaExacta(p, termino))];
}

export interface SelectProductoBusquedaProps {
  /** id del producto — lo inyecta Form.Item */
  value?: number;
  onChange?: (id: number) => void;
  /** Se dispara con el producto completo (o null si se limpia). */
  onProductoSeleccionado?: (p: ProductoBuscado | null) => void;
  placeholder?: string;
  /** Añade "(Stock: n)" a la etiqueta. */
  conStock?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export default function SelectProductoBusqueda({
  value,
  onChange,
  onProductoSeleccionado,
  placeholder = 'Buscar por nombre, código o código de barras...',
  conStock = false,
  disabled,
  style,
}: SelectProductoBusquedaProps) {
  const qc = useQueryClient();
  const [termino, setTermino]   = useState('');
  const [elegido, setElegido]   = useState<ProductoBuscado | null>(null);
  const terminoD = useDebounce(termino, 300);

  const { data, isFetching } = useQuery({
    queryKey: ['producto-busqueda', terminoD],
    queryFn:  () => productosApi.list(1, 50, terminoD, true),
    enabled:  terminoD.trim().length >= 2,
    staleTime: 30_000,
  });

  const resultados = useMemo(
    () => ordenarExactoPrimero(((data as any)?.data ?? []) as ProductoBuscado[], terminoD),
    [data, terminoD],
  );

  const etiqueta = (p: ProductoBuscado) => {
    const codigo = p.codigo ?? p.codigoBarras ?? '—';
    return conStock ? `${codigo} — ${p.nombre} (Stock: ${p.stock ?? 0})` : `${codigo} — ${p.nombre}`;
  };

  // El elegido va siempre en las opciones: si no, al cambiar la búsqueda el
  // Select se queda con un id que no sabe pintar y muestra el número pelado.
  const opciones = useMemo(() => {
    const base = resultados.map(p => ({ value: p.id, label: etiqueta(p), producto: p }));
    if (elegido && !base.some(o => o.value === elegido.id)) {
      return [{ value: elegido.id, label: etiqueta(elegido), producto: elegido }, ...base];
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultados, elegido, conStock]);

  const seleccionar = (p: ProductoBuscado | null, id?: number) => {
    setElegido(p);
    onChange?.(p?.id ?? (id as number));
    onProductoSeleccionado?.(p);
  };

  /**
   * Enter de la pistola: no espera al debounce ni a que el desplegable se haya
   * refrescado — busca el término tal cual y autoselecciona si hay UNA exacta.
   */
  const handleEnter = async () => {
    const t = termino.trim();
    if (t.length < 2) return;

    const yaExactos = resultados.filter(p => esCoincidenciaExacta(p, t));
    if (yaExactos.length === 1) { seleccionar(yaExactos[0]); return; }
    if (yaExactos.length > 1) return; // ambiguo: que elija la persona

    const fresco: any = await qc.fetchQuery({
      queryKey: ['producto-busqueda', t],
      queryFn:  () => productosApi.list(1, 50, t, true),
      staleTime: 30_000,
    }).catch(() => null);

    const exactos = ((fresco?.data ?? []) as ProductoBuscado[])
      .filter(p => esCoincidenciaExacta(p, t));
    if (exactos.length === 1) seleccionar(exactos[0]);
  };

  return (
    <Select
      showSearch
      // El servidor es quien filtra. Con el filtro del cliente activo, la
      // búsqueda por código de barras volvería a fallar: no está en la etiqueta.
      filterOption={false}
      value={value}
      disabled={disabled}
      style={style ?? { width: '100%' }}
      placeholder={placeholder}
      loading={isFetching}
      allowClear
      searchValue={termino}
      onSearch={setTermino}
      onInputKeyDown={e => { if (e.key === 'Enter') void handleEnter(); }}
      onChange={(id: number) => {
        const opt = opciones.find(o => o.value === id);
        seleccionar((opt?.producto as ProductoBuscado) ?? null, id);
      }}
      notFoundContent={
        terminoD.trim().length < 2 ? 'Escribe al menos 2 caracteres'
        : isFetching               ? 'Buscando...'
        :                            'Sin resultados'
      }
      options={opciones}
      popupMatchSelectWidth={false}
    />
  );
}
