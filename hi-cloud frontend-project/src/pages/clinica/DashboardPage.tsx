import { Card, Row, Col, Statistic, Table, Tag, Typography, Spin, Badge, Button, Space } from 'antd';
import {
  UserOutlined, CalendarOutlined, MedicineBoxOutlined,
  ExperimentOutlined, SafetyCertificateOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
import { theme } from 'antd';
import { message } from 'antd';
const fmt = (v: any) => fmtObj.date(v);

const { Title, Text } = Typography;

const ESTADO_COLOR: Record<string, string> = {
  programada: 'blue', en_sala: 'orange', en_consulta: 'green',
  completada: 'cyan', cancelada: 'red', no_asistio: 'default',
  esperando: 'orange', llamado: 'gold', atendido: 'green',
};

function SalaEsperaCard({ C }: { C: typeof import('antd').theme.useToken extends () => infer R ? R : never }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['clinica-sala-espera'],
    queryFn: () => clinicaApi.getSalaEspera(),
    refetchInterval: 30_000,
  });

  const llamar = useMutation({
    mutationFn: (id: number) => clinicaApi.llamarPaciente(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica-sala-espera'] }),
    onError: () => message.error('Error al llamar al paciente'),
  });

  const atender = useMutation({
    mutationFn: (id: number) => clinicaApi.marcarAtendido(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica-sala-espera'] }),
    onError: () => message.error('Error al marcar como atendido'),
  });

  const cols = [
    { title: '#', dataIndex: 'turno', width: 50 },
    {
      title: 'Paciente', key: 'pac',
      render: (_: any, r: any) => <>{r.pacienteNombre} {r.pacienteApellidos}</>,
    },
    { title: 'Médico', dataIndex: 'medicoNombre', ellipsis: true },
    { title: 'Hora cita', dataIndex: 'citaHora', width: 85, render: (v: any) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 160,
      render: (_: any, r: any) => (
        <Space size="small">
          {r.estado === 'esperando' && (
            <Button size="small" type="primary" onClick={() => llamar.mutate(r.id)}>Llamar</Button>
          )}
          {(r.estado === 'llamado' || r.estado === 'en_consulta') && (
            <Button size="small" onClick={() => atender.mutate(r.id)}>Atendido</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={<><Badge count={data.length} offset={[8, 0]}><span>Sala de Espera</span></Badge></>}
      extra={<Button icon={<ReloadOutlined />} size="small" onClick={() => qc.invalidateQueries({ queryKey: ['clinica-sala-espera'] })}>Actualizar</Button>}
      size="small"
    >
      <Table
        columns={cols}
        dataSource={data}
        rowKey="id"
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={false}
        loading={isLoading}
        locale={{ emptyText: 'Sala de espera vacía' }}
      />
    </Card>
  );
}

export default function ClinicaDashboard() {
  const { token: C } = theme.useToken();
  const { data, isLoading } = useQuery({
    queryKey: ['clinica-dashboard'],
    queryFn: () => clinicaApi.dashboard(),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  const d = data ?? {};

  const agendaCols = [
    { title: 'Hora', dataIndex: 'hora', width: 70 },
    { title: 'Paciente', key: 'pac', render: (_: any, r: any) => `${r.pacienteNombre} ${r.pacienteApellidos}`, ellipsis: true },
    { title: 'Médico', dataIndex: 'medicoNombre', ellipsis: true },
    { title: 'Tipo', dataIndex: 'tipoCita', width: 110, render: (v: any) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 100,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>,
    },
  ];

  const arsCols = [
    { title: 'N°', dataIndex: 'numero', width: 100 },
    { title: 'Paciente', key: 'pac', render: (_: any, r: any) => `${r.pacienteNombre} ${r.pacienteApellidos}`, ellipsis: true },
    { title: 'Fecha', dataIndex: 'createdAt', width: 100, render: fmt },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      <Title level={4} style={{ marginBottom: 16 }}>Panel Clínica / Consultorio</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Citas hoy',        value: d.citasHoy ?? 0,       icon: <CalendarOutlined />,          color: '#1677ff' },
          { title: 'En sala de espera',value: d.enSalaEspera ?? 0,   icon: <UserOutlined />,              color: '#fa8c16' },
          { title: 'Consultas hoy',    value: d.consultasHoy ?? 0,   icon: <MedicineBoxOutlined />,       color: '#52c41a' },
          { title: 'Labs pendientes',  value: d.labsPendientes ?? 0,  icon: <ExperimentOutlined />,        color: '#722ed1' },
          { title: 'ARS pendientes',   value: d.arsPendientes ?? 0,   icon: <SafetyCertificateOutlined />, color: '#f5222d' },
          { title: 'Total pacientes',  value: d.totalPacientes ?? 0, icon: <UserOutlined />,              color: undefined },
        ].map(stat => (
          <Col xs={12} sm={8} md={4} key={stat.title}>
            <Card size="small">
              <Statistic
                title={<Text style={{ fontSize: 12 }}>{stat.title}</Text>}
                value={stat.value}
                prefix={stat.icon}
                valueStyle={stat.color ? { color: stat.color } : undefined}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <SalaEsperaCard C={C as any} />
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Agenda del día" size="small">
            <Table
              columns={agendaCols}
              dataSource={d.agendaHoy ?? []}
              rowKey="id"
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={false}
              locale={{ emptyText: 'Sin citas para hoy' }}
            />
          </Card>
          {(d.arsPendientes?.length ?? 0) > 0 && (
            <Card title="ARS con solicitudes pendientes" size="small" style={{ marginTop: 16 }}>
              <Table
                columns={arsCols}
                dataSource={d.arsPendientes ?? []}
                rowKey="id"
                size="small"
                scroll={{ x: 'max-content' }}
                pagination={false}
              />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
