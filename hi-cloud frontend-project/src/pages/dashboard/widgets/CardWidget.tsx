import { Typography, theme } from 'antd';

const { Text } = Typography;

// ── Widget base reutilizable ─────────────────────────────────────────────────
export function CardWidget({ title, extra, children, noPad }: {
  title: string; extra?: React.ReactNode;
  children: React.ReactNode; noPad?: boolean;
}) {
  const { token } = theme.useToken();
  return (
    <div style={{
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12, overflow: 'hidden',
      // Llena la celda de la rejilla; el hueco entre tarjetas lo pone el gap,
      // no un marginBottom que ademas se sumaria al gap.
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <Text strong style={{ fontSize: 15 }}>{title}</Text>
        {extra}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  );
}

