import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Card, Row, Col, Statistic, Tag, Modal, Form, Input, Select, DatePicker, message, theme, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Eye, Plus, Mail } from 'lucide-react';
import { FileExcelOutlined } from '@ant-design/icons';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';

const { Option } = Select;
const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

const COLS_DEF = [
  { key: 'numero', label: 'Préstamo', defaultVisible: true },
  { key: 'deudorNombre', label: 'Deudor', defaultVisible: true },
  { key: 'deudorTelefono', label: 'Teléfono', defaultVisible: true },
  { key: 'saldoCapital', label: 'Saldo Capital', defaultVisible: true },
  { key: 'saldoMora', label: 'Saldo Mora', defaultVisible: true },
  { key: 'saldoTotal', label: 'Saldo Total', defaultVisible: true },
  { key: 'diasMoraActual', label: 'Días Mora', defaultVisible: true },
  { key: 'cuotasVencidas', label: 'Cuotas Vencidas', defaultVisible: true },
  { key: 'ultimaGestion', label: 'Última Gestión', defaultVisible: false },
];

export default function CobranzaPage() {
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [gestionOpen, setGestionOpen] = useState(false);
  const [selectedPrestamo, setSelectedPrestamo] = useState<any>(null);
  const [formGestion] = Form.useForm();
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('prestamista-cobranza', COLS_DEF);

  const { data: resumen } = useQuery({
    queryKey: ['prestamista-cobranza-resumen'],
    queryFn: prestamistalApi.getResumenCobranza,
    refetchInterval: 120_000,
  });

  const { data: carteraResp, isLoading } = useQuery({
    queryKey: ['prestamista-cartera-vencida'],
    queryFn: () => prestamistalApi.getCarteraVencida(),
  });
  const cartera: any[] = (carteraResp as any)?.data ?? carteraResp ?? [];

  const registrarGestion = useMutation({
    mutationFn: (vals: any) => prestamistalApi.registrarGestion({ prestamoId: selectedPrestamo?.id, ...vals }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prestamista-cartera-vencida'] });
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

  const cols = [
    { title: 'Préstamo', dataIndex: 'numero', key: 'numero', width: 120 },
    { title: 'Deudor', dataIndex: 'deudorNombre', key: 'deudorNombre' },
    { title: 'Teléfono', dataIndex: 'deudorTelefono', key: 'deudorTelefono', width: 110 },
    { title: 'Saldo Capital', dataIndex: 'saldoCapital', key: 'saldoCapital', render: fmt },
    { title: 'Saldo Mora', dataIndex: 'saldoMora', key: 'saldoMora', render: (v: any) => <span style={{ color: '#ff4d4f' }}>{fmt(v)}</span> },
    { title: 'Saldo Total', dataIndex: 'saldoTotal', key: 'saldoTotal', render: fmt },
    { title: 'Días Mora', dataIndex: 'diasMoraActual', key: 'diasMoraActual', render: (v: any) => <Tag color={v > 90 ? 'red' : v > 30 ? 'orange' : 'blue'}>{v}</Tag> },
    { title: 'Cuotas Vencidas', dataIndex: 'cuotasVencidas', key: 'cuotasVencidas', render: (v: any) => <Tag color="red">{v}</Tag> },
    { title: 'Última Gestión', dataIndex: 'ultimaGestion', key: 'ultimaGestion', render: (v: string) => v?.slice(0, 10) ?? '—' },
    {
      title: '', key: 'acc', width: 130,
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
      'Última Gestión': r.ultimaGestion?.slice(0, 10) ?? '',
    }));
    exportarExcel(filas, `Cobranza-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  const rs = resumen ?? {};

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: C.colorText }}>Cobranza — Cartera Vencida</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['prestamista-cartera-vencida']} />
          <VideoTutorialButton />
        </div>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Préstamos Morosos" value={Number(rs.totalMorosos ?? 0)} valueStyle={{ color: C.colorWarning }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Préstamos Vencidos" value={Number(rs.totalVencidos ?? 0)} valueStyle={{ color: C.colorError }} /></Card></Col>
        <Col xs={12} md={5}><Card size="small"><Statistic title="Saldo Mora Total" value={fmt(rs.saldoMoraTotal)} valueStyle={{ color: C.colorError, fontSize: 14 }} /></Card></Col>
        <Col xs={12} md={5}><Card size="small"><Statistic title="Cartera Vencida" value={fmt(rs.carteraVencidaTotal)} valueStyle={{ fontSize: 14 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Índice de Morosidad" value={`${rs.indiceMorosidad ?? 0}%`} valueStyle={{ color: C.colorWarning, fontSize: 14 }} /></Card></Col>
      </Row>

      <Table dataSource={(cartera as any[]).map((r: any) => ({ ...r, key: r.id }))} columns={filterColumns(cols as any)}
        loading={isLoading} scroll={{ x: 'max-content' }} size="small" />

      <Modal title={`Registrar Gestión — ${selectedPrestamo?.deudorNombre ?? ''}`} open={gestionOpen}
        onCancel={() => { setGestionOpen(false); formGestion.resetFields(); }}
        onOk={() => formGestion.validateFields().then(v => registrarGestion.mutate(v))} okText="Registrar" confirmLoading={registrarGestion.isPending}>
        <Form form={formGestion} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="tipoGestion" label="Tipo de Gestión" rules={[{ required: true }]}>
            <Select>
              <Option value="llamada">Llamada telefónica</Option>
              <Option value="visita">Visita domiciliaria</Option>
              <Option value="mensaje">Mensaje / WhatsApp</Option>
              <Option value="carta">Carta / Notificación</Option>
              <Option value="acuerdo_pago">Acuerdo de pago</Option>
              <Option value="judicial">Acción judicial</Option>
            </Select>
          </Form.Item>
          <Form.Item name="resultado" label="Resultado">
            <Select allowClear>
              <Option value="contactado">Contactado — promesa de pago</Option>
              <Option value="no_contactado">No contactado</Option>
              <Option value="pago_parcial">Realizó pago parcial</Option>
              <Option value="negativa">Se negó a pagar</Option>
              <Option value="acuerdo">Acuerdo alcanzado</Option>
            </Select>
          </Form.Item>
          <Form.Item name="fechaProximaGestion" label="Fecha Próxima Gestión">
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="notas" label="Notas" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
