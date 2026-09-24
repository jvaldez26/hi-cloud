import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Typography, theme, Progress } from 'antd';
import { CheckCircleFilled, RightOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons';
import { reportesApi } from '../../../api/reportes.api';
import { useAuthStore } from '../../../store/auth.store';
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
/** Ítems cuya ruta requiere un rol más allá de admin/contador (los dos que
 *  ven este widget, según el @Roles del endpoint) — "Usuarios" (/equipo)
 *  está detrás de RolRoute roles={['admin']}. Un contador que le hacía clic
 *  terminaba redirigido en silencio de vuelta a Inicio, sin aviso: parecía
 *  que el enlace "no llevaba a ningún lado". Se deja visible (informa igual
 *  si falta configurar), pero sin navegar para quien no tiene acceso. */
const CLAVES_SOLO_ADMIN = new Set(['usuarios']);

export function ChecklistConfiguracionInicial() {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const { user } = useAuthStore();
  const esAdmin = user?.role === 'admin';
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

  const items = Object.entries(data.items) as [string, { label: string; completo: boolean; ruta: string }][];
  const completados = items.filter(([, i]) => i.completo).length;

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
        {items.map(([clave, item], i) => {
          const navegable = esAdmin || !CLAVES_SOLO_ADMIN.has(clave);
          return (
            <div
              key={clave}
              onClick={navegable ? () => navigate(item.ruta) : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', cursor: navegable ? 'pointer' : 'default',
                borderTop: i > 0 ? `1px solid ${token.colorBorderSecondary}` : undefined,
                transition: 'background 0.12s',
              }}
              onMouseEnter={navegable ? (e => (e.currentTarget.style.background = token.colorFillAlter)) : undefined}
              onMouseLeave={navegable ? (e => (e.currentTarget.style.background = 'transparent')) : undefined}
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
              {navegable
                ? <RightOutlined style={{ fontSize: 10, color: token.colorTextQuaternary }} />
                : <Text type="secondary" style={{ fontSize: 11 }} title="Requiere rol de administrador">Solo admin</Text>}
            </div>
          );
        })}
      </div>
    </CardWidget>
  );
}
