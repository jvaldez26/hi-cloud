import { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Modal, Form, Select, Input, message, Badge, Row, Col, Statistic } from 'antd';
import { PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';

const { Title, Text } = Typography;
const { Option } = Select;

const ESTADO_COLOR: Record<string, string> = {
  esperando: 'orange', llamado: 'gold', en_consulta: 'green', atendido: 'default',
};

export default function SalaEsperaPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();
  const [timer, setTimer] = useState(30);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['clinica-sala-espera-full'],
    queryFn: () => clinicaApi.getSalaEspera(),
    refetchInterval: 30_000,
  });

  const { data: citasHoy = [] } = useQuery({
    queryKey: ['clinica-citas-hoy-sala'],
    queryFn: () => clinicaApi.listarCitas({ fecha: new Date().toISOString().slice(0, 10), limit: 100 }),
    select: (d: any) => d.data ?? [],
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(t => {
        if (t <= 1) { refetch(); return 30; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [refetch]);

  const registrar = useMutation({
    mutationFn: (vals: any) => clinicaApi.registrarLlegada(vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-sala-espera-full'] }); setModal(false); message.success('Llegada registrada'); },
    onError: () => message.error('Error al registrar llegada'),
  });

  const llamar = useMutation({
    mutationFn: (id: number) => clinicaApi.llamarPaciente(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica-sala-espera-full'] }),
    onError: () => message.error('Error al llamar paciente'),
  });

  const atender = useMutation({
    mutationFn: (id: number) => clinicaApi.marcarAtendido(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinica-sala-espera-full'] }),
    onError: () => message.error('Error'),
  });

  const esperando = data.filter((r: any) => r.estado === 'esperando').length;
  const llamados = data.filter((r: any) => r.estado === 'llamado').length;
  const enConsulta = data.filter((r: any) => r.estado === 'en_consulta').length;

  const cols = [
    { title: 'Turno', dataIndex: 'turno', width: 65, render: (v: any) => <strong>#{v ?? '—'}</strong> },
    {
      title: 'Paciente', key: 'pac', ellipsis: true,
      render: (_: any, r: any) => (
        <div>
          <div><strong>{r.pacienteNombre} {r.pacienteApellidos}</strong></div>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.medicoNombre} — {r.citaHora}</Text>
        </div>
      ),
    },
    { title: 'Tipo Cita', dataIndex: 'tipoCita', width: 110, render: (v: any) => v ?? '—' },
    {
      title: 'Llegada', dataIndex: 'horaLlegada', width: 80,
      render: (v: any) => v ? new Date(v).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '—',
    },
    {
      title: 'Espera', key: 'espera', width: 80,
      render: (_: any, r: any) => {
        if (!r.horaLlegada || r.estado === 'atendido') return '—';
        const diff = Math.floor((Date.now() - new Date(r.horaLlegada).getTime()) / 60000);
        const color = diff > 30 ? '#f5222d' : diff > 15 ? '#fa8c16' : '#52c41a';
        return <span style={{ color }}>{diff}m</span>;
      },
    },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>,
    },
    {
      title: 'Acciones', key: 'act', width: 180,
      render: (_: any, r: any) => (
        <Space size="small">
          {r.estado === 'esperando' && (
            <Button size="small" type="primary" onClick={() => llamar.mutate(r.id)}>📢 Llamar</Button>
          )}
          {(r.estado === 'llamado' || r.estado === 'en_consulta') && (
            <Button size="small" onClick={() => atender.mutate(r.id)}>✅ Atendido</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Sala de Espera</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <RefreshByKeyButton queryKey={['clinica-sala-espera-full']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>Actualiza en {timer}s</Text>
          <Button icon={<ReloadOutlined />} onClick={() => { refetch(); setTimer(30); }}>Actualizar</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal(true); }}>Registrar Llegada</Button>
        </div>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Esperando" value={esperando} prefix={<UserOutlined />} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="Llamados" value={llamados} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="En Consulta" value={enConsulta} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      <Table
        columns={cols}
        dataSource={data}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={false}
        locale={{ emptyText: 'Sala de espera vacía' }}
        rowClassName={(r: any) => r.estado === 'llamado' ? 'ant-table-row-selected' : ''}
      />

      <Modal
        open={modal}
        title="Registrar Llegada de Paciente"
        onCancel={() => setModal(false)}
        onOk={() => form.validateFields().then(vals => registrar.mutate(vals))}
        confirmLoading={registrar.isPending}
        okText="Registrar"
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="citaId" label="Cita" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" placeholder="Seleccionar cita">
              {(Array.isArray(citasHoy) ? citasHoy : []).filter((c: any) => !['completada','cancelada','no_asistio'].includes(c.estado)).map((c: any) => (
                <Option key={c.id} value={c.id} label={`${c.pacienteNombre} ${c.pacienteApellidos} ${c.hora}`}>
                  {c.hora} — {c.pacienteNombre} {c.pacienteApellidos} ({c.medicoNombre})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="pacienteId"
            label="Paciente ID"
            rules={[{ required: true }]}
            help="Se llena automáticamente al seleccionar la cita"
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Seleccionar paciente"
              onChange={(v) => form.setFieldValue('pacienteId', v)}
            >
              {(Array.isArray(citasHoy) ? citasHoy : []).map((c: any) => (
                <Option key={c.pacienteId ?? c.id} value={c.pacienteId} label={`${c.pacienteNombre} ${c.pacienteApellidos}`}>
                  {c.pacienteNombre} {c.pacienteApellidos}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
