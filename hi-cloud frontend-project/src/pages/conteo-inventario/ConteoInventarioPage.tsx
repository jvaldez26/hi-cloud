import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, Space, Typography, Statistic, Popconfirm, message,
  Progress, InputNumber, Badge, Alert, theme,
} from 'antd';
import {
  AuditOutlined, PlusOutlined, CheckCircleOutlined, PlayCircleOutlined,
  StopOutlined, EditOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2 }).format(v ?? 0);

const ESTADO_CONFIG: Record<string, { color: string; label: string }> = {
  borrador:    { color: 'default', label: 'Borrador'    },
  en_proceso:  { color: 'blue',   label: 'En Proceso'  },
  confirmado:  { color: 'green',  label: 'Confirmado'  },
  cancelado:   { color: 'red',    label: 'Cancelado'   },
};

export default function ConteoInventarioPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [modalCrear,    setModalCrear]    = useState(false);
  const [conteoActivo,  setConteoActivo]  = useState<any>(null);
  const [editandoLinea, setEditandoLinea] = useState<any>(null);
  const [cantidadEdit,  setCantidadEdit]  = useState<number>(0);
  const [formCrear] = Form.useForm();

  const { data: resumen = [] } = useQuery<any[]>({
    queryKey: ['conteo-resumen'],
    queryFn:  () => api.get('/conteo-inventario/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: conteos = [] } = useQuery<any[]>({
    queryKey: ['conteos'],
    queryFn:  () => api.get('/conteo-inventario').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: conteoDetalle } = useQuery<any>({
    queryKey: ['conteo-detalle', conteoActivo?.id],
    queryFn:  () => api.get(`/conteo-inventario/${conteoActivo.id}`).then((r: any) => r.data?.data ?? r.data),
    enabled:  !!conteoActivo?.id,
  });

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/conteo-inventario', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conteos'] });
      qc.invalidateQueries({ queryKey: ['conteo-resumen'] }); setModalCrear(false); formCrear.resetFields(); message.success('Hoja de conteo creada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const iniciar = useMutation({
    mutationFn: (id: number) => api.patch(`/conteo-inventario/${id}/iniciar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conteos'] });
      qc.invalidateQueries({ queryKey: ['conteo-detalle'] }); message.success('Conteo iniciado'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const confirmar = useMutation({
    mutationFn: (id: number) => api.patch(`/conteo-inventario/${id}/confirmar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conteos'] });
      qc.invalidateQueries({ queryKey: ['conteo-resumen'] });
      qc.invalidateQueries({ queryKey: ['conteo-detalle'] });
      message.success('¡Conteo confirmado! Stock actualizado en el inventario.');
      setConteoActivo(null);
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const cancelar = useMutation({
    mutationFn: (id: number) => api.patch(`/conteo-inventario/${id}/cancelar`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conteos'] });
      qc.invalidateQueries({ queryKey: ['conteo-resumen'] }); message.success('Conteo cancelado'); setConteoActivo(null); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const actualizarLinea = useMutation({
    mutationFn: ({ id, dto }: { id: number; dto: any }) =>
      api.patch(`/conteo-inventario/${id}/linea`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conteo-detalle'] });
      setEditandoLinea(null);
      message.success('Cantidad actualizada');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const lineas     = conteoDetalle?.lineas ?? [];
  const contadas   = lineas.filter((l: any) => l.cantidadFisica != null).length;
  const diferencias = lineas.filter((l: any) => l.diferencia !== 0).length;
  const pctAvance   = lineas.length > 0 ? Math.round((contadas / lineas.length) * 100) : 0;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AuditOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Conteo Físico de Inventario</Title>
            <Text type="secondary">Ciclo de conteo · Comparación sistema vs físico · Ajuste automático de stock</Text>
          </div>
        </div>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = conteos.map((c: any) => ({
              'Código':    c.codigo ?? '',
              'Almacén':   c.almacen ?? '',
              'Estado':    c.estado ?? '',
              'Avance':    `${Number(c.porcentajeContado ?? 0).toFixed(0)}%`,
              'Diferencias': c.diferencias ?? 0,
              'Fecha Inicio': c.fechaInicio ? dayjs(c.fechaInicio).format('DD/MM/YYYY') : '',
              'Responsable': c.responsable?.nombre ?? '',
            }));
            exportarExcel(filas, 'Conteos-Inventario');
          }}>Excel</Button>
            <RefreshByKeyButton queryKey={['conteos']} />
            <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nuevo Conteo
          </Button>
        </Space>
      </div>


      <Row gutter={[16, 16]}>
        {/* Lista de conteos */}
        <Col xs={24} lg={conteoActivo ? 10 : 24}>
          <Card bordered={false} style={{ borderRadius: 12 }} title="Hojas de Conteo">
            <Table
              dataSource={conteos}
              rowKey="id"
              size="middle"
              pagination={{ pageSize: 10 }}
              onRow={(row: any) => ({
                style:   { cursor: 'pointer', background: row.id === conteoActivo?.id ? token.colorPrimaryBg : undefined },
                onClick: () => setConteoActivo(row),
              })}
              columns={[
                { title: 'N°', dataIndex: 'numero', key: 'n', render: v => <Text strong style={{ fontFamily: 'mono' }}>{v}</Text> },
                { title: 'Nombre', dataIndex: 'nombre', key: 'nm' },
                { title: 'Fecha', dataIndex: 'fecha', key: 'f' },
                { title: 'Productos', dataIndex: 'totalProductos', key: 'tp', align: 'center', render: v => <Tag>{v}</Tag> },
                { title: 'Diferencias', dataIndex: 'totalDiferencias', key: 'td', align: 'center',
                  render: v => v > 0 ? <Tag color="orange">{v}</Tag> : <Tag color="green">0</Tag> },
                { title: 'Estado', dataIndex: 'estado', key: 'e', render: v => <Tag color={ESTADO_CONFIG[v]?.color}>{ESTADO_CONFIG[v]?.label}</Tag> },
                {
                  title: '', key: 'a',
                  render: (_, r: any) => (
                    <Space onClick={e => e.stopPropagation()}>
                      {r.estado === 'borrador' && <Button size="small" icon={<PlayCircleOutlined />} type="primary" ghost onClick={() => iniciar.mutate(r.id)}>Iniciar</Button>}
                      {r.estado === 'en_proceso' && (
                        <Popconfirm title="¿Confirmar y aplicar ajustes de stock?" onConfirm={() => confirmar.mutate(r.id)}>
                          <Button size="small" icon={<CheckCircleOutlined />} style={{ color: token.colorSuccess, borderColor: token.colorSuccess }}>Confirmar</Button>
                        </Popconfirm>
                      )}
                      {r.estado !== 'confirmado' && (
                        <Popconfirm title="¿Cancelar conteo?" onConfirm={() => cancelar.mutate(r.id)}>
                          <Button size="small" danger icon={<StopOutlined />} />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        {/* Detalle del conteo activo */}
        {conteoActivo && conteoDetalle && (
          <Col xs={24} lg={14}>
            <Card
              bordered={false}
              style={{ borderRadius: 12 }}
              title={
                <Space>
                  <AuditOutlined />
                  {conteoActivo.nombre}
                  <Tag color={ESTADO_CONFIG[conteoDetalle.estado]?.color}>{ESTADO_CONFIG[conteoDetalle.estado]?.label}</Tag>
                </Space>
              }
              extra={<Button size="small" onClick={() => setConteoActivo(null)}>Cerrar ✕</Button>}
            >
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text type="secondary">Progreso del conteo</Text>
                  <Text strong>{contadas}/{lineas.length} productos contados</Text>
                </div>
                <Progress
                  percent={pctAvance}
                  strokeColor={pctAvance === 100 ? token.colorSuccess : token.colorPrimary}
                />
                {diferencias > 0 && (
                  <Alert type="warning" showIcon style={{ marginTop: 8, fontSize: 12 }}
                    message={`${diferencias} producto(s) con diferencia entre físico y sistema`} />
                )}
              </div>

              <Table
                dataSource={lineas}
                rowKey="id"
                size="small"
                scroll={{ y: 380 }}
                pagination={false}
                rowClassName={(r: any) => {
                  if (r.diferencia > 0) return 'ant-table-row-success';
                  if (r.diferencia < 0) return 'ant-table-row-danger';
                  return '';
                }}
                columns={[
                  { title: 'Código', dataIndex: 'productoCodigo', key: 'c', render: v => <Tag style={{ fontSize: 10 }}>{v}</Tag> },
                  { title: 'Producto', dataIndex: 'productoNombre', key: 'n', ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v}</Text> },
                  { title: 'Sistema', dataIndex: 'cantidadSistema', key: 's', align: 'right', render: v => fmt(v) },
                  {
                    title: 'Físico', key: 'f', align: 'right',
                    render: (_, r: any) => r.cantidadFisica != null
                      ? <Text strong>{fmt(r.cantidadFisica)}</Text>
                      : <Text type="secondary" style={{ fontSize: 11 }}>Pendiente</Text>,
                  },
                  {
                    title: 'Dif.', dataIndex: 'diferencia', key: 'd', align: 'right',
                    render: v => v === 0 ? <Text type="secondary">0</Text>
                      : <Text style={{ color: v > 0 ? token.colorSuccess : token.colorError, fontWeight: 700 }}>
                          {v > 0 ? '+' : ''}{fmt(v)}
                        </Text>,
                  },
                  {
                    title: '', key: 'a',
                    render: (_, r: any) => conteoDetalle.estado === 'en_proceso' ? (
                      <Button size="small" icon={<EditOutlined />}
                        onClick={() => { setEditandoLinea(r); setCantidadEdit(r.cantidadFisica ?? r.cantidadSistema); }}>
                        Contar
                      </Button>
                    ) : null,
                  },
                ]}
              />
            </Card>
          </Col>
        )}
      </Row>

      {/* Modal Crear */}
      <Modal
        title={<Space><AuditOutlined />Nuevo Conteo de Inventario</Space>}
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending}
        okText="Crear Hoja de Conteo"
        destroyOnClose
      >
        <Form form={formCrear} layout="vertical"
          initialValues={{ fecha: dayjs().format('YYYY-MM-DD') }}
          onFinish={v => crear.mutate(v)}>
          <Form.Item name="nombre" label="Nombre / Descripción" rules={[{ required: true }]}>
            <Input placeholder="Conteo mensual Mayo 2026" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="fecha" label="Fecha del Conteo" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col xs={24} sm={12}>
              <Form.Item name="categoria" label="Filtrar por Categoría (opcional)">
                <Input placeholder="Ej. Electrónica" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
        <Alert type="info" showIcon style={{ fontSize: 12 }}
          message="Se cargará automáticamente el stock actual de todos los productos en el sistema." />
      </Modal>

      {/* Modal editar línea */}
      <Modal
        title={`Contar: ${editandoLinea?.productoNombre}`}
        open={!!editandoLinea}
        onCancel={() => setEditandoLinea(null)}
        onOk={() => actualizarLinea.mutate({ id: conteoActivo.id, dto: { lineaId: editandoLinea.id, cantidadFisica: cantidadEdit } })}
        confirmLoading={actualizarLinea.isPending}
        okText="Guardar"
        width={380}
      >
        {editandoLinea && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              Sistema: {fmt(editandoLinea.cantidadSistema)} {editandoLinea.productoNombre?.includes('KG') ? 'kg' : 'uds'}
            </Text>
            <Text style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>Cantidad Física Contada:</Text>
            <InputNumber
              style={{ width: 160, fontSize: 24 }}
              value={cantidadEdit}
              min={0}
              precision={2}
              onChange={v => setCantidadEdit(Number(v))}
              size="large"
              autoFocus
            />
            {cantidadEdit !== editandoLinea.cantidadSistema && (
              <div style={{ marginTop: 12 }}>
                <Tag color={cantidadEdit > editandoLinea.cantidadSistema ? 'green' : 'red'} style={{ fontSize: 14 }}>
                  Diferencia: {cantidadEdit > editandoLinea.cantidadSistema ? '+' : ''}{fmt(cantidadEdit - editandoLinea.cantidadSistema)}
                </Tag>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
