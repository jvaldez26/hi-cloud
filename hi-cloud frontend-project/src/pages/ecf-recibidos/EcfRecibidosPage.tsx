import { useState } from 'react';
import {
  Table, Button, Tag, Card, Row, Col, Typography, Upload, Modal,
  Input, Select, Space, Alert, message, Badge, Statistic, Divider,
  DatePicker, theme, Tooltip,
} from 'antd';
import {
  UploadOutlined, SearchOutlined, CheckCircleOutlined,
  CloseCircleOutlined, SyncOutlined, InboxOutlined,
  DownloadOutlined, WarningOutlined,
} from '@ant-design/icons';
import { exportarEcfRecibidos } from '../../utils/exportExcel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ecfRecibidosApi } from '../../api/ecf-recibidos.api';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const MONO: React.CSSProperties = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 };

const TIPO_ECF_LABELS: Record<string, string> = {
  '31': 'E31 — Crédito Fiscal',
  '32': 'E32 — Consumo',
  '33': 'E33 — Nota Débito',
  '34': 'E34 — Nota Crédito',
  '41': 'E41 — Compras',
  '43': 'E43 — Gastos Menores',
  '44': 'E44 — Régimen Especial',
  '45': 'E45 — Gubernamental',
  '46': 'E46 — Exportación',
  '47': 'E47 — Pago Exterior',
};

interface ImportResult {
  total: number;
  importados: number;
  actualizados: number;
  errores: number;
  detalles: Array<{ fila: number; encf?: string; estado: 'importado' | 'actualizado' | 'error'; error?: string }>;
}

export default function EcfRecibidosPage() {
  const qc = useQueryClient();
  const { token } = theme.useToken();

  const [page, setPage]               = useState(1);
  const [limit]                       = useState(20);
  const [search, setSearch]           = useState('');
  const [tipoEcf, setTipoEcf]         = useState<string | undefined>();
  const [rango, setRango]             = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showResult, setShowResult]   = useState(false);
  const [exporting, setExporting]     = useState(false);

  const desde = rango?.[0]?.format('YYYY-MM-DD');
  const hasta = rango?.[1]?.format('YYYY-MM-DD');

  const { data, isFetching } = useQuery({
    queryKey: ['ecf-recibidos', page, search, tipoEcf, desde, hasta],
    queryFn: () => ecfRecibidosApi.listar({ page, limit, desde, hasta, rncEmisor: search || undefined, tipoEcf }),
    placeholderData: (prev) => prev,
  });

  const rows: any[] = Array.isArray(data) ? data : (data?.data ?? []);
  const total: number = data?.total ?? 0;

  const importMut = useMutation({
    mutationFn: (file: File) => ecfRecibidosApi.importarCsv(file),
    onSuccess: (res: ImportResult) => {
      setImportResult(res);
      setShowResult(true);
      qc.invalidateQueries({ queryKey: ['ecf-recibidos'] });
      if (res.importados > 0 || res.actualizados > 0) {
        message.success(`${res.importados} importados, ${res.actualizados} actualizados`);
      }
      if (res.errores > 0) {
        message.warning(`${res.errores} filas con errores — revisa el detalle`);
      }
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? e?.friendlyMessage ?? 'Error al importar el CSV';
      message.error(msg, 8);
    },
  });

  // ── Exportar todo el filtro activo a Excel ───────────────────────────────
  const handleExportar = async () => {
    setExporting(true);
    try {
      const res = await ecfRecibidosApi.listar({
        desde, hasta,
        rncEmisor: search || undefined,
        tipoEcf,
        exportar: true,
      });
      const registros: any[] = Array.isArray(res) ? res : (res?.data ?? []);
      if (!registros.length) { message.warning('No hay registros para exportar con los filtros actuales'); return; }
      const sufijo = desde && hasta ? `${desde}_${hasta}` : new Date().toISOString().substring(0, 10);
      await exportarEcfRecibidos(registros, `eCF-Recibidos-${sufijo}`);
      message.success(`${registros.length} registros exportados`);
    } catch {
      message.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      title: 'e-NCF',
      dataIndex: 'encf',
      width: 160,
      fixed: 'left' as const,
      render: (v: string) => <Text style={MONO}>{v}</Text>,
    },
    {
      title: 'RNC Emisor',
      dataIndex: 'rncEmisor',
      width: 110,
      render: (v?: string) => v ? <Text style={MONO}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Emisor',
      dataIndex: 'nombreEmisor',
      ellipsis: true,
      render: (v?: string) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Fecha',
      dataIndex: 'fechaDocumento',
      width: 110,
      render: (v?: string) => v
        ? fmt.date(v)
        : (
          <Tooltip title="Fecha no disponible — re-importa este comprobante con fecha correcta">
            <Tag icon={<WarningOutlined />} color="warning" style={{ fontSize: 11 }}>Sin fecha</Tag>
          </Tooltip>
        ),
    },
    {
      title: 'Tipo',
      dataIndex: 'tipoEcf',
      width: 80,
      render: (v?: string) => v
        ? <Tag style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>E{v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Total',
      dataIndex: 'total',
      width: 120,
      align: 'right' as const,
      render: (v: number) => <Text style={MONO}>{fmt.money(v)}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (v?: string) => {
        const lower = (v ?? '').toLowerCase();
        const color = (lower === 'aceptado' || lower === 'received') ? 'green'
          : lower === 'rechazado'  ? 'red'
          : lower === 'pendiente'  ? 'orange'
          : lower === 'error'      ? 'red'
          : 'default';
        return <Tag color={color} style={{ fontSize: 11, textTransform: 'capitalize' }}>{v ?? 'received'}</Tag>;
      },
    },
    {
      title: 'Origen',
      dataIndex: 'fuenteImportacion',
      width: 80,
      render: (v?: string) => <Tag color="default" style={{ fontSize: 11 }}>{v ?? 'csv'}</Tag>,
    },
    {
      title: 'Importado',
      dataIndex: 'createdAt',
      width: 95,
      render: (v?: string) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{fmt.date(v)}</Text> : '—',
    },
  ];

  const resultCols = [
    { title: 'Fila',   dataIndex: 'fila',   width: 60 },
    { title: 'e-NCF',  dataIndex: 'encf',   width: 160,
      render: (v?: string) => v ? <Text style={MONO}>{v}</Text> : '—' },
    { title: 'Estado', dataIndex: 'estado', width: 110,
      render: (v: string) => {
        if (v === 'importado')   return <Tag color="green"   icon={<CheckCircleOutlined />}>Importado</Tag>;
        if (v === 'actualizado') return <Tag color="blue"    icon={<SyncOutlined />}>Actualizado</Tag>;
        return                          <Tag color="red"     icon={<CloseCircleOutlined />}>Error</Tag>;
      }},
    { title: 'Detalle', dataIndex: 'error', ellipsis: true,
      render: (v?: string) => v ?? <Text type="secondary">OK</Text> },
  ];

  return (
    <div style={{ padding: '16px 20px' }}>
      <Row gutter={[12, 8]} align="middle" justify="space-between" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>e-CF Recibidos</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Comprobantes electrónicos emitidos por proveedores — importados desde MSeller
          </Text>
        </Col>
        <Col>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportar}
              loading={exporting}
            >
              Exportar Excel
            </Button>
            <Upload
              accept=".csv"
              showUploadList={false}
              beforeUpload={(file) => { importMut.mutate(file); return false; }}
            >
              <Button
                type="primary"
                icon={<UploadOutlined />}
                loading={importMut.isPending}
              >
                Importar CSV
              </Button>
            </Upload>
            {importResult && (
              <Button onClick={() => setShowResult(true)}>
                Ver último resultado
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* Filtros */}
      <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: '8px 12px' }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} sm={8} md={7}>
            <Input
              placeholder="Buscar por RNC emisor..."
              prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              allowClear
              size="small"
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="Tipo e-CF"
              allowClear
              size="small"
              style={{ width: '100%' }}
              onChange={(v) => { setTipoEcf(v); setPage(1); }}
              options={Object.entries(TIPO_ECF_LABELS).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Col>
          <Col xs={24} sm={8} md={9}>
            <RangePicker
              size="small"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              placeholder={['Fecha desde', 'Fecha hasta']}
              onChange={(dates) => { setRango(dates as any); setPage(1); }}
            />
          </Col>
        </Row>
      </Card>

      {/* Tabla */}
      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: false,
          showTotal: (t) => `${t} comprobante${t !== 1 ? 's' : ''}`,
          onChange: (p) => setPage(p),
        }}
        locale={{ emptyText: (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <InboxOutlined style={{ fontSize: 36, color: token.colorTextQuaternary }} />
            <div style={{ marginTop: 8, color: token.colorTextSecondary }}>
              Sin e-CFs recibidos. Usa "Importar CSV" para cargar el reporte de MSeller.
            </div>
          </div>
        )}}
      />

      {/* Modal resultado de importación */}
      <Modal
        open={showResult}
        title="Resultado de importación"
        onCancel={() => setShowResult(false)}
        footer={<Button type="primary" onClick={() => setShowResult(false)}>Cerrar</Button>}
        width={700}
      >
        {importResult && (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic title="Total filas" value={importResult.total} />
              </Col>
              <Col span={6}>
                <Statistic title="Importados" value={importResult.importados}
                  valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col span={6}>
                <Statistic title="Actualizados" value={importResult.actualizados}
                  valueStyle={{ color: '#1890ff' }} />
              </Col>
              <Col span={6}>
                <Statistic title="Errores" value={importResult.errores}
                  valueStyle={{ color: importResult.errores > 0 ? '#ff4d4f' : undefined }} />
              </Col>
            </Row>
            {importResult.errores > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`${importResult.errores} fila(s) con error`}
                description="Las filas con error NO fueron importadas. Corrige los datos y re-importa."
                style={{ marginBottom: 12 }}
              />
            )}
            <Table
              size="small"
              rowKey="fila"
              dataSource={importResult.detalles}
              columns={resultCols}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
