import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Tabs, Table, Tag, Typography, Row, Col, Button, Spin,
  Descriptions, Space, theme,
} from 'antd';
import {
  ArrowLeftOutlined, FilePdfOutlined, CalendarOutlined,
  MedicineBoxOutlined, FileTextOutlined, UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { opticaApi } from '../../api/optica.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';
import { dRD } from '../../utils/fechaRD';

const { Title, Text } = Typography;

const CITA_COLOR: Record<string, string> = {
  programada: 'blue', confirmada: 'cyan', completada: 'green',
  cancelada: 'red', no_asistio: 'default',
};
const OT_COLOR: Record<string, string> = {
  pendiente: 'orange', en_proceso: 'blue', lista: 'cyan',
  entregada: 'green', cancelada: 'red',
};
const ARS_COLOR: Record<string, string> = {
  borrador: 'default', enviada: 'blue', aprobada: 'cyan',
  rechazada: 'red', pagada: 'green',
};

function fmtGrad(v: any): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

export default function FichaPacientePage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { token } = theme.useToken();
  const [pdfLoading, setPdfLoading] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['optica-historial', id],
    queryFn: () => opticaApi.historialPaciente(Number(id)),
    enabled: !!id,
  });

  const downloadPdf = async (recetaId: number) => {
    setPdfLoading(recetaId);
    try {
      const blob = await opticaApi.pdfReceta(recetaId);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `receta-${recetaId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* silently ignore — user will see loading stop */
    } finally {
      setPdfLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) return null;

  const { paciente, citas, consultas, recetas, ordenes, reclamaciones } = data;

  const citaCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    {
      title: 'Fecha', dataIndex: 'fechaHora', width: 120,
      render: (v: string) => v ? `${fmt.date(v)} ${dRD(v).format('HH:mm')}` : '—',
    },
    { title: 'Tipo', dataIndex: 'tipo', width: 140, render: (v: any) => v ?? '—' },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={CITA_COLOR[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>,
    },
    { title: 'Motivo', dataIndex: 'motivoConsulta', ellipsis: true, render: (v: any) => v ?? '—' },
  ];

  const consultaCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Fecha', dataIndex: 'fecha', width: 110, render: (v: string) => fmt.date(v) },
    { title: 'Médico', key: 'med', ellipsis: true, render: (_: any, r: any) => r.medicoNombre ? `Dr(a). ${r.medicoNombre}` : '—' },
    { title: 'AV OD', dataIndex: 'agudezaVisualOD', width: 80, render: (v: any) => v ?? '—' },
    { title: 'AV OI', dataIndex: 'agudezaVisualOI', width: 80, render: (v: any) => v ?? '—' },
    { title: 'Diagnóstico', dataIndex: 'diagnostico', ellipsis: true, render: (v: any) => v ?? '—' },
  ];

  const recetaCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Fecha', dataIndex: 'fecha', width: 110, render: (v: string) => fmt.date(v) },
    { title: 'Médico', key: 'med', ellipsis: true, render: (_: any, r: any) => r.medicoNombre ? `Dr(a). ${r.medicoNombre}` : '—' },
    {
      title: 'OD', key: 'od', width: 90,
      render: (_: any, r: any) => r.esferaOD != null ? fmtGrad(r.esferaOD) : '—',
    },
    {
      title: 'OI', key: 'oi', width: 90,
      render: (_: any, r: any) => r.esferaOI != null ? fmtGrad(r.esferaOI) : '—',
    },
    {
      title: 'PDF', key: 'pdf', width: 64, align: 'center' as const,
      render: (_: any, r: any) => (
        <Button
          size="small"
          type="link"
          icon={<FilePdfOutlined />}
          loading={pdfLoading === r.id}
          onClick={() => downloadPdf(r.id)}
        />
      ),
    },
  ];

  const otCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Fecha', dataIndex: 'fecha', width: 110, render: (v: string) => fmt.date(v) },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={OT_COLOR[v] ?? 'default'}>{v?.replace('_', ' ')}</Tag>,
    },
    { title: 'Lente', dataIndex: 'tipoLente', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'Total', dataIndex: 'total', width: 100, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
    {
      title: 'Saldo', dataIndex: 'balance', width: 100, align: 'right' as const,
      render: (v: any) => v && Number(v) > 0
        ? <span style={{ color: '#f5222d' }}>{fmt.money(v)}</span>
        : '—',
    },
  ];

  const arsCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Fecha', dataIndex: 'fecha', width: 110, render: (v: string) => fmt.date(v) },
    { title: 'ARS', dataIndex: 'arsNombre', ellipsis: true },
    {
      title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => <Tag color={ARS_COLOR[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: 'Reclamado', dataIndex: 'montoReclamado', width: 110, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
    {
      title: 'Aprobado', dataIndex: 'montoAprobado', width: 110, align: 'right' as const,
      render: (v: any) => v ? fmt.money(v) : '—',
    },
  ];

  const tabs = [
    {
      key: 'citas',
      label: (
        <Space>
          <CalendarOutlined />
          Citas
          <Tag>{citas.length}</Tag>
        </Space>
      ),
      children: (
        <Table columns={citaCols} dataSource={citas} rowKey="id" size="small"
          scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
      ),
    },
    {
      key: 'consultas',
      label: (
        <Space>
          <MedicineBoxOutlined />
          Consultas
          <Tag>{consultas.length}</Tag>
        </Space>
      ),
      children: (
        <Table columns={consultaCols} dataSource={consultas} rowKey="id" size="small"
          scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
      ),
    },
    {
      key: 'recetas',
      label: (
        <Space>
          <FileTextOutlined />
          Recetas
          <Tag>{recetas.length}</Tag>
        </Space>
      ),
      children: (
        <Table columns={recetaCols} dataSource={recetas} rowKey="id" size="small"
          scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
      ),
    },
    {
      key: 'ordenes',
      label: (
        <Space>
          Órdenes de Trabajo
          <Tag>{ordenes.length}</Tag>
        </Space>
      ),
      children: (
        <Table columns={otCols} dataSource={ordenes} rowKey="id" size="small"
          scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
      ),
    },
    {
      key: 'ars',
      label: (
        <Space>
          Reclamaciones ARS
          <Tag>{reclamaciones.length}</Tag>
        </Space>
      ),
      children: (
        <Table columns={arsCols} dataSource={reclamaciones} rowKey="id" size="small"
          scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => nav('/optica/pacientes')}>
              Pacientes
            </Button>
            <Title level={4} style={{ margin: 0 }}>
              Ficha: {paciente.nombre} {paciente.apellido}
            </Title>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card
            title={
              <Space>
                <UserOutlined />
                Datos del paciente
              </Space>
            }
            size="small"
          >
            <Descriptions column={1} size="small" labelStyle={{ color: token.colorTextSecondary }}>
              <Descriptions.Item label="Cédula">{paciente.cedula ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Nacimiento">
                {paciente.fechaNacimiento ? fmt.date(paciente.fechaNacimiento) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Género">
                {paciente.genero === 'M' ? 'Masculino' : paciente.genero === 'F' ? 'Femenino' : paciente.genero ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Teléfono">{paciente.telefono ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Email">{paciente.email ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Ocupación">{paciente.ocupacion ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Dirección">{paciente.direccion ?? '—'}</Descriptions.Item>
            </Descriptions>
            {paciente.notas && (
              <>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                  Notas:
                </Text>
                <Text style={{ fontSize: 13 }}>{paciente.notas}</Text>
              </>
            )}
          </Card>

          <Card
            size="small"
            style={{ marginTop: 12 }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <Row gutter={8}>
              {[
                { label: 'Citas',     value: citas.length,         color: '#1677ff' },
                { label: 'Consultas', value: consultas.length,     color: '#52c41a' },
                { label: 'Recetas',   value: recetas.length,       color: '#722ed1' },
                { label: 'OT',        value: ordenes.length,       color: '#fa8c16' },
              ].map(item => (
                <Col span={12} key={item.label} style={{ textAlign: 'center', padding: '4px 0' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 11, color: token.colorTextSecondary }}>{item.label}</div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card size="small">
            <Tabs items={tabs} size="small" />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
