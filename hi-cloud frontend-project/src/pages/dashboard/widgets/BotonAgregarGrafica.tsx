import { Button, Dropdown, Empty, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { WidgetCatalogo } from '../../../api/preferencias.api';
import { useMobile } from '../../../hooks/useMediaQuery';

/**
 * Menú de gráficas que el usuario todavía no tiene puestas.
 *
 * Las que ya están no salen en la lista: un menú donde la mitad de las opciones
 * no hacen nada obliga a leerlo entero para descubrir cuáles sirven.
 */
export function BotonAgregarGrafica({
  disponibles, onAgregar,
}: {
  disponibles: WidgetCatalogo[];
  onAgregar: (slug: string) => void;
}) {
  const { token } = theme.useToken();
  const isMobile  = useMobile();
  const noQuedan  = disponibles.length === 0;

  return (
    <Dropdown
      trigger={['click']}
      disabled={noQuedan}
      placement={isMobile ? 'bottom' : 'bottomRight'}
      menu={{
        items: disponibles.map(w => ({
          key: w.slug,
          label: w.titulo,
          // 44px de alto también aquí: este menú se usa desde la tablet de la caja.
          style: { minHeight: 44, display: 'flex', alignItems: 'center' },
        })),
        onClick: ({ key }) => onAgregar(String(key)),
        style: { maxHeight: '60vh', overflowY: 'auto' },
      }}
      dropdownRender={menu => (
        noQuedan
          ? <div style={{
              background: token.colorBgElevated, borderRadius: 8,
              boxShadow: token.boxShadowSecondary, padding: 12,
            }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Ya las tienes todas"
                style={{ margin: 0 }}
              />
            </div>
          : menu
      )}
    >
      <Button
        icon={<PlusOutlined />}
        size={isMobile ? 'middle' : 'small'}
        style={isMobile ? { minHeight: 44 } : undefined}
        title={noQuedan ? 'No queda ninguna gráfica por agregar' : undefined}
      >
        Agregar gráfica
      </Button>
    </Dropdown>
  );
}
