import { useState } from 'react';
import {
  Card, Row, Col, Typography, Table, Tag, Statistic, Button,
  Space, Modal, Form, Select, InputNumber, Tabs,
  message, Rate, Progress, Avatar, Popconfirm, Descriptions, theme } from 'antd';
import { PlusOutlined, CheckOutlined, StarOutlined, TeamOutlined, FileExcelOutlined, DeleteOutlined } from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;

const evalApi = {
  listar:    (anio: number)     => api.get(`/evaluaciones?anio=${anio}`).then(r => r.data?.data ?? r.data),
  criterios: ()                  => api.get('/evaluaciones/criterios').then(r => r.data?.data ?? r.data),
  resumen:   (anio: number)     => api.get(`/evaluaciones/resumen-equipo?anio=${anio}`).then(r => r.data?.data ?? r.data),
  crear:     (b: any)            => api.post('/evaluaciones', b).then(r => r.data?.data ?? r.data),
  completar: (id: number)        => api.patch(`/evaluaciones/${id}/completar`).then(r => r.data?.data ?? r.data),
  eliminar:  (id: number)        => api.delete(`/evaluaciones/${id}`).then(r => r.data?.data ?? r.data),
  empleados: ()                  => api.get('/nomina/empleados?limit=200').then(r => r.data.data?.data ?? []),
  historico: (id: number)        => api.get(`/evaluaciones/empleado/${id}/historico`).then(r => r.data?.data ?? r.data),
};

const NOTA_COLOR = (nota: number) => nota >= 4.5 ? '#10b981' : nota >= 3.5 ? '#1677ff' : nota >= 2.5 ? '#f59e0b' : '#ef4444';
const NOTA_LABEL = (nota: number) => nota >= 4.5 ? 'Excelente' : nota >= 3.5 ? 'Bueno' : nota >= 2.5 ? 'Regular' : 'Deficiente';

export default function EvaluacionesPage() {
  const { token } = theme.useToken();
  const [anio,       setAnio]       = useState(dayjs().year());
  const [crearModal, setCrearModal] = useState(false);
  const [detalle,    setDetalle]    = useState<any>(null);
  const [criterios,  setCriterios]  = useState<Record<string, number>>({});
  const [form]                      = Form.useForm();
  const qc = useQueryClient();

  const { data: evaluaciones, isLoading } = useQuery({
    queryKey: ['evals', anio],
    queryFn:  () => evalApi.listar(anio),
  });
  const { data: resumen }   = useQuery({ queryKey: ['eval-resumen', anio], queryFn: () => evalApi.resumen(anio) });
  const { data: crits }     = useQuery({ queryKey: ['eval-criterios'],     queryFn: evalApi.criterios });
  const { data: empleados } = useQuery({ queryKey: ['empleados-eval'],     queryFn: evalApi.empleados });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['evals'] });
    qc.invalidateQueries({ queryKey: ['eval-resumen'] });
  };

  const crearMut = useMutation({
    mutationFn: evalApi.crear,
    onSuccess: () => { inv(); setCrearModal(false); form.resetFields(); setCriterios({}); message.success('Evaluación creada'); },
    onError: (e: any) => message.error((e as any)?.response?.data?.errors?.[0] ?? 'Error al crear evaluación'),
  });

  const completarMut = useMutation({
    mutationFn: evalApi.completar,
    onSuccess: () => { inv(); message.success('Evaluación completada'); },
  });

  const eliminarMut = useMutation({
    mutationFn: evalApi.eliminar,
    onSuccess: () => { inv(); message.success('Evaluación eliminada'); },
  });

  const handleCrear = (values: any) => {
    crearMut.mutate({ ...values, criterios, anio });
  };

  const cols = [
    { title: 'Empleado', key: 'emp', ellipsis: true,
      render: (_: any, r: any) => (
        <Space>
          <Avatar size={28} style={{ background: '#1677ff', fontSize: 12 }}>
            {(r.empleado?.nombre ?? '?').charAt(0)}
          </Avatar>
          <Text>{r.empleado?.nombre ?? '—'} {r.empleado?.apellido ?? ''}</Text>
        </Space>
      )},
    { title: 'Período',  dataIndex: 'periodo',  width: 110, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Semestre', dataIndex: 'semestre', width: 80 },
    { title: 'Calificación', dataIndex: 'calificacionGeneral', width: 130,
      render: (v: number) => v ? (
        <Space>
          <Text strong style={{ color: NOTA_COLOR(v), fontSize: 16 }}>{v?.toFixed(1)}</Text>
          <Tag color={NOTA_COLOR(v)} style={{ fontSize: 10 }}>{NOTA_LABEL(v)}</Tag>
        </Space>
      ) : '—' },
    { title: 'Estado', dataIndex: 'estado', width: 120,
      render: (v: string) => <Tag color={v === 'completada' ? 'success' : v === 'en_revision' ? 'processing' : 'default'}>
        {v}
      </Tag> },
    { title: '', key: 'actions', width: 160,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" onClick={() => setDetalle(r)}>Ver</Button>
          {r.estado !== 'completada' && (
            <Button size="small" type="primary" icon={<CheckOutlined />}
              loading={completarMut.isPending}
              onClick={() => completarMut.mutate(r.id)}>
              Completar
            </Button>
          )}
          {r.estado === 'borrador' && (
            <Popconfirm title="¿Eliminar evaluación?" onConfirm={() => eliminarMut.mutate(r.id)} okButtonProps={{ danger: true }}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <StarOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
            Evaluación de Empleados
          </Title>
        </Col>
        <Col>
          <Space>
            <Select value={anio} onChange={setAnio} style={{ width: 90 }}
              options={[2023, 2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (Array.isArray(evaluaciones) ? evaluaciones : []).map((e: any) => ({
                'Empleado':       `${e.empleado?.nombre ?? ''} ${e.empleado?.apellido ?? ''}`.trim(),
                'Período':        e.periodo ?? '',
                'Tipo':           e.tipo ?? '',
                'Calificación':   Number(e.calificacionFinal ?? 0),
                'Puntuación':     e.nivelDesempeno ?? '',
                'Estado':         e.estado ?? '',
                'Evaluador':      e.evaluador?.nombre ?? '',
              }));
              exportarExcel(filas, `Evaluaciones-${anio}`);
            }}>Excel</Button>
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => { setCrearModal(true); form.resetFields(); setCriterios({}); }}>
              Nueva evaluación
            </Button>
          </Space>
        </Col>
      </Row>

      {/* KPIs del equipo */}
      {resumen && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="Promedio del equipo" value={resumen.promedio}
                suffix="/5" valueStyle={{ color: NOTA_COLOR(resumen.promedio), fontSize: 22 }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="Total evaluados" value={resumen.empleados?.length ?? 0}
                prefix={<TeamOutlined />} />
            </Card>
          </Col>
          {resumen.top?.[0] && (
            <Col xs={24} md={6}>
              <Card size="small" style={{ borderColor: '#10b981' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>🏆 Mejor evaluado</Text>
                <div style={{ marginTop: 4 }}>
                  <Text strong style={{ color: '#10b981' }}>{resumen.top[0].nombre}</Text>
                  <Tag color="green" style={{ marginLeft: 8 }}>{resumen.top[0].promedio}/5</Tag>
                </div>
              </Card>
            </Col>
          )}
          {resumen.mejora?.[0] && (
            <Col xs={24} md={6}>
              <Card size="small" style={{ borderColor: '#f59e0b' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>📈 Requiere mejora</Text>
                <div style={{ marginTop: 4 }}>
                  <Text strong style={{ color: '#f59e0b' }}>{resumen.mejora[0].nombre}</Text>
                  <Tag color="orange" style={{ marginLeft: 8 }}>{resumen.mejora[0].promedio}/5</Tag>
                </div>
              </Card>
            </Col>
          )}
        </Row>
      )}

      <Tabs items={[
        {
          key: 'lista',
          label: 'Evaluaciones',
          children: (
            <Card>
              <Table columns={cols} dataSource={evaluaciones ?? []} rowKey="id"
                loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={false} />
            </Card>
          ),
        },
        {
          key: 'resumen',
          label: '📊 Resumen equipo',
          children: resumen ? (
            <Card>
              {resumen.empleados?.map((emp: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '10px 0', borderBottom: '1px solid #f1f5f9',
                }}>
                  <Avatar size={36} style={{ background: '#1677ff', flexShrink: 0 }}>
                    {emp.nombre.charAt(0)}
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 13 }}>{emp.nombre}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{emp.cargo}</Text>
                  </div>
                  <div style={{ width: 200 }}>
                    <Progress
                      percent={(emp.promedio / 5) * 100}
                      format={() => `${emp.promedio}/5`}
                      strokeColor={NOTA_COLOR(emp.promedio)}
                      size="small"
                    />
                  </div>
                  <Tag color={NOTA_COLOR(emp.promedio)} style={{ minWidth: 80, textAlign: 'center' }}>
                    {NOTA_LABEL(emp.promedio)}
                  </Tag>
                </div>
              ))}
            </Card>
          ) : null,
        },
      ]} />

      {/* Modal detalle evaluación */}
      <Modal
        title={<Space><StarOutlined style={{ color: '#f59e0b' }} />Detalle de Evaluación</Space>}
        open={!!detalle}
        onCancel={() => setDetalle(null)}
        footer={<Button onClick={() => setDetalle(null)}>Cerrar</Button>}
        width={600}
        destroyOnClose
      >
        {detalle && (
          <div>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Empleado" span={2}>
                <strong>{detalle.empleado?.nombre} {detalle.empleado?.apellido}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Período">{detalle.periodo}</Descriptions.Item>
              <Descriptions.Item label="Semestre / Trim.">{detalle.semestre}</Descriptions.Item>
              <Descriptions.Item label="Año">{detalle.anio}</Descriptions.Item>
              <Descriptions.Item label="Estado">
                <Tag color={detalle.estado === 'completada' ? 'success' : detalle.estado === 'en_revision' ? 'processing' : 'default'}>
                  {detalle.estado}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Calificación general" span={2}>
                {detalle.calificacionGeneral ? (
                  <Space>
                    <Rate disabled value={Math.round(detalle.calificacionGeneral)} />
                    <Text strong style={{ color: NOTA_COLOR(detalle.calificacionGeneral), fontSize: 18 }}>
                      {Number(detalle.calificacionGeneral).toFixed(1)}
                    </Text>
                    <Tag color={NOTA_COLOR(detalle.calificacionGeneral)}>{NOTA_LABEL(detalle.calificacionGeneral)}</Tag>
                  </Space>
                ) : '—'}
              </Descriptions.Item>
            </Descriptions>

            {/* Criterios */}
            {detalle.criterios && Object.keys(detalle.criterios).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Criterios de evaluación</Text>
                {(crits ?? []).map((c: any) => {
                  const val = detalle.criterios[c.key] ?? 0;
                  return (
                    <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <Text style={{ width: 180, fontSize: 12 }}>{c.label}</Text>
                      <Progress percent={(val / 5) * 100} format={() => `${val}/5`}
                        strokeColor={NOTA_COLOR(val)} size="small" style={{ flex: 1 }} />
                    </div>
                  );
                })}
              </div>
            )}

            {detalle.fortalezas && (
              <div style={{ marginBottom: 10 }}>
                <Text strong style={{ fontSize: 12 }}>✅ Fortalezas</Text>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
                  <Text style={{ fontSize: 12 }}>{detalle.fortalezas}</Text>
                </div>
              </div>
            )}
            {detalle.areasImprovement && (
              <div style={{ marginBottom: 10 }}>
                <Text strong style={{ fontSize: 12 }}>📈 Áreas de mejora</Text>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
                  <Text style={{ fontSize: 12 }}>{detalle.areasImprovement}</Text>
                </div>
              </div>
            )}
            {detalle.comentarios && (
              <div>
                <Text strong style={{ fontSize: 12 }}>💬 Comentarios</Text>
                <div style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
                  <Text style={{ fontSize: 12 }}>{detalle.comentarios}</Text>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal crear evaluación */}
      <Modal title="Nueva Evaluación" open={crearModal}
        onCancel={() => setCrearModal(false)} footer={null} width={620}>
        <Form form={form} layout="vertical"
          initialValues={{ periodo: 'semestral', semestre: 1 }}
          onFinish={handleCrear}>
          <Row gutter={12}>
            <Col span={24}><Form.Item name="empleadoId" label="Empleado" rules={[{ required: true }]}>
              <Select showSearch filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                options={(empleados ?? []).map((e: any) => ({ value: e.id, label: `${e.nombre} ${e.apellido ?? ''}`.trim() }))} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="periodo" label="Período">
              <Select options={[
                { value: 'trimestral', label: 'Trimestral' },
                { value: 'semestral',  label: 'Semestral'  },
                { value: 'anual',      label: 'Anual'      },
              ]} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="semestre" label="Semestre / Trimestre">
              <InputNumber style={{ width: '100%' }} min={1} max={4} />
            </Form.Item></Col>
          </Row>

          {/* Criterios con sliders */}
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
              Calificación por criterio (1–5 ⭐)
            </Text>
            {(crits ?? []).map((c: any) => (
              <div key={c.key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13 }}>{c.label}</Text>
                  <Rate value={criterios[c.key] ?? 0}
                    onChange={v => setCriterios(prev => ({ ...prev, [c.key]: v }))}
                    count={5}
                    style={{ fontSize: 16 }}
                  />
                </div>
              </div>
            ))}
          </div>

          <Form.Item name="fortalezas" label="Fortalezas">
            <textarea style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', minHeight: 60 }} />
          </Form.Item>
          <Form.Item name="areasImprovement" label="Áreas de mejora">
            <textarea style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', minHeight: 60 }} />
          </Form.Item>
          <Form.Item name="comentarios" label="Comentarios generales">
            <textarea style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d9d9d9', minHeight: 60 }} />
          </Form.Item>

          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCrearModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Guardar evaluación</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
