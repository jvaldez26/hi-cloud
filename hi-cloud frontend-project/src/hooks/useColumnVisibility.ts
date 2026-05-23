import { useState } from 'react';
import type { ColumnType } from 'antd/es/table';

export interface ColDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

export function useColumnVisibility(moduloKey: string, allColumns: ColDef[]) {
  const storageKey = `hicloud-columns-${moduloKey}`;

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try { return JSON.parse(saved) as string[]; } catch { /* ignorar */ }
    }
    return allColumns.filter(c => c.defaultVisible !== false).map(c => c.key);
  });

  const updateVisibility = (cols: string[]) => {
    setVisibleColumns(cols);
    localStorage.setItem(storageKey, JSON.stringify(cols));
  };

  const filterColumns = <T,>(columns: ColumnType<T>[]): ColumnType<T>[] =>
    columns.filter(col => {
      const k = (col.key ?? (col as any).dataIndex) as string;
      // 'acc' / 'acciones' / 'actions' son siempre visibles (columna de botones)
      return k === 'acc' || k === 'acciones' || k === 'actions' || visibleColumns.includes(k);
    });

  return { visibleColumns, updateVisibility, filterColumns };
}
