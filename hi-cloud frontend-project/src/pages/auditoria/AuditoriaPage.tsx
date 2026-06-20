import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import {
  Table, Card, Row, Col, Typography, Tag, Select, Space, Badge,
  Tabs, Input, theme, Modal, Tooltip, Button, message as antMessage,
} from 'antd';
import {
  SearchOutlined, WarningOutlined, CheckCircleOutlined,
  EyeOutlined, CopyOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts';
import { auditoriaApi } from '../../api/auditoria.api';
import { fmt } from '../../utils/formatters';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;

const accionColor: Record<string, string> = {
  create: 'green', update: 'blue', delete: 'red',
  login: 'cyan', logout: 'orange', error: 'red', read: 'default', export: 'purple',
};

const accionIcon: Record<string, string> = {
  create: '➕', update: '✏️', delete: '🗑️',
  login: '🔑', logout: '🚪', error: '❌', read: '👁️', export: '📤',
};

const NIVEL_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  CRITICO:    { color: 'red',     label: 'Crítico',    bg: 'rgba(239,68,68,0.07)'  },
  IMPORTANTE: { color: 'orange',  label: 'Importante', bg: 'rgba(245,158,11,0.07)' },
  NORMAL:     { color: 'default', label: 'Normal',     bg: 'transparent'           },
};

const isErrorLog  = (r: any) => r.accion === 'error' || !r.exitoso || (r.statusCode && r.statusCode >= 400);
const isLogoutLog = (r: any) => r.accion === 'logout' && r.exitoso !== false;

/** Modal de detalle completo de un evento de auditoría */
function DetalleModal({
  log, onClose, isSuperAdmin,
}: {
  log: any;
  onClose: () => void;
  isSuperAdmin: boolean;
}) {
  const { token } = theme.useToken();
  const isErr = isErrorLog(log);

  const tecnico: Record<string, any> = {};
  if (log.ruta)       tecnico.ruta       = log.ruta;
  if (log.metodo)     tecnico.metodo     = log.metodo;
  if (log.statusCode) tecnico.statusCode = log.statusCode;
  if (log.duracionMs) tecnico.duracionMs = `${log.duracionMs} ms`;
  if (log.userAgent)  tecnico.userAgent  = log.userAgent;
  if (log.entidad)    tecnico.entidad    = log.entidad;
  if (log.entidadId)  tecnico.entidadId  = log.entidadId;
  if (log.valorAnterior) {
    try { tecnico.valorAnterior = JSON.parse(log.valorAnterior); }
    catch { tecnico.valorAnterior = log.valorAnterior; }
  }
  if (log.valorNuevo) {
    try { tecnico.valorNuevo = JSON.parse(log.valorNuevo); }
    catch { tecnico.valorNuevo = log.valorNuevo; }
  }
  if (isSuperAdmin) {
    if (log.userId)    tecnico.userId    = log.userId;
    if (log.userRole)  tecnico.userRole  = log.userRole;
    if (log.empresaId) tecnico.empresaId = log.empresaId;
  }

  const jsonStr     = JSON.stringify(tecnico, null, 2);
  const hasTecnico  = Object.keys(tecnico).length > 0;
  const nivelCfg    = NIVEL_CONFIG[log.nivel] ?? NIVEL_CONFIG.NORMAL;

  const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: token.colorTextTertiary,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    display: 'block', marginBottom: 3,
  };
  const value: React.CSSProperties = {
    fontSize: 13, color: token.colorText, display: 'block', marginBottom: 10,
  };
  const section: React.CSSProperties = {
    background: token.colorBgLayout,
    borderRadius: 8, padding: '12px 16px', marginBottom: 12,
    border: `1px solid ${token.colorBorderSecondary}`,
  };

  return (
    <Modal
      open
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{isErr ? '❌' : '📋'}</span>
          <span>Detalle del Evento</span>
          {log.nivel && <Tag color={nivelCfg.color}>{nivelCfg.label}</Tag>}
          {isErr && <Tag color="error" style={{ fontWeight: 600 }}>ERROR</Tag>}
        </span>
      }
      onCancel={onClose}
      footer={null}
      width={660}
      destroyOnClose
    >
      {/* Info principal */}
      <div style={section}>
        <Row gutter={[16, 0]}>
          <Col span={12}>
            <span style={label}>Fecha</span>
            <span style={value}>{fmt.dateTime(log.createdAt)}</span>
          </Col>
          <Col span={12}>
            <span style={label}>IP</span>
            <span style={{ ...value, fontFamily: 'monospace' }}>{log.ipAddress ?? '—'}</span>
          </Col>
          <Col span={12}>
            <span style={label}>Usuario</span>
            <span style={value}>
              {log.userName ?? <em style={{ color: token.colorTextTertiary }}>no autenticado</em>}
              {log.userRole && (
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                  ({log.userRole})
                </Text>
              )}
            </span>
          </Col>
          <Col span={12}>
            <span style={label}>HTTP Status</span>
            <span style={{
              ...value, fontWeight: 700,
              color: log.statusCode >= 400 ? '#EF4444'
                   : log.statusCode >= 200 ? '#10B981'
                   : token.colorText,
            }}>
              {log.statusCode ?? '—'}
            </span>
          </Col>
          <Col span={12}>
            <span style={label}>Módulo</span>
            <div style={{ marginBottom: 10 }}>
              <Tag>{log.modulo?.toUpperCase()}</Tag>
            </div>
          </Col>
          <Col span={12}>
            <span style={label}>Acción</span>
            <div style={{ marginBottom: 10 }}>
              <Tag color={accionColor[log.accion]}>
                {accionIcon[log.accion]} {log.accion?.toUpperCase()}
              </Tag>
            </div>
          </Col>
          {(log.ruta || log.metodo) && (
            <Col span={24}>
              <span style={label}>Endpoint</span>
              <span style={{ ...value, fontFamily: 'monospace', fontSize: 12 }}>
                {log.metodo && (
                  <Tag style={{ marginRight: 6, fontFamily: 'monospace', fontSize: 11 }}>
                    {log.metodo}
                  </Tag>
                )}
                {log.ruta}
              </span>
            </Col>
          )}
          {log.duracionMs != null && (
            <Col span={12}>
              <span style={label}>Duración</span>
              <span style={value}>{log.duracionMs} ms</span>
            </Col>
          )}
        </Row>
      </div>

      {/* Descripción completa */}
      <div style={section}>
        <span style={label}>Descripción</span>
        <Text style={{
          display: 'block', fontSize: 13, lineHeight: 1.7,
          color: isErr ? '#EF4444' : token.colorText,
          whiteSpace: 'pre-wrap',
        }}>
          {log.descripcion}
        </Text>
      </div>

      {/* Detalle técnico JSON */}
      {hasTecnico && (
        <div style={{ ...section, marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={label}>
              Detalle técnico (JSON)
              {!isSuperAdmin && (
                <Text type="secondary" style={{ fontSize: 10, marginLeft: 6, textTransform: 'none', fontWeight: 400 }}>
                  — solo campos técnicos básicos
                </Text>
              )}
            </span>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(jsonStr);
                antMessage.success('JSON copiado al portapapeles');
              }}
            >
              Copiar JSON
            </Button>
          </div>
          <pre style={{
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 6, padding: '10px 14px',
            fontSize: 11.5, lineHeight: 1.65, margin: 0,
            maxHeight: 300, overflowY: 'auto',
            fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Courier New',monospace",
            color: token.colorText,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {jsonStr}
          </pre>
        </div>
      )}
    </Modal>
  );
}

function LogsTab({
  filtroExitoso,
  nivelesDefault,
}: {
  filtroExitoso?: boolean;
  nivelesDefault?: string[];
}) {
  const { token } = theme.useToken();
  const [page,       setPage]       = useState(1);
  const [accion,     setAccion]     = useState<string | undefined>();
  const [modulo,     setModulo]     = useState<string | undefined>();
  const [search,     setSearch]     = useState('');
  const [detallLog,  setDetallLog]  = useState<any>(null);
  const [nivelesSel, setNivelesSel] = useState<string[]>(nivelesDefault ?? []);

  const user         = useAuthStore(s => s.user);
  const isSuperAdmin = user?.role === 'super_admin';

  const nivelesParam = nivelesSel.length > 0 ? nivelesSel.join(',') : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, accion, modulo, filtroExitoso, nivelesParam],
    queryFn:  () => auditoriaApi.logs(page, 20, accion, modulo, filtroExitoso, nivelesParam),
  });

  const logsfiltrados = useMemo(() =>
    (data?.data ?? []).filter((i: any) =>
      String(i.userName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.descripcion ?? '').toLowerCase().includes(search.toLowerCase())
    ), [data, search]);

  const COLS_DEF = [
    { key: 'nivel',       label: 'Nivel',       defaultVisible: true  },
    { key: 'createdAt',   label: 'Fecha',       defaultVisible: true  },
    { key: 'userName',    label: 'Usuario',     defaultVisible: true  },
    { key: 'modulo',      label: 'Módulo',      defaultVisible: true  },
    { key: 'accion',      label: 'Acción',      defaultVisible: true  },
    { key: 'descripcion', label: 'Descripción', defaultVisible: true  },
    { key: 'ipAddress',   label: 'IP',          defaultVisible: false },
    { key: 'exitoso',     label: 'Estado',      defaultVisible: true  },
    { key: 'duracionMs',  label: 'ms',          defaultVisible: false },
  ];
  const sufijo = nivelesDefault?.join('-') ?? 'todos';
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility(`auditoria-${sufijo}`, COLS_DEF);

  const cols = [
    {
      title: 'Nivel', dataIndex: 'nivel', key: 'nivel', width: 100,
      render: (v: string) => {
        const cfg = NIVEL_CONFIG[v] ?? NIVEL_CONFIG.NORMAL;
        if (v === 'NORMAL') return <Tag>{cfg.label}</Tag>;
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: 'Fecha', dataIndex: 'createdAt', key: 'createdAt', width: 130,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmt.dateTime(v)}</Text>,
    },
    {
      title: 'Usuario', dataIndex: 'userName', key: 'userName', width: 120,
      render: (v: string, r: any) => (
        <div>
          <Text style={{ fontSize: 12 }}>{v ?? <em style={{ color: token.colorTextTertiary }}>—</em>}</Text>
          {r.userRole && (
            <Text type="secondary" style={{ display: 'block', fontSize: 10 }}>{r.userRole}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Módulo', dataIndex: 'modulo', key: 'modulo', width: 100,
      render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag>,
    },
    {
      title: 'Acción', dataIndex: 'accion', key: 'accion', width: 90,
      render: (v: string) => <Tag color={accionColor[v]}>{accionIcon[v]} {v?.toUpperCase()}</Tag>,
    },
    {
      title: 'Descripción', dataIndex: 'descripcion', key: 'descripcion', ellipsis: true,
      render: (v: string, r: any) => (
        <Tooltip title={v} placement="topLeft" mouseEnterDelay={0.5}>
          <span
            style={{
              cursor: 'pointer',
              color: isErrorLog(r)
                ? '#EF4444'
                : r.nivel === 'CRITICO'
                  ? '#dc2626'
                  : token.colorText,
              fontWeight: r.nivel === 'CRITICO' ? 600 : undefined,
            }}
            onClick={() => setDetallLog(r)}
          >
            {v}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'IP', dataIndex: 'ipAddress', key: 'ipAddress', width: 110,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 11 }}>{v ?? '—'}</Text>
      ),
    },
    {
      title: 'Estado', dataIndex: 'exitoso', key: 'exitoso', width: 80,
      render: (v: boolean, r: any) =>
        v ? <Badge status="success" text="OK" />
          : <Badge status="error" text={
              <span style={{ color: '#EF4444', fontWeight: 600 }}>
                {r.statusCode ? `${r.statusCode}` : 'Error'}
              </span>
            } />,
    },
    {
      title: 'ms', dataIndex: 'duracionMs', key: 'duracionMs', width: 70,
      render: (v: number) => (
        <Text type="secondary" style={{ fontSize: 11 }}>{v ?? '—'}</Text>
      ),
    },
  ];

  const colDetalle = {
    title: '',
    key: '_detalle',
    width: 44,
    fixed: 'right' as const,
    render: (_: any, r: any) => (
      <Tooltip title="Ver detalle completo">
        <Button
          size="small"
          type="text"
          icon={<EyeOutlined />}
          onClick={() => setDetallLog(r)}
          style={{
            color: isErrorLog(r)
              ? '#EF4444'
              : r.nivel === 'CRITICO'
                ? '#dc2626'
                : token.colorTextTertiary,
          }}
        />
      </Tooltip>
    ),
  };

  return (
    <>
      <style>{`
        .audit-row-critico   > td { background: rgba(239,68,68,0.06) !important; }
        .audit-row-importante > td { background: rgba(245,158,11,0.05) !important; }
        .audit-row-error     > td { background: rgba(239,68,68,0.08) !important; }
        .audit-row-logout    > td { background: rgba(245,158,11,0.04) !important; }
        [data-theme="dark"] .audit-row-critico   > td { background: rgba(239,68,68,0.10) !important; }
        [data-theme="dark"] .audit-row-importante > td { background: rgba(245,158,11,0.09) !important; }
        [data-theme="dark"] .audit-row-error     > td { background: rgba(239,68,68,0.12) !important; }
        [data-theme="dark"] .audit-row-logout    > td { background: rgba(245,158,11,0.07) !important; }
      `}</style>

      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <Col>
          <Select
            mode="multiple"
            value={nivelesSel}
            onChange={v => { setNivelesSel(v); setPage(1); }}
            placeholder="Nivel de importancia"
            style={{ minWidth: 220 }}
            maxTagCount="responsive"
            allowClear
          >
            <Select.Option value="CRITICO">🔴 Crítico</Select.Option>
            <Select.Option value="IMPORTANTE">🟠 Importante</Select.Option>
            <Select.Option value="NORMAL">⚪ Normal</Select.Option>
          </Select>
        </Col>
        <Col>
          <Select
            placeholder="Acción" allowClear style={{ width: 140 }}
            onChange={setAccion}
            options={['create','update','delete','login','logout','error','export']
              .map(v => ({ value: v, label: `${accionIcon[v]} ${v.toUpperCase()}` }))}
          />
        </Col>
        <Col>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Módulo (facturas, clientes...)"
            style={{ width: 200 }}
            onChange={e => setModulo(e.target.value || undefined)}
            allowClear
          />
        </Col>
        <Col>
          <Input
            placeholder="Buscar por usuario o descripción..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
            style={{ width: 220 }}
          />
        </Col>
        <Col>
          <ColumnToggle
            columns={COLS_DEF}
            visibleColumns={visibleColumns}
            onChange={updateVisibility}
          />
        </Col>
      </Row>

      <Table
        columns={[...filterColumns(cols), colDetalle]}
        dataSource={logsfiltrados}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        rowClassName={(r: any) => {
          if (isErrorLog(r))        return 'audit-row-error';
          if (r.nivel === 'CRITICO')    return 'audit-row-critico';
          if (r.nivel === 'IMPORTANTE') return 'audit-row-importante';
          if (isLogoutLog(r))       return 'audit-row-logout';
          return '';
        }}
        pagination={{
          total: data?.meta?.total,
          pageSize: 20,
          current: page,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: t => `${t} eventos`,
        }}
      />

      {detallLog && (
        <DetalleModal
          log={detallLog}
          onClose={() => setDetallLog(null)}
          isSuperAdmin={isSuperAdmin}
        />
      )}
    </>
  );
}

export default function AuditoriaPage() {
  const { data: resumen } = useQuery({ queryKey: ['audit-resumen'], queryFn: auditoriaApi.resumen });
  const { data: errores } = useQuery({ queryKey: ['audit-errores'], queryFn: () => auditoriaApi.errores(8) });
  const { bloqueado, config, plan } = usePlanGuard();
  if (bloqueado && config) return <ModuloBloqueado modulo="Auditoría del Sistema" planMinimo={config.planMinimo} planActual={plan} />;

  const chartAccion = (resumen?.distribucion?.porAccion ?? []).map((r: any) => ({
    name: `${accionIcon[r.accion] ?? ''} ${r.accion}`,
    cantidad: r.cantidad,
  }));

  const chartModulo = (resumen?.distribucion?.porModulo ?? []).slice(0, 8).map((r: any) => ({
    name: r.modulo,
    cantidad: r.cantidad,
  }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>Auditoría y Logs del Sistema</Title>
        <Space size={2}>
          <RefreshByKeyButton queryKey={['audit-logs']} />
          <VideoTutorialButton />
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Acciones este mes" size="small">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartAccion} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                <ReTooltip />
                <Bar dataKey="cantidad" fill="#1677ff" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Módulos más activos" size="small">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartModulo} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
                <ReTooltip />
                <Bar dataKey="cantidad" fill="#52c41a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          defaultActiveKey="importantes"
          items={[
            {
              key: 'importantes',
              label: '🔴 Crítico + Importante',
              children: <LogsTab nivelesDefault={['CRITICO', 'IMPORTANTE']} />,
            },
            {
              key: 'todos',
              label: '📋 Todos los eventos',
              children: <LogsTab />,
            },
            {
              key: 'errores',
              label: <><WarningOutlined /> Solo errores</>,
              children: <LogsTab filtroExitoso={false} />,
            },
          ]}
        />
      </Card>
    </div>
  );
}
