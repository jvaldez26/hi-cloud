import { useState } from 'react';
import { Tabs, Button, Spin, Empty, Typography, Space, Badge, Tooltip } from 'antd';
import { ArchiveRestore, CheckCheck, Archive, MailOpen, Cloud } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/es';
dayjs.extend(relativeTime);
dayjs.locale('es');
import {
  useBandeja,
  useMarcarLeido,
  useArchivar,
  useMarcarTodosLeidos,
  useNoLeidosCount,
} from '../../hooks/useMensajes';
import type { MensajeBandeja } from '../../api/mensajes.api';

const { Text, Title, Paragraph } = Typography;

// ─── Estado vacío con copy real ───────────────────────────────────────────────

function EstadoVacio({ tab }: { tab: string }) {
  const contenido: Record<string, { titulo: string; descripcion: string }> = {
    principal: {
      titulo:      '¡Estás al día!',
      descripcion: 'Aquí verás avisos importantes sobre tu cuenta y el sistema.',
    },
    novedades: {
      titulo:      '¡Estás al día!',
      descripcion: 'Aquí verás las nuevas funcionalidades de HiCloud.',
    },
    archivo: {
      titulo:      'No tienes mensajes archivados.',
      descripcion: '',
    },
  };

  const { titulo, descripcion } = contenido[tab] ?? contenido.principal;

  return (
    <Empty
      image={<Cloud size={56} strokeWidth={1} style={{ color: 'var(--color-text-tertiary, #bfbfbf)' }} />}
      description={
        <Space direction="vertical" size={4} style={{ textAlign: 'center' }}>
          <Title level={5} style={{ margin: 0 }}>{titulo}</Title>
          {descripcion && <Text type="secondary">{descripcion}</Text>}
        </Space>
      }
      style={{ padding: '64px 0' }}
    />
  );
}

// ─── Item de mensaje ──────────────────────────────────────────────────────────

function MensajeItem({
  mensaje,
  tab,
  onLeer,
  onArchivar,
}: {
  mensaje:   MensajeBandeja;
  tab:       string;
  onLeer:    (id: string) => void;
  onArchivar:(id: string) => void;
}) {
  const noLeido = !mensaje.leidoEn;
  const fecha = dayjs(mensaje.fechaPublicacion).fromNow();

  return (
    <div
      onClick={() => { if (noLeido) onLeer(mensaje.id); }}
      style={{
        padding:       '16px 20px',
        borderBottom:  '1px solid var(--color-border, #f0f0f0)',
        cursor:         noLeido ? 'pointer' : 'default',
        background:     noLeido ? 'var(--color-bg-unread, rgba(22,119,255,0.04))' : 'transparent',
        display:       'flex',
        gap:           '12px',
        alignItems:    'flex-start',
        transition:    'background 0.15s',
      }}
    >
      {/* Indicador de no leído */}
      <div style={{ paddingTop: 6, flexShrink: 0 }}>
        {noLeido
          ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1677ff' }} />
          : <div style={{ width: 8, height: 8 }} />
        }
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <Text strong={noLeido} style={{ fontSize: 14 }}>
            {mensaje.titulo}
            {mensaje.editadoEn && (
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>(editado)</Text>
            )}
          </Text>
          <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>{fecha}</Text>
        </div>
        <Paragraph
          ellipsis={{ rows: 2 }}
          type="secondary"
          style={{ margin: '4px 0 0', fontSize: 13 }}
        >
          {mensaje.cuerpo}
        </Paragraph>
      </div>

      {/* Acciones */}
      {tab !== 'archivo' && (
        <Space style={{ flexShrink: 0 }}>
          {noLeido && (
            <Tooltip title="Marcar como leído">
              <Button
                type="text" size="small"
                icon={<MailOpen size={14} />}
                onClick={e => { e.stopPropagation(); onLeer(mensaje.id); }}
              />
            </Tooltip>
          )}
          <Tooltip title="Archivar">
            <Button
              type="text" size="small"
              icon={<Archive size={14} />}
              onClick={e => { e.stopPropagation(); onArchivar(mensaje.id); }}
            />
          </Tooltip>
        </Space>
      )}
    </div>
  );
}

// ─── Pestaña de mensajes ──────────────────────────────────────────────────────

function PestanaContenido({
  tab,
  label,
}: {
  tab:   'principal' | 'novedades' | 'archivo';
  label: string;
}) {
  const { data: mensajes = [], isLoading } = useBandeja(tab);
  const marcarLeido        = useMarcarLeido();
  const archivar           = useArchivar();
  const marcarTodosLeidos  = useMarcarTodosLeidos();

  const noLeidos = mensajes.filter(m => !m.leidoEn).length;

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  }

  return (
    <div>
      {/* Barra de acciones */}
      {tab !== 'archivo' && mensajes.length > 0 && (
        <div style={{
          padding:       '8px 20px',
          borderBottom:  '1px solid var(--color-border, #f0f0f0)',
          display:       'flex',
          alignItems:    'center',
          gap:            8,
        }}>
          {noLeidos > 0 && (
            <Button
              type="text" size="small"
              icon={<CheckCheck size={14} />}
              loading={marcarTodosLeidos.isPending}
              onClick={() => marcarTodosLeidos.mutate(tab as 'principal' | 'novedades')}
            >
              Marcar todo como leído
            </Button>
          )}
        </div>
      )}

      {/* Lista */}
      {mensajes.length === 0
        ? <EstadoVacio tab={tab} />
        : mensajes.map(m => (
          <MensajeItem
            key={m.id}
            mensaje={m}
            tab={tab}
            onLeer={id => marcarLeido.mutate(id)}
            onArchivar={id => archivar.mutate(id)}
          />
        ))
      }
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function BandejaPage() {
  const [tab, setTab] = useState<'principal' | 'novedades' | 'archivo'>('principal');
  const { data: count = 0 } = useNoLeidosCount();

  const items = [
    {
      key:      'principal',
      label:    (
        <Space>
          Principal
          {count > 0 && <Badge count={count} size="small" />}
        </Space>
      ),
      children: <PestanaContenido tab="principal" label="Principal" />,
    },
    {
      key:      'novedades',
      label:    'Novedades',
      children: <PestanaContenido tab="novedades" label="Novedades" />,
    },
    {
      key:      'archivo',
      label:    (
        <Space>
          <ArchiveRestore size={13} />
          Archivo
        </Space>
      ),
      children: <PestanaContenido tab="archivo" label="Archivo" />,
    },
  ];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 16px 40px' }}>
      <Title level={4} style={{ margin: '24px 0 16px' }}>Bandeja de entrada</Title>
      <div style={{
        background:   'var(--color-bg-container, #fff)',
        borderRadius: 8,
        border:       '1px solid var(--color-border, #f0f0f0)',
        overflow:     'hidden',
      }}>
        <Tabs
          activeKey={tab}
          onChange={k => setTab(k as typeof tab)}
          items={items}
          style={{ padding: '0 8px' }}
          tabBarStyle={{ marginBottom: 0 }}
        />
      </div>
    </div>
  );
}
