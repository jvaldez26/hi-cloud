import { Card, Row, Col, Statistic, Table, Tag, Typography, Spin, Tabs } from 'antd';
import {
  UserOutlined, CalendarOutlined, FileTextOutlined,
  MedicineBoxOutlined, DollarOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { theme } from 'antd';

const { Title, Text } = Typography;

const MES_LABEL: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};
const fmtMes = (v: string) => {
  const [, m] = v.split('-');
  return MES_LABEL[m] ?? v;
};

const CITA_COLOR: Record<string, string> = {
  programada: 'blue', confirmada: 'cyan', completada: 'green',
  cancelada: 'red', no_asistio: 'default',
};

// ── Panel resumen ─────────────────────────────────────────────────────────────

function ResumenTab({ data }: { data: any }) {
  const d = data ?? {};

  const proxCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Paciente', dataIndex: 'pacienteNombre', ellipsis: true },
    {
      title: 'Fecha / Hora', dataIndex: 'fechaHora', width: 145,
      render: (v: string) => v ? `${fmt.date(v)} ${dayjs(v).format('HH:mm')}` : '—',
    },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => (
        <Tag color={CITA_COLOR[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>
      ),
    },
  ];

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Pacientes',         value: d.totalPacientes ?? 0,       icon: <UserOutlined />,         color: undefined },
          { title: 'Citas hoy',          value: d.citasHoy ?? 0,             icon: <CalendarOutlined />,     color: '#1677ff' },
          { title: 'Citas pendientes',   value: d.citasPendientes ?? 0,      icon: <CalendarOutlined />,     color: '#fa8c16' },
          { title: 'Órdenes activas',    value: d.ordenesActivas ?? 0,       icon: <FileTextOutlined />,     color: '#52c41a' },
          { title: 'Reclamaciones pend.',value: d.reclamacionesPendientes ?? 0, icon: <MedicineBoxOutlined />, color: '#722ed1' },
          { title: 'Saldo pend. OT',     value: d.saldoPendienteOt ?? 0,    icon: <DollarOutlined />,       color: '#f5222d', precision: 2 },
        ].map(stat => (
          <Col xs={12} sm={8} md={4} key={stat.title}>
            <Card size="small">
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={stat.icon}
                precision={stat.precision}
                valueStyle={stat.color ? { color: stat.color } : undefined}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title="Próximas citas"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>Próximas 5</Text>}
      >
        <Table
          columns={proxCols}
          dataSource={d.citasProximas ?? []}
          rowKey="id"
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={false}
          locale={{ emptyText: 'No hay citas programadas próximamente' }}
        />
      </Card>
    </>
  );
}

// ── Charts de estadísticas ────────────────────────────────────────────────────

function EstadisticasTab() {
  const { token } = theme.useToken();
  const { data, isLoading } = useQuery({
    queryKey: ['optica-estadisticas'],
    queryFn:  () => opticaApi.estadisticas(),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  const d = data ?? {};
  const citasData  = (d.citasPorMes ?? []).map((r: any) => ({
    mes: fmtMes(r.mes), total: r.total, completadas: r.completadas, canceladas: r.canceladas,
  }));
  const ingresosData = (d.ingresosPorMes ?? []).map((r: any) => ({
    mes: fmtMes(r.mes), ingresos: Number(r.totalIngresos), ordenes: r.totalOrdenes,
  }));
  const pacData = (d.pacientesNuevosPorMes ?? []).map((r: any) => ({
    mes: fmtMes(r.mes), nuevos: r.total,
  }));
  const diagData = (d.topDiagnosticos ?? []).map((r: any) => ({
    name: r.diagnostico?.length > 25 ? r.diagnostico.slice(0, 25) + '…' : r.diagnostico,
    total: r.total,
  }));

  const colors = ['#1677ff', '#52c41a', '#722ed1', '#fa8c16', '#13c2c2', '#eb2f96', '#fadb14', '#f5222d'];

  return (
    <Row gutter={[16, 16]}>
      {/* Citas por mes */}
      <Col xs={24} lg={12}>
        <Card title="Citas por mes" size="small">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={citasData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
              <YAxis tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
              <Tooltip
                contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total"      name="Total"      fill="#1677ff" radius={[2, 2, 0, 0]} />
              <Bar dataKey="completadas" name="Completadas" fill="#52c41a" radius={[2, 2, 0, 0]} />
              <Bar dataKey="canceladas"  name="Canceladas"  fill="#f5222d" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Col>

      {/* Ingresos por mes */}
      <Col xs={24} lg={12}>
        <Card title="Ingresos OT por mes (RD$)" size="small">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ingresosData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
              <YAxis
                tick={{ fontSize: 11, fill: token.colorTextSecondary }}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, fontSize: 12 }}
                formatter={(v: number) => [fmt.money(v), 'Ingresos']}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#1677ff"
                strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </Col>

      {/* Pacientes nuevos */}
      <Col xs={24} lg={12}>
        <Card title="Pacientes nuevos por mes" size="small">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pacData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
              <YAxis tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
              <Tooltip contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, fontSize: 12 }} />
              <Bar dataKey="nuevos" name="Nuevos" fill="#722ed1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Col>

      {/* Top diagnósticos */}
      <Col xs={24} lg={12}>
        <Card title="Top diagnósticos (últimos 12 meses)" size="small">
          {diagData.length === 0 ? (
            <Text type="secondary">Sin datos de diagnósticos registrados</Text>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={diagData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: token.colorTextSecondary }} />
                <YAxis dataKey="name" type="category" width={130}
                  tick={{ fontSize: 10, fill: token.colorTextSecondary }} />
                <Tooltip contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, fontSize: 12 }} />
                <Bar dataKey="total" name="Casos" radius={[0, 2, 2, 0]}>
                  {diagData.map((_: any, i: number) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function OpticaDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['optica-dashboard'],
    queryFn: () => opticaApi.dashboard(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Panel Óptica</Title>
      <Tabs
        defaultActiveKey="resumen"
        items={[
          { key: 'resumen',      label: 'Resumen',       children: <ResumenTab data={data} /> },
          { key: 'estadisticas', label: <span><BarChartOutlined /> Estadísticas</span>, children: <EstadisticasTab /> },
        ]}
      />
    </div>
  );
}
