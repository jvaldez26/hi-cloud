import { useState } from 'react';
import { exportarExcel } from '../../utils/exportExcel';
import {
  Card, Row, Col, Typography, Table, Tag, Statistic, Button,
  Space, Modal, Form, Input, Select, InputNumber, Tabs,
  Popconfirm, message, Drawer, Badge, Alert,
} from 'antd';
import {
  PlusOutlined, CarOutlined, WarningOutlined, DollarOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';

const { Title, Text } = Typography;

const flotaApi = {
  dashboard:  ()               => api.get('/flota/dashboard').then(r => r.data?.data ?? r.data),
  vehiculos:  ()               => api.get('/flota/vehiculos').then(r => r.data?.data ?? r.data ?? []),
  crear:      (b: any)         => api.post('/flota/vehiculos', b).then(r => r.data?.data ?? r.data),
  actualizar: (id: number, b: any) => api.patch(`/flota/vehiculos/${id}`, b).then(r => r.data?.data ?? r.data),
  eliminar:   (id: number)     => api.delete(`/flota/vehiculos/${id}`).then(r => r.data?.data ?? r.data),
  registros:  (id: number, p = 1) => api.get(`/flota/vehiculos/${id}/registros?page=${p}`).then(r => r.data?.data ?? r.data),
  registrar:  (b: any)         => api.post('/flota/registros', b).then(r => r.data?.data ?? r.data),
  eliminarReg:(id: number)     => api.delete(`/flota/registros/${id}`).then(r => r.data?.data ?? r.data),
  resumen:    (id: number)     => api.get(`/flota/vehiculos/${id}/resumen`).then(r => r.data?.data ?? r.data),
};

const ESTADO_VEH: Record<string, { label: string; color: string }> = {
  activo:    { label: 'Activo',    color: 'success' },
  en_taller: { label: 'En taller', color: 'warning' },
  inactivo:  { label: 'Inactivo',  color: 'default' },
  dado_baja: { label: 'Dado baja', color: 'error'   },
};

const TIPO_REG = [
  { value: 'combustible',   label: '⛽ Combustible' },
  { value: 'mantenimiento', label: '🔧 Mantenimiento' },
  { value: 'seguro',        label: '🛡️ Seguro' },
  { value: 'multa',         label: '📋 Multa' },
  { value: 'peaje',         label: '🛣️ Peaje' },
  { value: 'otro',          label: '📎 Otro' },
];

export default function FlotaPage() {
  const [vehSeleccionado, setVehSeleccionado] = useState<any>(null);
  const [crearModal,  setCrearModal]  = useState(false);
  const [regModal,    setRegModal]    = useState(false);
  const [formVeh]  = Form.useForm();
  const [formReg]  = Form.useForm();
  const qc = useQueryClient();

  const { data: dash }      = useQuery({ queryKey: ['flota-dash'],                    queryFn: flotaApi.dashboard });
  const { data: vehiculos } = useQuery({ queryKey: ['flota-vehs'],                    queryFn: flotaApi.vehiculos });
  const { data: registros } = useQuery({
    queryKey: ['flota-regs', vehSeleccionado?.id],
    queryFn:  () => flotaApi.registros(vehSeleccionado!.id),
    enabled:  !!vehSeleccionado,
  });
  const { data: resumen }   = useQuery({
    queryKey: ['flota-res', vehSeleccionado?.id],
    queryFn:  () => flotaApi.resumen(vehSeleccionado!.id),
    enabled:  !!vehSeleccionado,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['flota-vehs'] });
    qc.invalidateQueries({ queryKey: ['flota-dash'] });
    qc.invalidateQueries({ queryKey: ['flota-regs'] });
    qc.invalidateQueries({ queryKey: ['flota-res'] });
  };

  const crearMut = useMutation({
    mutationFn: flotaApi.crear,
    onSuccess: () => { inv(); setCrearModal(false); formVeh.resetFields(); message.success('Vehículo agregado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const regMut = useMutation({
    mutationFn: flotaApi.registrar,
    onSuccess: () => { inv(); setRegModal(false); formReg.resetFields(); message.success('Registro guardado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <CarOutlined style={{ marginRight: 8, color: '#06b6d4' }} />
            Flota de Vehículos
          </Title>
        </Col>
        <Col>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = (vehiculos ?? []).map((v: any) => ({
              'Placa':       v.placa ?? '',
              'Marca/Modelo':v.marca ? `${v.marca} ${v.modelo ?? ''}`.trim() : '',
              'Año':         v.anio ?? '',
              'Tipo':        v.tipo ?? '',
              'Estado':      v.estado ?? '',
              'Conductor':   v.conductor ?? v.empleado?.nombre ?? '',
              'Km Actuales': Number(v.kmActuales ?? 0),
            }));
            exportarExcel(filas, 'Flota-Vehiculos');
          }}>Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCrearModal(true)}>
            Agregar vehículo
          </Button>
        </Col>
      </Row>

      {/* KPIs */}
      {dash && (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={4}><Card size="small"><Statistic title="Activos"   value={dash.flota.activos}   valueStyle={{ color: '#10b981' }} /></Card></Col>
            <Col xs={12} md={4}><Card size="small"><Statistic title="En taller" value={dash.flota.enTaller}  valueStyle={{ color: '#f59e0b' }} /></Card></Col>
            <Col xs={12} md={4}><Card size="small"><Statistic title="Gasto mes" value={fmt.money(dash.gastoMes.total)} valueStyle={{ color: '#ef4444', fontSize: 16 }} /></Card></Col>
            <Col xs={12} md={4}><Card size="small"><Statistic title="Combustible (litros)" value={Number(dash.combustible.litros).toFixed(0)} /></Card></Col>
            <Col xs={12} md={4}><Card size="small"><Statistic title="Costo combustible" value={fmt.money(dash.combustible.monto)} valueStyle={{ fontSize: 14 }} /></Card></Col>
          </Row>

          {/* Alertas de documentos */}
          {(dash.alertas.vencenItbis + dash.alertas.vencenSeguro + dash.alertas.vencenInspeccion) > 0 && (
            <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }}
              message="Documentos por vencer en los próximos 30 días"
              description={
                <Space>
                  {dash.alertas.vencenItbis      > 0 && <Tag color="orange">{dash.alertas.vencenItbis} marbetes</Tag>}
                  {dash.alertas.vencenSeguro     > 0 && <Tag color="orange">{dash.alertas.vencenSeguro} seguros</Tag>}
                  {dash.alertas.vencenInspeccion > 0 && <Tag color="orange">{dash.alertas.vencenInspeccion} inspecciones</Tag>}
                </Space>
              } />
          )}
        </>
      )}

      {/* Grid de vehículos */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {(vehiculos ?? []).map((v: any) => (
          <Col xs={24} sm={12} md={8} lg={6} key={v.id}>
            <Card
              onClick={() => setVehSeleccionado(v)}
              style={{
                cursor: 'pointer',
                border: vehSeleccionado?.id === v.id ? '2px solid #06b6d4' : '1px solid #e2e8f0',
              }}
              size="small"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <Text strong style={{ fontSize: 15 }}>{v.placa}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{v.marca} {v.modelo} {v.anio}</Text>
                </div>
                <Tag color={ESTADO_VEH[v.estado]?.color}>{ESTADO_VEH[v.estado]?.label}</Tag>
              </div>
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12 }}>🛣️ {Number(v.kilometraje).toLocaleString()} km</Text>
                {v.conductor && <Text type="secondary" style={{ fontSize: 11 }}>👤 {v.conductor}</Text>}
              </div>
              {/* Alertas de vencimiento */}
              {(v.vencimientoItbis || v.vencimientoSeguro) && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {v.vencimientoItbis && new Date(v.vencimientoItbis) <= new Date(Date.now() + 30 * 86400000) && (
                    <Tag color="orange" style={{ fontSize: 9, padding: '0 4px' }}>Marbete {fmt.date(v.vencimientoItbis)}</Tag>
                  )}
                  {v.vencimientoSeguro && new Date(v.vencimientoSeguro) <= new Date(Date.now() + 30 * 86400000) && (
                    <Tag color="orange" style={{ fontSize: 9, padding: '0 4px' }}>Seguro {fmt.date(v.vencimientoSeguro)}</Tag>
                  )}
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {/* Panel vehículo seleccionado */}
      {vehSeleccionado && (
        <Tabs items={[
          {
            key: 'registros',
            label: '📋 Registros',
            children: (
              <Card extra={
                <Button icon={<PlusOutlined />} onClick={() => { setRegModal(true); formReg.setFieldsValue({ vehiculoId: vehSeleccionado.id, fecha: dayjs().format('YYYY-MM-DD') }); }}>
                  Registrar
                </Button>
              }>
                <Table size="small" pagination={false}
                  dataSource={registros?.data ?? []} rowKey="id"
                  columns={[
                    { title: 'Fecha',  dataIndex: 'fecha', width: 100, render: (v: string) => fmt.date(v) },
                    { title: 'Tipo',   dataIndex: 'tipo',  width: 130, render: (v: string) => TIPO_REG.find(t => t.value === v)?.label ?? v },
                    { title: 'Monto',  dataIndex: 'monto', width: 120, render: (v: number) => fmt.money(v) },
                    { title: 'Km',     dataIndex: 'kilometraje', width: 80, render: (v: number) => v ? v.toLocaleString() : '—' },
                    { title: 'Litros', dataIndex: 'litros', width: 70, render: (v: number) => v ? `${v}L` : '—' },
                    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true, render: (v: string) => v ?? '—' },
                    { title: '', key: 'del', width: 50,
                      render: (_: any, r: any) => (
                        <Popconfirm title="¿Eliminar?" onConfirm={() => flotaApi.eliminarReg(r.id).then(() => inv())}>
                          <Button type="text" danger size="small">✕</Button>
                        </Popconfirm>
                      )},
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'costos',
            label: '💸 Costos',
            children: resumen ? (
              <Card title={`Distribución de costos — ${vehSeleccionado.placa}`}>
                <Statistic title="Costo total acumulado" value={fmt.money(resumen.costoTotal)}
                  valueStyle={{ color: '#ef4444', fontSize: 22 }} style={{ marginBottom: 16 }} />
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={resumen.gastos.map((g: any) => ({
                    tipo:  TIPO_REG.find(t => t.value === g.tipo)?.label?.replace(/[^\w\s]/g,'').trim() ?? g.tipo,
                    total: Number(g.total),
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tipo" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt.money(v)} />
                    <Bar dataKey="total" fill="#06b6d4" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            ) : null,
          },
        ]} />
      )}

      {/* Modal crear vehículo */}
      <Modal title="Agregar Vehículo" open={crearModal} onCancel={() => setCrearModal(false)} footer={null} width={560}>
        <Form form={formVeh} layout="vertical" onFinish={v => crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="placa" label="Placa" rules={[{ required: true }]}><Input placeholder="A123456" /></Form.Item></Col>
            <Col span={8}><Form.Item name="marca" label="Marca" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="modelo" label="Modelo" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="anio" label="Año" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={1990} max={2030} /></Form.Item></Col>
            <Col span={10}><Form.Item name="color" label="Color"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="tipoVehiculo" label="Tipo"><Input placeholder="Sedan, Pickup..." /></Form.Item></Col>
            <Col span={12}><Form.Item name="conductor" label="Conductor asignado"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="kilometraje" label="Km inicial"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={8}><Form.Item name="vencimientoItbis" label="Marbete vence"><Input type="date" /></Form.Item></Col>
            <Col span={8}><Form.Item name="vencimientoSeguro" label="Seguro vence"><Input type="date" /></Form.Item></Col>
            <Col span={8}><Form.Item name="vencimientoInspeccion" label="Insp. vence"><Input type="date" /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCrearModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending}>Agregar</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal registrar movimiento */}
      <Modal title="Registrar movimiento" open={regModal} onCancel={() => setRegModal(false)} footer={null} width={460}>
        <Form form={formReg} layout="vertical" onFinish={v => regMut.mutate(v)}>
          <Form.Item name="vehiculoId" hidden><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}><Select options={TIPO_REG} /></Form.Item></Col>
            <Col span={12}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><Input type="date" /></Form.Item></Col>
            <Col span={12}><Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} precision={2} /></Form.Item></Col>
            <Col span={12}><Form.Item name="kilometraje" label="Kilometraje"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={12}><Form.Item name="litros" label="Litros (combustible)"><InputNumber style={{ width: '100%' }} min={0} step={0.5} /></Form.Item></Col>
            <Col span={12}><Form.Item name="proveedor" label="Proveedor"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setRegModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={regMut.isPending}>Guardar</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
