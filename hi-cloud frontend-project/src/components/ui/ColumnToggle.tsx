import { Dropdown, Checkbox, Tooltip, Button } from 'antd';
import { MenuOutlined, ReloadOutlined } from '@ant-design/icons';

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

interface ColumnToggleProps {
  columns: ColumnDef[];
  visibleColumns: string[];
  onChange: (visibleColumns: string[]) => void;
}

/** Las columnas que el módulo trae de fábrica. */
const porDefecto = (columns: ColumnDef[]) =>
  columns.filter(c => c.defaultVisible !== false).map(c => c.key);

export function ColumnToggle({ columns, visibleColumns, onChange }: ColumnToggleProps) {
  // Restaurar se deriva de `columns`, que ya llega como prop. Así el botón
  // aparece en las 126 tablas que usan este componente sin tocar ni una.
  // Mandar la lista por defecto equivale a borrar la preferencia: el hook
  // guarda solo las desviaciones, y aquí no hay ninguna.
  const defecto    = porDefecto(columns);
  const enDefecto  = defecto.length === visibleColumns.length
    && defecto.every(k => visibleColumns.includes(k));

  const items = [
    ...columns.map(col => ({
      key: col.key,
      label: (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0', cursor: 'pointer' }}
          onClick={e => {
            e.stopPropagation();
            const isVisible = visibleColumns.includes(col.key);
            // No permitir deseleccionar la última columna visible
            if (isVisible && visibleColumns.length === 1) return;
            onChange(
              isVisible
                ? visibleColumns.filter(k => k !== col.key)
                : [...visibleColumns, col.key],
            );
          }}
        >
          <Checkbox checked={visibleColumns.includes(col.key)} style={{ pointerEvents: 'none' }} />
          <span style={{ fontSize: 14 }}>{col.label}</span>
        </div>
      ),
    })),
    { type: 'divider' as const },
    {
      key: '__restaurar',
      disabled: enDefecto,
      label: (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0',
            cursor: enDefecto ? 'default' : 'pointer',
            opacity: enDefecto ? 0.45 : 1,
          }}
          onClick={e => {
            e.stopPropagation();
            if (enDefecto) return;
            onChange(defecto);
          }}
        >
          <ReloadOutlined style={{ fontSize: 13 }} />
          <span style={{ fontSize: 13 }}>Restaurar columnas</span>
        </div>
      ),
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"
      overlayStyle={{ minWidth: 190 }}>
      <Tooltip title="Mostrar / Ocultar campos">
        <Button type="text" size="small" icon={<MenuOutlined />} />
      </Tooltip>
    </Dropdown>
  );
}
