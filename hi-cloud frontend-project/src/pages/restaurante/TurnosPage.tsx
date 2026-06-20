import { useState } from 'react';
import {
  Table, Button, Card, Modal, Form, Input, Select, Tag, Space,
  Typography, Statistic, Row, Col, Divider, message, Alert,
} from 'antd';
import { PlayCircleOutlined, StopOutlined, PrinterOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { restauranteApi } from '../../api/restaurante.api';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const { Title, Text } = Typography;
const { Option } = Select;

const COLS_DEF = [
  { key: 'numero', label: 'Número', defaultVisible: true },
  { key: 'fechaApertura', label: 'Apertura', defaultVisible: true },
  { key: 'fechaCierre', label: 'Cierre', defaultVisible: true },
  { key: 'usuarioNombre', label: 'Cajero', defaultVisible: true },
  { key: 'estado', label: 'Estado', defaultVisible: true },
  { key: 'totalVentas', label: 'Ventas', defaultVisible: true },
  { key: 'totalComandas', label: 'Comandas', defaultVisible: true },
  { key: 'act', label: 'Acciones', defaultVisible: true },
];

export default function TurnosPage() {
  const qc = useQueryClient();
  const [modalAbrir, setModalAbrir] = useState(false);
  const [modalCerrar, setModalCerrar] = useState<any>(null);
  const [form] = Form.useForm();
  const [formCierre] = Form.useForm();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('restaurante-turnos', COLS_DEF);

  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['restaurante-turnos'],
    queryFn: () => restauranteApi.listarTurnos({ limit: 30 }),
  });

  const turnoActivo = (turnos as any[]).find((t: any) => t.estado === 'abierto');

  const abrirTurno = useMutation({
    mutationFn: (b: any) => restauranteApi.abrirTurno(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['restaurante-turnos'] }); setModalAbrir(false); form.resetFields(); message.success('Turno abierto'); },
    onError: () => message.error('Error abriendo turno'),
  });

  const cerrarTurno = useMutation({
    mutationFn: ({ id, ...b }: any) => restauranteApi.cerrarTurno(id, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurante-turnos'] });
      setModalCerrar(null);
      formCierre.resetFields();
      message.success('Turno cerrado');
    },
    onError: () => message.error('Error cerrando turno'),
  });

  const { data: resumen } = useQuery({
    queryKey: ['restaurante-turno-resumen', turnoActivo?.id],
    queryFn: () => turnoActivo ? restauranteApi.resumenTurno(turnoActivo.id) : null,
    enabled: !!turnoActivo,
    refetchInterval: 30_000,
  });

  const cols = [
    { title: 'Número', dataIndex: 'numero', width: 100 },
    {
      title: 'Apertura', dataIndex: 'fechaApertura', width: 150,
      render: (v: string) => new Date(v).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }),
    },
    {
      title: 'Cierre', dataIndex: 'fechaCierre', width: 150,
      render: (v: string) => v ? new Date(v).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : '—',
    },
    { title: 'Cajero', dataIndex: 'usuarioNombre', ellipsis: true },
    {
      title: 'Estado', dataIndex: 'estado', width: 90,
      render: (v: string) => <Tag color={v === 'abierto' ? 'green' : 'default'}>{v.toUpperCase()}</Tag>,
    },
    {
      title: 'Ventas', dataIndex: 'totalVentas', width: 120,
      render: (v: number) => `RD$${Number(v ?? 0).toFixed(2)}`,
    },
    {
      title: 'Comandas', dataIndex: 'totalComandas', width: 90, align: 'center' as const,
    },
    {
      title: '', key: 'act', width: 100,
      render: (_: any, r: any) => (
        <Space>
          {r.estado === 'abierto' && (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => { setModalCerrar(r); formCierre.resetFields(); }}>
              Cerrar
            </Button>
          )}
          {r.estado === 'cerrado' && (
            <Button size="small" icon={<PrinterOutlined />} onClick={() => window.open(restauranteApi.pdfTurno(r.id), '_blank')}>
              PDF
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const exportar = () => {
    const filas = (turnos as any[]).map((r: any) => ({
      'Número': r.numero ?? '',
      'Apertura': r.fechaApertura ? new Date(r.fechaApertura).toLocaleString('es-DO') : '',
      'Cierre': r.fechaCierre ? new Date(r.fechaCierre).toLocaleString('es-DO') : '',
      'Cajero': r.usuarioNombre ?? '',
      'Estado': r.estado ?? '',
      'Ventas': r.totalVentas ?? 0,
      'Comandas': r.totalComandas ?? 0,
    }));
    exportarExcel(filas, `Turnos-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0 }}>⏱️ Turnos</Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['restaurante-turnos']} />
          <VideoTutorialButton />
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={!!turnoActivo}
            onClick={() => setModalAbrir(true)}
          >
            Abrir Turno
          </Button>
        </div>
      </div>

      {turnoActivo && resumen && (
        <Card style={{ marginBottom: 16, borderColor: '#52c41a' }} size="small" title={<Text style={{ color: '#52c41a' }}>✅ Turno activo: {turnoActivo.numero}</Text>}>
          <Row gutter={[12, 8]}>
            <Col xs={12} sm={6}><Statistic title="Ventas" value={`RD$${Number(resumen.totalVentas ?? 0).toFixed(2)}`} valueStyle={{ fontSize: 16 }} /></Col>
            <Col xs={12} sm={6}><Statistic title="Efectivo" value={`RD$${Number(resumen.efectivo ?? 0).toFixed(2)}`} valueStyle={{ fontSize: 16 }} /></Col>
            <Col xs={12} sm={6}><Statistic title="Tarjeta" value={`RD$${Number(resumen.tarjeta ?? 0).toFixed(2)}`} valueStyle={{ fontSize: 16 }} /></Col>
            <Col xs={12} sm={6}><Statistic title="Comandas" value={resumen.totalComandas ?? 0} valueStyle={{ fontSize: 16 }} /></Col>
          </Row>
        </Card>
      )}

      {!turnoActivo && (
        <Alert type="warning" message="No hay turno activo. Abre un turno para comenzar a registrar ventas." style={{ marginBottom: 12 }} />
      )}

      <Table
        dataSource={turnos as any[]}
        columns={filterColumns(cols as any)}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 15 }}
      />

      {/* Modal abrir turno */}
      <Modal
        open={modalAbrir}
        title="Abrir Turno"
        onCancel={() => setModalAbrir(false)}
        onOk={() => form.validateFields().then(vals => abrirTurno.mutate(vals))}
        confirmLoading={abrirTurno.isPending}
        okText="Abrir turno"
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="usuarioNombre" label="Nombre del cajero" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="fondoInicial" label="Fondo inicial (RD$)">
            <Select defaultValue="0">
              <Option value={0}>Sin fondo</Option>
              <Option value={500}>RD$500</Option>
              <Option value={1000}>RD$1,000</Option>
              <Option value={2000}>RD$2,000</Option>
              <Option value={5000}>RD$5,000</Option>
            </Select>
          </Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal cerrar turno */}
      <Modal
        open={!!modalCerrar}
        title={`Cerrar turno ${modalCerrar?.numero}`}
        onCancel={() => setModalCerrar(null)}
        onOk={() => formCierre.validateFields().then(vals => cerrarTurno.mutate({ id: modalCerrar.id, ...vals }))}
        confirmLoading={cerrarTurno.isPending}
        okText="Cerrar turno"
      >
        <Alert type="warning" message="Esta acción cierra el turno definitivamente." style={{ marginBottom: 12 }} />
        <Form form={formCierre} layout="vertical" size="small">
          <Form.Item name="efectivoContado" label="Efectivo en caja (RD$)">
            <Select>
              <Option value={0}>No contar</Option>
            </Select>
          </Form.Item>
          <Form.Item name="notas" label="Notas de cierre"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
