import { useState, useMemo } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input,
  InputNumber, Switch, Space, Typography, message,
  Progress, Divider, theme,
} from 'antd';
import {
  StarOutlined, GiftOutlined, TrophyOutlined, SettingOutlined,
  PlusOutlined, HistoryOutlined, FileExcelOutlined, SearchOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { TableActions } from '../../components/ui/TableActions';

const { Title, Text } = Typography;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 }).format(v ?? 0);

export default function FidelidadPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();
  const [search, setSearch]             = useState('');
  const [modalConfig,  setModalConfig]  = useState(false);
  const [modalCanje,   setModalCanje]   = useState<any>(null);
  const [clienteQuery, setClienteQuery] = useState('');
  const [formConfig] = Form.useForm();
  const [formCanje]  = Form.useForm();

  const { data: resumen } = useQuery<any>({
    queryKey: ['fidelidad-resumen'],
    queryFn:  () => api.get('/fidelidad/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: ranking = [] } = useQuery<any[]>({
    queryKey: ['fidelidad-ranking'],
    queryFn:  () => api.get('/fidelidad/ranking?limit=20').then((r: any) => r.data?.data ?? r.data),
  });

  const actualizarPrograma = useMutation({
    mutationFn: (dto: any) => api.patch('/fidelidad/programa', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fidelidad-resumen'] });
      setModalConfig(false);
      message.success('Programa actualizado');
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error al actualizar el programa'),
  });

  const canjear = useMutation({
    mutationFn: ({ clienteId, puntos }: { clienteId: number; puntos: number }) =>
      api.post(`/fidelidad/cliente/${clienteId}/canjear`, { puntos }),
    onSuccess: (res: any) => {
      // Invalidaciones separadas — una key combinada no matchea queries individuales
      qc.invalidateQueries({ queryKey: ['fidelidad-ranking'] });
      qc.invalidateQueries({ queryKey: ['fidelidad-resumen'] });
      setModalCanje(null);
      formCanje.resetFields();
      const descuento = res.data?.data?.descuentoRD ?? res.data?.descuentoRD ?? 0;
      message.success(`¡Canje exitoso! Descuento: ${fmt(descuento)}`);
    },
    onError: (e: any) => message.error(e?.response?.data?.errors?.[0] ?? (e as any)?.friendlyMessage ?? 'Error al canjear'),
  });

  const prog = resumen?.programa;

  const abrirConfig = () => {
    if (prog) formConfig.setFieldsValue(prog);
    setModalConfig(true);
  };

  const rankingFiltrado = useMemo(() =>
    ranking.filter((r: any) =>
      String(r.clienteNombre ?? '').toLowerCase().includes(search.toLowerCase()) ||
      String(r.codigo ?? '').toLowerCase().includes(search.toLowerCase())
    ), [ranking, search]);

  const maxPuntos = Math.max(...ranking.map((r: any) => Number(r.puntosDisponibles)), 1);

  const COLS_DEF = [
    { key: 'rank',             label: '#',                defaultVisible: true  },
    { key: 'clienteNombre',    label: 'Cliente',          defaultVisible: true  },
    { key: 'puntosDisponibles',label: 'Puntos Disponibles', defaultVisible: true },
    { key: 'puntosTotales',    label: 'Total Acumulados', defaultVisible: true  },
    { key: 'puntosCanjeados',  label: 'Canjeados',        defaultVisible: false },
  ];
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('fidelidad-ranking', COLS_DEF);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StarOutlined style={{ fontSize: 28, color: '#f59e0b' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Programa de Fidelidad</Title>
            <Text type="secondary">Puntos por compra · Canje por descuentos · Retención de clientes</Text>
          </div>
        </div>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => {
            const filas = ranking.map((r: any) => ({
              'Cliente':    r.cliente?.nombre ?? r.clienteNombre ?? '',
              'Puntos Disp.':Number(r.puntosDisponibles ?? 0),
              'Puntos Total':Number(r.puntosAcumulados ?? 0),
              'Canjeados':  Number(r.puntosCanjeados ?? 0),
              'Nivel':      r.nivel ?? '',
              'Compras':    Number(r.totalCompras ?? 0),
            }));
            exportarExcel(filas, 'Fidelidad-Ranking');
          }}>Excel</Button>
            <RefreshByKeyButton queryKey={['fidelidad']} />
            <VideoTutorialButton />
            <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <Button icon={<SettingOutlined />} onClick={abrirConfig}>Configurar</Button>
        </Space>
      </div>

      {/* Configuración rápida del programa */}
      {prog && (
        <Card bordered={false} style={{ borderRadius: 10, marginBottom: 16, background: token.colorFillAlter }}>
          <Row gutter={24} align="middle">
            <Col>
              <Tag color={prog.activo ? 'green' : 'red'} style={{ fontSize: 12 }}>
                {prog.activo ? '✅ Programa Activo' : '❌ Programa Inactivo'}
              </Tag>
            </Col>
            <Col><Text type="secondary" style={{ fontSize: 12 }}>Acumula:</Text> <Text strong>{prog.puntosPorDOP} punto(s) por cada RD$ 1</Text></Col>
            <Col><Text type="secondary" style={{ fontSize: 12 }}>Mínimo canje:</Text> <Text strong>{prog.minimoCanjePoints} puntos</Text></Col>
            <Col><Text type="secondary" style={{ fontSize: 12 }}>1 punto =</Text> <Text strong>RD$ {prog.valorPorPunto}</Text></Col>
            <Col><Text type="secondary" style={{ fontSize: 12 }}>Vencen en:</Text> <Text strong>{prog.diasVencimiento > 0 ? `${prog.diasVencimiento} días` : 'Nunca'}</Text></Col>
          </Row>
        </Card>
      )}

      {/* Ranking */}
      <Card bordered={false} style={{ borderRadius: 12 }} title={<Space><TrophyOutlined style={{ color: '#f59e0b' }} />Top Clientes por Puntos</Space>}
        extra={
          <Input
            placeholder="Buscar por cliente o código..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
        }
      >
        <Table
          dataSource={rankingFiltrado}
          rowKey="id"
          size="small"
        scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 15 }}
          columns={filterColumns([
            {
              title: '#', key: 'rank',
              render: (_, __, i) => (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: i < 3 ? ['#fbbf24','#94a3b8','#d97706'][i] : token.colorFillAlter,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 12, color: i < 3 ? '#fff' : token.colorText,
                }}>
                  {i + 1}
                </div>
              ),
              width: 50,
            },
            { title: 'Cliente', dataIndex: 'clienteNombre', key: 'clienteNombre', render: v => <Text strong>{v ?? `Cliente #${v}`}</Text> },
            {
              title: 'Puntos Disponibles', dataIndex: 'puntosDisponibles', key: 'puntosDisponibles',
              render: (v, r: any) => (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text strong style={{ color: '#f59e0b' }}>{Number(v).toLocaleString('es-DO')} pts</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      ≈ {fmt(Number(v) * Number(prog?.valorPorPunto ?? 1))}
                    </Text>
                  </div>
                  <Progress
                    percent={Math.round((Number(v) / maxPuntos) * 100)}
                    showInfo={false} size="small"
                    strokeColor={{ '0%': '#f59e0b', '100%': '#fbbf24' }}
                  />
                </div>
              ),
            },
            { title: 'Total Acumulados', dataIndex: 'puntosTotales', key: 'puntosTotales', align: 'right', render: v => Number(v).toLocaleString('es-DO') },
            { title: 'Canjeados', dataIndex: 'puntosCanjeados', key: 'puntosCanjeados', align: 'right', render: v => Number(v).toLocaleString('es-DO') },
            {
              title: '', key: 'acciones', width: 72, align: 'right' as const,
              render: (_: any, r: any) => Number(r.puntosDisponibles) >= (prog?.minimoCanjePoints ?? 100) ? (
                <TableActions
                  onView={() => { setModalCanje(r); formCanje.resetFields(); }}
                  viewLabel="Canjear puntos"
                  items={[]}
                />
              ) : null,
            },
          ])}
        />
      </Card>

      {/* Modal Configuración */}
      <Modal title={<Space><SettingOutlined />Configurar Programa de Puntos</Space>}
        open={modalConfig} onCancel={() => setModalConfig(false)}
        onOk={() => formConfig.submit()} confirmLoading={actualizarPrograma.isPending}
        okText="Guardar" width={480} destroyOnClose>
        <Form form={formConfig} layout="vertical" onFinish={v => actualizarPrograma.mutate(v)}>
          <Form.Item name="nombre" label="Nombre del Programa"><Input /></Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="puntosPorDOP" label="Puntos por cada RD$ 1 gastado">
                <InputNumber min={0.01} precision={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="minimoCanjePoints" label="Mínimo para canjear (pts)">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="valorPorPunto" label="Valor de 1 punto (RD$)">
                <InputNumber min={0.01} precision={4} style={{ width: '100%' }} prefix="RD$" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="diasVencimiento" label="Vencimiento (días, 0=nunca)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="activo" label="Programa activo" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Canje */}
      <Modal title={<Space><GiftOutlined />Canjear Puntos — {modalCanje?.clienteNombre}</Space>}
        open={!!modalCanje} onCancel={() => setModalCanje(null)}
        onOk={() => formCanje.submit()} confirmLoading={canjear.isPending}
        okText="Confirmar Canje" okButtonProps={{ style: { background: '#f59e0b', borderColor: '#f59e0b' } }}
        destroyOnClose>
        {modalCanje && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Disponibles: </Text>
            <Text strong style={{ color: '#f59e0b' }}>{Number(modalCanje.puntosDisponibles).toLocaleString('es-DO')} puntos</Text>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>≈ </Text>
            <Text strong>{fmt(Number(modalCanje.puntosDisponibles) * Number(prog?.valorPorPunto ?? 1))}</Text>
          </div>
        )}
        <Form form={formCanje} layout="vertical"
          onFinish={v => canjear.mutate({ clienteId: modalCanje?.clienteId, puntos: Number(v.puntos) })}>
          <Form.Item name="puntos" label="Puntos a canjear" rules={[{ required: true }]}>
            <InputNumber min={prog?.minimoCanjePoints ?? 100} max={Number(modalCanje?.puntosDisponibles ?? 0)} style={{ width: '100%' }} size="large" />
          </Form.Item>
          {formCanje.getFieldValue('puntos') > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Descuento generado: <Text strong style={{ color: token.colorSuccess }}>
                {fmt((formCanje.getFieldValue('puntos') ?? 0) * Number(prog?.valorPorPunto ?? 1))}
              </Text>
            </Text>
          )}
        </Form>
      </Modal>
    </div>
  );
}
