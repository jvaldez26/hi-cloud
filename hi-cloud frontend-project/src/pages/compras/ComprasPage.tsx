import { useState, useCallback } from 'react';
import {
  Table, Button, Tag, Space, Typography, Card, Row, Col,
  Popconfirm, message, Dropdown, Input, Select, DatePicker, Statistic, theme,
  Modal, Tooltip,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DownOutlined, SearchOutlined,
  FileExcelOutlined, FilterOutlined, MailOutlined, FilePdfOutlined,
  LoadingOutlined, AuditOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { comprasApi } from '../../api/compras.api';
import api from '../../api/client';
import { ecfApi } from '../../api/ecf.api';
import { exportarExcel } from '../../utils/exportExcel';
import type { Compra, CompraEstado } from '../../types';
import { fmt, estadoColor } from '../../utils/formatters';
import EcfResultModal from '../../components/ui/EcfResultModal';
import EcfBadge, { type EstadoEcf } from '../../components/ui/EcfBadge';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const ESTADOS_COMPRA: CompraEstado[] = ['borrador', 'recibida', 'pagada', 'cancelada'];

const TRANSICIONES: Record<CompraEstado, CompraEstado[]> = {
  borrador:  ['recibida', 'cancelada'],
  recibida:  ['pagada',   'cancelada'],
  pagada:    [],
  cancelada: [],
};

const TRANS_LABEL: Record<string, string> = {
  recibida: '📦 Recibir mercancía',
  pagada:   '✅ Marcar pagada',
  cancelada: '❌ Cancelar',
};

export default function ComprasPage() {
  const { token } = theme.useToken();
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [estado, setEstado]     = useState<string | undefined>();
  const [rango, setRango]       = useState<[Dayjs, Dayjs] | null>(null);
  const [emailCompra, setEmailCompra] = useState<any>(null);
  const [emailDest,   setEmailDest]   = useState('');
  const [ecfEncf,     setEcfEncf]     = useState<string | null>(null);

  const filters = {
    search: search || undefined,
    estado,
    desde: rango?.[0].format('YYYY-MM-DD'),
    hasta: rango?.[1].format('YYYY-MM-DD'),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['compras', page, filters],
    refetchOnMount: 'always',
    queryFn:  () => comprasApi.list(page, 15, filters),
  });

  const rows = data?.data ?? [];
  const [pdfPending, setPdfPending] = useState<number | null>(null);

  const descargarPDF = async (compra: Compra) => {
    setPdfPending(compra.id);
    try {
      const token = localStorage.getItem('access_token') ?? '';
      const eid   = localStorage.getItem('empresaId') ?? '';
      const res   = await fetch(`/api/v1/compras/${compra.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Empresa-ID': eid },
      });
      if (!res.ok) throw new Error('Error PDF');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(compra as any).folio}.pdf`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch { message.error('No se pudo generar el PDF'); }
    finally { setPdfPending(null); }
  };
  const totalPag = rows.reduce((s, c) => s + Number(c.total ?? 0), 0);

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: CompraEstado }) =>
      comprasApi.cambiarEstado(id, estado),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); message.success('Estado actualizado'); },
    onError:   (e: any) => message.error(e?.response?.data?.errors?.[0] ?? 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: comprasApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras'] }); message.success('Compra eliminada'); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'No se puede eliminar'),
  });

  const emitirEcfE41 = useMutation({
    mutationFn: (id: number) => ecfApi.emitirEcfCompra(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['compras'] });
      if (res?.encf) setEcfEncf(res.encf);
    },
    onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al emitir e-CF E41',
    ),
  });

  const emailMut = useMutation({
    mutationFn: ({ id, email }: { id: number; email: string }) =>
      api.post(`/notificaciones/compra/${id}/enviar`, { email }).then(r => r.data?.data ?? r.data),
    onSuccess: (_, v) => { setEmailCompra(null); setEmailDest(''); message.success(`Orden enviada a ${v.email}`); },
    onError:   (e: any) => message.error((e as any)?.friendlyMessage ?? 'Error al enviar'),
  });

  const handleExcel = useCallback(async () => {
    const all = await comprasApi.list(1, 1000, filters);
    const filas = (all?.data ?? []).map((c: Compra) => ({
      'Folio':      c.folio,
      'Fecha':      c.fecha ? dayjs(c.fecha).format('DD/MM/YYYY') : '',
      'Proveedor':  (c as any).proveedor?.nombre ?? '',
      'RNC':        (c as any).proveedor?.rnc ?? '',
      'Subtotal':   Number(c.subtotal ?? 0),
      'ITBIS':      Number(c.itbis ?? 0),
      'Total':      Number(c.total ?? 0),
      'Estado':     c.estado,
    }));
    exportarExcel(filas, `Compras-${dayjs().format('YYYY-MM-DD')}`);
    message.success(`${filas.length} compras exportadas`);
  }, [filters]);

  const limpiar = () => { setSearch(''); setEstado(undefined); setRango(null); setPage(1); };
  const hayFiltros = !!(search || estado || rango);

  const columns = [
    {
      title: 'Folio', dataIndex: 'folio', width: 140, fixed: 'left' as const,
      render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Fecha', dataIndex: 'fecha', width: 88,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{fmt.date(v)}</Text>,
    },
    {
      title: 'Proveedor', dataIndex: ['proveedor', 'nombre'], ellipsis: true, minWidth: 120,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Subtotal', dataIndex: 'subtotal', width: 105, align: 'right' as const,
      responsive: ['lg'] as any,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt.money(v)}</Text>,
    },
    {
      title: 'ITBIS', dataIndex: 'itbis', width: 90, align: 'right' as const,
      responsive: ['xl'] as any,
      render: (v: number) => <Text style={{ fontSize: 12 }}>{fmt.money(v)}</Text>,
    },
    {
      title: 'Total', dataIndex: 'total', width: 110, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: token.colorPrimary }}>{fmt.money(v)}</Text>,
    },
    {
      title: 'Estado', dataIndex: 'estado', width: 90,
      render: (v: CompraEstado) => (
        <Tag color={estadoColor[v]} style={{ fontSize: 11, fontWeight: 600, margin: 0 }}>
          {v.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'e-CF', key: 'ecf', width: 120,
      render: (_: unknown, r: Compra) => {
        const ecfNum   = (r as any).ecfNumero;
        const ecfEst   = (r as any).ecfEstado;
        if (!ecfNum) return null;
        return <EcfBadge estado={(ecfEst ?? 'pendiente') as EstadoEcf} encf={ecfNum} small />;
      },
    },
    {
      title: '', key: 'actions', width: 110, align: 'right' as const,
      render: (_: unknown, r: Compra) => {
        const sigs = TRANSICIONES[r.estado];
        const items = sigs.map(s => ({
          key: s,
          label: TRANS_LABEL[s] ?? s,
          danger: s === 'cancelada',
          onClick: () => estadoMut.mutate({ id: r.id, estado: s }),
        }));
        return (
          <Space size={4}>
            <Button size="small" type="text" icon={<EyeOutlined />}
              onClick={() => navigate(`/compras/${r.id}`)} />
            <Tooltip title="Descargar PDF">
              <Button size="small" type="text"
                icon={pdfPending === r.id ? <LoadingOutlined /> : <FilePdfOutlined />}
                disabled={pdfPending === r.id}
                onClick={() => descargarPDF(r)}
              />
            </Tooltip>
            <Tooltip title="Enviar por email al proveedor">
              <Button size="small" type="text" icon={<MailOutlined />}
                onClick={() => {
                  setEmailCompra(r);
                  setEmailDest((r as any).proveedor?.email ?? '');
                }}
              />
            </Tooltip>
            {items.length > 0 && (
              <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
                <Button size="small" icon={<DownOutlined style={{ fontSize: 10 }} />} />
              </Dropdown>
            )}
            {(r.estado === 'recibida' || r.estado === 'pagada') && !(r as any).ecfNumero && (
              <Popconfirm
                title="¿Emitir e-CF E41 (Comprobante de Compras)?"
                description="Se enviará a la DGII vía tu proveedor e-CF. El proveedor debe tener RNC registrado."
                onConfirm={() => emitirEcfE41.mutate(r.id)}
                okText="Emitir E41"
                cancelText="Cancelar"
              >
                <Tooltip title="Emitir Comprobante de Compras E41">
                  <Button
                    size="small"
                    icon={<AuditOutlined />}
                    loading={emitirEcfE41.isPending}
                    style={{ color: '#7c3aed', borderColor: '#7c3aed' }}
                  />
                </Tooltip>
              </Popconfirm>
            )}
            {r.estado === 'borrador' && (
              <Popconfirm title="¿Eliminar compra?" onConfirm={() => deleteMut.mutate(r.id)}
                okText="Eliminar" okButtonProps={{ danger: true }}>
                <Button size="small" type="text" danger>✕</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Card>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Órdenes de Compra</Title>
          {data?.meta && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.meta.total.toLocaleString('es-DO')} compras{hayFiltros ? ' (filtradas)' : ''}
            </Text>
          )}
        </Col>
        <Col>
          <Space>
            <Button icon={<FileExcelOutlined />} onClick={handleExcel}>Excel</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/compras/nueva')}>
              Nueva compra
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Filtros */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }} align="middle">
        <Col xs={24} sm={10} md={8}>
          <Input
            placeholder="Buscar folio, proveedor, RNC..."
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            allowClear
          />
        </Col>
        <Col xs={24} sm={6} md={4}>
          <Select placeholder="Estado" value={estado}
            onChange={v => { setEstado(v); setPage(1); }} allowClear style={{ width: '100%' }}>
            {ESTADOS_COMPRA.map(e => (
              <Option key={e} value={e}>
                <Tag color={estadoColor[e]} style={{ margin: 0, fontSize: 11 }}>{e.toUpperCase()}</Tag>
              </Option>
            ))}
          </Select>
        </Col>
        <Col xs={24} sm={8} md={8}>
          <RangePicker value={rango} onChange={v => { setRango(v as [Dayjs, Dayjs] | null); setPage(1); }}
            format="DD/MM/YYYY" style={{ width: '100%' }} placeholder={['Desde', 'Hasta']} />
        </Col>
        {hayFiltros && (
          <Col>
            <Button type="text" size="small" icon={<FilterOutlined />} onClick={limpiar}>Limpiar</Button>
          </Col>
        )}
      </Row>

      {/* Totales rápidos */}
      {rows.length > 0 && (
        <Row gutter={[12, 0]} style={{ marginBottom: 12 }}>
          {[
            { label: 'Borradores',  count: rows.filter(c => c.estado === 'borrador').length,  color: '#d97706' },
            { label: 'Recibidas',   count: rows.filter(c => c.estado === 'recibida').length,  color: '#1677ff' },
            { label: 'Pagadas',     count: rows.filter(c => c.estado === 'pagada').length,    color: '#059669' },
            { label: 'Total página',count: '', extra: fmt.money(totalPag), color: token.colorPrimary },
          ].map(k => (
            <Col key={k.label}>
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 11 }}>{k.label}</Text>}
                value={k.extra ?? k.count}
                valueStyle={{ fontSize: 16, color: k.color, fontWeight: 700 }}
              />
            </Col>
          ))}
        </Row>
      )}

      <Table
        columns={columns} dataSource={rows} rowKey="id"
        loading={isLoading} size="small"
        onRow={r => ({ style: { cursor: 'pointer' }, onDoubleClick: () => navigate(`/compras/${r.id}`) })}
        pagination={{
          total: data?.meta.total, pageSize: 15, current: page,
          onChange: setPage, showTotal: t => `${t.toLocaleString('es-DO')} compras`,
          showSizeChanger: false, size: 'small',
        }}
      />

      {/* Modal email proveedor */}
      <Modal
        title={<><MailOutlined style={{ color: '#7c3aed', marginRight: 8 }} />Enviar orden al proveedor</>}
        open={!!emailCompra}
        onCancel={() => { setEmailCompra(null); setEmailDest(''); }}
        onOk={() => emailCompra && emailMut.mutate({ id: emailCompra.id, email: emailDest })}
        confirmLoading={emailMut.isPending}
        okText="Enviar orden"
        destroyOnClose
        width={400}
      >
        {emailCompra && (
          <div>
            <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 13 }}>
              Orden <strong>{emailCompra.folio}</strong> · Proveedor: <strong>{(emailCompra as any).proveedor?.nombre ?? '—'}</strong>
            </p>
            <Input
              prefix={<MailOutlined />}
              placeholder="correo@proveedor.com"
              value={emailDest}
              onChange={e => setEmailDest(e.target.value)}
              size="large"
            />
          </div>
        )}
      </Modal>

      <EcfResultModal encf={ecfEncf} onClose={() => setEcfEncf(null)} />
    </Card>
  );
}
