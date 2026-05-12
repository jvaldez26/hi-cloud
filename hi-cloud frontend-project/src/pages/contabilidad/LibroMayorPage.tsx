import { useState } from 'react';
import { Card, Select, Table, Typography, Row, Col, Statistic,
         Button, DatePicker, Space, Tag, Empty } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { contabilidadApi } from '../../api/contabilidad.api';
import { exportarExcel } from '../../utils/exportExcel';
import { fmt } from '../../utils/formatters';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function LibroMayorPage() {
  const [cuentaId, setCuentaId] = useState<number | undefined>();
  const [rango, setRango]       = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const desde = rango?.[0].format('YYYY-MM-DD');
  const hasta = rango?.[1].format('YYYY-MM-DD');

  const { data: cuentas } = useQuery({
    queryKey: ['cuentas-sel'],
    queryFn:  () => contabilidadApi.cuentas(true), // solo las que permiten movimientos
  });

  const { data: mayor, isLoading } = useQuery({
    queryKey: ['libro-mayor', cuentaId, desde, hasta],
    queryFn:  () => contabilidadApi.libroMayor(cuentaId!, desde, hasta),
    enabled:  !!cuentaId,
  });

  const cuentaSeleccionada = cuentas?.find((c: any) => c.id === cuentaId);

  const handleExportar = () => {
    if (!mayor?.movimientos?.length) return;
    exportarExcel(mayor.movimientos.map((m: any, i: number) => ({
      '#':           i + 1,
      'Descripción': m.descripcion,
      'Debe':        m.debe > 0 ? m.debe : '',
      'Haber':       m.haber > 0 ? m.haber : '',
      'Saldo':       m.saldo,
    })), `LibroMayor-${cuentaSeleccionada?.codigo ?? cuentaId}`);
  };

  const cols = [
    { title: '#',       key: 'idx',        width: 50,  render: (_: any, __: any, i: number) => i + 1 },
    { title: 'Descripción', dataIndex: 'descripcion', ellipsis: true },
    { title: 'Debe',    dataIndex: 'debe',  width: 130,
      render: (v: number) => v > 0 ? <Text style={{ color: '#1677ff' }}>{fmt.money(v)}</Text> : '' },
    { title: 'Haber',   dataIndex: 'haber', width: 130,
      render: (v: number) => v > 0 ? <Text style={{ color: '#ef4444' }}>{fmt.money(v)}</Text> : '' },
    { title: 'Saldo',   dataIndex: 'saldo', width: 140,
      render: (v: number) => (
        <Text strong style={{ color: v >= 0 ? '#10b981' : '#ef4444' }}>
          {fmt.money(Math.abs(v))} {v < 0 ? '(CR)' : '(DB)'}
        </Text>
      )},
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Libro Mayor</Title>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col flex="auto">
            <Select
              showSearch
              placeholder="Seleccionar cuenta contable..."
              style={{ width: '100%' }}
              value={cuentaId}
              onChange={setCuentaId}
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={(cuentas ?? []).map((c: any) => ({
                value: c.id,
                label: `${c.codigo}  —  ${c.nombre}`,
              }))}
            />
          </Col>
          <Col>
            <RangePicker
              format="DD/MM/YYYY"
              onChange={v => setRango(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
              placeholder={['Desde', 'Hasta']}
            />
          </Col>
          <Col>
            <Button icon={<DownloadOutlined />} onClick={handleExportar}
              disabled={!mayor?.movimientos?.length}>
              Excel
            </Button>
          </Col>
        </Row>
      </Card>

      {cuentaId && cuentaSeleccionada && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Encabezado de la cuenta */}
          <Card style={{ marginBottom: 16, borderRadius: 10 }}>
            <Row gutter={[24, 0]} align="middle">
              <Col>
                <Text code style={{ fontSize: 18, fontWeight: 700 }}>
                  {cuentaSeleccionada.codigo}
                </Text>
              </Col>
              <Col flex="auto">
                <Title level={4} style={{ margin: 0 }}>{cuentaSeleccionada.nombre}</Title>
                <Space>
                  <Tag style={{ textTransform: 'capitalize' }}>{cuentaSeleccionada.tipo}</Tag>
                  <Tag color="blue">{cuentaSeleccionada.naturaleza}</Tag>
                </Space>
              </Col>
              <Col>
                <Statistic
                  title="Saldo final"
                  value={Math.abs(mayor?.saldoFinal ?? 0)}
                  formatter={v => fmt.money(Number(v))}
                  suffix={mayor?.saldoFinal < 0 ? '(CR)' : '(DB)'}
                  valueStyle={{
                    color: cuentaSeleccionada.naturaleza === 'deudora'
                      ? (mayor?.saldoFinal >= 0 ? '#1677ff' : '#ef4444')
                      : (mayor?.saldoFinal <= 0 ? '#10b981' : '#ef4444'),
                    fontSize: 20,
                  }}
                />
              </Col>
            </Row>
          </Card>

          {/* Tabla de movimientos */}
          <Card>
            {!mayor?.movimientos?.length && !isLoading ? (
              <Empty description="Sin movimientos contabilizados para esta cuenta en el período seleccionado" />
            ) : (
              <>
                <Row justify="space-between" style={{ marginBottom: 10 }}>
                  <Text type="secondary">
                    {mayor?.movimientos?.length ?? 0} movimientos
                    {desde && ` · ${fmt.date(desde)} al ${fmt.date(hasta!)}`}
                  </Text>
                </Row>

                <Table
                  columns={cols}
                  dataSource={mayor?.movimientos ?? []}
                  rowKey={(_, i) => i!}
                  loading={isLoading}
                  size="small"
                  pagination={{ pageSize: 25, showSizeChanger: false }}
                  summary={() => (
                    <Table.Summary fixed>
                      <Table.Summary.Row style={{ background: '#f0f9ff' }}>
                        <Table.Summary.Cell index={0} colSpan={2} align="right">
                          <Text strong>SALDO FINAL:</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} colSpan={3}>
                          <Text strong style={{
                            fontSize: 16,
                            color: mayor?.saldoFinal >= 0 ? '#1677ff' : '#ef4444',
                          }}>
                            {fmt.money(Math.abs(mayor?.saldoFinal ?? 0))}
                            {' '}{mayor?.saldoFinal < 0 ? '(CR)' : '(DB)'}
                          </Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />
              </>
            )}
          </Card>
        </motion.div>
      )}

      {!cuentaId && (
        <Card style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">Selecciona una cuenta contable para ver sus movimientos</Text>
        </Card>
      )}
    </div>
  );
}
