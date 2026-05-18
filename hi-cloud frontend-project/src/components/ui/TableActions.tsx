import { Button, Dropdown, Space, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { EyeOutlined, MoreOutlined } from '@ant-design/icons';

interface TableActionsProps {
  /** Callback al hacer click en el ojo — abre detalle/drawer */
  onView?: () => void;
  /** Items del dropdown ⋮ — todas las demás acciones */
  items?: MenuProps['items'];
  /** Texto del tooltip del ojo (default: "Ver detalle") */
  viewLabel?: string;
}

export function TableActions({ onView, items, viewLabel = 'Ver detalle' }: TableActionsProps) {
  return (
    <div className="hc-table-actions" style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
      {onView && (
        <Tooltip title={viewLabel} placement="left">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={(e) => { e.stopPropagation(); onView(); }}
            style={{ color: 'var(--hc-text-3, #94A3B8)' }}
          />
        </Tooltip>
      )}
      {items && items.length > 0 && (
        <Dropdown
          menu={{ items }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            onClick={(e) => e.stopPropagation()}
            style={{ color: 'var(--hc-text-3, #94A3B8)' }}
          />
        </Dropdown>
      )}
    </div>
  );
}
