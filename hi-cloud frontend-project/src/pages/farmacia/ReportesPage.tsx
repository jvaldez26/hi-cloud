import { useState } from 'react';
import {
  Tabs, Table, Button, DatePicker, Space, Typography, Tag, Statistic, Row, Col, Card,
} from 'antd';
import { FilePdfOutlined, BarChartOutlined, AlertOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { farmaciaApi } from '../../api/farmacia.api';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export default function ReportesPage() {
  const [rango, setRango] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const desde = rango?.[0]?.format('YYYY-MM-DD');
  const hasta = rango?.[1]?.format('YYYY-MM-DD');

  const { data: masVendidos, isLoading: loadMV } = useQuery({
    queryKey: ['farmacia-mas-vendidos', desde, hasta],
    queryFn: () => farmaciaApi.reporteMasVendidos({ desde, hasta }),
  });

  const { data: ingresos, isLoading: loadIn } = useQuery({
    queryKey: ['farmacia-ingresos', desde, hasta],
    queryFn: () => farmaciaApi.reporteIngresos({ desde, hasta }),
  });

  const { data: stockBajo, isLoading: loadSB } = useQuery({
    queryKey: ['farmacia-stock-bajo'],
    queryFn: () => farmaciaApi.reporteStockBajo(),
  });

  const { data: sinMov, isLoading: loadSM } = useQuery({
    queryKey: ['farmacia-sin-movimiento'],
    queryFn: () => farmaciaApi.reporteSinMovimiento(30),
  });

  const { data: alertas, isLoading: loadAl } = useQuery({
    queryKey: ['farmacia-alertas'],
    queryFn: () => farmaciaApi.alertasActivas(),
  });

  const exportVencimientos = async (dias: number) => {
    const blob = await farmaciaApi.pdfVencimientos(dias).then(r => r.data);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const filtros = (
    <Space wrap>
      <RangePicker format="DD/MM/YYYY" value={rango} onChange={v => setRango(v as any)} placeholder={['Desde', 'Hasta']} />
    </Space>
  );

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 16 }}>
        <BarChartOutlined style={{ marginRight: 8 }} />
        Reportes de Farmacia
      </Title>

      <Tabs
        items={[
          {
            key: 'mas-vendidos',
            label: 'Más Vendidos',
            children: (
              <>
                <div style={{ marginBottom: 16 }}>{filtros}</div>
                <Table
                  dataSource={masVendidos ?? []}
                  rowKey="id"
                  size="small"
                  loading={loadMV}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    { title: '#', render: (_: any, _r: any, idx: number) => idx + 1, width: 40 },
                    { title: 'Medicamento', dataIndex: 'nombreGenerico', render: (v: string, r: any) => `${v} ${r.concentracion ?? ''}` },
                    { title: 'Comercial', dataIndex: 'nombreComercial' },
                    { title: 'Categoría', dataIndex: 'categoria', width: 130 },
                    { title: 'Cant. Vendida', dataIndex: 'cantidadVendida', width: 110 },
                    { title: 'Dispensaciones', dataIndex: 'dispensaciones', width: 120 },
                    { title: 'Total Vendido', dataIndex: 'totalVendido', width: 130, render: (v: number) => `RD$ ${Number(v).toFixed(2)}` },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'ingresos',
            label: 'Ingresos',
            children: (
              <>
                <div style={{ marginBottom: 16 }}>{filtros}</div>
                {ingresos && (
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                      <Card>
                        <Statistic title="Total Dispensaciones" value={ingresos.dispensaciones} />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card>
                        <Statistic title="Total Ingresos" value={`RD$ ${Number(ingresos.total ?? 0).toFixed(2)}`} />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card>
                        <Statistic title="Cubierto por ARS" value={`RD$ ${Number(ingresos.cubiertoPorArs ?? 0).toFixed(2)}`} />
                      </Card>
                    </Col>
                  </Row>
                )}
                <Table
                  dataSource={ingresos?.porDia ?? []}
                  rowKey="dia"
                  size="small"
                  loading={loadIn}
                  scroll={{ x: 'max-content' }}
                  pagination={false}
                  columns={[
                    { title: 'Día', dataIndex: 'dia', width: 130, render: (v: string) => new Date(v).toLocaleDateString('es-DO') },
                    { title: 'Dispensaciones', dataIndex: 'dispensaciones', width: 120 },
                    { title: 'Total', dataIndex: 'total', render: (v: number) => `RD$ ${Number(v).toFixed(2)}` },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'stock-bajo',
            label: 'Stock Bajo',
            children: (
              <Table
                dataSource={stockBajo ?? []}
                rowKey="id"
                size="small"
                loading={loadSB}
                scroll={{ x: 'max-content' }}
                pagination={false}
                columns={[
                  { title: 'Medicamento', dataIndex: 'nombreGenerico', render: (v: string, r: any) => `${v} ${r.concentracion ?? ''}` },
                  { title: 'Comercial', dataIndex: 'nombreComercial' },
                  {
                    title: 'Stock Actual', dataIndex: 'stockActual', width: 110,
                    render: (v: number) => <Tag color={v === 0 ? 'error' : 'warning'}>{v}</Tag>,
                  },
                  { title: 'Stock Mínimo', dataIndex: 'stockMinimo', width: 110 },
                  { title: 'Faltantes', dataIndex: 'faltantes', width: 90, render: (v: number) => <strong style={{ color: '#ff4d4f' }}>{v}</strong> },
                ]}
              />
            ),
          },
          {
            key: 'sin-movimiento',
            label: 'Sin Movimiento',
            children: (
              <Table
                dataSource={sinMov ?? []}
                rowKey="id"
                size="small"
                loading={loadSM}
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 20 }}
                columns={[
                  { title: 'Medicamento', dataIndex: 'nombreGenerico', render: (v: string, r: any) => `${v} ${r.concentracion ?? ''}` },
                  { title: 'Comercial', dataIndex: 'nombreComercial' },
                  { title: 'Stock Actual', dataIndex: 'stockActual', width: 110 },
                  { title: 'Última Venta', dataIndex: 'ultimaVenta', width: 140, render: (v: string) => v ? new Date(v).toLocaleDateString('es-DO') : 'Nunca' },
                ]}
              />
            ),
          },
          {
            key: 'alertas',
            label: <><AlertOutlined /> Alertas</>,
            children: (
              <>
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <Card title="Stock Bajo" size="small">
                      <Table
                        dataSource={alertas?.stockBajo ?? []}
                        rowKey="id"
                        size="small"
                        loading={loadAl}
                        scroll={{ x: 'max-content' }}
                        pagination={false}
                        columns={[
                          { title: 'Medicamento', dataIndex: 'nombreGenerico', ellipsis: true },
                          { title: 'Stock', dataIndex: 'stockActual', width: 70 },
                          { title: 'Mín.', dataIndex: 'stockMinimo', width: 60 },
                        ]}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card
                      title="Lotes Vencidos"
                      size="small"
                      extra={
                        <Button size="small" icon={<FilePdfOutlined />} onClick={() => exportVencimientos(60)}>
                          PDF 60 días
                        </Button>
                      }
                    >
                      <Table
                        dataSource={alertas?.lotesVencidos ?? []}
                        rowKey="id"
                        size="small"
                        loading={loadAl}
                        scroll={{ x: 'max-content' }}
                        pagination={false}
                        columns={[
                          { title: 'Medicamento', dataIndex: 'nombreGenerico', ellipsis: true },
                          { title: 'Lote', dataIndex: 'numeroLote', width: 110 },
                          { title: 'Vence', dataIndex: 'fechaVencimiento', width: 110, render: (v: string) => new Date(v).toLocaleDateString('es-DO') },
                          { title: 'Cant.', dataIndex: 'cantidadActual', width: 70 },
                        ]}
                      />
                    </Card>
                  </Col>
                </Row>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
