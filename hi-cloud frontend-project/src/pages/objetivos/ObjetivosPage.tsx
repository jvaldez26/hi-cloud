import { useState, useMemo } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Typography, Tag, Button,
  Space, Modal, Form, Input, Select, InputNumber, Tabs,
  Popconfirm, message, Progress, Tooltip, theme,
} from 'antd';
import {
  PlusOutlined, TrophyOutlined, FileExcelOutlined, AimOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api/client';

const { Title, Text } = Typography;

const okrApi = {
  dashboard:  (anio: number)   => api.get(`/objetivos/dashboard?anio=${anio}`).then(r => r.data?.data ?? r.data),
  listar:     (anio: number)   => api.get(`/objetivos?anio=${anio}`).then(r => r.data?.data ?? r.data),
  crear:      (b: any)         => api.post('/objetivos', b).then(r => r.data?.data ?? r.data),
  eliminar:   (id: number)     => api.delete(`/objetivos/${id}`).then(r => r.data?.data ?? r.data),
  crearKR:    (id: number, b: any) => api.post(`/objetivos/${id}/krs`, b).then(r => r.data?.data ?? r.data),
  progreso:   (krId: number, val: number) =>
    api.patch(`/objetivos/krs/${krId}/progreso`, { valorActual: val }).then(r => r.data?.data ?? r.data),
  eliminarKR: (id: number)     => api.delete(`/objetivos/krs/${id}`).then(r => r.data?.data ?? r.data),
};

const ESTADO_COLOR: Record<string, string> = {
  activo:    '#1677ff',
  en_riesgo: '#ef4444',
  cumplido:  '#10b981',
  cancelado: '#94a3b8',
};

const NIVEL_COLOR: Record<string, string> = {
  empresa:      '#7c3aed',
  departamento: '#0891b2',
  individual:   '#f59e0b',
};

const PERIODO_LABEL: Record<string, string> = {
  Q1: 'Q1 (Ene-Mar)', Q2: 'Q2 (Abr-Jun)',
  Q3: 'Q3 (Jul-Sep)', Q4: 'Q4 (Oct-Dic)', anual: 'Anual',
};

function ObjetivoCard({ obj, onUpdate }: { obj: any; onUpdate: () => void }) {
  const { token }               = theme.useToken();
  const [krModal,   setKrModal]   = useState(false);
  const [progModal, setProgModal] = useState<any>(null);
  const [formKR]  = Form.useForm();
  const [formProg]= Form.useForm();
  const qc = useQueryClient();

  const crearKrMut = useMutation({
    mutationFn: (dto: any) => okrApi.crearKR(obj.id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['okr'] }); setKrModal(false); formKR.resetFields(); message.success('KR agregado'); },
  });

  const progresoMut = useMutation({
    mutationFn: ({ krId, val }: any) => okrApi.progreso(krId, val),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['okr'] }); setProgModal(null); onUpdate(); },
  });

  const progColor = obj.progresoCalculado >= 70 ? '#10b981' : obj.progresoCalculado >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Card
        style={{
          borderLeft: `4px solid ${ESTADO_COLOR[obj.estado] ?? '#1677ff'}`,
          marginBottom: 12,
        }}
        size="small"
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 14 }}>{obj.titulo}</Text>
            <Space size={4}>
              <Tag color={NIVEL_COLOR[obj.nivel]}>{obj.nivel}</Tag>
              <Tag color={ESTADO_COLOR[obj.estado]}>{obj.estado}</Tag>
              <Tag>{PERIODO_LABEL[obj.periodo] ?? obj.periodo} {obj.anio}</Tag>
            </Space>
          </div>
        }
        extra={
          <Space size={4}>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setKrModal(true)}>
              + KR
            </Button>
            <Popconfirm title="¿Eliminar objetivo?" onConfirm={() => okrApi.eliminar(obj.id).then(() => onUpdate())}>
              <Button size="small" danger>✕</Button>
            </Popconfirm>
          </Space>
        }
      >
        {/* Progreso global */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Progreso global</Text>
            <Text strong style={{ color: progColor }}>{obj.progresoCalculado}%</Text>
          </div>
          <Progress
            percent={obj.progresoCalculado}
            strokeColor={progColor}
            size="small"
            showInfo={false}
          />
        </div>

        {/* Resultados Clave */}
        {obj.resultadosClave?.length > 0 && (
          <div>
            {obj.resultadosClave.map((kr: any) => (
              <div key={kr.id} style={{
                padding: '8px 12px', marginBottom: 6,
                background: token.colorFillAlter, borderRadius: 8,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: 500 }}>{kr.descripcion}</Text>
                  <Space size={4}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {Number(kr.valorActual).toFixed(0)} / {Number(kr.valorMeta).toFixed(0)} {kr.unidad ?? ''}
                    </Text>
                    <Button size="small" type="link" style={{ padding: 0, height: 'auto', fontSize: 11 }}
                      onClick={() => { setProgModal(kr); formProg.setFieldsValue({ valorActual: kr.valorActual }); }}>
                      Actualizar
                    </Button>
                    <Popconfirm title="¿Eliminar KR?" onConfirm={() => okrApi.eliminarKR(kr.id).then(() => onUpdate())}>
                      <Button size="small" type="text" danger style={{ padding: 0, height: 'auto', fontSize: 11 }}>✕</Button>
                    </Popconfirm>
                  </Space>
                </div>
                <Progress
                  percent={kr.progreso}
                  size="small"
                  strokeColor={kr.progreso >= 70 ? '#10b981' : kr.progreso >= 40 ? '#f59e0b' : '#ef4444'}
                  format={p => `${p}%`}
                />
              </div>
            ))}
          </div>
        )}

        {obj.propietario && (
          <Text type="secondary" style={{ fontSize: 11 }}>👤 {obj.propietario}</Text>
        )}
      </Card>

      {/* Modal agregar KR */}
      <Modal title="Agregar Resultado Clave (KR)" open={krModal}
        onCancel={() => setKrModal(false)} footer={null} width={440}>
        <Form form={formKR} layout="vertical"
          initialValues={{ tipo: 'numero', valorInicio: 0 }}
          onFinish={v => crearKrMut.mutate(v)}>
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="tipo" label="Tipo">
              <Select options={[
                { value: 'numero',     label: '🔢 Número' },
                { value: 'porcentaje', label: '📊 Porcentaje' },
                { value: 'booleano',   label: '✅ Sí/No' },
              ]} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="valorInicio" label="Valor inicial"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="valorMeta" label="Meta" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={24}><Form.Item name="unidad" label="Unidad (clientes, %, RD$...)"><Input placeholder="ej: clientes, %, RD$" /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setKrModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearKrMut.isPending}>Agregar KR</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal actualizar progreso */}
      <Modal title={`Actualizar: ${progModal?.descripcion}`} open={!!progModal}
        onCancel={() => setProgModal(null)} footer={null} width={380}>
        <Form form={formProg} layout="vertical"
          onFinish={v => progresoMut.mutate({ krId: progModal?.id, val: v.valorActual })}>
          <Form.Item name="valorActual" label={`Valor actual (meta: ${progModal?.valorMeta} ${progModal?.unidad ?? ''})`} rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} size="large" min={0} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setProgModal(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={progresoMut.isPending}>Actualizar</Button></Col>
          </Row>
        </Form>
      </Modal>
    </motion.div>
  );
}

export default function ObjetivosPage() {
  const { token }                   = theme.useToken();
  const [search, setSearch]         = useState('');
  const [anio,       setAnio]       = useState(new Date().getFullYear());
  const [crearModal, setCrearModal] = useState(false);
  const [form]                      = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }    = useQuery({ queryKey: ['okr-dash', anio], queryFn: () => okrApi.dashboard(anio) });
  const { data: objetivos}= useQuery({ queryKey: ['okr',      anio], queryFn: () => okrApi.listar(anio) });

  const crearMut = useMutation({
    mutationFn: okrApi.crear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['okr'] });
      qc.invalidateQueries({ queryKey: ['okr-dash'] });
      setCrearModal(false); form.resetFields(); message.success('Objetivo creado');
    },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const reload = () => {
    qc.invalidateQueries({ queryKey: ['okr'] });
    qc.invalidateQueries({ queryKey: ['okr-dash'] });
  };

  const objetivosFiltrados = useMemo(() =>
    (objetivos ?? []).filter((o: any) =>
      String(o.titulo ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(o.propietario ?? '').toLowerCase().includes(search.toLowerCase())
    ), [objetivos, search]);

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <AimOutlined style={{ marginRight: 8, color: '#7c3aed' }} />
            Objetivos y Metas — OKR
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Objectives & Key Results · Gestión estratégica
          </Text>
        </Col>
        <Col>
          <Space>
            <Input
              placeholder="Buscar por nombre o responsable..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            <Select value={anio} onChange={setAnio} style={{ width: 90 }}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (objetivos ?? []).map((o: any) => ({
                'Objetivo':   o.titulo ?? '',
                'Área':       o.area ?? '',
                'Progreso':   `${Number(o.progresoGeneral ?? 0).toFixed(0)}%`,
                'Estado':     o.estado ?? '',
                'Propietario':o.propietario?.nombre ?? '',
                'Año':        anio,
              }));
              exportarExcel(filas, `OKR-${anio}`);
            }}>Excel</Button>
            <RefreshByKeyButton queryKey={['objetivos']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => { setCrearModal(true); form.resetFields(); }}>
              Nuevo objetivo
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Lista de objetivos */}
      {objetivosFiltrados.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <AimOutlined style={{ fontSize: 48, color: '#d1d5db', marginBottom: 12 }} />
          <br />
          <Text type="secondary">No hay objetivos para {anio}.</Text>
          <br />
          <Button type="primary" style={{ marginTop: 12 }} onClick={() => setCrearModal(true)}>
            Crear primer objetivo
          </Button>
        </Card>
      ) : (
        <AnimatePresence>
          {objetivosFiltrados.map((obj: any) => (
            <ObjetivoCard key={obj.id} obj={obj} onUpdate={reload} />
          ))}
        </AnimatePresence>
      )}

      {/* Modal crear objetivo */}
      <Modal title="Nuevo Objetivo" open={crearModal}
        onCancel={() => setCrearModal(false)} footer={null} width={520}>
        <Form form={form} layout="vertical"
          initialValues={{ nivel: 'empresa', periodo: 'anual', anio }}>
          <Form.Item name="titulo" label="Título del objetivo" rules={[{ required: true }]}>
            <Input placeholder="Incrementar ventas un 30%, Lanzar nuevo producto..." />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="nivel" label="Nivel">
              <Select options={[
                { value: 'empresa',      label: '🏢 Empresa' },
                { value: 'departamento', label: '👥 Departamento' },
                { value: 'individual',   label: '👤 Individual' },
              ]} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="periodo" label="Período">
              <Select options={Object.entries(PERIODO_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="anio" label="Año">
              <InputNumber style={{ width: '100%' }} min={2024} max={2030} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="propietario" label="Responsable"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción (opcional)"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCrearModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Crear objetivo</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
