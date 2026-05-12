import {
  Card, Row, Col, Typography, Statistic, Tag, Alert,
  Table, Progress, Space, theme,
} from 'antd';
import {
  UserOutlined, DollarOutlined, CalendarOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

const { Title, Text } = Typography;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(v ?? 0);

export default function PortalEmpleadoPage() {
  const { token } = theme.useToken();
  const { user }  = useAuthStore();

  const { data: resumen, isLoading, error } = useQuery<any>({
    queryKey: ['portal-empleado-resumen'],
    queryFn:  () => api.get('/portal-empleado/mi-resumen').then((r: any) => r.data?.data ?? r.data),
    retry: false,
  });

  const { data: nominas } = useQuery<any>({
    queryKey: ['portal-empleado-nominas'],
    queryFn:  () => api.get('/portal-empleado/mis-nominas').then((r: any) => r.data?.data ?? r.data),
    enabled:  !error,
    retry: false,
  });

  const { data: vacaciones } = useQuery<any>({
    queryKey: ['portal-empleado-vacaciones'],
    queryFn:  () => api.get('/portal-empleado/mis-vacaciones').then((r: any) => r.data?.data ?? r.data),
    enabled:  !error,
    retry: false,
  });

  if (isLoading) return null;

  if (error || !resumen) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="info"
          showIcon
          icon={<UserOutlined />}
          message="Portal del Empleado"
          description={
            <>
              <p>Este portal muestra tu información laboral, recibos de nómina y saldo de vacaciones.</p>
              <p><strong>Para habilitar el portal</strong>, el administrador debe vincular tu usuario de sistema ({user?.email}) con tu registro de empleado en el módulo de Nómina.</p>
            </>
          }
          style={{ borderRadius: 8 }}
        />
      </div>
    );
  }

  const emp  = resumen.empleado;
  const calc = resumen.calculoMensual;
  const vac  = vacaciones;
  const noms = nominas?.nominas ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <UserOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
        <div>
          <Title level={3} style={{ margin: 0 }}>Mi Portal — {emp.nombre}</Title>
          <Text type="secondary">{emp.cargo} · {emp.departamento ?? 'Sin departamento'}</Text>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        {/* Datos personales */}
        <Col xs={24} lg={8}>
          <Card bordered={false} style={{ borderRadius: 12 }} title={<Space><UserOutlined />Mis Datos</Space>}>
            {[
              { label: 'Cédula',       value: emp.cedula },
              { label: 'Cargo',        value: emp.cargo },
              { label: 'Departamento', value: emp.departamento ?? '—' },
              { label: 'Tipo Contrato',value: emp.tipoContrato },
              { label: 'Fecha Ingreso',value: emp.fechaIngreso ? new Date(emp.fechaIngreso).toLocaleDateString('es-DO') : '—' },
              { label: 'Antigüedad',   value: vac?.aniosServicio != null ? `${vac.aniosServicio} año(s)` : '—' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{r.label}</Text>
                <Text strong style={{ fontSize: 12 }}>{r.value}</Text>
              </div>
            ))}
          </Card>
        </Col>

        {/* Resumen salarial */}
        <Col xs={24} lg={8}>
          <Card bordered={false} style={{ borderRadius: 12 }} title={<Space><DollarOutlined />Mi Sueldo Mensual</Space>}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Salario Bruto</Text>
              <div style={{ fontSize: 28, fontWeight: 900, color: token.colorPrimary }}>
                {fmt(calc.salarioBruto)}
              </div>
            </div>
            {[
              { label: 'AFP (2.87%)',    value: calc.descuentoAfp,    color: token.colorError },
              { label: 'SFS (3.04%)',    value: calc.descuentoSfs,    color: token.colorError },
              { label: 'ISR (Ley 11-92)',value: calc.descuentoIsr,    color: calc.descuentoIsr > 0 ? token.colorWarning : token.colorTextTertiary },
            ].map(d => (
              <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{d.label}</Text>
                <Text style={{ fontSize: 12, color: d.color }}>-{fmt(d.value)}</Text>
              </div>
            ))}
            <div style={{ borderTop: `2px solid ${token.colorBorder}`, paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <Text strong>Salario Neto</Text>
              <Text strong style={{ fontSize: 18, color: token.colorSuccess }}>{fmt(calc.salarioNeto)}</Text>
            </div>
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>Deducciones sobre bruto</Text>
              <Progress
                percent={+((calc.totalDescuentos / calc.salarioBruto) * 100).toFixed(1)}
                strokeColor={token.colorWarning}
                size="small"
                format={p => `${p}%`}
              />
            </div>
          </Card>
        </Col>

        {/* Vacaciones */}
        <Col xs={24} lg={8}>
          <Card bordered={false} style={{ borderRadius: 12 }} title={<Space><CalendarOutlined />Mis Vacaciones</Space>}>
            {vac ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 42, fontWeight: 900, color: vac.diasDisponibles > 0 ? token.colorSuccess : token.colorError }}>
                    {vac.diasDisponibles}
                  </div>
                  <Text type="secondary" style={{ display: 'block' }}>días disponibles</Text>
                  <Tag color="blue" style={{ marginTop: 4 }}>Ley 16-92 RD — {vac.diasPorLey} días/año</Tag>
                </div>
                <Progress
                  percent={+((vac.diasUsados / vac.diasPorLey) * 100).toFixed(0)}
                  strokeColor={{ '0%': '#1a56db', '100%': '#059669' }}
                  format={() => `${vac.diasUsados}/${vac.diasPorLey} usados`}
                />
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                  Antigüedad: {vac.aniosServicio} año(s) —
                  {vac.aniosServicio >= 5 ? ' 18 días por ley (> 5 años)' : ' 14 días por ley (1-5 años)'}
                </Text>
              </>
            ) : (
              <Text type="secondary">Sin datos de vacaciones</Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* Historial de nóminas */}
      <Card bordered={false} style={{ borderRadius: 12, marginTop: 16 }} title={<Space><FileTextOutlined />Historial de Nómina</Space>}>
        {noms.length === 0 ? (
          <Text type="secondary">Sin registros de nómina disponibles</Text>
        ) : (
          <Table
            dataSource={noms}
            rowKey="periodo"
            size="small"
            pagination={{ pageSize: 12 }}
            columns={[
              { title: 'Período', dataIndex: 'periodo', key: 'p', render: v => <Text strong>{v}</Text> },
              { title: 'Días', dataIndex: 'diasTrabajados', key: 'd', align: 'center' },
              { title: 'Bruto', dataIndex: 'salarioBruto', key: 'b', align: 'right', render: v => fmt(Number(v)) },
              { title: 'AFP', dataIndex: 'descuentoAfp', key: 'afp', align: 'right', render: v => <Text type="secondary" style={{ fontSize: 11 }}>-{fmt(Number(v))}</Text> },
              { title: 'SFS', dataIndex: 'descuentoSfs', key: 'sfs', align: 'right', render: v => <Text type="secondary" style={{ fontSize: 11 }}>-{fmt(Number(v))}</Text> },
              { title: 'ISR', dataIndex: 'descuentoIsr', key: 'isr', align: 'right', render: v => <Text type="secondary" style={{ fontSize: 11 }}>-{fmt(Number(v))}</Text> },
              { title: 'Neto', dataIndex: 'salarioNeto', key: 'n', align: 'right', render: v => <Text strong style={{ color: token.colorSuccess }}>{fmt(Number(v))}</Text> },
              { title: 'Estado', dataIndex: 'estado', key: 'e', render: v => <Tag color={v === 'pagada' ? 'green' : 'orange'}>{(v ?? 'pendiente').toUpperCase()}</Tag> },
              { title: 'Pago', dataIndex: 'fechaPago', key: 'fp', render: v => v ?? '—' },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
