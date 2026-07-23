import { useState } from 'react';
import {
  Card, Row, Col, Table, Typography, Statistic, Button, message,
  Space, Tag, DatePicker, theme, Alert, Divider,
} from 'antd';
import {
  CalculatorOutlined, CheckCircleOutlined, WarningOutlined,
  DownloadOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { exportarExcel } from '../../utils/exportExcel';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Title, Text } = Typography;

const fmt = (v: number) =>
  new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);

const TIPO_COLOR: Record<string, string> = {
  activo: 'blue', pasivo: 'red', patrimonio: 'purple',
  ingreso: 'green', costo: 'orange', gasto: 'volcano',
};

export default function BalanceComprobacionPage() {
  const { token } = theme.useToken();
  const [fechaCorte, setFechaCorte] = useState(dayjs());

  const { data, isLoading } = useQuery<any>({
    queryKey: ['balance-comprobacion', fechaCorte.format('YYYY-MM-DD')],
    queryFn: () => api.get(`/reportes-financieros/balance-comprobacion?hasta=${fechaCorte.format('YYYY-MM-DD')}`).then((r: any) => r.data?.data ?? r.data),
  });

  const lineas   = data?.lineas   ?? [];
  const totales  = data?.totales  ?? {};

  const exportarCSV = () => {
    const rows = [
      ['Código', 'Cuenta', 'Tipo', 'Naturaleza', 'Nivel', 'Total Debe', 'Total Haber', 'Saldo Deudor', 'Saldo Acreedor'].join(','),
      ...lineas.map((l: any) => [
        l.codigo, `"${l.nombre}"`, l.tipo, l.naturaleza, l.nivel,
        l.totalDebe, l.totalHaber, l.saldoDeudor, l.saldoAcreedor,
      ].join(',')),
      ['', 'TOTALES', '', '', '',
        totales.debe, totales.haber, totales.deudor, totales.acreedor,
      ].join(','),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `balance-comprobacion-${fechaCorte.format('YYYY-MM-DD')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CalculatorOutlined style={{ fontSize: 28, color: token.colorPrimary }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Balance de Comprobación</Title>
            <Text type="secondary">Sumas y Saldos de todas las cuentas contables a una fecha de corte</Text>
          </div>
        </div>
        <Space>
          <DatePicker
            value={fechaCorte}
            onChange={d => d && setFechaCorte(d)}
            format="DD/MM/YYYY"
            placeholder="Fecha de corte"
          />
          <Space>
            <Button icon={<FileExcelOutlined />} onClick={() => {
              const filas = [
                ...lineas.map((l: any) => ({
                  'Código':         l.codigo ?? '',
                  'Cuenta':         l.nombre ?? '',
                  'Tipo':           l.tipo ?? '',
                  'Naturaleza':     l.naturaleza ?? '',
                  'Nivel':          l.nivel ?? '',
                  'Total Debe':     Number(l.totalDebe ?? 0),
                  'Total Haber':    Number(l.totalHaber ?? 0),
                  'Saldo Deudor':   Number(l.saldoDeudor ?? 0),
                  'Saldo Acreedor': Number(l.saldoAcreedor ?? 0),
                })),
                {
                  'Código': '', 'Cuenta': 'TOTALES', 'Tipo': '', 'Naturaleza': '', 'Nivel': '',
                  'Total Debe':     Number(totales.debe ?? 0),
                  'Total Haber':    Number(totales.haber ?? 0),
                  'Saldo Deudor':   Number(totales.deudor ?? 0),
                  'Saldo Acreedor': Number(totales.acreedor ?? 0),
                },
              ];
              exportarExcel(filas, `Balance-Comprobacion-${fechaCorte.format('YYYY-MM-DD')}`);
            }}>Excel</Button>
            <Button icon={<DownloadOutlined />} onClick={exportarCSV}>CSV</Button>
          </Space>
        </Space>
      </div>

      {/* Estado del balance */}
      {totales.cuadra !== undefined && (
        <Alert
          type={totales.cuadra ? 'success' : 'error'}
          showIcon
          icon={totales.cuadra ? <CheckCircleOutlined /> : <WarningOutlined />}
          message={
            totales.cuadra
              ? '✅ Balance cuadrado — Debe = Haber y Deudor = Acreedor'
              : '⚠️ Balance NO cuadra — Revisar asientos contables'
          }
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      {/* Totales */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Debe',      value: totales.debe,     color: '#1a56db' },
          { label: 'Total Haber',     value: totales.haber,    color: '#059669' },
          { label: 'Saldo Deudor',    value: totales.deudor,   color: '#7c3aed' },
          { label: 'Saldo Acreedor',  value: totales.acreedor, color: '#d97706' },
        ].map(s => (
          <Col xs={12} sm={6} key={s.label}>
            <Card bordered={false} style={{ borderRadius: 10, border: `1px solid ${token.colorBorderSecondary}` }}>
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 12 }}>{s.label}</Text>}
                value={s.value ?? 0}
                formatter={v => `RD$ ${fmt(Number(v))}`}
                valueStyle={{ color: s.color, fontSize: 16 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Tabla */}
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          dataSource={lineas}
          rowKey="codigo"
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 30 }}
          scroll={{ x: 'max-content' }}
          rowClassName={(r: any) => r.nivel <= 2 ? 'ant-table-row-level-parent' : ''}
          columns={[
            {
              title: 'Código', dataIndex: 'codigo', key: 'c', width: 100,
              render: (v, r: any) => (
                <Text strong={r.nivel <= 2} style={{ fontFamily: 'monospace', fontSize: r.nivel <= 2 ? 13 : 12 }}>
                  {v}
                </Text>
              ),
            },
            {
              title: 'Cuenta', dataIndex: 'nombre', key: 'n',
              render: (v, r: any) => (
                <Text
                  strong={r.nivel <= 2}
                  style={{
                    paddingLeft: (r.nivel - 1) * 12,
                    fontSize: r.nivel <= 2 ? 13 : 12,
                  }}
                >
                  {v}
                </Text>
              ),
            },
            {
              title: 'Tipo', dataIndex: 'tipo', key: 't', width: 100,
              render: v => <Tag color={TIPO_COLOR[v] ?? 'default'} style={{ fontSize: 10 }}>{v}</Tag>,
            },
            {
              title: 'Total Debe', dataIndex: 'totalDebe', key: 'td', align: 'right', width: 130,
              render: v => v > 0 ? <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(v)}</Text> : <Text type="secondary">—</Text>,
            },
            {
              title: 'Total Haber', dataIndex: 'totalHaber', key: 'th', align: 'right', width: 130,
              render: v => v > 0 ? <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(v)}</Text> : <Text type="secondary">—</Text>,
            },
            {
              title: 'Saldo Deudor', dataIndex: 'saldoDeudor', key: 'sd', align: 'right', width: 130,
              render: v => v > 0 ? <Text strong style={{ color: token.colorPrimary, fontFamily: 'monospace', fontSize: 12 }}>{fmt(v)}</Text> : null,
            },
            {
              title: 'Saldo Acreedor', dataIndex: 'saldoAcreedor', key: 'sa', align: 'right', width: 130,
              render: v => v > 0 ? <Text strong style={{ color: token.colorSuccess, fontFamily: 'monospace', fontSize: 12 }}>{fmt(v)}</Text> : null,
            },
          ]}
          summary={() => (
            <Table.Summary.Row style={{ background: token.colorFillAlter, fontWeight: 700 }}>
              <Table.Summary.Cell index={0} colSpan={3}>
                <Text strong style={{ fontSize: 13 }}>TOTALES</Text>
                {totales.cuadra && <Tag color="green" style={{ marginLeft: 8, fontSize: 10 }}>✓ Cuadrado</Tag>}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <Text strong style={{ fontFamily: 'monospace' }}>RD$ {fmt(totales.debe ?? 0)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <Text strong style={{ fontFamily: 'monospace' }}>RD$ {fmt(totales.haber ?? 0)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <Text strong style={{ color: token.colorPrimary, fontFamily: 'monospace' }}>RD$ {fmt(totales.deudor ?? 0)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right">
                <Text strong style={{ color: token.colorSuccess, fontFamily: 'monospace' }}>RD$ {fmt(totales.acreedor ?? 0)}</Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
    </div>
  );
}
