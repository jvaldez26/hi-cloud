import { useState } from 'react';
import { Card, Row, Col, Typography, Statistic, Button, InputNumber,
         Table, Tag, Modal, Form, Input, Space, Alert, Spin, message, Avatar,
         Popconfirm, Tooltip } from 'antd';
import { UnlockOutlined, LockOutlined, ReloadOutlined, HistoryOutlined,
         UserOutlined, RollbackOutlined, WarningOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../store/auth.store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const cajaApi = {
  hoy:       ()                          => api.get('/caja/hoy').then(r => r.data?.data ?? r.data),
  abrir:     (body: any)                 => api.post('/caja/abrir', body).then(r => r.data?.data),
  cerrar:    (id: number, body: any)     => api.patch(`/caja/${id}/cerrar`, body).then(r => r.data?.data),
  anular:    (id: number, motivo: string) => api.patch(`/caja/${id}/anular`, { motivo }).then(r => r.data?.data),
  historial: (p = 1)                     => api.get(`/caja/historial?page=${p}`).then(r => r.data?.data),
  resumen:   (mes: number, anio: number) => api.get(`/caja/resumen?mes=${mes}&anio=${anio}`).then(r => r.data?.data),
};

const estadoColor: Record<string, string> = {
  abierta: 'green', cerrada: 'blue', revisada: 'purple',
};

function avatarColor(name: string) {
  const c = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#0891B2'];
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h + name.charCodeAt(i)) % c.length;
  return c[h];
}

export default function CajaPage() {
  const [cerrarTarget, setCerrarTarget] = useState<{ id: number; nombre: string; saldoEsperado: number } | null>(null);
  const [anularTarget, setAnularTarget] = useState<{ id: number; nombre: string; fecha: string } | null>(null);
  const [openAbrir,    setOpenAbrir]    = useState(false);
  const [form]       = Form.useForm();
  const [formAnular] = Form.useForm();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const puedeAnular = user?.role === 'admin' || user?.role === 'contador' || user?.role === 'super_admin';

  const { data: cajaData, isLoading } = useQuery({
    queryKey: ['caja-hoy'],
    queryFn:  cajaApi.hoy,
    refetchInterval: 30_000,
  });

  const { data: historial } = useQuery({
    queryKey: ['caja-hist'],
    queryFn:  () => cajaApi.historial(),
  });

  const mes  = dayjs().month() + 1;
  const anio = dayjs().year();
  const { data: resumenMes } = useQuery({
    queryKey: ['caja-resumen', mes, anio],
    queryFn:  () => cajaApi.resumen(mes, anio),
  });

  const abrirMut = useMutation({
    mutationFn: cajaApi.abrir,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      setOpenAbrir(false); form.resetFields();
      message.success('Caja abierta');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const cerrarMut = useMutation({
    mutationFn: ({ id, body }: any) => cajaApi.cerrar(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-hist'] });
      setCerrarTarget(null); form.resetFields();
      message.success('Caja cerrada');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const anularMut = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => cajaApi.anular(id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] });
      qc.invalidateQueries({ queryKey: ['caja-hist'] });
      setAnularTarget(null); formAnular.resetFields();
      message.success('Cierre anulado — la caja está abierta nuevamente');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular'),
  });

  // Normalizar respuesta: puede ser array de cajas o "sin apertura"
  const sinApertura = !cajaData || (cajaData as any).estado === 'sin_apertura';
  const cajas: any[] = sinApertura
    ? []
    : Array.isArray((cajaData as any).cajas)
      ? (cajaData as any).cajas
      : [(cajaData as any)];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Title level={4} style={{ margin: 0 }}>Caja Diaria</Title></Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => qc.invalidateQueries({ queryKey: ['caja-hoy'] })}>
              Actualizar
            </Button>
            <Button type="primary" icon={<UnlockOutlined />} onClick={() => { setOpenAbrir(true); form.resetFields(); }}>
              Abrir caja
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Estado del día */}
      {isLoading ? <Spin /> : sinApertura ? (
        <Alert type="warning" showIcon
          message="No hay cajas abiertas hoy"
          description="Abre una caja por cada cajero para registrar transacciones del día."
          action={<Button onClick={() => setOpenAbrir(true)}>Abrir caja ahora</Button>}
          style={{ marginBottom: 16 }} />
      ) : (
        <>
          {/* Tarjeta por cada cajero */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {cajas.map((caja, i) => {
              const totalIngresos = Number(caja.ventasEfectivo ?? 0) + Number(caja.ventasTarjeta ?? 0) + Number(caja.ventasTransferencia ?? 0);
              const saldoEsperado = Number(caja.saldoApertura ?? 0) + totalIngresos
                - Number(caja.gastosEfectivo ?? 0) - Number(caja.retiros ?? 0);
              const nombre = caja.vendedorNombre ?? 'Administrador';

              return (
                <Col xs={24} lg={12} key={caja.id}>
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <Card
                      size="small"
                      style={{ borderColor: caja.estado === 'abierta' ? '#10b981' : '#94a3b8', borderWidth: 1.5 }}
                      title={
                        <Space>
                          <Avatar size={28} style={{ background: avatarColor(nombre), fontSize: 12 }}>
                            {nombre.charAt(0).toUpperCase()}
                          </Avatar>
                          <Text strong>{nombre}</Text>
                          <Tag color={estadoColor[caja.estado]} style={{ margin: 0 }}>
                            {caja.estado.toUpperCase()}
                          </Tag>
                        </Space>
                      }
                      extra={
                        caja.estado === 'abierta' ? (
                          <Button size="small" danger icon={<LockOutlined />}
                            onClick={() => { setCerrarTarget({ id: caja.id, nombre, saldoEsperado }); form.resetFields(); }}>
                            Cerrar caja
                          </Button>
                        ) : null
                      }
                    >
                      <Row gutter={[8, 8]}>
                        {[
                          { title: 'Apertura',      value: caja.saldoApertura,   color: '#6b7280' },
                          { title: 'Efectivo',       value: caja.ventasEfectivo,  color: '#10b981' },
                          { title: 'Tarjeta',        value: caja.ventasTarjeta,   color: '#1677ff' },
                          { title: 'Saldo esperado', value: saldoEsperado,        color: '#7c3aed' },
                        ].map(k => (
                          <Col xs={12} sm={6} key={k.title}>
                            <Statistic title={k.title} value={k.value ?? 0}
                              formatter={v => fmt.money(Number(v))}
                              valueStyle={{ color: k.color, fontSize: 13 }}  />
                          </Col>
                        ))}
                      </Row>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                        {caja.cantidadTransacciones ?? 0} transacciones · {fmt.date(caja.fecha)}
                        {caja.estado === 'cerrada' && Number(caja.diferencia) !== 0 && (
                          <Text style={{ marginLeft: 8, fontWeight: 600, color: Number(caja.diferencia) > 0 ? '#10b981' : '#ef4444' }}>
                            · Diferencia: {fmt.money(Math.abs(Number(caja.diferencia)))} {Number(caja.diferencia) > 0 ? '(sobrante)' : '(faltante)'}
                          </Text>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                </Col>
              );
            })}
          </Row>

          {/* Resumen mensual */}
          {resumenMes && (
            <Card title={`Resumen ${dayjs().format('MMMM YYYY')}`} size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 0]}>
                <Col xs={12} sm={6}><Statistic title="Total Ventas"        value={resumenMes.totalVentas}       formatter={v => fmt.money(Number(v))} /></Col>
                <Col xs={12} sm={6}><Statistic title="Total Cobros"        value={resumenMes.totalCobros}       formatter={v => fmt.money(Number(v))} /></Col>
                <Col xs={12} sm={6}><Statistic title="Diferencia Acum."    value={resumenMes.diferenciaTotal}   formatter={v => fmt.money(Number(v))} valueStyle={{ color: Number(resumenMes.diferenciaTotal) < 0 ? '#ef4444' : '#10b981' }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Días con diferencia" value={resumenMes.diasConDiferencia} /></Col>
              </Row>
            </Card>
          )}
        </>
      )}

      {/* Historial */}
      <Card title={<><HistoryOutlined /> Historial de Cierres</>}>
        <Table size="small"
        scroll={{ x: 'max-content' }}
          dataSource={historial?.data ?? []} rowKey="id"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          columns={[
            { title: 'Fecha',  dataIndex: 'fecha',  width: 100, render: (v: string) => fmt.date(v) },
            {
              title: 'Cajero', dataIndex: 'vendedorNombre', width: 150,
              render: (v: string) => {
                const n = v ?? 'Administrador';
                return (
                  <Space size={4}>
                    <Avatar size={20} style={{ background: avatarColor(n), fontSize: 10 }}>{n.charAt(0)}</Avatar>
                    <Text style={{ fontSize: 12 }}>{n}</Text>
                  </Space>
                );
              },
            },
            { title: 'Estado', dataIndex: 'estado', width: 90,  render: (v: string) => <Tag color={estadoColor[v]}>{v.toUpperCase()}</Tag> },
            { title: 'Apertura',        dataIndex: 'saldoApertura', width: 110, render: (v: number) => fmt.money(v) },
            { title: 'Total Ingresos',  key: 'ing', width: 120,
              render: (_: any, r: any) => fmt.money(Number(r.ventasEfectivo ?? 0) + Number(r.ventasTarjeta ?? 0) + Number(r.ventasTransferencia ?? 0)) },
            { title: 'Cierre Esperado', dataIndex: 'saldoCierre', width: 120, render: (v: number) => fmt.money(v) },
            { title: 'Cierre Físico',   dataIndex: 'saldoFisico', width: 120, render: (v: number) => fmt.money(v) },
            { title: 'Diferencia', dataIndex: 'diferencia', width: 100,
              render: (v: number) => <Text style={{ color: v === 0 ? '#10b981' : v > 0 ? '#1677ff' : '#ef4444' }} strong>{fmt.money(v)}</Text> },
            { title: 'Transacc.', dataIndex: 'cantidadTransacciones', width: 80 },
            ...(puedeAnular ? [{
              title: '', key: 'acciones', width: 80, align: 'center' as const,
              render: (_: any, r: any) => r.estado === 'cerrada' ? (
                <Tooltip title="Anular cierre — permite seguir facturando ese día">
                  <Button
                    size="small"
                    icon={<RollbackOutlined />}
                    onClick={() => {
                      setAnularTarget({
                        id: r.id,
                        nombre: r.vendedorNombre ?? 'Administrador',
                        fecha: r.fecha,
                      });
                      formAnular.resetFields();
                    }}
                  >
                    Anular
                  </Button>
                </Tooltip>
              ) : null,
            }] : []),
          ]} />
      </Card>

      {/* Modal abrir caja */}
      <Modal title="Abrir Caja" open={openAbrir} onCancel={() => setOpenAbrir(false)} footer={null} width={420}>
        <Form form={form} layout="vertical" onFinish={v => abrirMut.mutate(v)} initialValues={{ saldoApertura: 0 }}>
          <Form.Item name="vendedorNombre" label="Cajero responsable" rules={[{ required: true, message: 'Indica el nombre del cajero' }]}>
            <Input prefix={<UserOutlined />} placeholder="Nombre del cajero" size="large" />
          </Form.Item>
          <Form.Item name="saldoApertura" label="Saldo de apertura (RD$)">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} size="large" />
          </Form.Item>
          <Form.Item name="notas" label="Notas (opcional)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setOpenAbrir(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" icon={<UnlockOutlined />} loading={abrirMut.isPending}>Abrir caja</Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal cerrar caja — individual por cajero */}
      <Modal
        title={<Space><LockOutlined />{`Cerrar caja — ${cerrarTarget?.nombre ?? ''}`}</Space>}
        open={!!cerrarTarget} onCancel={() => setCerrarTarget(null)} footer={null}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message={`Saldo esperado: ${fmt.money(cerrarTarget?.saldoEsperado ?? 0)}`}
          description="Cuenta el efectivo de esta caja e ingresa el monto real para calcular la diferencia." />
        <Form form={form} layout="vertical" onFinish={v => cerrarMut.mutate({ id: cerrarTarget!.id, body: v })}>
          <Form.Item name="saldoFisico" label="Efectivo físico contado (RD$)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={2} size="large" autoFocus />
          </Form.Item>
          <Form.Item name="notas" label="Observaciones (opcional)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCerrarTarget(null)}>Cancelar</Button></Col>
            <Col>
              <Button type="primary" danger htmlType="submit" icon={<LockOutlined />} loading={cerrarMut.isPending}>
                Cerrar caja
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
      {/* Modal anular cierre */}
      <Modal
        title={
          <Space>
            <RollbackOutlined style={{ color: '#d97706' }} />
            <span>Anular cierre — {anularTarget?.nombre}</span>
          </Space>
        }
        open={!!anularTarget}
        onCancel={() => { setAnularTarget(null); formAnular.resetFields(); }}
        footer={null}
        width={460}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="¿Estás seguro de anular este cierre?"
          description={
            <span>
              La caja del <strong>{anularTarget?.fecha ? new Date(anularTarget.fecha + 'T00:00:00').toLocaleDateString('es-DO') : ''}</strong> de{' '}
              <strong>{anularTarget?.nombre}</strong> volverá a estado <strong>ABIERTA</strong>.
              El cajero podrá seguir registrando ventas ese día.
            </span>
          }
          style={{ marginBottom: 16 }}
        />
        <Form
          form={formAnular}
          layout="vertical"
          onFinish={v => anularTarget && anularMut.mutate({ id: anularTarget.id, motivo: v.motivo })}
        >
          <Form.Item
            name="motivo"
            label="Motivo de la anulación"
            rules={[{ required: true, message: 'El motivo es obligatorio para el registro de auditoría' }]}
          >
            <Input.TextArea
              rows={3}
              maxLength={300}
              placeholder="Ej: El cajero olvidó registrar ventas del turno de la tarde..."
              showCount
            />
          </Form.Item>
          <Row justify="end" gutter={8}>
            <Col>
              <Button onClick={() => { setAnularTarget(null); formAnular.resetFields(); }}>
                Cancelar
              </Button>
            </Col>
            <Col>
              <Button
                type="primary"
                htmlType="submit"
                icon={<RollbackOutlined />}
                loading={anularMut.isPending}
                style={{ background: '#d97706', borderColor: '#d97706' }}
              >
                Confirmar anulación
              </Button>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
