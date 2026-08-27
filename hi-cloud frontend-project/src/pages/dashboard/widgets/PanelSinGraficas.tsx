import { Button, Typography, theme } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * Lo que se ve cuando alguien ha quitado todas sus gráficas.
 *
 * No es el caso del usuario nuevo: ese entra con las cuatro de siempre puestas y
 * nunca ve esto. Aquí se llega solo a propósito, quitándolas una a una, y por eso
 * el mensaje no regaña — solo ofrece las dos salidas: poner una concreta, o
 * devolver el panel a como venía.
 *
 * La regla que esto cumple: nadie se queda mirando una pantalla vacía sin saber
 * cómo salir de ella.
 */
export function PanelSinGraficas({
  onReponer, botonAgregar,
}: {
  onReponer: () => void;
  botonAgregar: React.ReactNode;
}) {
  const { token } = theme.useToken();

  return (
    <div style={{
      marginTop: 16,
      padding: '40px 24px',
      textAlign: 'center',
      background: token.colorBgContainer,
      border: `1px dashed ${token.colorBorder}`,
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>

      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
        No tienes ninguna gráfica en el panel
      </div>
      <Text type="secondary" style={{ fontSize: 13 }}>
        Las quitaste todas. Puedes agregar las que quieras o dejarlo como venía.
      </Text>

      <div style={{
        marginTop: 20, display: 'flex', gap: 10,
        justifyContent: 'center', flexWrap: 'wrap',
      }}>
        {botonAgregar}
        <Button
          icon={<ReloadOutlined />}
          onClick={onReponer}
          style={{ minHeight: 44 }}
        >
          Restaurar las de siempre
        </Button>
      </div>
    </div>
  );
}

/** Aviso discreto: no se pudo leer la preferencia y se está con los defaults. */
export function AvisoPreferenciaDegradada() {
  const { token } = theme.useToken();
  return (
    <div style={{
      marginTop: 12, padding: '8px 12px', borderRadius: 8,
      background: token.colorWarningBg,
      border: `1px solid ${token.colorWarningBorder}`,
      fontSize: 12, color: token.colorTextSecondary,
    }}>
      <PlusOutlined style={{ marginRight: 6, opacity: 0 }} />
      No se pudo cargar tu selección de gráficas; estás viendo las de siempre.
      Los cambios que hagas ahora podrían no guardarse.
    </div>
  );
}
