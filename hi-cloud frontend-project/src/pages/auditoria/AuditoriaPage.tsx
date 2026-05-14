import { useState } from 'react';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import { Table, Card, Row, Col, Typography, Statistic, Tag, Select,
         Space, Badge, Tabs, Input } from 'antd';
import { SearchOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { auditoriaApi } from '../../api/auditoria.api';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const accionColor: Record<string, string> = {
  create: 'green', update: 'blue', delete: 'red',
  login: 'cyan', logout: 'default', error: 'red', read: 'default',
};

const accionIcon: Record<string, string> = {
  create: '➕', update: '✏️', delete: '🗑️',
  login: '🔑', logout: '🚪', error: '❌', read: '👁️',
};

function LogsTab({ filtroExitoso }: { filtroExitoso?: boolean }) {
  const [page,   setPage]   = useState(1);
  const [accion, setAccion] = useState<string | undefined>();
  const [modulo, setModulo] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, accion, modulo, filtroExitoso],
    queryFn:  () => auditoriaApi.logs(page, 20, accion, modulo, filtroExitoso),
  });

  const cols = [
    { title: 'Fecha',    dataIndex: 'createdAt',   width: 130,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmt.dateTime(v)}</Text> },
    { title: 'Acción',   dataIndex: 'accion',      width: 90,
      render: (v: string) => <Tag color={accionColor[v]}>{accionIcon[v]} {v?.toUpperCase()}</Tag> },
    { title: 'Módulo',   dataIndex: 'modulo',      width: 100,
      render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Usuario',  dataIndex: 'userName',    width: 120 },
    { title: 'IP',       dataIndex: 'ipAddress',   width: 110,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v ?? '—'}</Text> },
    { title: 'Estado',   dataIndex: 'exitoso',     width: 80,
      render: (v: boolean) => v
        ? <Badge status="success" text="OK" />
        : <Badge status="error" text="Error" /> },
    { title: 'ms',       dataIndex: 'duracionMs',  width: 70,
      render: (v: number) => <Text type="secondary" style={{ fontSize: 11 }}>{v ?? '—'}</Text> },
  ];

  return (
    <>
      <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Select placeholder="Acción" allowClear style={{ width: 140 }} onChange={setAccion}
            options={['create','update','delete','login','logout','error','read']
              .map(v => ({ value: v, label: `${accionIcon[v]} ${v.toUpperCase()}` }))} />
        </Col>
        <Col>
          <Input prefix={<SearchOutlined />} placeholder="Módulo (facturas, clientes...)" style={{ width: 220 }}
            onChange={e => setModulo(e.target.value || undefined)} allowClear />
        </Col>
      </Row>
      <Table columns={cols} dataSource={data?.data ?? []} rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ total: data?.meta?.total, pageSize: 20, current: page, onChange: setPage, showSizeChanger: false }} />
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
      <Title level={4} style={{ marginBottom: 16 }}>Auditoría y Logs del Sistema</Title>

      {/* KPIs */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><Card><Statistic title="Eventos hoy"     value={resumen?.eventos?.ultimas24h     ?? 0} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="Esta semana"     value={resumen?.eventos?.ultimaSemana   ?? 0} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="Este mes"        value={resumen?.eventos?.esteMes        ?? 0} /></Card></Col>
        <Col xs={12} sm={6}><Card>
          <Statistic title="Errores hoy" value={resumen?.eventos?.erroresHoy ?? 0}
            valueStyle={{ color: (resumen?.eventos?.erroresHoy ?? 0) > 0 ? '#ff4d4f' : '#52c41a' }}
            prefix={<WarningOutlined />} />
        </Card></Col>
      </Row>

      {/* Gráficas */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Acciones este mes" size="small">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartAccion} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                <Tooltip />
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
                <Tooltip />
                <Bar dataKey="cantidad" fill="#52c41a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs defaultActiveKey="todos" items={[
          { key: 'todos',   label: '📋 Todos los eventos',   children: <LogsTab /> },
          { key: 'errores', label: <><WarningOutlined /> Solo errores</>, children: <LogsTab filtroExitoso={false} /> },
        ]} />
      </Card>
    </div>
  );
}
