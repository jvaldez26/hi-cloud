import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Typography, Table, Tag, Statistic, Button,
  Space, Modal, Form, Input, Select, DatePicker, InputNumber,
  Tabs, message, Drawer, Descriptions, Steps,
} from 'antd';
import {
  PlusOutlined, TrophyOutlined, FileTextOutlined, FileExcelOutlined,
  CloseCircleOutlined, LinkOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const licApi = {
  dashboard:   ()               => api.get('/licitaciones/dashboard').then(r => r.data?.data ?? r.data),
  listar:      (p = 1, e?: string) =>
    api.get(`/licitaciones?page=${p}${e ? `&estado=${e}` : ''}`).then(r => r.data?.data ?? r.data),
  crear:       (b: any)          => api.post('/licitaciones', b).then(r => r.data?.data ?? r.data),
  actualizar:  (id: number, b: any) => api.patch(`/licitaciones/${id}`, b).then(r => r.data?.data ?? r.data),
  estado:      (id: number, estado: string, motivo?: string, monto?: number) =>
    api.patch(`/licitaciones/${id}/estado`, { estado, motivo, montoAdjudicado: monto }).then(r => r.data?.data ?? r.data),
  eliminar:    (id: number)      => api.delete(`/licitaciones/${id}`).then(r => r.data?.data ?? r.data),
};

const ESTADO_PIPELINE = [
  { key: 'identificada', label: 'Identificada', color: '#6b7280', step: 0 },
  { key: 'en_proceso',   label: 'En proceso',   color: '#3b82f6', step: 1 },
  { key: 'presentada',   label: 'Presentada',   color: '#f59e0b', step: 2 },
  { key: 'adjudicada',   label: 'Adjudicada',   color: '#10b981', step: 3 },
  { key: 'perdida',      label: 'Perdida',       color: '#ef4444', step: -1 },
  { key: 'cancelada',    label: 'Cancelada',     color: '#9ca3af', step: -2 },
];

const TIPO_LIC = [
  { value: 'publica',     label: '🏛️ Pública' },
  { value: 'privada',     label: '🏢 Privada' },
  { value: 'restringida', label: '🔒 Restringida' },
  { value: 'emergencia',  label: '🚨 Emergencia' },
];

export default function LicitacionesPage() {
  const [page,        setPage]        = useState(1);
  const [estadoF,     setEstadoF]     = useState<string | undefined>();
  const [crearModal,  setCrearModal]  = useState(false);
  const [detalle,     setDetalle]     = useState<any>(null);
  const [estadoModal, setEstadoModal] = useState<any>(null);
  const [form]                        = Form.useForm();
  const [formEst]                     = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }     = useQuery({ queryKey: ['lic-dash'],             queryFn: licApi.dashboard });
  const { data: lista, isLoading } = useQuery({
    queryKey: ['licitaciones', page, estadoF],
    queryFn:  () => licApi.listar(page, estadoF),
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['licitaciones'] });
    qc.invalidateQueries({ queryKey: ['lic-dash'] });
  };

  const crearMut = useMutation({
    mutationFn: licApi.crear,
    onSuccess: () => { inv(); setCrearModal(false); form.resetFields(); message.success('Licitación registrada'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado, motivo, monto }: any) => licApi.estado(id, estado, motivo, monto),
    onSuccess: (updated) => { inv(); setEstadoModal(null); setDetalle(updated); message.success('Estado actualizado'); },
  });

  const COLS_DEF = [
    { key: 'numero',             label: 'Número',   defaultVisible: true  },
    { key: 'titulo',             label: 'Título',   defaultVisible: true  },
    { key: 'entidadConvocante',  label: 'Entidad',  defaultVisible: true  },
    { key: 'tipo',               label: 'Tipo',     defaultVisible: false },
    { key: 'fechaLimiteOfertas', label: 'Límite',   defaultVisible: true  },
    { key: 'montoOfertado',      label: 'Ofertado', defaultVisible: true  },
    { key: 'estado',             label: 'Estado',   defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('licitaciones', COLS_DEF);

  const cols = [
    { title: 'Número',    dataIndex: 'numero',            key: 'numero',            width: 130, render: (v: string) => <Text code strong>{v}</Text> },
    { title: 'Título',    dataIndex: 'titulo',            key: 'titulo',            ellipsis: true,
      render: (v: string, r: any) => <Button type="link" style={{ padding: 0 }} onClick={() => setDetalle(r)}>{v}</Button> },
    { title: 'Entidad',   dataIndex: 'entidadConvocante', key: 'entidadConvocante',  ellipsis: true },
    { title: 'Tipo',      dataIndex: 'tipo',              key: 'tipo',               width: 100, render: (v: string) => TIPO_LIC.find(t => t.value === v)?.label ?? v },
    { title: 'Límite',    dataIndex: 'fechaLimiteOfertas',key: 'fechaLimiteOfertas', width: 105,
      render: (v: string) => v ? <Text type={new Date(v) < new Date() ? 'danger' : undefined}>{fmt.date(v)}</Text> : '—' },
    { title: 'Ofertado',  dataIndex: 'montoOfertado',     key: 'montoOfertado',      width: 130, render: (v: number) => v ? fmt.money(v) : '—' },
    { title: 'Estado',    dataIndex: 'estado',            key: 'estado',             width: 120,
      render: (v: string) => {
        const e = ESTADO_PIPELINE.find(x => x.key === v);
        return <Tag color={e?.color}>{e?.label ?? v}</Tag>;
      }},
    { title: '', key: 'del', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetalle(r)}
          viewLabel="Ver detalle"
          items={[
            { key: 'del', label: 'Eliminar', danger: true, icon: <CloseCircleOutlined />,
              onClick: () => { if (window.confirm('¿Eliminar?')) licApi.eliminar(r.id).then(() => inv()); } },
          ]}
        />
      )},
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Licitaciones y Propuestas
          </Title>
        </Col>
        <Col>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (lista?.data ?? []).map((l: any) => ({
              'Número':     l.numero ?? '',
              'Título':     l.titulo ?? '',
              'Entidad':    l.entidadConvocante ?? '',
              'Monto':      Number(l.montoEstimado ?? 0),
              'Estado':     l.estado ?? '',
              'Vencimiento':l.fechaVencimiento ?? '',
            }));
            exportarExcel(filas, 'Licitaciones');
          }}>Excel</Button>
          <RefreshByKeyButton queryKey={['licitaciones']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { setCrearModal(true); form.resetFields(); }}>
            Registrar licitación
          </Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
        </Col>
      </Row>


      <Card extra={
        <Select placeholder="Estado" allowClear style={{ width: 150 }}
          value={estadoF} onChange={v => { setEstadoF(v); setPage(1); }}
          options={ESTADO_PIPELINE.map(e => ({
            value: e.key, label: <Tag color={e.color}>{e.label}</Tag>,
          }))} />
      }>
        <Table columns={filterColumns(cols)} dataSource={lista?.data ?? []} rowKey="id"
          loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ total: lista?.meta?.total, pageSize: 10, current: page,
                        onChange: setPage, showSizeChanger: false }} />
      </Card>

      {/* Drawer detalle */}
      <Drawer title={detalle?.numero} open={!!detalle} onClose={() => setDetalle(null)} width={560}
        extra={
          <Space>
            {['identificada','en_proceso','presentada'].includes(detalle?.estado) && (
              <Button type="primary" onClick={() => { setEstadoModal(detalle); formEst.resetFields(); }}>
                Avanzar estado
              </Button>
            )}
          </Space>
        }>
        {detalle && (
          <>
            {/* Pipeline steps */}
            <Steps size="small" current={ESTADO_PIPELINE.find(e => e.key === detalle.estado)?.step ?? 0}
              style={{ marginBottom: 20 }}
              items={ESTADO_PIPELINE.filter(e => e.step >= 0).map(e => ({ title: e.label }))} />

            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Título">{detalle.titulo}</Descriptions.Item>
              <Descriptions.Item label="Entidad convocante">{detalle.entidadConvocante}</Descriptions.Item>
              {detalle.rncEntidad && <Descriptions.Item label="RNC Entidad">{detalle.rncEntidad}</Descriptions.Item>}
              <Descriptions.Item label="Tipo">{TIPO_LIC.find(t => t.value === detalle.tipo)?.label}</Descriptions.Item>
              <Descriptions.Item label="Publicación">{fmt.date(detalle.fechaPublicacion)}</Descriptions.Item>
              {detalle.fechaLimiteOfertas && <Descriptions.Item label="Límite ofertas">{fmt.date(detalle.fechaLimiteOfertas)}</Descriptions.Item>}
              {detalle.montoEstimado  && <Descriptions.Item label="Monto estimado">{fmt.money(detalle.montoEstimado)}</Descriptions.Item>}
              {detalle.montoOfertado  && <Descriptions.Item label="Monto ofertado">{fmt.money(detalle.montoOfertado)}</Descriptions.Item>}
              {detalle.montoAdjudicado && <Descriptions.Item label="Monto adjudicado"><Text strong style={{ color: '#10b981' }}>{fmt.money(detalle.montoAdjudicado)}</Text></Descriptions.Item>}
              {detalle.requisitos && <Descriptions.Item label="Requisitos">{detalle.requisitos}</Descriptions.Item>}
              {detalle.descripcion && <Descriptions.Item label="Descripción">{detalle.descripcion}</Descriptions.Item>}
              {detalle.motivoPerdida && <Descriptions.Item label="Motivo pérdida">{detalle.motivoPerdida}</Descriptions.Item>}
              {detalle.enlacePortal  && (
                <Descriptions.Item label="Portal">
                  <a href={detalle.enlacePortal} target="_blank" rel="noreferrer">
                    <LinkOutlined /> Ver licitación
                  </a>
                </Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}
      </Drawer>

      {/* Modal avanzar estado */}
      <Modal title="Cambiar estado de licitación" open={!!estadoModal}
        onCancel={() => setEstadoModal(null)} footer={null} width={460}>
        <Form form={formEst} layout="vertical"
          onFinish={v => estadoMut.mutate({ id: estadoModal?.id, ...v })}>
          <Form.Item name="estado" label="Nuevo estado" rules={[{ required: true }]}>
            <Select options={ESTADO_PIPELINE.map(e => ({
              value: e.key, label: <Tag color={e.color}>{e.label}</Tag>,
            }))} />
          </Form.Item>
          <Form.Item name="monto" label="Monto adjudicado (si aplica)">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item name="motivo" label="Motivo pérdida/cancelación">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setEstadoModal(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={estadoMut.isPending}>Actualizar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal crear */}
      <Modal title="Registrar Licitación" open={crearModal}
        onCancel={() => setCrearModal(false)} footer={null} width={620}>
        <Form form={form} layout="vertical"
          initialValues={{ tipo: 'publica' }}
          onFinish={v => crearMut.mutate({
            ...v,
            fechaPublicacion:   v.fechaPublicacion?.format('YYYY-MM-DD'),
            fechaLimiteOfertas: v.fechaLimiteOfertas?.format('YYYY-MM-DD'),
            fechaApertura:      v.fechaApertura?.format('YYYY-MM-DD'),
          })}>
          <Row gutter={12}>
            <Col span={24}><Form.Item name="titulo" label="Título" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="entidadConvocante" label="Entidad convocante" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="rncEntidad" label="RNC entidad"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tipo" label="Tipo"><Select options={TIPO_LIC} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaPublicacion" label="Fecha publicación" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaLimiteOfertas" label="Límite ofertas">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="fechaApertura" label="Fecha apertura">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="montoEstimado" label="Monto estimado (RD$)">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="montoOfertado" label="Monto ofertado (RD$)">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="enlacePortal" label="Enlace portal (DGCP / SNCC)"><Input prefix={<LinkOutlined />} /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
            <Col span={24}><Form.Item name="requisitos" label="Requisitos"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCrearModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Registrar</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
