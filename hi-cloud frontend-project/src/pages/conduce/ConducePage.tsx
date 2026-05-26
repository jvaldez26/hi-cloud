import { useState } from 'react';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  DatePicker, InputNumber, Space, Typography, Popconfirm,
  message, Divider, Steps, Tooltip, theme,
} from 'antd';
import {
  CarOutlined, PlusOutlined, SendOutlined, CheckCircleOutlined,
  RollbackOutlined, DeleteOutlined, EyeOutlined, FileExcelOutlined,
  PrinterOutlined, LoadingOutlined, SearchOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import WhatsAppButton from '../../components/ui/WhatsAppButton';
import PrintButton from '../../components/ui/PrintButton';

const { Title, Text } = Typography;
const { Option } = Select;

const ESTADO_CONFIG: Record<string, { color: string; label: string; step: number }> = {
  generado:    { color: 'blue',    label: 'Generado',    step: 0 },
  en_transito: { color: 'orange',  label: 'En Tránsito', step: 1 },
  entregado:   { color: 'green',   label: 'Entregado',   step: 2 },
  devuelto:    { color: 'red',     label: 'Devuelto',    step: 3 },
};

export default function ConducePage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(1);
  const [modalCrear,    setModalCrear]    = useState(false);
  const [modalDetalle,  setModalDetalle]  = useState<any>(null);
  const [modalEntrega,  setModalEntrega]  = useState<{ id: number; tipo: 'entregado' | 'devuelto' } | null>(null);
  const [pdfPending,    setPdfPending]    = useState<number | null>(null);
  const [formCrear]   = Form.useForm();
  const [formEntrega] = Form.useForm();

  const { data: clientes = [] } = useQuery<any[]>({
    queryKey: ['clientes-select'],
    queryFn:  () => api.get('/clientes?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: productos = [] } = useQuery<any[]>({
    queryKey: ['productos-select'],
    queryFn:  () => api.get('/productos?limit=200').then((r: any) => { const d = r.data?.data ?? r.data; return Array.isArray(d) ? d : (d?.data ?? []); }),
  });

  const { data: resumen = [] } = useQuery<any[]>({
    queryKey: ['conduces-resumen'],
    queryFn:  () => api.get('/conduces/resumen').then((r: any) => r.data.data ?? r.data ?? []),
  });

  const { data: conduces, isLoading } = useQuery<any>({
    queryKey: ['conduces', page, search],
    queryFn:  () => api.get(`/conduces?page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`).then((r: any) => r.data?.data ?? r.data),
  });

  const onErr = (e: any, fallback: string) => message.error((e as any)?.friendlyMessage ?? fallback);

  const crear = useMutation({
    mutationFn: (dto: any) => api.post('/conduces', dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduces'] });
      qc.invalidateQueries({ queryKey: ['conduces-resumen'] }); setModalCrear(false); formCrear.resetFields(); message.success('Conduce generado'); },
    onError: (e: any) => onErr(e, 'Error al generar conduce'),
  });

  const enTransito = useMutation({
    mutationFn: (id: number) => api.patch(`/conduces/${id}/en-transito`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduces'] });
      qc.invalidateQueries({ queryKey: ['conduces-resumen'] }); message.success('Conduce en tránsito'); },
    onError: (e: any) => onErr(e, 'Error al actualizar estado'),
  });

  const confirmarEntrega = useMutation({
    mutationFn: ({ id, obs, tipo }: { id: number; obs?: string; tipo: string }) =>
      api.patch(`/conduces/${id}/${tipo === 'entregado' ? 'entregado' : 'devuelto'}`, { observaciones: obs }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['conduces'] });
      qc.invalidateQueries({ queryKey: ['conduces-resumen'] });
      setModalEntrega(null);
      formEntrega.resetFields();
      message.success(v.tipo === 'entregado' ? '¡Entrega confirmada!' : 'Devolución registrada');
    },
    onError: (e: any) => onErr(e, 'Error al confirmar entrega'),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/conduces/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conduces'] });
      qc.invalidateQueries({ queryKey: ['conduces-resumen'] }); message.success('Conduce eliminado'); },
    onError: (e: any) => onErr(e, 'Error al eliminar conduce'),
  });

  const imprimirPDF = async (item: any) => {
    setPdfPending(item.id);
    try {
      const eid = localStorage.getItem('empresaId') ?? '';
      const res = await fetch(`/api/v1/conduces/${item.id}/pdf`, {
        credentials: 'include',
        headers: { 'X-Empresa-ID': eid },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(`Error PDF: ${err?.message ?? res.status}`); return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (!win) { message.warning('El navegador bloqueó la ventana emergente'); URL.revokeObjectURL(url); return; }
      win.addEventListener('load', () => {
        setTimeout(() => { win.print(); setTimeout(() => URL.revokeObjectURL(url), 1_000); }, 500);
      });
    } catch (e: any) { message.error(`No se pudo generar el PDF: ${e?.message ?? ''}`); }
    finally { setPdfPending(null); }
  };

  const COLS_DEF = [
    { key: 'n',     label: 'No.',     defaultVisible: true  },
    { key: 'f',     label: 'Fecha',   defaultVisible: true  },
    { key: 'c',     label: 'Cliente', defaultVisible: true  },
    { key: 'd',     label: 'Destino', defaultVisible: false },
    { key: 'items', label: 'Items',   defaultVisible: true  },
    { key: 'e',     label: 'Estado',  defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('conduces', COLS_DEF);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CarOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Conduces</Title>
            <Text type="secondary">Notas de entrega · Seguimiento de despachos y envíos</Text>
          </div>
        </div>
        <Space>
          <Input
            placeholder="Buscar por número o cliente..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
            style={{ width: 220 }}
          />
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (conduces?.data ?? []).map((c: any) => ({
              'Número':   c.numero ?? '',
              'Fecha':    c.fecha ? dayjs(c.fecha).format('DD/MM/YYYY') : '',
              'Cliente':  c.cliente?.nombre ?? '',
              'Factura':  c.facturaFolio ?? c.factura?.folio ?? '',
              'Estado':   c.estado ?? '',
              'Destino':  c.direccionEntrega ?? c.destino ?? '',
            }));
            exportarExcel(filas, `Conduces-${dayjs().format('YYYY-MM-DD')}`);
          }}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['conduces']} />
          <VideoTutorialButton />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalCrear(true)}>
            Nuevo Conduce
          </Button>
        </Space>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={conduces?.data ?? []}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15, current: page, total: conduces?.meta?.total, onChange: setPage, showSizeChanger: false }}
          expandable={{
            expandedRowRender: (r: any) => (
              <Steps
                size="small"
                current={ESTADO_CONFIG[r.estado]?.step ?? 0}
                items={[
                  { title: 'Generado',    description: r.fecha },
                  { title: 'En Tránsito', description: r.fechaEntregaProgramada ?? '' },
                  { title: 'Entregado',   description: r.fechaEntregaReal ? new Date(r.fechaEntregaReal).toLocaleDateString('es-DO') : '' },
                ]}
                style={{ padding: '12px 0' }}
              />
            ),
          }}
          columns={filterColumns([
            { title: 'No.', dataIndex: 'numero', key: 'n', render: v => <Text strong style={{ fontFamily: 'mono' }}>{v}</Text> },
            { title: 'Fecha', dataIndex: 'fecha', key: 'f' },
            { title: 'Cliente', key: 'c', render: (_, r: any) => <Text strong>{r.cliente?.nombre}</Text> },
            { title: 'Destino', key: 'd', render: (_, r: any) => <Text type="secondary" style={{ fontSize: 12 }}>{r.ciudad ? `${r.ciudad} · ` : ''}{r.direccionEntrega?.slice(0, 30)}...</Text> },
            { title: 'Ítems', key: 'items', render: (_, r: any) => <Tag>{r.detalles?.length ?? 0} ítem(s)</Tag> },
            { title: 'Estado', dataIndex: 'estado', key: 'e', render: v => <Tag color={ESTADO_CONFIG[v]?.color}>{ESTADO_CONFIG[v]?.label}</Tag> },
            {
              title: '', key: 'acciones', width: 72, align: 'right' as const,
              render: (_: any, r: any) => (
                <TableActions
                  onView={() => setModalDetalle(r)}
                  viewLabel="Ver detalle"
                  items={[
                    { key: 'pdf', label: pdfPending === r.id ? 'Generando...' : 'Imprimir',
                      icon: pdfPending === r.id ? <LoadingOutlined /> : <PrinterOutlined />,
                      disabled: pdfPending === r.id, onClick: () => imprimirPDF(r) },
                    ...(r.estado === 'generado' ? [
                      { key: 'transito', label: 'Marcar En Tránsito', icon: <SendOutlined />, onClick: () => enTransito.mutate(r.id) },
                    ] : []),
                    ...(r.estado === 'en_transito' ? [
                      { key: 'entregar', label: 'Confirmar Entrega', icon: <CheckCircleOutlined />, onClick: () => setModalEntrega({ id: r.id, tipo: 'entregado' }) },
                      { key: 'devolver', label: 'Registrar Devolución', icon: <RollbackOutlined />, onClick: () => setModalEntrega({ id: r.id, tipo: 'devuelto' }) },
                    ] : []),
                    { type: 'divider' as const },
                    { key: 'eliminar', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
                      disabled: r.estado === 'entregado',
                      onClick: () => Modal.confirm({
                        title: '¿Eliminar conduce?',
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

      {/* Modal Crear */}
      <Modal
        title="Nuevo Conduce"
        open={modalCrear}
        onCancel={() => { setModalCrear(false); formCrear.resetFields(); }}
        onOk={() => formCrear.submit()}
        confirmLoading={crear.isPending}
        okText="Generar Conduce"
        width={720}
      >
        <Form form={formCrear} layout="vertical" initialValues={{ fecha: dayjs(), detalles: [{}] }}
          onFinish={v => crear.mutate({
            ...v,
            fecha: v.fecha?.format('YYYY-MM-DD'),
            fechaEntregaProgramada: v.fechaEntregaProgramada?.format('YYYY-MM-DD'),
            detalles: (v.detalles ?? []).map((d: any) => ({ ...d, cantidad: Number(d.cantidad) })),
          })}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="clienteId" label="Cliente" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="children" placeholder="Seleccionar cliente">
                  {clientes.map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6}>
              <Form.Item name="fechaEntregaProgramada" label="Entrega Progr.">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="direccionEntrega" label="Dirección de Entrega" rules={[{ required: true }]}>
            <Input placeholder="Av. Principal #100, Santo Domingo" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="ciudad" label="Ciudad"><Input placeholder="Santo Domingo" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="contactoEntrega" label="Contacto"><Input placeholder="Juan García" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="telefonoContacto" label="Tel. Contacto"><Input placeholder="809-000-0000" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="conductor" label="Conductor"><Input placeholder="Nombre del conductor" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="vehiculo" label="Vehículo / Placa"><Input placeholder="Ej. E-123456" /></Form.Item></Col>
          </Row>

          <Divider orientation="left">Mercancía a Despachar</Divider>

          <Form.List name="detalles">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Row gutter={8} key={key} align="middle" style={{ marginBottom: 8 }}>
                    <Col xs={24} sm={8}>
                      <Form.Item name={[name, 'productoId']} noStyle>
                        <Select showSearch optionFilterProp="children" placeholder="Producto" style={{ width: '100%' }}
                          onChange={(pid) => {
                            const prod = productos.find((p: any) => p.id === pid);
                            if (prod) { const ds = formCrear.getFieldValue('detalles'); ds[name] = { ...ds[name], descripcion: prod.nombre, unidadMedida: prod.unidadMedida }; formCrear.setFieldsValue({ detalles: ds }); }
                          }}>
                          {productos.map((p: any) => <Option key={p.id} value={p.id}>{p.nombre}</Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}><Form.Item name={[name, 'descripcion']} noStyle rules={[{ required: true, message: '' }]}><Input placeholder="Descripción*" /></Form.Item></Col>
                    <Col xs={12} sm={3}><Form.Item name={[name, 'cantidad']} noStyle rules={[{ required: true }]}><InputNumber min={0.01} placeholder="Cant." style={{ width: '100%' }} /></Form.Item></Col>
                    <Col xs={12} sm={3}><Form.Item name={[name, 'unidadMedida']} noStyle><Input placeholder="PZA" /></Form.Item></Col>
                    <Col xs={12} sm={2}>{fields.length > 1 && <Button type="link" danger onClick={() => remove(name)} icon={<DeleteOutlined />} />}</Col>
                  </Row>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Agregar ítem</Button>
              </>
            )}
          </Form.List>
          <Form.Item name="notas" label="Notas" style={{ marginTop: 12 }}>
            <Input.TextArea rows={2} placeholder="Instrucciones de entrega, cuidados..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Detalle */}
      <Modal title={`Conduce ${modalDetalle?.numero}`} open={!!modalDetalle} onCancel={() => setModalDetalle(null)} footer={null} width={600}>
        {modalDetalle && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12}><Text type="secondary">Cliente:</Text><div><Text strong>{modalDetalle.cliente?.nombre}</Text></div></Col>
              <Col xs={24} sm={12}><Text type="secondary">Destino:</Text><div><Text style={{ fontSize: 12 }}>{modalDetalle.direccionEntrega}</Text></div></Col>
            </Row>
            {(modalDetalle.conductor || modalDetalle.vehiculo) && (
              <Row gutter={16} style={{ marginBottom: 16 }}>
                {modalDetalle.conductor && <Col xs={24} sm={12}><Text type="secondary">Conductor:</Text><div><Text>{modalDetalle.conductor}</Text></div></Col>}
                {modalDetalle.vehiculo && <Col xs={24} sm={12}><Text type="secondary">Vehículo:</Text><div><Text>{modalDetalle.vehiculo}</Text></div></Col>}
              </Row>
            )}
            <Table size="small"
        scroll={{ x: 'max-content' }} dataSource={modalDetalle.detalles} rowKey="id" pagination={false}
              columns={[
                { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                { title: 'Cantidad', dataIndex: 'cantidad', key: 'c', align: 'right' },
                { title: 'Unidad', dataIndex: 'unidadMedida', key: 'u' },
              ]} />
            {modalDetalle.observacionesEntrega && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Observaciones: {modalDetalle.observacionesEntrega}</Text>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Modal Entrega/Devolución */}
      <Modal
        title={modalEntrega?.tipo === 'entregado' ? 'Confirmar Entrega' : 'Registrar Devolución'}
        open={!!modalEntrega}
        onCancel={() => { setModalEntrega(null); formEntrega.resetFields(); }}
        onOk={() => formEntrega.submit()}
        okText={modalEntrega?.tipo === 'entregado' ? 'Confirmar Entrega' : 'Registrar Devolución'}
        okButtonProps={{ style: { background: modalEntrega?.tipo === 'entregado' ? '#059669' : '#ef4444', borderColor: 'transparent' } }}
      >
        <Form form={formEntrega} layout="vertical"
          onFinish={v => confirmarEntrega.mutate({ id: modalEntrega!.id, obs: v.observaciones, tipo: modalEntrega!.tipo })}>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={3} placeholder={modalEntrega?.tipo === 'entregado' ? 'Recibido conforme por...' : 'Motivo de la devolución...'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
