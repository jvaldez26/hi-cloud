import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Typography, theme, Progress } from 'antd';
import { CheckCircleFilled, RightOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons';
import { reportesApi } from '../../../api/reportes.api';
import { CardWidget } from './CardWidget';

const { Text } = Typography;

/**
 * Checklist de configuración inicial — visible mientras la empresa tenga
 * pasos pendientes (Catálogo de Cuentas, Secuencias e-CF, Clientes,
 * Proveedores, Productos, Usuarios). Cada ítem consulta el estado REAL vía
 * /reportes/dashboard/checklist-configuracion (cacheado 2 min en el
 * backend) — nunca un flag manual que alguien tenga que ir a marcar.
 *
 * Con todo en verde se colapsa solo a un enlace "Ver configuración" — no
 * desaparece del todo (así quien quiera revisar sus datos de nuevo puede),
 * pero deja de ocupar espacio para quien ya terminó de configurar.
 */
export function ChecklistConfiguracionInicial() {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [expandidoManual, setExpandidoManual] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['checklist-configuracion'],
    queryFn:  reportesApi.checklistConfiguracion,
    staleTime: 2 * 60_000,
    retry: 1,
  });

  // Sin datos (cargando o el endpoint falló): no bloquear el dashboard por
  // un widget de onboarding — se omite en silencio, no es información crítica.
  if (isLoading || isError || !data) return null;

  const items = Object.values(data.items) as { label: string; completo: boolean; ruta: string }[];
  const completados = items.filter(i => i.completo).length;

  if (data.completo && !expandidoManual) {
    return (
      <div
        onClick={() => setExpandidoManual(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '8px 4px', marginBottom: 12, color: token.colorTextSecondary, fontSize: 13,
        }}
      >
        <SettingOutlined />
        <Text type="secondary" style={{ fontSize: 13 }}>Ver configuración</Text>
      </div>
    );
  }

  return (
    <CardWidget
      title="Configuración inicial"
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{completados}/{items.length}</Text>
          {data.completo && (
            <DownOutlined
              style={{ fontSize: 11, color: token.colorTextTertiary, cursor: 'pointer' }}
              onClick={() => setExpandidoManual(false)}
            />
          )}
        </div>
      }
    >
      <div style={{ padding: '4px 16px 12px' }}>
        <Progress
          percent={Math.round((completados / items.length) * 100)}
          showInfo={false} size="small" strokeColor={token.colorPrimary}
          style={{ marginBottom: 8 }}
        />
      </div>
      <div>
        {items.map((item, i) => (
          <div
            key={i}
            onClick={() => navigate(item.ruta)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', cursor: 'pointer',
              borderTop: i > 0 ? `1px solid ${token.colorBorderSecondary}` : undefined,
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = token.colorFillAlter)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {item.completo
              ? <CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 16 }} />
              : <span style={{
                  width: 16, height: 16, borderRadius: '50%',
                  border: `2px solid ${token.colorBorder}`, display: 'inline-block', flexShrink: 0,
                }} />}
            <Text style={{ flex: 1, fontSize: 13, color: item.completo ? token.colorTextSecondary : token.colorText }}>
              {item.label}
            </Text>
            {!item.completo && (
              <Text type="warning" style={{ fontSize: 12 }}>Pendiente</Text>
            )}
            <RightOutlined style={{ fontSize: 10, color: token.colorTextQuaternary }} />
          </div>
        ))}
      </div>
    </CardWidget>
  );
}
