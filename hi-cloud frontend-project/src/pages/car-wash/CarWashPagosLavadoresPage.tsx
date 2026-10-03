import { useState } from 'react';
import { Typography, Table, Button, Segmented, DatePicker, Space, Modal, Select, Form, Input, InputNumber, Radio, message, Tag } from 'antd';
import { FileExcelOutlined, DollarOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import api from '../../api/client';
import { carWashApi } from '../../api/car-wash.api';
import { exportarExcel } from '../../utils/exportExcel';
import { imprimirReciboLiquidacion } from './imprimirReciboLiquidacion';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const F = 'YYYY-MM-DD';

type RangoPreset = 'hoy' | 'semana' | 'personalizado';

function rangoPara(preset: RangoPreset, personalizado: [Dayjs, Dayjs] | null): [string, string] {
  const hoy = dayjs();
  if (preset === 'hoy') return [hoy.format(F), hoy.format(F)];
  if (preset === 'semana') return [hoy.startOf('week').add(1, 'day').format(F), hoy.format(F)]; // lunes a hoy
  if (personalizado) return [personalizado[0].format(F), personalizado[1].format(F)];
  return [hoy.format(F), hoy.format(F)];
}

export default function CarWashPagosLavadoresPage() {
  const qc = useQueryClient();
  const [preset, setPreset] = useState<RangoPreset>('hoy');
  const [personalizado, setPersonalizado] = useState<[Dayjs, Dayjs] | null>(null);
  const [cajaModal, setCajaModal] = useState<{ lavadorId: number; nombre: string } | null>(null);
  const [cajaElegida, setCajaElegida] = useState<number | null>(null);
  const [metodoPagoLiq, setMetodoPagoLiq] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [referenciaLiq, setReferenciaLiq] = useState('');
  const [cuentaBancariaLiq, setCuentaBancariaLiq] = useState<number | undefined>();
  const [adelantoAbierto, setAdelantoAbierto] = useState(false);
  const [formAdelanto] = Form.useForm();
  const metodoPagoAdelanto: 'efectivo' | 'transferencia' = Form.useWatch('metodoPago', formAdelanto) ?? 'efectivo';

  const [desde, hasta] = rangoPara(preset, personalizado);

  const { data: reporte, isLoading } = useQuery({
    queryKey: ['cw-pagos-lavadores', desde, hasta],
    queryFn: () => carWashApi.reportePagosLavadores(desde, hasta),
  });

  const { data: cajasHoy } = useQuery({
    queryKey: ['caja-hoy-cw'],
    queryFn: () => api.get('/caja/hoy').then(r => {
      const d = r.data?.data ?? r.data;
      if (Array.isArray(d?.cajas)) return d.cajas as any[];
      if (d?.id) return [d] as any[];
      return [] as any[];
    }),
    enabled: !!cajaModal || adelantoAbierto,
  });

  const { data: lavadores } = useQuery({ queryKey: ['cw-lavadores'], queryFn: () => carWashApi.getLavadores(true) });
  const { data: cuentasBancarias } = useQuery({
    queryKey: ['bancos-cuentas-cw'],
    queryFn: () => api.get('/bancos/cuentas').then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    enabled: metodoPagoLiq === 'transferencia' || metodoPagoAdelanto === 'transferencia',
  });

  const crearAdelanto = useMutation({
    mutationFn: (body: any) => carWashApi.crearAdelanto(body),
    onSuccess: () => {
      message.success('Adelanto registrado');
      qc.invalidateQueries({ queryKey: ['cw-pagos-lavadores'] });
      setAdelantoAbierto(false);
      formAdelanto.resetFields();
    },
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'No se pudo registrar el adelanto'),
  });

  const registrarPago = useMutation({
    mutationFn: (body: any) => carWashApi.registrarPagoLavador(body),
    onSuccess: async (liq, vars) => {
      qc.invalidateQueries({ queryKey: ['cw-pagos-lavadores'] });
      if (!liq.retiroRegistrado) {
        message.warning('Pago registrado, pero la salida de caja falló — regístrala a mano (revisa el log).');
      } else {
        message.success('Pago registrado');
      }
      const lavador = (reporte ?? []).find((r: any) => r.lavadorId === vars.lavadorId);
      await imprimirReciboLiquidacion({
        id: liq.liquidacionId, lavadorNombre: lavador?.nombre ?? '', desde: vars.desde, hasta: vars.hasta,
        totalComisiones: liq.totalComisiones, totalAdelantos: liq.totalAdelantos, totalPagado: liq.totalPagado,
      });
      cerrarModalPago();
    },
    onError: (err: any) => message.error(err?.response?.data?.message ?? 'No se pudo registrar el pago'),
  });

  function cerrarModalPago() {
    setCajaModal(null);
    setCajaElegida(null);
    setMetodoPagoLiq('efectivo');
    setReferenciaLiq('');
    setCuentaBancariaLiq(undefined);
  }

  function exportar() {
    const filas = (reporte ?? []).map((r: any) => ({
      Lavador: r.nombre, Vehículos: r.vehiculos, 'Monto generado': Number(r.montoGenerado),
      'Comisión ganada': Number(r.comisionGanada), Adelantos: Number(r.adelantos),
      Pagado: Number(r.pagado), Pendiente: Math.max(0, Number(r.comisionGanada) - Number(r.adelantos)),
    }));
    if (!filas.length) { message.info('No hay datos para exportar'); return; }
    exportarExcel(filas, `Pagos-Lavadores-${desde}-a-${hasta}`);
  }

  function confirmarPago() {
    if (!cajaModal) return;
    if (metodoPagoLiq === 'efectivo' && !cajaElegida) return;
    registrarPago.mutate({
      lavadorId: cajaModal.lavadorId, desde, hasta, metodoPago: metodoPagoLiq,
      ...(metodoPagoLiq === 'efectivo' ? { cajaId: cajaElegida } : { referencia: referenciaLiq, cuentaBancariaId: cuentaBancariaLiq }),
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>Pagos a lavadores</Title>
        <Space>
          <Segmented
            value={preset}
            onChange={v => setPreset(v as RangoPreset)}
            options={[{ label: 'Hoy', value: 'hoy' }, { label: 'Esta semana', value: 'semana' }, { label: 'Rango', value: 'personalizado' }]}
          />
          {preset === 'personalizado' && (
            <RangePicker value={personalizado} onChange={v => setPersonalizado(v as [Dayjs, Dayjs])} />
          )}
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <Button icon={<PlusOutlined />} onClick={() => setAdelantoAbierto(true)}>Nuevo adelanto</Button>
        </Space>
      </div>

      <Table
        rowKey="lavadorId"
        loading={isLoading}
        dataSource={reporte ?? []}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (r: any) => <DetalleLavador lavadorId={r.lavadorId} desde={desde} hasta={hasta} />,
        }}
        columns={[
          { title: 'Lavador', dataIndex: 'nombre' },
          { title: 'Vehículos', dataIndex: 'vehiculos' },
          { title: 'Monto generado', dataIndex: 'montoGenerado', render: (v: number) => `RD$${Number(v).toFixed(2)}` },
          { title: 'Comisión ganada', dataIndex: 'comisionGanada', render: (v: number) => `RD$${Number(v).toFixed(2)}` },
          { title: 'Adelantos', dataIndex: 'adelantos', render: (v: number) => `RD$${Number(v).toFixed(2)}` },
          { title: 'Pagado', dataIndex: 'pagado', render: (v: number) => `RD$${Number(v).toFixed(2)}` },
          {
            title: 'Pendiente', key: 'pendiente',
            render: (_, r: any) => {
              const pendiente = Math.max(0, Number(r.comisionGanada) - Number(r.adelantos));
              return <Tag color={pendiente > 0 ? 'orange' : 'green'}>RD${pendiente.toFixed(2)}</Tag>;
            },
          },
          {
            title: '', key: 'acciones',
            render: (_, r: any) => (
              <Button
                size="small" icon={<DollarOutlined />}
                disabled={Number(r.comisionGanada) === 0 && Number(r.adelantos) === 0}
                onClick={() => setCajaModal({ lavadorId: r.lavadorId, nombre: r.nombre })}
              >
                Registrar pago
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={`Registrar pago — ${cajaModal?.nombre ?? ''}`}
        open={!!cajaModal}
        onCancel={cerrarModalPago}
        onOk={confirmarPago}
        confirmLoading={registrarPago.isPending}
        okButtonProps={{ disabled: metodoPagoLiq === 'efectivo' && !cajaElegida }}
      >
        <p>Período: {desde} a {hasta}</p>
        <Radio.Group
          value={metodoPagoLiq} onChange={e => setMetodoPagoLiq(e.target.value)}
          style={{ marginBottom: 12 }}
        >
          <Radio.Button value="efectivo">Efectivo</Radio.Button>
          <Radio.Button value="transferencia">Transferencia</Radio.Button>
        </Radio.Group>
        {metodoPagoLiq === 'efectivo' ? (
          <Select
            placeholder="Caja de donde sale el efectivo"
            style={{ width: '100%' }}
            value={cajaElegida}
            onChange={setCajaElegida}
            options={(cajasHoy ?? []).map((c: any) => ({ value: c.id, label: c.vendedorNombre ? `Caja de ${c.vendedorNombre}` : `Caja #${c.id}` }))}
          />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input placeholder="Referencia de la transferencia" value={referenciaLiq} onChange={e => setReferenciaLiq(e.target.value)} />
            {(cuentasBancarias ?? []).length > 0 && (
              <Select
                placeholder="Cuenta bancaria (opcional)" allowClear style={{ width: '100%' }}
                value={cuentaBancariaLiq} onChange={setCuentaBancariaLiq}
                options={(cuentasBancarias ?? []).map((c: any) => ({ value: c.id, label: c.nombre ?? c.banco }))}
              />
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title="Nuevo adelanto a lavador"
        open={adelantoAbierto}
        onCancel={() => setAdelantoAbierto(false)}
        onOk={() => formAdelanto.validateFields().then(v => crearAdelanto.mutate(v))}
        confirmLoading={crearAdelanto.isPending}
      >
        <Form form={formAdelanto} layout="vertical" initialValues={{ metodoPago: 'efectivo' }}>
          <Form.Item name="lavadorId" label="Lavador" rules={[{ required: true }]}>
            <Select options={(lavadores ?? []).map((l: any) => ({ value: l.id, label: l.nombre }))} />
          </Form.Item>
          <Form.Item name="monto" label="Monto RD$" rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="metodoPago" label="Método de pago">
            <Radio.Group>
              <Radio.Button value="efectivo">Efectivo</Radio.Button>
              <Radio.Button value="transferencia">Transferencia</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {metodoPagoAdelanto === 'efectivo' ? (
            <Form.Item name="cajaId" label="Caja (opcional — si no eliges, se usa tu caja abierta)">
              <Select
                allowClear
                options={(cajasHoy ?? []).map((c: any) => ({ value: c.id, label: c.vendedorNombre ? `Caja de ${c.vendedorNombre}` : `Caja #${c.id}` }))}
              />
            </Form.Item>
          ) : (
            <>
              <Form.Item name="referencia" label="Referencia de la transferencia" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              {(cuentasBancarias ?? []).length > 0 && (
                <Form.Item name="cuentaBancariaId" label="Cuenta bancaria (opcional)">
                  <Select allowClear options={(cuentasBancarias ?? []).map((c: any) => ({ value: c.id, label: c.nombre ?? c.banco }))} />
                </Form.Item>
              )}
            </>
          )}
          <Form.Item name="motivo" label="Motivo (opcional)">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function DetalleLavador({ lavadorId, desde, hasta }: { lavadorId: number; desde: string; hasta: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cw-resumen-liq', lavadorId, desde, hasta],
    queryFn: () => carWashApi.resumenLiquidacion(lavadorId, desde, hasta),
  });
  if (isLoading) return <div>Cargando…</div>;
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      dataSource={data?.comisiones ?? []}
      columns={[
        { title: 'Fecha', dataIndex: 'fecha' },
        { title: 'Turno', dataIndex: 'turnoCodigo' },
        { title: 'Placa', dataIndex: 'placa' },
        { title: 'Servicio', dataIndex: 'servicioNombre', render: (v: string) => v || 'Todo el vehículo' },
        { title: 'Monto', dataIndex: 'monto', render: (v: number) => `RD$${Number(v).toFixed(2)}` },
      ]}
    />
  );
}
