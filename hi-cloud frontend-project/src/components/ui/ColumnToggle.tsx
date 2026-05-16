import { Dropdown, Checkbox, Tooltip, Button } from 'antd';
import { MenuOutlined } from '@ant-design/icons';

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

export function ColumnToggle({ columns, visibleColumns, onChange }: ColumnToggleProps) {
  const items = columns.map(col => ({
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
  }));

  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight"
      overlayStyle={{ minWidth: 190 }}>
      <Tooltip title="Mostrar / Ocultar campos">
        <Button type="text" size="small" icon={<MenuOutlined />} />
      </Tooltip>
    </Dropdown>
  );
}
