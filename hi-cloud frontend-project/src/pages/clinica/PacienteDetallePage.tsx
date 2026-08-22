import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Tabs, Card, Descriptions, Table, Tag, Button, Typography, Spin, Space, Row, Col } from 'antd';
import { ArrowLeftOutlined, FilePdfOutlined, UserOutlined } from '@ant-design/icons';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
import { dRD } from '../../utils/fechaRD';
const fmt = (v: any) => fmtObj.date(v);

const { Title, Text } = Typography;

function calcEdad(fecha: any): string {
  if (!fecha) return '—';
  // Todo en zona RD: la edad no puede cambiar segun la zona del equipo.
  const dob = dRD(fecha);
  const hoy = dRD();
  let age = hoy.year() - dob.year();
  if (hoy.month() - dob.month() < 0 || (hoy.month() - dob.month() === 0 && hoy.date() < dob.date())) age--;
  return `${age} años`;
}

const ESTADO_COLOR: Record<string, string> = {
  completada: 'green', pendiente: 'orange', cancelada: 'red', programada: 'blue',
  resultados_recibidos: 'cyan', en_progreso: 'processing',
};

export default function PacienteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pid = Number(id);

  const { data, isLoading } = useQuery({
    queryKey: ['clinica-expediente', pid],
    queryFn: () => clinicaApi.expediente(pid),
    enabled: !!pid,
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  const { paciente, consultas = [], recetas = [], laboratorios = [], procedimientos = [], signosVitales = [] } = data ?? {};

  const descargarPdf = async () => {
    const blob = await clinicaApi.expedientePdf(pid);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const consultaCols = [
    { title: 'Fecha', dataIndex: 'fecha', width: 100, render: fmt },
    { title: 'Motivo', dataIndex: 'motivoConsulta', ellipsis: true },
    { title: 'Médico', dataIndex: 'medicoNombre', ellipsis: true },
    { title: 'Diagnóstico', dataIndex: 'diagnosticoPrincipal', ellipsis: true, render: (v: any) => v ?? '—' },
  ];

  const recetaCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Fecha', dataIndex: 'fecha', width: 100, render: fmt },
    { title: 'Médico', dataIndex: 'medicoNombre' },
    { title: 'Diagnóstico', dataIndex: 'diagnostico', ellipsis: true, render: (v: any) => v ?? '—' },
    {
      title: 'PDF', key: 'pdf', width: 70,
      render: (_: any, r: any) => (
        <Button icon={<FilePdfOutlined />} size="small" onClick={async () => {
          const blob = await clinicaApi.recetaPdf(r.id);
          window.open(URL.createObjectURL(blob), '_blank');
        }} />
      ),
    },
  ];

  const labCols = [
    { title: 'N°', dataIndex: 'numero', width: 110 },
    { title: 'Fecha', dataIndex: 'fecha', width: 100, render: fmt },
    { title: 'Médico', dataIndex: 'medicoNombre' },
    {
      title: 'Estado', dataIndex: 'estado', width: 140,
      render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v?.replace(/_/g, ' ')}</Tag>,
    },
    {
      title: 'PDF', key: 'pdf', width: 70,
      render: (_: any, r: any) => (
        <Button icon={<FilePdfOutlined />} size="small" onClick={async () => {
          const blob = await clinicaApi.ordenPdf(r.id);
          window.open(URL.createObjectURL(blob), '_blank');
        }} />
      ),
    },
  ];

  const signosCols = [
    { title: 'Fecha', dataIndex: 'fecha', width: 150, render: (v: any) => new Date(v).toLocaleString('es-DO') },
    { title: 'Temp.', dataIndex: 'temperatura', width: 70, render: (v: any) => v ? `${v}°C` : '—' },
    { title: 'P.A.', key: 'pa', width: 80, render: (_: any, r: any) => r.presionSistolica ? `${r.presionSistolica}/${r.presionDiastolica}` : '—' },
    { title: 'FC', dataIndex: 'frecuenciaCardiaca', width: 60, render: (v: any) => v ? `${v}bpm` : '—' },
    { title: 'Peso', dataIndex: 'peso', width: 70, render: (v: any) => v ? `${v}kg` : '—' },
    { title: 'Talla', dataIndex: 'talla', width: 70, render: (v: any) => v ? `${v}cm` : '—' },
    { title: 'IMC', dataIndex: 'imc', width: 70, render: (v: any) => v ?? '—' },
    { title: 'Glucosa', dataIndex: 'glucosa', width: 80, render: (v: any) => v ? `${v}mg/dL` : '—' },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/clinica/pacientes')}>Volver</Button>
        <Button icon={<FilePdfOutlined />} onClick={descargarPdf}>Expediente PDF</Button>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <UserOutlined style={{ fontSize: 40, color: '#1677ff' }} />
          </Col>
          <Col flex={1}>
            <Title level={4} style={{ margin: 0 }}>{paciente?.nombre} {paciente?.apellidos}</Title>
            <Text type="secondary">Código: {paciente?.codigo}  |  Cédula: {paciente?.cedula ?? '—'}  |  Edad: {calcEdad(paciente?.fechaNacimiento)}</Text>
          </Col>
        </Row>
      </Card>

      <Tabs
        items={[
          {
            key: 'info', label: 'Datos Generales',
            children: (
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Nombre">{paciente?.nombre} {paciente?.apellidos}</Descriptions.Item>
                <Descriptions.Item label="Cédula">{paciente?.cedula ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Fecha Nac.">{fmt(paciente?.fechaNacimiento)}</Descriptions.Item>
                <Descriptions.Item label="Edad">{calcEdad(paciente?.fechaNacimiento)}</Descriptions.Item>
                <Descriptions.Item label="Sexo">{paciente?.sexo === 'M' ? 'Masculino' : paciente?.sexo === 'F' ? 'Femenino' : '—'}</Descriptions.Item>
                <Descriptions.Item label="Grupo Sanguíneo">{paciente?.grupoSanguineo ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Teléfono">{paciente?.telefono ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Email">{paciente?.email ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Dirección" span={2}>{paciente?.direccion ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="ARS">{paciente?.arsNombre ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="No. Afiliado">{paciente?.arsNumeroAfiliado ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Alergias" span={2}>{paciente?.alergias ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Antecedentes Personales" span={2}>{paciente?.antecedentesPersonales ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Antecedentes Familiares" span={2}>{paciente?.antecedentesFamiliares ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Medicamentos Actuales" span={2}>{paciente?.medicamentosActuales ?? '—'}</Descriptions.Item>
              </Descriptions>
            ),
          },
          {
            key: 'signos', label: `Signos Vitales (${signosVitales.length})`,
            children: (
              <Table columns={signosCols} dataSource={signosVitales} rowKey="id" size="small"
                scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
            ),
          },
          {
            key: 'consultas', label: `Consultas (${consultas.length})`,
            children: (
              <Table columns={consultaCols} dataSource={consultas} rowKey="id" size="small"
                scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
            ),
          },
          {
            key: 'recetas', label: `Recetas (${recetas.length})`,
            children: (
              <Table columns={recetaCols} dataSource={recetas} rowKey="id" size="small"
                scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
            ),
          },
          {
            key: 'laboratorio', label: `Laboratorio (${laboratorios.length})`,
            children: (
              <Table columns={labCols} dataSource={laboratorios} rowKey="id" size="small"
                scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }} />
            ),
          },
          {
            key: 'procedimientos', label: `Procedimientos (${procedimientos.length})`,
            children: (
              <Table
                columns={[
                  { title: 'Fecha', dataIndex: 'fecha', width: 100, render: fmt },
                  { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
                  { title: 'Médico', dataIndex: 'medicoNombre' },
                  { title: 'Estado', dataIndex: 'estado', width: 110, render: (v: string) => <Tag color={ESTADO_COLOR[v] ?? 'default'}>{v}</Tag> },
                  { title: 'Costo', dataIndex: 'costo', width: 100, render: (v: any) => v ? `RD$${v}` : '—' },
                ]}
                dataSource={procedimientos}
                rowKey="id"
                size="small"
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 10 }}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

