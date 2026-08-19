import { useState } from 'react';
import { Tabs, Button, Spin, Empty, Typography, Space, Badge, Tooltip, Checkbox } from 'antd';
import { ArchiveRestore, CheckCheck, Archive, MailOpen, Cloud, Trash2, Inbox } from 'lucide-react';
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
  useDesarchivar,
  useEliminar,
  useEliminarBulk,
  useDesarchivarBulk,
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
  selected,
  onToggle,
  onSelect,
  onLeer,
  onArchivar,
  onDesarchivar,
  onEliminar,
}: {
  mensaje:       MensajeBandeja;
  tab:           string;
  expanded:      boolean;
  selected:      boolean;
  onToggle:      (id: string) => void;
  onSelect:      (id: string, checked: boolean) => void;
  onLeer:        (id: string) => void;
  onArchivar:    (id: string) => void;
  onDesarchivar: (id: string) => void;
  onEliminar:    (id: string) => void;
}) {
  const noLeido = !mensaje.leidoEn;

  const handleToggle = () => {
    onToggle(mensaje.id);
    if (noLeido && !expanded) onLeer(mensaje.id);
  };

  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'flex-start',
        borderBottom: '1px solid var(--color-border, #f0f0f0)',
        background:   selected
          ? 'rgba(22,119,255,0.06)'
          : noLeido && !expanded
          ? 'var(--color-bg-unread, rgba(22,119,255,0.04))'
          : expanded
          ? 'rgba(0,0,0,0.015)'
          : 'transparent',
        transition:   'background 0.15s',
      }}
    >
      {/* Checkbox de selección */}
      <div
        style={{ padding: '16px 0 16px 16px', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onChange={e => onSelect(mensaje.id, e.target.checked)}
          aria-label="Seleccionar mensaje"
        />
      </div>

      {/* Contenido clicable (toggle) */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={handleToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(); } }}
        style={{
          flex:       1,
          minWidth:   0,
          cursor:     'pointer',
          padding:    '14px 8px 14px 12px',
          outline:    'none',
          display:    'flex',
          gap:        '10px',
          alignItems: 'flex-start',
        }}
        onFocus={e => { e.currentTarget.style.boxShadow = 'inset 0 0 0 2px rgba(22,119,255,0.3)'; }}
        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
      >
        {/* Punto de no leído */}
        <div style={{ paddingTop: 5, flexShrink: 0, width: 8 }}>
          {noLeido && (
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1677ff' }} />
          )}
        </div>

        {/* Texto */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <Text
              strong={noLeido}
              style={{ fontSize: 14 }}
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

          {expanded ? (
            <div style={{
              marginTop:  8,
              maxWidth:   '65ch',
              whiteSpace: 'pre-line',
              lineHeight: 1.65,
              fontSize:   14,
              color:      'var(--color-text-secondary, rgba(0,0,0,0.65))',
            }}>
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
      </div>

      {/* Acciones individuales */}
      <Space
        style={{ padding: '14px 16px 14px 0', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Marcar leído — solo si no leído y no es archivo */}
        {noLeido && tab !== 'archivo' && (
          <Tooltip title="Marcar como leído">
            <Button
              type="text" size="small"
              icon={<MailOpen size={14} />}
              onClick={() => onLeer(mensaje.id)}
            />
          </Tooltip>
        )}

        {/* Archivar — solo en pestañas no-archivo */}
        {tab !== 'archivo' && (
          <Tooltip title="Archivar">
            <Button
              type="text" size="small"
              icon={<Archive size={14} />}
              onClick={() => onArchivar(mensaje.id)}
            />
          </Tooltip>
        )}

        {/* Desarchivar — solo en pestaña archivo */}
        {tab === 'archivo' && (
          <Tooltip title="Desarchivar">
            <Button
              type="text" size="small"
              icon={<Inbox size={14} />}
              onClick={() => onDesarchivar(mensaje.id)}
            />
          </Tooltip>
        )}

        {/* Eliminar — siempre */}
        <Tooltip title="Eliminar">
          <Button
            type="text" size="small"
            danger
            icon={<Trash2 size={14} />}
            onClick={() => onEliminar(mensaje.id)}
          />
        </Tooltip>
      </Space>
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
  const desarchivar       = useDesarchivar();
  const eliminar          = useEliminar();
  const eliminarBulk      = useEliminarBulk();
  const desarchivarBulk   = useDesarchivarBulk();

  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const noLeidos      = mensajes.filter(m => !m.leidoEn).length;
  const selCount      = selectedIds.size;
  const todosSelected = mensajes.length > 0 && selCount === mensajes.length;

  const handleToggle = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(mensajes.map(m => m.id)) : new Set());
  };

  const handleEliminarBulk = () => {
    eliminarBulk.mutate([...selectedIds], {
      onSuccess: () => {
        setSelectedIds(new Set());
        setExpandedId(null);
      },
    });
  };

  const handleDesarchivarBulk = () => {
    desarchivarBulk.mutate([...selectedIds], {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>;
  }

  return (
    <div>
      {/* Barra de acciones — sin selección */}
      {mensajes.length > 0 && selCount === 0 && (
        <div style={{
          padding:      '8px 16px',
          borderBottom: '1px solid var(--color-border, #f0f0f0)',
          display:      'flex',
          alignItems:   'center',
          gap:           8,
        }}>
          <Checkbox
            checked={todosSelected}
            indeterminate={selCount > 0 && !todosSelected}
            onChange={e => handleSelectAll(e.target.checked)}
            style={{ marginRight: 4 }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>Seleccionar todos</Text>
          </Checkbox>

          {tab !== 'archivo' && noLeidos > 0 && (
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

      {/* Barra de acciones — con selección activa */}
      {selCount > 0 && (
        <div style={{
          padding:      '8px 16px',
          borderBottom: '1px solid var(--color-border, #f0f0f0)',
          display:      'flex',
          alignItems:   'center',
          gap:           8,
          background:   'rgba(22,119,255,0.04)',
        }}>
          <Checkbox
            checked={todosSelected}
            indeterminate={selCount > 0 && !todosSelected}
            onChange={e => handleSelectAll(e.target.checked)}
          />
          <Text style={{ fontSize: 13, flex: 1 }}>
            {selCount} seleccionado{selCount !== 1 ? 's' : ''}
          </Text>

          {tab === 'archivo' && (
            <Button
              size="small"
              icon={<Inbox size={13} />}
              loading={desarchivarBulk.isPending}
              onClick={handleDesarchivarBulk}
            >
              Desarchivar ({selCount})
            </Button>
          )}

          <Button
            size="small"
            danger
            icon={<Trash2 size={13} />}
            loading={eliminarBulk.isPending}
            onClick={handleEliminarBulk}
          >
            Eliminar ({selCount})
          </Button>

          <Button
            type="text" size="small"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancelar
          </Button>
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
            selected={selectedIds.has(m.id)}
            onToggle={handleToggle}
            onSelect={handleSelect}
            onLeer={id => marcarLeido.mutate(id)}
            onArchivar={id => archivar.mutate(id)}
            onDesarchivar={id => desarchivar.mutate(id)}
            onEliminar={id => {
              eliminar.mutate(id);
              if (expandedId === id) setExpandedId(null);
              setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
            }}
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
