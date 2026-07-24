import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import { Table, Tag, Button, Row, Col, Typography, Space, Modal, Form, Input, InputNumber, Select, DatePicker, message, Descriptions, Drawer } from 'antd';
import { PlusOutlined, CheckOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons';
import { TableActions } from '../../components/ui/TableActions';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contabilidadApi, type AsientoPayload, type AsientoLineaPayload } from '../../api/contabilidad.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Text } = Typography;

// ── Asientos Contables ─────────────────────────────────────────────────────────
function Asientos() {
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [open,       setOpen]       = useState(false);
  const [detail,     setDetail]     = useState<any>(null);
  const [desde,      setDesde]      = useState('');
  const [hasta,      setHasta]      = useState('');
  const [estadoFilt, setEstadoFilt] = useState<string | undefined>();
  const [tipoFilt,   setTipoFilt]   = useState<string | undefined>();
  const [lineas, setLineas] = useState<AsientoLineaPayload[]>([
    { cuentaContableId: 0, descripcion: '', debe: 0, haber: 0 },
    { cuentaContableId: 0, descripcion: '', debe: 0, haber: 0 },
  ]);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: asientos, isLoading } = useQuery({
    queryKey: ['asientos', page, desde, hasta, estadoFilt, tipoFilt],
    queryFn: () => contabilidadApi.asientos(page, 15, estadoFilt, desde || undefined, hasta || undefined, tipoFilt),
  });
  const { data: cuentas } = useQuery({ queryKey: ['cuentas-sel'], queryFn: () => contabilidadApi.cuentas(true) });

  const createMut = useMutation({
    mutationFn: contabilidadApi.createAsiento,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asientos'] }); setOpen(false); form.resetFields(); message.success('Asiento creado'); },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error — verifica que cuadre'),
  });

  const contabilizarMut = useMutation({
    mutationFn: contabilidadApi.contabilizar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asientos'] }); message.success('Asiento contabilizado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al contabilizar'),
  });

  const anularMut = useMutation({
    mutationFn: contabilidadApi.anularAsiento,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['asientos'] }); setDetail(null); message.success('Asiento anulado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al anular'),
  });

  const estadoColor: Record<string, string> = { borrador: 'default', contabilizado: 'green', anulado: 'red' };
  const totalDebe  = lineas.reduce((s, l) => s + (l.debe  || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (l.haber || 0), 0);
  const cuadra = Math.abs(totalDebe - totalHaber) < 0.01;

  const COLS_DEF = [
    { key: 'numero',      label: 'Número',      defaultVisible: true  },
    { key: 'fecha',       label: 'Fecha',       defaultVisible: true  },
    { key: 'descripcion', label: 'Descripción', defaultVisible: true  },
    { key: 'tipoOrigen',  label: 'Tipo',        defaultVisible: false },
    { key: 'totalDebe',   label: 'Debe',        defaultVisible: true  },
    { key: 'totalHaber',  label: 'Haber',       defaultVisible: true  },
    { key: 'estado',      label: 'Estado',      defaultVisible: true  },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('asientos', COLS_DEF);

  const cols = filterColumns([
    { title: 'Número',      dataIndex: 'numero',       key: 'numero',      width: 170 },
    { title: 'Fecha',       dataIndex: 'fecha',        key: 'fecha',       width: 100, render: (v: string) => fmt.date(v) },
    { title: 'Descripción', dataIndex: 'descripcion',  key: 'descripcion', ellipsis: true },
    { title: 'Tipo',        dataIndex: 'tipoOrigen',   key: 'tipoOrigen',  width: 100,
      render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Debe',        dataIndex: 'totalDebe',    key: 'totalDebe',   width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Haber',       dataIndex: 'totalHaber',   key: 'totalHaber',  width: 120, render: (v: number) => fmt.money(v) },
    { title: 'Estado',      dataIndex: 'estado',       key: 'estado',      width: 110,
      render: (v: string) => <Tag color={estadoColor[v]}>{v?.toUpperCase()}</Tag> },
    { title: '', key: 'actions', width: 72, align: 'right' as const,
      render: (_: any, r: any) => (
        <TableActions
          onView={() => setDetail(r)}
          viewLabel="Ver detalle"
          items={r.estado === 'borrador' ? [
            { key: 'contabilizar', label: 'Contabilizar', icon: <CheckOutlined />, onClick: () => contabilizarMut.mutate(r.id) },
          ] : []}
        />
      ),
    },
  ]);

  const handleSubmit = (values: { fecha: dayjs.Dayjs; descripcion: string }) => {
    const payload: AsientoPayload = {
      fecha: values.fecha.format('YYYY-MM-DD'),
      descripcion: values.descripcion,
      lineas: lineas.filter(l => l.cuentaContableId > 0),
    };
    createMut.mutate(payload);
  };

  return (
    <>
      <Row gutter={[8, 8]} align="middle" style={{ marginBottom: 12 }}>
        <Col xs={24} sm={12} md={6}>
          <Input
            placeholder="Buscar por número o descripción..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
          />
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Input type="date" value={desde} style={{ width: '100%' }}
            onChange={e => { setDesde(e.target.value); setPage(1); }} />
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Input type="date" value={hasta} style={{ width: '100%' }}
            onChange={e => { setHasta(e.target.value); setPage(1); }} />
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Select style={{ width: '100%' }} placeholder="Estado" allowClear
            value={estadoFilt} onChange={v => { setEstadoFilt(v); setPage(1); }}>
            <Select.Option value="borrador">Borrador</Select.Option>
            <Select.Option value="contabilizado">Contabilizado</Select.Option>
            <Select.Option value="anulado">Anulado</Select.Option>
          </Select>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Select style={{ width: '100%' }} placeholder="Tipo" allowClear
            value={tipoFilt} onChange={v => { setTipoFilt(v); setPage(1); }}>
            <Select.Option value="manual">Manual</Select.Option>
            <Select.Option value="factura">Factura</Select.Option>
            <Select.Option value="compra">Compra</Select.Option>
            <Select.Option value="nomina">Nómina</Select.Option>
            <Select.Option value="ajuste">Ajuste</Select.Option>
          </Select>
        </Col>
        <Col xs={24} sm="auto" style={{ marginLeft: 'auto' }}>
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = (asientos?.data ?? []).map((a: any) => ({
                'Número':      a.numero ?? '',
                'Fecha':       a.fecha ? fmt.date(a.fecha) : '',
                'Descripción': a.descripcion ?? '',
                'Tipo':        a.tipoOrigen ?? '',
                'Debe':        Number(a.totalDebe ?? 0),
                'Haber':       Number(a.totalHaber ?? 0),
                'Estado':      a.estado ?? '',
              }));
              exportarExcel(filas, `Asientos-${new Date().toISOString().split('T')[0]}`);
              message.success(`${filas.length} asientos exportados`);
            }}>Excel</Button>
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
            <RefreshByKeyButton queryKey={['asientos']} />
            <VideoTutorialButton />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nuevo asiento manual</Button>
          </Space>
        </Col>
      </Row>
      <Table columns={cols}
        dataSource={(asientos?.data ?? []).filter((a: any) => {
          if (!search) return true;
          const s = search.toLowerCase();
          return a.numero?.toLowerCase().includes(s) || a.descripcion?.toLowerCase().includes(s);
        })}
        rowKey="id" loading={isLoading} size="small"
        scroll={{ x: 'max-content' }}
        pagination={{ total: asientos?.meta?.total, pageSize: 15, current: page, onChange: setPage, showSizeChanger: false }} />

      {/* Crear asiento */}
      <Modal title="Nuevo Asiento Contable" open={open} onCancel={() => setOpen(false)} footer={null} width={820}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}
          initialValues={{ fecha: dayjs() }}>
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="descripcion" label="Descripción" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Table size="small"
        scroll={{ x: 'max-content' }} pagination={false}
            dataSource={lineas.map((l, i) => ({ ...l, key: i }))}
            columns={[
              { title: 'Cuenta', key: 'cuenta', width: 220,
                render: (_: any, _r: any, idx: number) => (
                  <Select style={{ width: '100%' }} showSearch
                    filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                    options={cuentas?.map((c: any) => ({ value: c.id, label: `${c.codigo} — ${c.nombre}` }))}
                    onChange={(v) => { const u = [...lineas]; u[idx].cuentaContableId = v; setLineas(u); }} />
                )},
              { title: 'Descripción', key: 'desc', width: 170,
                render: (_: any, r: any, idx: number) => (
                  <Input value={r.descripcion} onChange={e => { const u=[...lineas]; u[idx].descripcion=e.target.value; setLineas(u); }} />
                )},
              { title: 'Debe', key: 'debe', width: 110,
                render: (_: any, r: any, idx: number) => (
                  <InputNumber min={0} precision={2} value={r.debe} style={{ width:'100%' }}
                    onChange={v => { const u=[...lineas]; u[idx].debe=v??0; u[idx].haber=0; setLineas(u); }} />
                )},
              { title: 'Haber', key: 'haber', width: 110,
                render: (_: any, r: any, idx: number) => (
                  <InputNumber min={0} precision={2} value={r.haber} style={{ width:'100%' }}
                    onChange={v => { const u=[...lineas]; u[idx].haber=v??0; u[idx].debe=0; setLineas(u); }} />
                )},
              { title: '', key: 'del', width: 40,
                render: (_: any, _r: any, idx: number) => (
                  <Button type="text" danger size="small" onClick={() => setLineas(lineas.filter((_, i) => i !== idx))}>×</Button>
                )},
            ]} />
          <Row justify="space-between" align="middle" style={{ marginTop: 8 }}>
            <Button onClick={() => setLineas([...lineas, { cuentaContableId: 0, descripcion: '', debe: 0, haber: 0 }])}>
              + Línea
            </Button>
            <Space>
              <Text>Debe: {fmt.money(totalDebe)}</Text>
              <Text>Haber: {fmt.money(totalHaber)}</Text>
              <Tag color={cuadra ? 'green' : 'red'}>{cuadra ? '✓ Cuadra' : '✗ No cuadra'}</Tag>
            </Space>
            <Button type="primary" htmlType="submit" disabled={!cuadra} loading={createMut.isPending}>Guardar</Button>
          </Row>
        </Form>
      </Modal>

      {/* Detalle asiento */}
      <Drawer
        title={`Asiento ${detail?.numero}`}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={700}
        extra={
          detail && (
            <Space>
              {detail.referenciaFolio && (
                <Tag color="blue">Ref: {detail.referenciaFolio}</Tag>
              )}
              {detail.estado === 'contabilizado' && (
                <Button danger size="small" loading={anularMut.isPending}
                  onClick={() => anularMut.mutate(detail.id)}>
                  Anular
                </Button>
              )}
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Fecha">{fmt.date(detail.fecha)}</Descriptions.Item>
              <Descriptions.Item label="Estado"><Tag color={estadoColor[detail.estado]}>{detail.estado?.toUpperCase()}</Tag></Descriptions.Item>
              <Descriptions.Item label="Descripción" span={2}>{detail.descripcion}</Descriptions.Item>
              <Descriptions.Item label="Total Debe">{fmt.money(detail.totalDebe)}</Descriptions.Item>
              <Descriptions.Item label="Total Haber">{fmt.money(detail.totalHaber)}</Descriptions.Item>
              {detail.referenciaFolio && (
                <Descriptions.Item label="Documento origen" span={2}>
                  <Text code>{detail.referenciaFolio}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>
            <Table size="small"
              scroll={{ x: 'max-content' }} pagination={false}
              dataSource={detail.lineas ?? []} rowKey="id"
              columns={[
                { title: 'Cuenta', key: 'cta', ellipsis: true, render: (_: any, r: any) => `${r.cuentaContable?.codigo} — ${r.cuentaContable?.nombre}` },
                { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
                { title: 'Debe',  dataIndex: 'debe',  width: 120, align: 'right' as const, render: (v: number) => v > 0 ? fmt.money(v) : '' },
                { title: 'Haber', dataIndex: 'haber', width: 120, align: 'right' as const, render: (v: number) => v > 0 ? fmt.money(v) : '' },
              ]} />
          </>
        )}
      </Drawer>
    </>
  );
}

export default function ContabilidadPage() {
  const { bloqueado, config, plan } = usePlanGuard();
  if (bloqueado && config) return <ModuloBloqueado modulo="Contabilidad General" planMinimo={config.planMinimo} planActual={plan} />;
  return <Asientos />;
}
