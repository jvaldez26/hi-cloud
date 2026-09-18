import type { ReactNode } from 'react';
import { Collapse, Badge, Button, Space, Row } from 'antd';
import { ControlOutlined, FilterOutlined } from '@ant-design/icons';

interface AdvancedFiltersProps {
  /**
   * Cuántos filtros avanzados están activos ahora mismo (contados por el
   * caller, uno por campo con valor). Decide si el panel arranca abierto
   * (igual que FacturasPage.tsx) y si aparece el badge + "Limpiar".
   */
  activeCount: number;
  /** Solo se muestra "Limpiar" si hay al menos un filtro activo y se pasa este callback. */
  onClear?: () => void;
  /** Los campos del módulo (Select, RangePicker, InputNumber...), cada uno envuelto en un <Col>. */
  children: ReactNode;
}

/**
 * Panel de búsqueda avanzada reutilizable — mismo patrón visual que ya
 * usaba FacturasPage.tsx (Collapse "ghost" que se auto-expande si hay
 * filtros activos), pero como componente para no repetirlo módulo por
 * módulo. Se usa junto al buscador simple/select básicos de cada tabla,
 * nunca los reemplaza.
 */
export function AdvancedFilters({ activeCount, onClear, children }: AdvancedFiltersProps) {
  return (
    <Collapse
      ghost
      size="small"
      defaultActiveKey={activeCount > 0 ? ['adv'] : []}
      style={{ marginBottom: 12 }}
      items={[{
        key: 'adv',
        label: (
          <Space size={4}>
            <ControlOutlined />
            <span style={{ fontSize: 13 }}>Búsqueda avanzada</span>
            {activeCount > 0 && <Badge count={activeCount} />}
          </Space>
        ),
        extra: activeCount > 0 && onClear ? (
          <Button
            type="text" size="small" icon={<FilterOutlined />}
            onClick={e => { e.stopPropagation(); onClear(); }}
          >
            Limpiar
          </Button>
        ) : undefined,
        children: (
          <Row gutter={[12, 12]} style={{ paddingBottom: 4 }}>
            {children}
          </Row>
        ),
      }]}
    />
  );
}
