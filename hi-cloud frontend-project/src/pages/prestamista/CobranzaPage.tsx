import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Card, Row, Col, Statistic, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Tooltip, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Eye, Plus, Mail, UserCog } from 'lucide-react';
import { FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import WhatsAppButton from '../../components/ui/WhatsAppButton';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';
import { configuracionApi } from '../../api/configuracion.api';
import { hoyRD } from '../../utils/fechaRD';
import { useAuthStore } from '../../store/auth.store';
import { Settings } from 'lucide-react';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

/**
 * Etapa 3 — ver docs/prestamista/etapa-3-cobranza.md. Default de arranque
 * 5/15/30/60 días; configurable por empresa desde `carteraResp.umbralesEscalamiento`
 * / el modal "Umbrales de escalamiento" más abajo (ver
 * docs/prestamista/decisiones-pendientes.md, punto 3).
 */
const ESCALAMIENTO: Record<string, { label: string; color: string }> = {
  sin_accion:   { label: 'Al día',               color: 'default' },
  recordatorio: { label: 'Recordatorio',          color: 'blue' },
  telefonica:   { label: 'Gestión telefónica',    color: 'gold' },
  carta:        { label: 'Carta formal',          color: 'orange' },
  legal:        { label: 'Acción legal',          color: 'red' },
};

const COLS_DEF = [
  { key: 'numero', label: 'Préstamo', defaultVisible: true },
  { key: 'deudorNombre', label: 'Deudor', defaultVisible: true },
  { key: 'deudorTelefono', label: 'Teléfono', defaultVisible: true },
  { key: 'saldoCapital', label: 'Saldo Capital', defaultVisible: true },
  { key: 'saldoMora', label: 'Saldo Mora', defaultVisible: true },
  { key: 'saldoTotal', label: 'Saldo Total', defaultVisible: true },
  { key: 'diasMoraActual', label: 'Días Mora', defaultVisible: true },
  { key: 'cuotasVencidas', label: 'Cuotas Vencidas', defaultVisible: true },
  { key: 'nivelEscalamiento', label: 'Escalamiento', defaultVisible: true },
  { key: 'cobradorEfectivoNombre', label: 'Cobrador', defaultVisible: true },
  { key: 'ultimaGestion', label: 'Última Gestión', defaultVisible: true },
];

export default function CobranzaPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const usuario = useAuthStore(s => s.user);
  const [gestionOpen, setGestionOpen] = useState(false);
  const [selectedPrestamo, setSelectedPrestamo] = useState<any>(null);
  const [formGestion] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('prestamista-cobranza', COLS_DEF);

  const [filtroCobrador, setFiltroCobrador] = useState<'todos' | 'mi_cartera' | number>('todos');
  const [soloPromesasIncumplidas, setSoloPromesasIncumplidas] = useState(false);

  const { data: resumen } = useQuery({
    queryKey: ['prestamista-cobranza-resumen'],
    queryFn: prestamistalApi.getResumenCobranza,
    refetchInterval: 120_000,
  });

  const { data: cobradores } = useQuery({
    queryKey: ['prestamista-cobradores'],
    queryFn: prestamistalApi.getCobradores,
  });

  const cobradorIdParam = filtroCobrador === 'todos' ? undefined : filtroCobrador === 'mi_cartera' ? usuario?.id : filtroCobrador;

  const { data: carteraResp, isLoading } = useQuery({
    queryKey: ['prestamista-cartera-vencida', cobradorIdParam, soloPromesasIncumplidas],
    queryFn: () => prestamistalApi.getCarteraVencida({
      ...(cobradorIdParam ? { cobradorId: cobradorIdParam } : {}),
      ...(soloPromesasIncumplidas ? { soloPromesasIncumplidas: true } : {}),
    }),
  });
  const cartera: any[] = (carteraResp as any)?.data ?? carteraResp ?? [];
  const umbralesVigentes = (carteraResp as any)?.umbralesEscalamiento
    ?? { recordatorio: 5, telefonica: 15, carta: 30, legal: 60 };
  const esAdmin = usuario?.role === 'admin';

  const registrarGestion = useMutation({
    // proximaGestion/fechaPromesaPago llegan como objeto dayjs del
    // DatePicker — el DTO espera un string 'YYYY-MM-DD'.
    mutationFn: ({ proximaGestion, fechaPromesaPago, ...vals }: any) => prestamistalApi.registrarGestion({
      prestamoId: selectedPrestamo?.id,
      ...vals,
      ...(proximaGestion ? { proximaGestion: proximaGestion.format('YYYY-MM-DD') } : {}),
      ...(fechaPromesaPago ? { fechaPromesaPago: fechaPromesaPago.format('YYYY-MM-DD') } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-cartera-vencida'] });
      qc.invalidateQueries({ queryKey: ['prestamista-cobranza-resumen'] });
      setGestionOpen(false);
      formGestion.resetFields();
      message.success('Gestión registrada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al registrar gestión'),
  });

  const openGestion = (row: any) => {
    setSelectedPrestamo(row);
    setGestionOpen(true);
  };

  const [notificandoId, setNotificandoId] = useState<number | null>(null);
  const notificarMora = useMutation({
    mutationFn: (prestamoId: number) => prestamistalApi.notificarMoraEmail(prestamoId),
    onMutate: (prestamoId: number) => setNotificandoId(prestamoId),
    onSuccess: (resp: any) => {
      qc.invalidateQueries({ queryKey: ['prestamista-cartera-vencida'] });
      message.success(resp?.mensaje ?? 'Recordatorio enviado por email');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo enviar el recordatorio'),
    onSettled: () => setNotificandoId(null),
  });

  const confirmarNotificar = (r: any) => {
    Modal.confirm({
      title: 'Enviar recordatorio de mora',
      content: `Se enviará un recordatorio de pago por email a ${r.deudorNombre} (${r.deudorEmail}).`,
      okText: 'Enviar',
      cancelText: 'Cancelar',
      onOk: () => notificarMora.mutateAsync(r.id),
    });
  };

  const [asignarOpen, setAsignarOpen] = useState(false);
  const [formAsignar] = Form.useForm();
  const asignarCobrador = useMutation({
    mutationFn: ({ prestamoId, cobradorId }: { prestamoId: number; cobradorId: number | null }) =>
      prestamistalApi.asignarCobrador(prestamoId, cobradorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-cartera-vencida'] });
      setAsignarOpen(false);
      message.success('Cartera reasignada');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al reasignar la cartera'),
  });

  const abrirAsignar = (row: any) => {
    setSelectedPrestamo(row);
    formAsignar.setFieldsValue({ cobradorId: row.cobradorId ?? undefined });
    setAsignarOpen(true);
  };

  // Umbrales de escalamiento — punto 3 de decisiones-pendientes.md. Solo
  // ADMIN (mismo rol que exige el backend en PATCH /configuracion/empresa).
  const [umbralesOpen, setUmbralesOpen] = useState(false);
  const [formUmbrales] = Form.useForm();
  const guardarUmbrales = useMutation({
    mutationFn: (v: { recordatorio: number; telefonica: number; carta: number; legal: number }) =>
      configuracionApi.updateEmpresa({
        configuracion: {
          cobranzaUmbralRecordatorio: v.recordatorio,
          cobranzaUmbralTelefonica:   v.telefonica,
          cobranzaUmbralCarta:        v.carta,
          cobranzaUmbralLegal:        v.legal,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-cartera-vencida'] });
      setUmbralesOpen(false);
      message.success('Umbrales de escalamiento actualizados');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al guardar los umbrales'),
  });
  const abrirUmbrales = () => {
    formUmbrales.setFieldsValue(umbralesVigentes);
    setUmbralesOpen(true);
  };

  const cols = [
    { title: 'Préstamo', dataIndex: 'numero', key: 'numero', width: 120 },
    { title: 'Deudor', dataIndex: 'deudorNombre', key: 'deudorNombre' },
    { title: 'Teléfono', dataIndex: 'deudorTelefono', key: 'deudorTelefono', width: 110 },
    { title: 'Saldo Capital', dataIndex: 'saldoCapital', key: 'saldoCapital', render: fmt },
    { title: 'Saldo Mora', dataIndex: 'saldoMora', key: 'saldoMora', render: (v: any) => <span style={{ color: '#ff4d4f' }}>{fmt(v)}</span> },
    { title: 'Saldo Total', dataIndex: 'saldoTotal', key: 'saldoTotal', render: fmt },
    { title: 'Días Mora', dataIndex: 'diasMoraActual', key: 'diasMoraActual', render: (v: any) => <Tag color={v > 90 ? 'red' : v > 30 ? 'orange' : 'blue'}>{v}</Tag> },
    { title: 'Cuotas Vencidas', dataIndex: 'cuotasVencidas', key: 'cuotasVencidas', render: (v: any) => <Tag color="red">{v}</Tag> },
    {
      title: 'Escalamiento', dataIndex: 'nivelEscalamiento', key: 'nivelEscalamiento',
      render: (v: string) => {
        const e = ESCALAMIENTO[v] ?? ESCALAMIENTO.sin_accion;
        return <Tag color={e.color}>{e.label}</Tag>;
      },
    },
    {
      title: 'Cobrador', dataIndex: 'cobradorEfectivoNombre', key: 'cobradorEfectivoNombre',
      render: (v: string, r: any) => (
        <Space size={4}>
          <span>{v ?? '—'}</span>
          <Tooltip title="Reasignar cartera">
            <Button size="small" type="text" icon={<UserCog size={13} />} onClick={() => abrirAsignar(r)} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Última Gestión', dataIndex: 'diasUltimaGestion', key: 'ultimaGestion',
      render: (dias: number | null, r: any) => (
        <Space direction="vertical" size={0}>
          <span>{dias == null ? 'Sin gestión' : `hace ${dias} día(s)`}</span>
          {r.promesaIncumplida && <Tag color="volcano" style={{ marginTop: 2 }}>Promesa incumplida</Tag>}
        </Space>
      ),
    },
    {
      title: '', key: 'acc', width: 170,
      render: (_: any, r: any) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="small" icon={<Eye size={13} />} onClick={() => navigate(`/prestamista/prestamos/${r.id}`)} />
          <Button size="small" icon={<Plus size={13} />} onClick={() => openGestion(r)}>Gestión</Button>
          <Tooltip title={r.deudorEmail ? 'Enviar recordatorio de mora por email' : 'El deudor no tiene email registrado'}>
            <span>
              <Button size="small" icon={<Mail size={13} />} disabled={!r.deudorEmail}
                loading={notificandoId === r.id} onClick={() => confirmarNotificar(r)} />
            </span>
          </Tooltip>
          <WhatsAppButton tipo="recordatorio-mora-prestamo" id={r.id} size="small" onlyIcon />
        </div>
      ),
    },
  ];

  const exportar = () => {
    const filas = (cartera as any[]).map((r: any) => ({
      'Préstamo': r.numero,
      'Deudor': r.deudorNombre,
      'Teléfono': r.deudorTelefono,
      'Saldo Capital': r.saldoCapital,
      'Saldo Mora': r.saldoMora,
      'Saldo Total': r.saldoTotal,
      'Días Mora': r.diasMoraActual,
      'Cuotas Vencidas': r.cuotasVencidas,
      'Escalamiento': ESCALAMIENTO[r.nivelEscalamiento]?.label ?? r.nivelEscalamiento,
      'Cobrador': r.cobradorEfectivoNombre ?? '',
      'Días Última Gestión': r.diasUltimaGestion ?? '',
      'Promesa Incumplida': r.promesaIncumplida ? 'Sí' : 'No',
    }));
    exportarExcel(filas, `Cobranza-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const rs = resumen ?? {};

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Cobranza — Cartera Vencida</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Select
            value={filtroCobrador}
            style={{ width: 180 }}
            onChange={setFiltroCobrador}
            options={[
              { value: 'todos', label: 'Toda la cartera' },
              { value: 'mi_cartera', label: 'Mi cartera' },
              ...((cobradores as any[]) ?? []).map((c: any) => ({ value: c.id, label: c.nombre })),
            ]}
          />
          <Button
            type={soloPromesasIncumplidas ? 'primary' : 'default'}
            danger={soloPromesasIncumplidas}
            onClick={() => setSoloPromesasIncumplidas(v => !v)}
          >
            Promesas incumplidas
          </Button>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          {esAdmin && (
            <Tooltip title="Días de mora para sugerir recordatorio / gestión telefónica / carta / acción legal">
              <Button icon={<Settings size={14} />} onClick={abrirUmbrales}>Umbrales</Button>
            </Tooltip>
          )}
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['prestamista-cartera-vencida']} />
          <VideoTutorialButton />
        </div>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Préstamos Morosos" value={Number(rs.totalMorosos ?? 0)} valueStyle={{ color: C.colorWarning }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Préstamos Vencidos" value={Number(rs.totalVencidos ?? 0)} valueStyle={{ color: C.colorError }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Saldo Mora Total" value={fmt(rs.saldoMoraTotal)} valueStyle={{ color: C.colorError, fontSize: 14 }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Cartera Vencida" value={fmt(rs.carteraVencidaTotal)} valueStyle={{ fontSize: 14 }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Índice de Morosidad" value={`${rs.indiceMorosidad ?? 0}%`} valueStyle={{ color: C.colorWarning, fontSize: 14 }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Promesas Incumplidas" value={Number(rs.promesasIncumplidas ?? 0)} valueStyle={{ color: C.colorError, fontSize: 14 }} /></Card></Col>
      </Row>

      <Table dataSource={(cartera as any[]).map((r: any) => ({ ...r, key: r.id }))} columns={filterColumns(cols as any)}
        loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

      <Modal title={`Registrar Gestión — ${selectedPrestamo?.deudorNombre ?? ''}`} open={gestionOpen}
        onCancel={() => { setGestionOpen(false); formGestion.resetFields(); }}
        onOk={() => formGestion.validateFields().then(v => registrarGestion.mutate(v))} okText="Registrar" confirmLoading={registrarGestion.isPending}>
        <Form form={formGestion} layout="vertical" style={{ paddingTop: 8 }}>
          {/* Etapa 1: nombres y valores alineados a RegistrarGestionDto — el
             formulario mandaba tipoGestion/fechaProximaGestion/notas (el DTO
             exige tipo/proximaGestion/descripcion) y valores de tipo/resultado
             que @IsIn() no reconoce (acuerdo_pago, judicial, contactado,
             no_contactado, negativa) — cada envío de "Registrar Gestión"
             terminaba en 400. */}
          <Form.Item name="tipo" label="Tipo de Gestión" rules={[{ required: true }]}>
            <Select>
              <Option value="llamada">Llamada telefónica</Option>
              <Option value="visita">Visita domiciliaria</Option>
              <Option value="mensaje">Mensaje / WhatsApp</Option>
              <Option value="carta">Carta / Notificación</Option>
              <Option value="acuerdo">Acuerdo de pago</Option>
              <Option value="legal">Acción judicial</Option>
              <Option value="otro">Otro</Option>
            </Select>
          </Form.Item>
          <Form.Item name="resultado" label="Resultado">
            <Select allowClear>
              <Option value="promesa_pago">Contactado — promesa de pago</Option>
              <Option value="sin_respuesta">No contactado</Option>
              <Option value="pago_parcial">Realizó pago parcial</Option>
              <Option value="negado">Se negó a pagar</Option>
              <Option value="exitoso">Acuerdo alcanzado</Option>
            </Select>
          </Form.Item>
          <Form.Item name="montoPrometido" label="Monto Prometido">
            <InputNumber style={{ width: '100%' }} prefix="RD$" min={0} />
          </Form.Item>
          <Form.Item name="fechaPromesaPago" label="Fecha Promesa de Pago">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="proximaGestion" label="Fecha Próxima Gestión">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="descripcion" label="Notas" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`Asignar cobrador — Préstamo ${selectedPrestamo?.numero ?? ''}`} open={asignarOpen}
        onCancel={() => setAsignarOpen(false)}
        onOk={() => formAsignar.validateFields().then(v => asignarCobrador.mutate({ prestamoId: selectedPrestamo.id, cobradorId: v.cobradorId ?? null }))}
        okText="Asignar" confirmLoading={asignarCobrador.isPending}>
        <Form form={formAsignar} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="cobradorId" label="Cobrador">
            <Select allowClear placeholder="Sin asignar (sugiere al oficial del préstamo)">
              {((cobradores as any[]) ?? []).map((c: any) => <Option key={c.id} value={c.id}>{c.nombre}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Umbrales de escalamiento de cobranza" open={umbralesOpen}
        onCancel={() => setUmbralesOpen(false)}
        onOk={() => formUmbrales.validateFields().then(v => guardarUmbrales.mutate(v))}
        okText="Guardar" confirmLoading={guardarUmbrales.isPending}>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
          Días de mora a partir de los cuales la columna "Escalamiento" sugiere cada nivel.
          Es solo una guía visual para priorizar a quién llamar hoy — nunca bloquea ni dispara nada
          automáticamente. Default de fábrica: 5 / 15 / 30 / 60.
        </p>
        <Form form={formUmbrales} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="recordatorio" label="Recordatorio (días)" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item name="telefonica" label="Gestión telefónica (días)" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item name="carta" label="Carta formal (días)" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
          <Form.Item name="legal" label="Acción legal (días)" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
