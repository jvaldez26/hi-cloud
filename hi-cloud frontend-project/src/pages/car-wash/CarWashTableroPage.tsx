import { useEffect, useMemo, useState } from 'react';
import {
  Typography, Tag, Button, Input, Select, Space, message, Empty, theme,
  Segmented, Collapse, Avatar, Tooltip, Table,
} from 'antd';
import { SearchOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuthStore } from '../../store/auth.store';
import { useMobile } from '../../hooks/useMediaQuery';
import { carWashApi } from '../../api/car-wash.api';
import { guardarOrigenPendiente } from './carWashOrigen';
import CwTurnoDrawer from './CwTurnoDrawer';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import {
  LABEL_TIPO_VEHICULO_CW, LABEL_ESTADO_CW, COLOR_ESTADO_CW,
  ESTADOS_TURNO_CW, type EstadoTurnoCw,
} from './tipos';
import {
  minutosDesde, duracionEstimadaMin, colorTiempo, TIMESTAMP_POR_ESTADO,
  siguienteEstado, ORDEN_ESTADO, iniciales,
} from './tableroHelpers';

const { Title, Text } = Typography;

function claveVista(userId?: number | null) {
  return `cw_tablero_vista_${userId ?? 'anon'}`;
}

const COLS_LISTA = [
  { key: 'codigo', label: 'Código', defaultVisible: true },
  { key: 'placa', label: 'Placa', defaultVisible: true },
  { key: 'tipoVehiculo', label: 'Tipo', defaultVisible: true },
  { key: 'servicios', label: 'Servicios', defaultVisible: true },
  { key: 'lavadores', label: 'Lavadores', defaultVisible: true },
  { key: 'bahia', label: 'Bahía', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'tiempo', label: 'Tiempo', defaultVisible: true },
  { key: 'cobro', label: 'Cobro', defaultVisible: true },
  { key: 'acciones', label: '', defaultVisible: true },
];

export default function CarWashTableroPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const empresaActual = useAuthStore(s => s.empresaActual);
  const user = useAuthStore(s => s.user);
  const isMobile = useMobile();
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const [vista, setVista] = useState<'tablero' | 'lista'>(() => {
    try { return (localStorage.getItem(claveVista(user?.id)) as any) ?? 'tablero'; } catch { return 'tablero'; }
  });
  function cambiarVista(v: 'tablero' | 'lista') {
    setVista(v);
    try { localStorage.setItem(claveVista(user?.id), v); } catch { /* localStorage no disponible */ }
  }
  const vistaEfectiva = isMobile ? 'lista' : vista;

  const [busqueda, setBusqueda] = useState('');
  const [filtroBahia, setFiltroBahia] = useState<number | undefined>();
  const [filtroLavador, setFiltroLavador] = useState<number | undefined>();
  const [turnoAbierto, setTurnoAbierto] = useState<number | null>(null);

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('car-wash-tablero-lista', COLS_LISTA);

  const { data: turnos, isLoading } = useQuery({
    queryKey: ['cw-turnos'], queryFn: () => carWashApi.getTablero(), refetchInterval: 30_000,
  });
  const { data: config } = useQuery({ queryKey: ['cw-config'], queryFn: () => carWashApi.getConfig() });
  const { data: lavadores } = useQuery({ queryKey: ['cw-lavadores'], queryFn: () => carWashApi.getLavadores(true) });
  const usaSecado = !!config?.usaSecado;

  const hoy = dayjs().format('YYYY-MM-DD');
  const { data: entregadosHoy } = useQuery({
    queryKey: ['cw-entregados-hoy', hoy], queryFn: () => carWashApi.getHistorial({ estado: 'entregado', desde: hoy, hasta: hoy, limit: 200 }),
  });
  const { data: canceladosHoy } = useQuery({
    queryKey: ['cw-cancelados-hoy', hoy], queryFn: () => carWashApi.getHistorial({ estado: 'cancelado', desde: hoy, hasta: hoy, limit: 200 }),
  });

  const turnosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (turnos ?? []).filter((t: any) => {
      if (q && !(t.placa?.toLowerCase().includes(q) || t.codigo?.toLowerCase().includes(q))) return false;
      if (filtroBahia && t.bahia !== filtroBahia) return false;
      if (filtroLavador && !(t.lavadoresAsignados ?? []).some((l: any) => l.lavadorId === filtroLavador)) return false;
      return true;
    });
  }, [turnos, busqueda, filtroBahia, filtroLavador]);

  const resumen = useMemo(() => {
    const porEstado: Record<string, number> = {};
    let sumaMinutos = 0;
    for (const t of turnosFiltrados) {
      porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
      sumaMinutos += minutosDesde(t[TIMESTAMP_POR_ESTADO[t.estado as EstadoTurnoCw]]);
    }
    const promedio = turnosFiltrados.length ? Math.round(sumaMinutos / turnosFiltrados.length) : 0;
    return { porEstado, promedio };
  }, [turnosFiltrados]);

  const bahiasConocidas = useMemo(
    () => [...new Set((turnos ?? []).map((t: any) => t.bahia).filter(Boolean))] as number[],
    [turnos],
  );

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: any) => carWashApi.cambiarEstado(id, { estado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cw-turnos'] }),
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'No se pudo cambiar el estado'),
  });

  async function cobrar(turno: any) {
    try {
      const detalle = await carWashApi.getDetallesParaCobro(turno.id);
      guardarOrigenPendiente({
        empresaId: empresaActual!,
        origenTipo: 'car_wash_turno',
        origenId: turno.id,
        clienteId: detalle.clienteId,
        items: detalle.detalles.map((d: any) => ({ nombre: d.descripcion, cantidad: d.cantidad, precioUnitario: d.precioUnitario })),
      });
      navigate('/pos');
    } catch {
      message.error('No se pudo preparar el cobro');
    }
  }

  function onDropEnColumna(turnoId: number, estadoDestino: EstadoTurnoCw) {
    cambiarEstado.mutate({ id: turnoId, estado: estadoDestino });
  }

  const columnasTablero: EstadoTurnoCw[] = usaSecado
    ? ['en_espera', 'en_lavado', 'secado', 'listo']
    : ['en_espera', 'en_lavado', 'listo'];

  if (isLoading) return <div style={{ padding: 24 }}>Cargando…</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>Car Wash — Tablero</Title>
        {!isMobile && (
          <Segmented value={vista} onChange={v => cambiarVista(v as any)} options={[{ label: 'Tablero', value: 'tablero' }, { label: 'Lista', value: 'lista' }]} />
        )}
      </div>

      <Space wrap style={{ marginBottom: 8 }}>
        <Input
          placeholder="Buscar por placa o código" prefix={<SearchOutlined />} allowClear
          value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ width: 200 }}
        />
        <Select
          placeholder="Bahía" allowClear style={{ width: 110 }}
          value={filtroBahia} onChange={setFiltroBahia}
          options={bahiasConocidas.map(b => ({ value: b, label: `Bahía ${b}` }))}
        />
        <Select
          placeholder="Lavador" allowClear style={{ width: 160 }}
          value={filtroLavador} onChange={setFiltroLavador}
          options={(lavadores ?? []).map((l: any) => ({ value: l.id, label: l.nombre }))}
        />
        {vistaEfectiva === 'lista' && <ColumnToggle columns={COLS_LISTA} visibleColumns={visibleColumns} onChange={updateVisibility} />}
      </Space>

      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {ESTADOS_TURNO_CW.filter(e => e !== 'entregado' && e !== 'cancelado')
          .map(e => `${LABEL_ESTADO_CW[e]} ${resumen.porEstado[e] ?? 0}`).join(' · ')}
        {' · '}Promedio {resumen.promedio} min
      </Text>

      {vistaEfectiva === 'tablero' ? (
        <TableroVista
          columnas={columnasTablero}
          turnos={turnosFiltrados}
          usaSecado={usaSecado}
          onAvanzar={(id, estado) => cambiarEstado.mutate({ id, estado })}
          onAbrir={setTurnoAbierto}
          onDrop={onDropEnColumna}
        />
      ) : (
        <ListaVista
          turnos={turnosFiltrados}
          usaSecado={usaSecado}
          isMobile={isMobile}
          columns={filterColumns}
          onAvanzar={(id, estado) => cambiarEstado.mutate({ id, estado })}
          onAbrir={setTurnoAbierto}
          onCambiarEstadoDirecto={(id, estado) => cambiarEstado.mutate({ id, estado })}
        />
      )}

      <Collapse
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'entregados',
            label: `Entregados hoy (${entregadosHoy?.total ?? 0})`,
            children: <ListaCompacta turnos={entregadosHoy?.data ?? []} onAbrir={setTurnoAbierto} />,
          },
          {
            key: 'cancelados',
            label: `Cancelados hoy (${canceladosHoy?.total ?? 0})`,
            children: <ListaCompacta turnos={canceladosHoy?.data ?? []} onAbrir={setTurnoAbierto} />,
          },
        ]}
      />

      {turnoAbierto && (
        <CwTurnoDrawer turnoId={turnoAbierto} onClose={() => setTurnoAbierto(null)} usaSecado={usaSecado} onCobrar={cobrar} />
      )}
    </div>
  );
}

// ── Vista Tablero (Kanban) — drag and drop nativo HTML5 en escritorio ──────

function TableroVista({ columnas, turnos, usaSecado, onAvanzar, onAbrir, onDrop }: {
  columnas: EstadoTurnoCw[];
  turnos: any[];
  usaSecado: boolean;
  onAvanzar: (id: number, estado: EstadoTurnoCw) => void;
  onAbrir: (id: number) => void;
  onDrop: (id: number, estado: EstadoTurnoCw) => void;
}) {
  const porColumna = useMemo(() => {
    const mapa: Record<string, any[]> = {};
    for (const c of columnas) mapa[c] = [];
    for (const t of turnos) if (mapa[t.estado]) mapa[t.estado].push(t);
    return mapa;
  }, [turnos, columnas]);

  return (
    <div style={{ display: 'flex', gap: 16, width: '100%' }}>
      {columnas.map(col => (
        <div
          key={col}
          style={{ flex: 1, minWidth: 0 }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            const id = Number(e.dataTransfer.getData('text/plain'));
            const turno = turnos.find(t => t.id === id);
            if (id && turno && turno.estado !== col) onDrop(id, col);
          }}
        >
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {LABEL_ESTADO_CW[col]} ({porColumna[col]?.length ?? 0})
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', paddingRight: 4 }}>
            {(porColumna[col] ?? []).length === 0 && <Empty description={false} />}
            {(porColumna[col] ?? []).map(turno => (
              <TarjetaCompacta
                key={turno.id} turno={turno} usaSecado={usaSecado}
                onAvanzar={onAvanzar} onAbrir={onAbrir} draggable
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TarjetaCompacta({ turno, usaSecado, onAvanzar, onAbrir, draggable }: {
  turno: any;
  usaSecado: boolean;
  onAvanzar: (id: number, estado: EstadoTurnoCw) => void;
  onAbrir: (id: number) => void;
  draggable?: boolean;
}) {
  const { token } = theme.useToken();
  const minutos = minutosDesde(turno[TIMESTAMP_POR_ESTADO[turno.estado as EstadoTurnoCw]]);
  const estimado = duracionEstimadaMin(turno.servicios);
  const color = colorTiempo(minutos, estimado);
  const colorTexto = color === 'rojo' ? token.colorError : color === 'ambar' ? token.colorWarning : token.colorTextSecondary;
  const siguiente = siguienteEstado(turno.estado, usaSecado);
  const nombresServicios: string[] = (turno.servicios ?? []).map((s: any) => s.nombre);
  const visibles = nombresServicios.slice(0, 2);
  const extra = nombresServicios.length - visibles.length;
  const lavadoresAsignados = turno.lavadoresAsignados ?? [];

  return (
    <div
      draggable={draggable}
      onDragStart={e => e.dataTransfer.setData('text/plain', String(turno.id))}
      onClick={() => onAbrir(turno.id)}
      style={{
        border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, padding: '6px 10px',
        cursor: 'pointer', background: token.colorBgContainer,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
        <Text ellipsis style={{ fontSize: 13 }}>
          <strong>{turno.codigo}</strong> · {turno.placa} · {LABEL_TIPO_VEHICULO_CW[turno.tipoVehiculo as keyof typeof LABEL_TIPO_VEHICULO_CW]}
        </Text>
        <Text style={{ fontSize: 12, color: colorTexto, whiteSpace: 'nowrap' }}>{minutos} min</Text>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: token.colorTextSecondary, overflow: 'hidden' }}>
          <Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 110 }}>
            {visibles.join(', ')}{extra > 0 ? ` +${extra}` : ''}
          </Text>
          {lavadoresAsignados.map((l: any) => (
            <Tooltip key={l.lavadorId} title={l.nombre}>
              <Avatar size={16} style={{ fontSize: 9, flexShrink: 0 }}>{iniciales(l.nombre)}</Avatar>
            </Tooltip>
          ))}
          {!turno.facturaFolio && (
            <Tooltip title="Pendiente de cobro">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: token.colorWarning, display: 'inline-block', flexShrink: 0 }} />
            </Tooltip>
          )}
          {turno.bahia && <Tag style={{ margin: 0, fontSize: 10, lineHeight: '14px', padding: '0 4px' }}>B{turno.bahia}</Tag>}
        </div>
        {siguiente && (
          <Tooltip title={`Pasar a ${LABEL_ESTADO_CW[siguiente]}`}>
            <Button
              size="small" type="text" icon={<ArrowRightOutlined />}
              onClick={e => { e.stopPropagation(); onAvanzar(turno.id, siguiente); }}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ── Vista Lista — mismo patrón de tabla que las demás pantallas ────────────

function ListaVista({ turnos, usaSecado, isMobile, columns, onAvanzar, onAbrir, onCambiarEstadoDirecto }: {
  turnos: any[];
  usaSecado: boolean;
  isMobile: boolean;
  columns: <T,>(c: any[]) => any[];
  onAvanzar: (id: number, estado: EstadoTurnoCw) => void;
  onAbrir: (id: number) => void;
  onCambiarEstadoDirecto: (id: number, estado: EstadoTurnoCw) => void;
}) {
  const { token } = theme.useToken();
  const ordenados = useMemo(
    () => [...turnos].sort((a, b) => {
      const d = ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado);
      return d !== 0 ? d : String(a.createdAt).localeCompare(String(b.createdAt));
    }),
    [turnos],
  );

  const columnasBase = [
    { key: 'codigo', title: 'Código', dataIndex: 'codigo' },
    { key: 'placa', title: 'Placa', dataIndex: 'placa' },
    { key: 'tipoVehiculo', title: 'Tipo', dataIndex: 'tipoVehiculo', render: (v: string) => LABEL_TIPO_VEHICULO_CW[v as keyof typeof LABEL_TIPO_VEHICULO_CW] },
    {
      key: 'servicios', title: 'Servicios', dataIndex: 'servicios',
      render: (s: any[]) => (s ?? []).map(x => x.nombre).join(', '),
    },
    {
      key: 'lavadores', title: 'Lavadores', dataIndex: 'lavadoresAsignados',
      render: (l: any[]) => (l ?? []).map(x => x.nombre).join(', ') || '—',
    },
    { key: 'bahia', title: 'Bahía', dataIndex: 'bahia', render: (v: number) => v || '—' },
    {
      key: 'estado', title: 'Estado', dataIndex: 'estado',
      render: (v: EstadoTurnoCw, r: any) => (
        <Select
          size="small" value={v} style={{ width: 130 }}
          onClick={e => e.stopPropagation()}
          onChange={nuevo => onCambiarEstadoDirecto(r.id, nuevo)}
          options={ESTADOS_TURNO_CW.map(e => ({ value: e, label: LABEL_ESTADO_CW[e] }))}
        />
      ),
    },
    {
      key: 'tiempo', title: 'Tiempo', dataIndex: 'id',
      render: (_: any, r: any) => {
        const minutos = minutosDesde(r[TIMESTAMP_POR_ESTADO[r.estado as EstadoTurnoCw]]);
        const c = colorTiempo(minutos, duracionEstimadaMin(r.servicios));
        const colorTexto = c === 'rojo' ? token.colorError : c === 'ambar' ? token.colorWarning : undefined;
        return <span style={{ color: colorTexto }}>{minutos} min</span>;
      },
    },
    {
      key: 'cobro', title: 'Cobro', dataIndex: 'facturaFolio',
      render: (v: string) => v ? <Tag color="green">{v}</Tag> : <Tag color="orange">Pendiente</Tag>,
    },
    {
      key: 'acciones', title: '', dataIndex: 'id',
      render: (_: any, r: any) => {
        const siguiente = siguienteEstado(r.estado, usaSecado);
        if (!siguiente) return null;
        return (
          <Tooltip title={`Pasar a ${LABEL_ESTADO_CW[siguiente]}`}>
            <Button
              size={isMobile ? 'middle' : 'small'} type="primary" icon={<ArrowRightOutlined />}
              onClick={e => { e.stopPropagation(); onAvanzar(r.id, siguiente); }}
            />
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Table
      rowKey="id"
      size={isMobile ? 'large' : 'middle'}
      dataSource={ordenados}
      columns={columns(columnasBase)}
      pagination={false}
      onRow={r => ({ onClick: () => onAbrir(r.id), style: { cursor: 'pointer' } })}
    />
  );
}

function ListaCompacta({ turnos, onAbrir }: { turnos: any[]; onAbrir: (id: number) => void }) {
  if (!turnos.length) return <Empty description="Sin turnos" />;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {turnos.map(t => (
        <div key={t.id} style={{ width: 240 }}>
          <TarjetaCompacta turno={t} usaSecado={false} onAvanzar={() => {}} onAbrir={onAbrir} />
        </div>
      ))}
    </div>
  );
}
