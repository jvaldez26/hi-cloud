import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  InputNumber, Switch, Space, Typography, Statistic,
  message, DatePicker, Divider, Alert, theme,
} from 'antd';
import {
  PercentageOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  ThunderboltOutlined, CheckCircleOutlined, FileExcelOutlined, SearchOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const TIPO_LABELS: Record<string, string> = {
  porcentaje: 'Porcentaje (%)',
  monto_fijo: 'Monto Fijo (RD$)',
};

const CONDICION_LABELS: Record<string, { label: string; desc: string }> = {
  siempre:      { label: 'Siempre',               desc: 'Aplica a todos los productos' },
  categoria:    { label: 'Por Categoría',          desc: 'Solo para productos de una categoría' },
  producto:     { label: 'Producto Específico',    desc: 'Solo para un producto (ID)' },
  cantidad_min: { label: 'Cantidad Mínima',        desc: 'Si se compra X o más unidades' },
  monto_min:    { label: 'Monto Mínimo',           desc: 'Si la línea supera RD$ X' },
  fecha:        { label: 'Por Rango de Fecha',     desc: 'Solo aplica en las fechas definidas' },
};

export default function DescuentosPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [search,       setSearch]       = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editando,     setEditando]     = useState<any>(null);
  const [form] = Form.useForm();
  const condicion = Form.useWatch('condicion', form);

  const { data: resumen } = useQuery<any>({
    queryKey: ['descuentos-resumen'],
    queryFn: () => api.get('/descuentos/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: reglas = [], isLoading } = useQuery<any[]>({
    queryKey: ['descuentos'],
    queryFn: () => api.get('/descuentos').then((r: any) => r.data?.data ?? r.data),
  });

  const reglasFiltradas = useMemo(() => {
    if (!search.trim()) return reglas;
    const q = search.toLowerCase();
    return reglas.filter((r: any) =>
      (r.nombre ?? '').toLowerCase().includes(q) ||
      (r.codigo ?? '').toLowerCase().includes(q) ||
      (r.descripcion ?? '').toLowerCase().includes(q)
    );
  }, [reglas, search]);

  const crearActualizar = useMutation({
    mutationFn: (dto: any) => editando
      ? api.patch(`/descuentos/${editando.id}`, dto)
      : api.post('/descuentos', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descuentos'] });
      qc.invalidateQueries({ queryKey: ['descuentos-resumen'] });
      setModalVisible(false);
      setEditando(null);
      form.resetFields();
      message.success(editando ? 'Regla actualizada' : 'Regla de descuento creada');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/descuentos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['descuentos'] });
      qc.invalidateQueries({ queryKey: ['descuentos-resumen'] }); message.success('Regla eliminada'); },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const toggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => api.patch(`/descuentos/${id}`, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos'] }),
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const abrirEditar = (r: any) => {
    setEditando(r);
    form.setFieldsValue({
      ...r,
      rango: r.fechaDesde && r.fechaHasta ? [dayjs(r.fechaDesde), dayjs(r.fechaHasta)] : undefined,
    });
    setModalVisible(true);
  };

  const handleFinish = (values: any) => {
    const dto = {
      ...values,
      fechaDesde: values.rango?.[0]?.format('YYYY-MM-DD'),
      fechaHasta: values.rango?.[1]?.format('YYYY-MM-DD'),
    };
    delete dto.rango;
    crearActualizar.mutate(dto);
  };

  const COLS_DEF = [
    { key: 'nombre',    label: 'Regla',      defaultVisible: true  },
    { key: 'tipo',      label: 'Descuento',  defaultVisible: true  },
    { key: 'condicion', label: 'Condición',  defaultVisible: true  },
    { key: 'vigencia',  label: 'Vigencia',   defaultVisible: false },
    { key: 'p',         label: 'Prioridad',  defaultVisible: true  },
    { key: 'activo',    label: 'Activa',     defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('descuentos', COLS_DEF);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PercentageOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Descuentos Automatizados</Title>
            <Text type="secondary">Reglas de descuento que se aplican automáticamente en facturas y POS</Text>
          </div>
        </div>
        <Space>
          <Input
            placeholder="Buscar por nombre o código..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => { setSearch(e.target.value); }}
            allowClear
            style={{ width: 220 }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = reglas.map((r: any) => ({
              'Nombre':    r.nombre ?? '',
              'Tipo':      r.tipo ?? '',
              'Valor':     r.tipo === 'porcentaje' ? `${r.valor}%` : `RD$ ${Number(r.valor ?? 0)}`,
              'Activa':    r.activa ? 'Sí' : 'No',
              'Prioridad': r.prioridad ?? '',
              'Vencimiento':r.fechaVencimiento ? dayjs(r.fechaVencimiento).format('DD/MM/YYYY') : 'Sin límite',
            }));
            exportarExcel(filas, 'Descuentos-Reglas');
          }}>Excel</Button>
          <RefreshByKeyButton queryKey={['descuentos']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditando(null); form.resetFields(); setModalVisible(true); }}>
            Nueva Regla
          </Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 8 }}
        message="Las reglas se evalúan por prioridad (mayor número = mayor prioridad). Solo se aplica la primera regla que coincida con cada línea."
      />

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={reglasFiltradas}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          columns={filterColumns([
            {
              title: 'Regla', key: 'nombre',
              render: (_, r: any) => (
                <div>
                  <Text strong>{r.nombre}</Text>
                  {r.descripcion && <div><Text type="secondary" style={{ fontSize: 11 }}>{r.descripcion}</Text></div>}
                </div>
              ),
            },
            {
              title: 'Descuento', key: 'tipo',
              render: (_, r: any) => (
                <Tag color={r.tipo === 'porcentaje' ? 'blue' : 'green'} style={{ fontSize: 13, fontWeight: 700 }}>
                  {r.tipo === 'porcentaje' ? `${r.valor}%` : `RD$ ${Number(r.valor).toLocaleString('es-DO')}`}
                </Tag>
              ),
            },
            {
              title: 'Condición', key: 'condicion',
              render: (_, r: any) => (
                <div>
                  <Tag>{CONDICION_LABELS[r.condicion]?.label ?? r.condicion}</Tag>
                  {r.condicionValor && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.condicionValor}</Text>}
                </div>
              ),
            },
            {
              title: 'Vigencia', key: 'vigencia',
              render: (_, r: any) => r.fechaDesde
                ? <Text type="secondary" style={{ fontSize: 12 }}>{r.fechaDesde} → {r.fechaHasta}</Text>
                : <Tag>Sin límite</Tag>,
            },
            {
              title: 'Prioridad', dataIndex: 'prioridad', key: 'p', align: 'center',
              render: v => <Tag color="purple">{v}</Tag>,
            },
            {
              title: 'Activa', key: 'activo',
              render: (_, r: any) => (
                <Switch
                  checked={r.activo}
                  size="small"
                  onChange={v => toggleActivo.mutate({ id: r.id, activo: v })}
                />
              ),
            },
            {
              title: '', key: 'acc', width: 72, align: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => abrirEditar(r)}
                  viewLabel="Editar"
                  items={[
                    { key: 'edit', label: 'Editar', icon: <EditOutlined />, onClick: () => abrirEditar(r) },
                    { type: 'divider' as const },
                    { key: 'del', label: 'Eliminar', danger: true, icon: <DeleteOutlined />,
                      onClick: () => Modal.confirm({
                        title: '¿Eliminar regla?',
                        okText: 'Confirmar',
                        cancelText: 'Cancelar',
                        okButtonProps: { danger: true },
                        onOk: () => eliminar.mutate(r.id),
                      }) },
                  ]}
                />
              ),
            },
          ])}
        />
      </Card>

      {/* Modal */}
      <Modal
        title={editando ? 'Editar Regla de Descuento' : 'Nueva Regla de Descuento'}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setEditando(null); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={crearActualizar.isPending}
        okText={editando ? 'Actualizar' : 'Crear'}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleFinish}
          initialValues={{ tipo: 'porcentaje', condicion: 'siempre', prioridad: 1, activo: true }}>
          <Form.Item name="nombre" label="Nombre de la Regla" rules={[{ required: true }]}>
            <Input placeholder="Ej. Descuento 10% temporada escolar" />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} sm={10}>
              <Form.Item name="tipo" label="Tipo de Descuento" rules={[{ required: true }]}>
                <Select>
                  <Option value="porcentaje">Porcentaje (%)</Option>
                  <Option value="monto_fijo">Monto Fijo (RD$)</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={7}>
              <Form.Item name="valor" label="Valor" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={7}>
              <Form.Item name="prioridad" label="Prioridad">
                <InputNumber min={1} max={99} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="condicion" label="Condición de Aplicación">
            <Select>
              {Object.entries(CONDICION_LABELS).map(([k, v]) => (
                <Option key={k} value={k}>
                  <div>
                    <Text strong>{v.label}</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{v.desc}</Text>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {condicion && condicion !== 'siempre' && condicion !== 'fecha' && (
            <Form.Item
              name="condicionValor"
              label={
                condicion === 'categoria' ? 'Nombre de Categoría'
                : condicion === 'producto' ? 'ID del Producto'
                : condicion === 'cantidad_min' ? 'Cantidad Mínima'
                : 'Monto Mínimo (RD$)'
              }
              rules={[{ required: true }]}
            >
              <Input placeholder={
                condicion === 'categoria' ? 'Ej. Electrónica'
                : condicion === 'producto' ? 'Ej. 42'
                : condicion === 'cantidad_min' ? 'Ej. 10'
                : 'Ej. 5000'
              } />
            </Form.Item>
          )}

          <Form.Item name="rango" label="Vigencia (opcional)">
            <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} placeholder="Descripción interna para identificar la regla..." />
          </Form.Item>

          <Form.Item name="activo" label="Activa" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
