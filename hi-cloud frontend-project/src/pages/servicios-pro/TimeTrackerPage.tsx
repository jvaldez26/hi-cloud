import { useState, useEffect } from 'react';
import { Button, Card, Form, Select, DatePicker, InputNumber, Input, Table, message, Tag, Alert } from 'antd';
import { PlusOutlined, PlayCircleOutlined, StopOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import dayjs from 'dayjs';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'expediente', label: 'Expediente', defaultVisible: true },
  { key: 'profesional', label: 'Profesional', defaultVisible: true },
  { key: 'horas', label: 'Horas', defaultVisible: true },
  { key: 'descripcion', label: 'Descripción', defaultVisible: true },
  { key: 'monto', label: 'Monto', defaultVisible: true },
  { key: 'facturable', label: 'Facturable', defaultVisible: true },
];

function formatDuracion(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export default function TimeTrackerPage() {
  const [formManual] = Form.useForm();
  const [formTimer] = Form.useForm();
  const [timerDisplay, setTimerDisplay] = useState('00:00:00');
  const qc = useQueryClient();

  const { data: profesionales = [] } = useQuery({ queryKey: ['sp-profesionales-sel'], queryFn: serviciosProApi.getProfesionales });
  const { data: expedientes = [] } = useQuery({ queryKey: ['sp-expedientes'], queryFn: () => serviciosProApi.getExpedientes({ estado: 'activo' }) });

  const profActual = (profesionales as any[])[0]?.id ?? undefined;

  const { data: timerData, refetch: refetchTimer } = useQuery<any>({
    queryKey: ['sp-timer', profActual],
    queryFn: () => profActual ? serviciosProApi.getTimerActivo(profActual) : Promise.resolve({ activo: false }),
    enabled: !!profActual,
    refetchInterval: (d: any) => (d?.activo ? 5000 : false),
  });

  // Actualizar display cada segundo si el timer está activo
  useEffect(() => {
    if (!timerData?.activo) return;
    const interval = setInterval(() => {
      const ms = timerData.transcurridoMs + (Date.now() - new Date(timerData.inicio).getTime()) + timerData.transcurridoMs - timerData.transcurridoMs;
      const elapsed = Date.now() - new Date(timerData.inicio).getTime();
      setTimerDisplay(formatDuracion(elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerData]);

  const mutManual = useMutation({
    mutationFn: (body: any) => serviciosProApi.crearTiempo(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sp-tiempo'] });
      message.success('Tiempo registrado');
      formManual.resetFields();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const mutIniciarTimer = useMutation({
    mutationFn: (body: any) => serviciosProApi.iniciarTimer(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sp-timer'] }); refetchTimer(); message.success('Timer iniciado'); setTimerDisplay('00:00:00'); },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const mutDetenerTimer = useMutation({
    mutationFn: (body: any) => serviciosProApi.detenerTimer(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sp-timer'] });
      qc.invalidateQueries({ queryKey: ['sp-tiempo'] });
      refetchTimer();
      message.success('Timer detenido y tiempo guardado');
      setTimerDisplay('00:00:00');
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Error'),
  });

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('sp-time', COLS_DEF);

  const { data: tiempoHoy = [] } = useQuery({
    queryKey: ['sp-tiempo-hoy'],
    queryFn: () => serviciosProApi.getTiempo({ desde: dayjs().format('YYYY-MM-DD'), hasta: dayjs().format('YYYY-MM-DD') }),
  });

  const totalHorasHoy = Array.isArray(tiempoHoy)
    ? tiempoHoy.reduce((s: number, t: any) => s + Number(t.horas), 0)
    : 0;
  const totalMontoHoy = Array.isArray(tiempoHoy)
    ? tiempoHoy.reduce((s: number, t: any) => s + Number(t.monto ?? 0), 0)
    : 0;

  const exportar = () => {
    const filas = (Array.isArray(tiempoHoy) ? tiempoHoy : []).map((r: any) => ({
      'Expediente': `${r.expedienteNumero ?? ''} — ${r.expedienteNombre ?? ''}`,
      'Profesional': `${r.profesionalNombre ?? ''} ${r.profesionalApellidos ?? ''}`.trim(),
      'Horas': r.horas,
      'Descripción': r.descripcion,
      'Monto': r.monto,
      'Facturable': r.facturable ? 'Si' : 'No',
    }));
    exportarExcel(filas, `TimeTracker-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const colsTiempo = [
    { title: 'Expediente', key: 'expediente', render: (_: any, r: any) => `${r.expedienteNumero ?? ''} — ${r.expedienteNombre ?? ''}` },
    { title: 'Profesional', key: 'profesional', render: (_: any, r: any) => `${r.profesionalNombre ?? ''} ${r.profesionalApellidos ?? ''}`.trim() },
    { title: 'Horas', key: 'horas', dataIndex: 'horas', render: (v: number) => `${Number(v).toFixed(2)}h`, width: 80 },
    { title: 'Descripción', key: 'descripcion', dataIndex: 'descripcion' },
    { title: 'Monto', key: 'monto', dataIndex: 'monto', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
    { title: 'Facturable', key: 'facturable', dataIndex: 'facturable', render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? '✓' : '—'}</Tag>, width: 80 },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>⏱️ Time Tracker</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['sp-tiempo-hoy']} />
          <VideoTutorialButton />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Timer en tiempo real */}
        <Card title="⏱️ Timer en Tiempo Real">
          {timerData?.activo ? (
            <div>
              <Alert message="Timer activo" type="success" showIcon style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 48, fontWeight: 700, color: '#1d4ed8', textAlign: 'center', letterSpacing: 4, marginBottom: 8 }}>
                {timerDisplay}
              </div>
              <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
                {(expedientes as any[]).find((e: any) => e.id === timerData.expedienteId)?.nombre ?? `Expediente #${timerData.expedienteId}`}
              </div>
              <Form layout="vertical">
                <Form.Item label="Descripción final">
                  <Input.TextArea rows={2} id="timer-desc-final" defaultValue={timerData.descripcion} />
                </Form.Item>
              </Form>
              <Button danger icon={<StopOutlined />} block size="large"
                loading={mutDetenerTimer.isPending}
                onClick={() => {
                  const desc = (document.getElementById('timer-desc-final') as HTMLTextAreaElement)?.value;
                  mutDetenerTimer.mutate({ profesionalId: timerData.profesionalId, descripcion: desc });
                }}>
                ⏹ Detener y Guardar
              </Button>
            </div>
          ) : (
            <Form form={formTimer} layout="vertical">
              <Form.Item name="profesionalId" label="Profesional" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="children">
                  {(profesionales as any[]).map(p => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="expedienteId" label="Expediente" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="children">
                  {(expedientes as any[]).map(e => <Select.Option key={e.id} value={e.id}>{e.numero} — {e.nombre}</Select.Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}>
                <Input placeholder="¿En qué estás trabajando?" />
              </Form.Item>
              <Button type="primary" icon={<PlayCircleOutlined />} block size="large"
                loading={mutIniciarTimer.isPending}
                onClick={() => formTimer.validateFields().then(v => mutIniciarTimer.mutate(v))}>
                ▶ Iniciar Timer
              </Button>
            </Form>
          )}
        </Card>

        {/* Agregar tiempo manual */}
        <Card title="📝 Agregar Tiempo Manual">
          <Form form={formManual} layout="vertical" onFinish={v => mutManual.mutate({ ...v, fecha: v.fecha?.format('YYYY-MM-DD') })}>
            <Form.Item name="expedienteId" label="Expediente" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children">
                {(expedientes as any[]).map(e => <Select.Option key={e.id} value={e.id}>{e.numero} — {e.nombre}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="profesionalId" label="Profesional" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="children">
                {(profesionales as any[]).map(p => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
              </Select>
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
              <Form.Item name="horas" label="Horas" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0.25} step={0.25} placeholder="0.25" /></Form.Item>
            </div>
            <Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
            <Form.Item name="facturable" label="Facturable" initialValue={true}>
              <Select><Select.Option value={true}>Sí</Select.Option><Select.Option value={false}>No</Select.Option></Select>
            </Form.Item>
            <Button type="primary" icon={<PlusOutlined />} htmlType="submit" block loading={mutManual.isPending}>
              + Agregar Tiempo
            </Button>
          </Form>
        </Card>
      </div>

      {/* Historial del día */}
      <Card title={`📋 Hoy — ${totalHorasHoy.toFixed(2)}h · RD$${totalMontoHoy.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`}>
        <Table dataSource={Array.isArray(tiempoHoy) ? tiempoHoy : []} rowKey="id" size="small" scroll={{ x: 'max-content' }} pagination={false}
          columns={filterColumns(colsTiempo as any)} />
      </Card>
    </div>
  );
}
