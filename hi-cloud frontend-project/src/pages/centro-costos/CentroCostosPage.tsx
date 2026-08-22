import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { TableActions } from '../../components/ui/TableActions';
import {
  Card, Row, Col, Typography, Table, Tag, Statistic,
  Button, Space, Modal, Form, Input, InputNumber, Select,
  message, Progress, Tabs, Divider, theme,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ApartmentOutlined, FileExcelOutlined, SearchOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { anioRD, hoyRD } from '../../utils/fechaRD';

const { Title, Text } = Typography;

const COLORES = ['#1677ff','#10b981','#f59e0b','#7c3aed','#ef4444','#0891b2','#f97316','#84cc16'];

const ccApi = {
  listar:    ()                   => api.get('/centro-costos').then(r => r.data?.data ?? r.data),
  crear:     (b: any)             => api.post('/centro-costos', b).then(r => r.data?.data ?? r.data),
  actualizar:(id: number, b: any) => api.patch(`/centro-costos/${id}`, b).then(r => r.data?.data ?? r.data),
  eliminar:  (id: number)         => api.delete(`/centro-costos/${id}`).then(r => r.data?.data ?? r.data),
  reporte:   (a: number)          => api.get(`/centro-costos/reporte?anio=${a}`).then(r => r.data?.data ?? r.data),
  mensual:   (id: number, a: number) => api.get(`/centro-costos/${id}/mensual?anio=${a}`).then(r => r.data?.data ?? r.data),
  asignar:   (b: any)             => api.post('/centro-costos/asignaciones', b).then(r => r.data?.data ?? r.data),
  asignaciones:(id: number)       => api.get(`/centro-costos/${id}/asignaciones`).then(r => r.data?.data ?? r.data),
  eliminarAsig:(id: number)       => api.delete(`/centro-costos/asignaciones/${id}`).then(r => r.data?.data ?? r.data),
};

const TIPOS = [
  { value: 'ingreso', label: '📈 Ingreso',  color: '#10b981' },
  { value: 'egreso',  label: '📉 Egreso',   color: '#ef4444' },
  { value: 'ambos',   label: '📊 Ambos',    color: '#1677ff' },
];

export default function CentroCostosPage() {
  const [anio,       setAnio]       = useState(anioRD());
  const [ccModal,    setCCModal]    = useState(false);
  const [asigModal,  setAsigModal]  = useState<number | null>(null);
  const [editando,   setEditando]   = useState<any>(null);
  const [search,     setSearch]     = useState('');
  const [formCC]                    = Form.useForm();
  const [formAsig]                  = Form.useForm();
  const qc = useQueryClient();
  const { token } = theme.useToken();

  const { data: centros,  isLoading } = useQuery({ queryKey: ['cc-lista'],           queryFn: ccApi.listar });
  const { data: reporte }             = useQuery({ queryKey: ['cc-reporte', anio],   queryFn: () => ccApi.reporte(anio) });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['cc-lista'] });
    qc.invalidateQueries({ queryKey: ['cc-reporte'] });
  };

  const crearMut = useMutation({
    mutationFn: ccApi.crear,
    onSuccess: () => { inv(); setCCModal(false); formCC.resetFields(); message.success('Centro creado'); },
    onError: (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error'),
  });

  const actualizarMut = useMutation({
    mutationFn: ({ id, data }: any) => ccApi.actualizar(id, data),
    onSuccess: () => { inv(); setEditando(null); setCCModal(false); message.success('Actualizado'); },
  });

  const eliminarMut = useMutation({
    mutationFn: ccApi.eliminar,
    onSuccess: () => { inv(); message.success('Eliminado'); },
  });

  const asignarMut = useMutation({
    mutationFn: ccApi.asignar,
    onSuccess: () => { inv(); setAsigModal(null); formAsig.resetFields(); message.success('Asignación registrada'); },
  });

  const COLS_DEF = [
    { key: 'codigo',      label: 'Código' },
    { key: 'nombre',      label: 'Nombre' },
    { key: 'tipo',        label: 'Tipo' },
    { key: 'presupuesto', label: 'Presupuesto' },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('centro-costos', COLS_DEF);

  const cols = filterColumns([
    { title: 'Código',      dataIndex: 'codigo',      width: 100, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Nombre',      dataIndex: 'nombre',      ellipsis: true },
    { title: 'Tipo',        dataIndex: 'tipo',        width: 120,
      render: (v: string) => {
        const t = TIPOS.find(x => x.value === v);
        return <Tag color={t?.color}>{t?.label ?? v}</Tag>;
      }},
    { title: 'Presupuesto', dataIndex: 'presupuesto', width: 130, render: (v: number) => fmt.money(v) },
    { title: '', key: 'actions', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => { setEditando(r); formCC.setFieldsValue(r); setCCModal(true); }}
          viewLabel="Editar"
          items={[
            { key: 'eliminar', label: 'Eliminar', icon: <DeleteOutlined />, danger: true,
              onClick: () => Modal.confirm({
                title: '¿Eliminar este centro de costo?',
                okText: 'Confirmar',
                cancelText: 'Cancelar',
                okButtonProps: { danger: true },
                onOk: () => eliminarMut.mutate(r.id),
              }) },
          ]}
        />
      )},
  ]);

  const centrosFiltrados = useMemo(() =>
    (centros ?? []).filter((i: any) =>
      String(i.nombre ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.codigo ?? '').toLowerCase().includes(search.toLowerCase())
    ), [centros, search]);

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <ApartmentOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Centro de Costos
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Clasifica ingresos y gastos por departamento o proyecto
          </Text>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Input
              placeholder="Buscar por nombre o código..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: '100%', maxWidth: 220, minWidth: 0 }}
            />
            <Select value={anio} onChange={setAnio} style={{ width: 90 }}
              options={[2024, 2025, 2026].map(y => ({ value: y, label: y }))} />
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (centros ?? []).map((c: any) => ({
                'Código':    c.codigo ?? '',
                'Nombre':    c.nombre ?? '',
                'Tipo':      c.tipo ?? '',
                'Responsable': c.responsable?.nombre ?? '',
                'Presupuesto': Number(c.presupuestoAnual ?? 0),
                'Activo':    c.activo !== false ? 'Sí' : 'No',
              }));
              exportarExcel(filas, 'Centros-de-Costo');
            }}>Excel</Button>
            <RefreshByKeyButton queryKey={['centro-costos']} />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => { setEditando(null); formCC.resetFields(); setCCModal(true); }}>
              Nuevo centro
            </Button>
          </Space>
        </Col>
      </Row>

      <Tabs items={[
        // ── Centros ───────────────────────────────────────────────────────────
        {
          key: 'centros',
          label: '🏢 Centros',
          children: (
            <Card>
              <Table columns={cols} dataSource={centrosFiltrados} rowKey="id"
                loading={isLoading} size="small"
        scroll={{ x: 'max-content' }} pagination={false} />
            </Card>
          ),
        },

        // ── Reporte ejecutado vs presupuesto ──────────────────────────────────
        {
          key: 'reporte',
          label: '📊 Reporte anual',
          children: reporte ? (
            <>
              <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={12} md={6}>
                  <Card size="small">
                    <Statistic title="Total presupuestado" value={reporte.totalPresupuesto}
                      formatter={v => fmt.money(Number(v))} />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small">
                    <Statistic title="Total ejecutado" value={reporte.totalEjecutado}
                      formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#ef4444' }} />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small">
                    <Statistic title="Disponible"
                      value={reporte.totalPresupuesto - reporte.totalEjecutado}
                      formatter={v => fmt.money(Number(v))} valueStyle={{ color: '#10b981' }} />
                  </Card>
                </Col>
                <Col xs={12} md={6}>
                  <Card size="small">
                    <Statistic title="% Ejecución"
                      value={reporte.totalPresupuesto > 0
                        ? Math.round((reporte.totalEjecutado / reporte.totalPresupuesto) * 100)
                        : 0}
                      suffix="%" />
                  </Card>
                </Col>
              </Row>

              {/* Barras comparativas */}
              <Card title="Presupuesto vs Ejecutado" style={{ marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={reporte.centros.map((c: any) => ({
                    nombre:       c.nombre.length > 18 ? c.nombre.slice(0, 18) + '…' : c.nombre,
                    Presupuesto:  c.presupuesto,
                    Ejecutado:    c.ejecutado,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nombre" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt.money(v)} />
                    <Bar dataKey="Presupuesto" fill="#e2e8f0" radius={[4,4,0,0]} />
                    <Bar dataKey="Ejecutado"   fill="#1677ff" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Detalle por centro */}
              {reporte.centros.map((c: any, i: number) => (
                <Card key={c.id} size="small" style={{ marginBottom: 12 }}
                  title={
                    <Space>
                      <Text code>{c.codigo}</Text>
                      <Text strong>{c.nombre}</Text>
                      <Tag color={TIPOS.find(t => t.value === c.tipo)?.color}>
                        {TIPOS.find(t => t.value === c.tipo)?.label}
                      </Tag>
                    </Space>
                  }
                  extra={
                    <Button size="small" icon={<PlusOutlined />}
                      onClick={() => { setAsigModal(c.id); formAsig.setFieldsValue({ centroCostoId: c.id }); }}>
                      Asignar
                    </Button>
                  }
                >
                  <Row align="middle" gutter={16}>
                    <Col xs={24} md={6}>
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Ejecutado / Presupuesto</Text>
                        <div>
                          <Text strong style={{ color: '#1677ff' }}>{fmt.money(c.ejecutado)}</Text>
                          <Text type="secondary"> / {fmt.money(c.presupuesto)}</Text>
                        </div>
                      </div>
                      <Progress
                        percent={c.porcentajeEjecutado}
                        status={c.porcentajeEjecutado > 100 ? 'exception' : 'normal'}
                        size="small"
                        format={p => `${p}%`}
                      />
                    </Col>
                    <Col xs={24} md={18}>
                      {c.desglose?.length > 0 && (
                        <Row gutter={8}>
                          {c.desglose.map((d: any, di: number) => (
                            <Col key={di}>
                              <Tag color={COLORES[di % COLORES.length]}>
                                {d.tipo}: {fmt.money(Number(d.total))} ({d.cantidad})
                              </Tag>
                            </Col>
                          ))}
                        </Row>
                      )}
                    </Col>
                  </Row>
                </Card>
              ))}
            </>
          ) : null,
        },
      ]} />

      {/* Modal crear/editar centro */}
      <Modal
        title={editando ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo'}
        open={ccModal} onCancel={() => { setCCModal(false); setEditando(null); formCC.resetFields(); }}
        footer={null} width={480}
      >
        <Form form={formCC} layout="vertical"
          initialValues={{ tipo: 'ambos', presupuesto: 0 }}
          onFinish={v => editando
            ? actualizarMut.mutate({ id: editando.id, data: v })
            : crearMut.mutate(v)}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="codigo" label="Código" rules={[{ required: true }]}><Input placeholder="CC-01" /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input placeholder="Ventas, Administración, Producción..." /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="tipo" label="Tipo"><Select options={TIPOS} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="presupuesto" label="Presupuesto anual (RD$)">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="descripcion" label="Descripción"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setCCModal(false)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={crearMut.isPending || actualizarMut.isPending}>
              {editando ? 'Guardar' : 'Crear'}
            </Button></Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal asignar documento */}
      <Modal title="Asignar a Centro de Costo" open={!!asigModal}
        onCancel={() => setAsigModal(null)} footer={null} width={440}>
        <Form form={formAsig} layout="vertical"
          initialValues={{ porcentaje: 100, tipoDocumento: 'gasto' }}
          onFinish={v => asignarMut.mutate({ ...v, centroCostoId: asigModal, fecha: v.fecha || hoyRD() })}>
          <Form.Item name="tipoDocumento" label="Tipo de documento">
            <Select options={[
              { value: 'factura', label: '🧾 Factura' },
              { value: 'gasto',   label: '💸 Gasto' },
              { value: 'compra',  label: '🛒 Compra' },
              { value: 'nomina',  label: '👷 Nómina' },
            ]} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="documentoId" label="ID del documento" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="monto" label="Monto (RD$)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="porcentaje" label="% asignado">
              <InputNumber style={{ width: '100%' }} min={1} max={100} />
            </Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item></Col>
            <Col span={24}><Form.Item name="nota" label="Nota (opcional)"><Input /></Form.Item></Col>
          </Row>
          <Row justify="end" gutter={8}>
            <Col><Button onClick={() => setAsigModal(null)}>Cancelar</Button></Col>
            <Col><Button type="primary" htmlType="submit" loading={asignarMut.isPending}>Asignar</Button></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
