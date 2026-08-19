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

// ─── Estado vacío ─────────────────────────────────────────────────────────────

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
  expanded,
  onToggle,
  onLeer,
  onArchivar,
}: {
  mensaje:    MensajeBandeja;
  tab:        string;
  expanded:   boolean;
  onToggle:   (id: string) => void;
  onLeer:     (id: string) => void;
  onArchivar: (id: string) => void;
}) {
  const noLeido = !mensaje.leidoEn;

  const handleToggle = () => {
    onToggle(mensaje.id);
    // Marcar como leído al abrir si aún no lo estaba
    if (noLeido && !expanded) onLeer(mensaje.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={handleToggle}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(); } }}
      style={{
        padding:       '14px 20px',
        borderBottom:  '1px solid var(--color-border, #f0f0f0)',
        cursor:        'pointer',
        background:    noLeido && !expanded
          ? 'var(--color-bg-unread, rgba(22,119,255,0.04))'
          : expanded
          ? 'var(--color-bg-expanded, rgba(0,0,0,0.02))'
          : 'transparent',
        display:       'flex',
        gap:           '12px',
        alignItems:    'flex-start',
        transition:    'background 0.15s',
        outline:       'none',
      }}
      onFocus={e => { e.currentTarget.style.boxShadow = 'inset 0 0 0 2px rgba(22,119,255,0.35)'; }}
      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Indicador de no leído */}
      <div style={{ paddingTop: 5, flexShrink: 0, width: 8 }}>
        {noLeido && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1677ff' }} />
        )}
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Cabecera: título + fecha */}
        <div style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'baseline',
          gap:            8,
        }}>
          <Text
            strong={noLeido}
            style={{ fontSize: 14, color: noLeido ? 'var(--color-text, inherit)' : undefined }}
          >
            {mensaje.titulo}
            {mensaje.editadoEn && (
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 6, fontWeight: 400 }}>
                (editado)
              </Text>
            )}
          </Text>
          <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
            {dayjs(mensaje.fechaPublicacion).fromNow()}
          </Text>
        </div>

        {/* Resumen (2 líneas) o cuerpo completo expandido */}
        {expanded ? (
          <div
            style={{
              marginTop:    8,
              maxWidth:     '65ch',
              whiteSpace:   'pre-line',   // respeta \n del texto original
              lineHeight:   1.65,
              fontSize:     14,
              color:        'var(--color-text-secondary, rgba(0,0,0,0.65))',
            }}
          >
            {mensaje.cuerpo}
          </div>
        ) : (
          <Paragraph
            ellipsis={{ rows: 2 }}
            type="secondary"
            style={{ margin: '4px 0 0', fontSize: 13 }}
          >
            {mensaje.cuerpo}
          </Paragraph>
        )}
      </div>

      {/* Acciones — stopPropagation para que no disparen el toggle */}
      {tab !== 'archivo' && (
        <Space style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {noLeido && (
            <Tooltip title="Marcar como leído">
              <Button
                type="text" size="small"
                icon={<MailOpen size={14} />}
                onClick={() => onLeer(mensaje.id)}
              />
            </Tooltip>
          )}
          <Tooltip title="Archivar">
            <Button
              type="text" size="small"
              icon={<Archive size={14} />}
              onClick={() => onArchivar(mensaje.id)}
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
}: {
  tab: 'principal' | 'novedades' | 'archivo';
}) {
  const { data: mensajes = [], isLoading } = useBandeja(tab);
  const marcarLeido       = useMarcarLeido();
  const archivar          = useArchivar();
  const marcarTodosLeidos = useMarcarTodosLeidos();

  // ID del mensaje actualmente expandido (null = ninguno)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const noLeidos = mensajes.filter(m => !m.leidoEn).length;

  const handleToggle = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  }

  return (
    <div>
      {/* Barra de acciones */}
      {tab !== 'archivo' && mensajes.length > 0 && (
        <div style={{
          padding:      '8px 20px',
          borderBottom: '1px solid var(--color-border, #f0f0f0)',
          display:      'flex',
          alignItems:   'center',
          gap:           8,
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
            expanded={expandedId === m.id}
            onToggle={handleToggle}
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
      children: <PestanaContenido tab="principal" />,
    },
    {
      key:      'novedades',
      label:    'Novedades',
      children: <PestanaContenido tab="novedades" />,
    },
    {
      key:      'archivo',
      label:    (
        <Space>
          <ArchiveRestore size={13} />
          Archivo
        </Space>
      ),
      children: <PestanaContenido tab="archivo" />,
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
