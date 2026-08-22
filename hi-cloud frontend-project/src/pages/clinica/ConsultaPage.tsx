import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Button, Select, Row, Col, Typography,
  Divider, message, Spin, Space, Alert, Tabs,
} from 'antd';
import { SaveOutlined, FileTextOutlined, ExperimentOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicaApi } from '../../api/clinica.api';
import { fmt as fmtObj } from '../../utils/formatters';
import { dRD } from '../../utils/fechaRD';
const fmt = (v: any) => fmtObj.date(v);

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

function calcImc(peso: any, talla: any): number | null {
  const p = Number(peso);
  const t = Number(talla);
  if (!p || !t) return null;
  return Math.round((p / Math.pow(t / 100, 2)) * 100) / 100;
}

function calcEdad(fecha: any): string {
  if (!fecha) return '—';
  // Todo en zona RD: la edad no puede cambiar segun la zona del equipo.
  const dob = dRD(fecha);
  const hoy = dRD();
  let age = hoy.year() - dob.year();
  if (hoy.month() - dob.month() < 0 || (hoy.month() - dob.month() === 0 && hoy.date() < dob.date())) age--;
  return `${age} años`;
}

export default function ConsultaPage() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const consultaId = sp.get('id') ? Number(sp.get('id')) : null;
  const [form] = Form.useForm();
  const [imc, setImc] = useState<number | null>(null);

  const { data: medicos = [] } = useQuery({ queryKey: ['clinica-medicos'], queryFn: () => clinicaApi.listarMedicos() });
  const { data: pacientes } = useQuery({ queryKey: ['clinica-pacientes-all'], queryFn: () => clinicaApi.listarPacientes({ limit: 500 }) });

  const { data: consulta, isLoading } = useQuery({
    queryKey: ['clinica-consulta', consultaId],
    queryFn: () => clinicaApi.obtenerConsulta(consultaId!),
    enabled: !!consultaId,
  });

  useEffect(() => {
    if (consulta) {
      form.setFieldsValue(consulta);
      setImc(consulta.imc ?? null);
    }
  }, [consulta, form]);

  const crear = useMutation({
    mutationFn: (vals: any) => clinicaApi.crearConsulta(vals),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['clinica-consultas'] });
      message.success('Consulta creada');
      navigate(`/clinica/consultas?id=${data.id}`);
    },
    onError: () => message.error('Error al crear consulta'),
  });

  const actualizar = useMutation({
    mutationFn: (vals: any) => clinicaApi.actualizarConsulta(consultaId!, vals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clinica-consulta', consultaId] }); message.success('Consulta guardada'); },
    onError: () => message.error('Error al guardar'),
  });

  const handleValuesChange = (changed: any, all: any) => {
    if ('peso' in changed || 'talla' in changed) {
      setImc(calcImc(all.peso, all.talla));
    }
  };

  const onGuardar = () => {
    form.validateFields().then(vals => {
      const data = { ...vals, imc: calcImc(vals.peso, vals.talla) };
      consultaId ? actualizar.mutate(data) : crear.mutate(data);
    });
  };

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  const SignosVitales = () => (
    <Card title="Signos Vitales" size="small">
      <Row gutter={12}>
        <Col span={6}><Form.Item name="temperatura" label="Temperatura (°C)"><InputNumber style={{ width: '100%' }} step={0.1} /></Form.Item></Col>
        <Col span={6}><Form.Item name="presionSistolica" label="P.A. Sistólica"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
        <Col span={6}><Form.Item name="presionDiastolica" label="P.A. Diastólica"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
        <Col span={6}><Form.Item name="frecuenciaCardiaca" label="F.C. (bpm)"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={6}><Form.Item name="frecuenciaRespiratoria" label="F.R. (rpm)"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
        <Col span={6}><Form.Item name="saturacionOxigeno" label="SatO₂ (%)"><InputNumber style={{ width: '100%' }} min={0} max={100} step={0.1} /></Form.Item></Col>
        <Col span={6}><Form.Item name="peso" label="Peso (kg)"><InputNumber style={{ width: '100%' }} step={0.1} /></Form.Item></Col>
        <Col span={6}><Form.Item name="talla" label="Talla (cm)"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
      </Row>
      {imc !== null && (
        <Alert
          type={imc < 18.5 ? 'warning' : imc < 25 ? 'success' : imc < 30 ? 'warning' : 'error'}
          message={`IMC: ${imc} — ${imc < 18.5 ? 'Bajo peso' : imc < 25 ? 'Normal' : imc < 30 ? 'Sobrepeso' : 'Obesidad'}`}
          style={{ marginBottom: 8 }}
          banner
        />
      )}
    </Card>
  );

  const Diagnostico = () => (
    <Card title="Diagnóstico y Plan" size="small">
      <Form.Item name="motivoConsulta" label="Motivo de Consulta" rules={[{ required: !consultaId }]}>
        <TextArea rows={2} />
      </Form.Item>
      <Form.Item name="enfermedadActual" label="Enfermedad Actual / Historia">
        <TextArea rows={3} />
      </Form.Item>
      <Form.Item name="examenFisico" label="Examen Físico">
        <TextArea rows={3} />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item name="diagnosticoPrincipal" label="Diagnóstico Principal">
            <Input placeholder="ej: Hipertensión arterial esencial" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="diagnosticosCIE10" label="Códigos CIE-10">
            <Input placeholder="ej: I10, J06.9" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="diagnosticosDescripcion" label="Descripción diagnósticos">
        <TextArea rows={2} />
      </Form.Item>
      <Form.Item name="planTratamiento" label="Plan de Tratamiento">
        <TextArea rows={3} />
      </Form.Item>
      <Form.Item name="indicaciones" label="Indicaciones al Paciente">
        <TextArea rows={2} />
      </Form.Item>
      <Row gutter={12}>
        <Col span={8}>
          <Form.Item name="proximaCita" label="Próxima Cita">
            <Input placeholder="ej: En 2 semanas" />
          </Form.Item>
        </Col>
        <Col span={16}>
          <Form.Item name="proximaCitaMotivo" label="Motivo">
            <Input />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
          <Title level={4} style={{ margin: 0 }}>
            {consultaId ? `Consulta ${consulta?.numero ?? ''}` : 'Nueva Consulta'}
          </Title>
        </Space>
        <Space>
          {consultaId && (
            <>
              <Button icon={<FileTextOutlined />} onClick={() => navigate(`/clinica/recetas?consultaId=${consultaId}`)}>
                Generar Receta
              </Button>
              <Button icon={<ExperimentOutlined />} onClick={() => navigate(`/clinica/laboratorio?consultaId=${consultaId}`)}>
                Orden Lab
              </Button>
            </>
          )}
          <Button type="primary" icon={<SaveOutlined />} onClick={onGuardar} loading={crear.isPending || actualizar.isPending}>
            Guardar
          </Button>
        </Space>
      </div>

      <Form form={form} layout="vertical" size="small" onValuesChange={handleValuesChange}>
        <Tabs
          items={[
            {
              key: 'datos',
              label: 'Datos Básicos',
              children: (
                <Card size="small">
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="pacienteId" label="Paciente" rules={[{ required: !consultaId }]}>
                        <Select showSearch optionFilterProp="label" placeholder="Seleccionar paciente" disabled={!!consultaId}>
                          {(pacientes?.data ?? []).map((p: any) => (
                            <Option key={p.id} value={p.id} label={`${p.nombre} ${p.apellidos ?? ''}`}>
                              {p.nombre} {p.apellidos} — {p.cedula ?? ''}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="medicoId" label="Médico" rules={[{ required: !consultaId }]}>
                        <Select placeholder="Seleccionar médico" disabled={!!consultaId}>
                          {medicos.map((m: any) => (
                            <Option key={m.id} value={m.id}>{m.nombre} {m.apellidos} — {m.especialidad}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                  {consulta && (
                    <Row gutter={12}>
                      <Col span={8}><Text type="secondary">N°: {consulta.numero}</Text></Col>
                      <Col span={8}><Text type="secondary">Fecha: {fmt(consulta.fecha)}</Text></Col>
                      <Col span={8}><Text type="secondary">Edad: {calcEdad(consulta.fechaNacimiento)}</Text></Col>
                    </Row>
                  )}
                </Card>
              ),
            },
            { key: 'signos', label: 'Signos Vitales', children: <SignosVitales /> },
            { key: 'dx', label: 'Diagnóstico', children: <Diagnostico /> },
          ]}
        />
      </Form>
    </div>
  );
}
