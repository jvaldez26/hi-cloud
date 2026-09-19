// FASE 4 Bloque D del catálogo fiscal dominicano — Anexo D del IR-2
// (Costo de Venta). Inventario Inicial + Compras − Inventario Final,
// con lo que el ERP puede calcular de verdad y lo que no marcado aparte.
//
// El reparto Compras Locales / Compras del Exterior y el ITBIS Llevado al
// Costo el ERP no los calcula (no hay campo de origen de compra, ni ningún
// módulo capitaliza ITBIS al costo) — van en cero, con su motivo, nunca
// inventados. El saldo de apertura de Inventario trae una advertencia fija:
// venía creciendo de forma monótona antes de que el costo de venta se
// contabilizara, así que puede arrastrar un desvío que solo el contador
// puede contrastar contra el inventario físico.

import { useState } from 'react';
import { Card, Table, Row, Col, Statistic, Button, Space, Typography, Alert, InputNumber } from 'antd';
import { DownloadOutlined, FileTextOutlined, WarningOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { exportarAnexoD } from '../../utils/exportExcel';

const { Text, Paragraph } = Typography;

const anexoDApi = {
  get: (anio: number) => api.get(`/declaraciones/anexo-d?anio=${anio}`).then(r => r.data?.data ?? r.data),
};

function TablaCuentas({ cuentas }: { cuentas: any[] }) {
  if (!cuentas?.length) return <Text type="secondary" style={{ fontSize: 12 }}>Sin cuentas con saldo</Text>;
  return (
    <Table
      rowKey="codigo" size="small" pagination={false} showHeader={false}
      dataSource={cuentas}
      columns={[
        { title: 'Cuenta', dataIndex: 'nombre', render: (v: string, r: any) => `${r.codigo} — ${v}` },
        { title: 'Monto', dataIndex: 'saldo', width: 130, align: 'right' as const, render: (v: number) => fmt.money(v) },
      ]}
    />
  );
}

export default function AnexoDPanel() {
  const [anio, setAnio] = useState<number>(dayjs().year());
  const [exportando, setExportando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['anexo-d', anio],
    queryFn: () => anexoDApi.get(anio),
  });

  async function handleExportar() {
    if (!data) return;
    setExportando(true);
    try { await exportarAnexoD(data, anio); } finally { setExportando(false); }
  }

  return (
    <div>
      <Alert
        type="info" showIcon icon={<FileTextOutlined />} style={{ marginBottom: 16 }}
        message="Anexo D — Costo de Venta"
        description={
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            Inventario Inicial + Compras Totales − Inventario Final. El reparto Compras Locales/del Exterior y el
            ITBIS Llevado al Costo el ERP no los calcula — quedan en cero, marcados como llenado manual.
          </Paragraph>
        }
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Text type="secondary">Ejercicio fiscal:</Text>
        <InputNumber value={anio} onChange={(v) => v && setAnio(Number(v))} min={2020} max={2100} />
        <Button icon={<DownloadOutlined />} loading={exportando} disabled={!data} onClick={handleExportar}>
          Exportar Excel
        </Button>
      </Space>

      <Alert
        type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }}
        message="Saldo de apertura de Inventario — revisar contra el físico"
        description={data?.advertencias?.saldoAperturaInventario ??
          'La cuenta de Inventario venía creciendo de forma monótona antes de que el costo de venta se contabilizara.'}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small"><Statistic title="Inventario inicial" value={data?.inventarioInicial?.total ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small"><Statistic title="Compras totales" value={data?.compras?.totalPeriodo ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small"><Statistic title="Inventario final" value={data?.inventarioFinal?.total ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small"><Statistic title="Costo de venta calculado" value={data?.costoVentaCalculado?.valor ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#7c3aed' }} /></Card>
        </Col>
      </Row>
      {data?.costoVentaCalculado?.nota && (
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: -8, marginBottom: 16 }}>
          {data.costoVentaCalculado.formula} · {data.costoVentaCalculado.nota}
        </Paragraph>
      )}

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="Inventario inicial" size="small" style={{ marginBottom: 16 }}
            extra={<Text type="secondary" style={{ fontSize: 11 }}>{data?.inventarioInicial?.procedencia}</Text>}>
            <TablaCuentas cuentas={data?.inventarioInicial?.cuentas ?? []} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Inventario final" size="small" style={{ marginBottom: 16 }}
            extra={<Text type="secondary" style={{ fontSize: 11 }}>{data?.inventarioFinal?.procedencia}</Text>}>
            <TablaCuentas cuentas={data?.inventarioFinal?.cuentas ?? []} />
          </Card>
        </Col>
      </Row>

      <Card title="Compras del ejercicio" size="small" style={{ marginBottom: 16 }}>
        <Paragraph type="secondary" style={{ fontSize: 12 }}>{data?.compras?.procedencia}</Paragraph>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Statistic title="Total" value={data?.compras?.totalPeriodo ?? 0} formatter={v => fmt.money(Number(v))} /></Col>
          <Col xs={24} sm={12}><Statistic title="Con gasto de importación asociado (proxy)" value={data?.compras?.conGastoImportacionAsociado ?? 0} formatter={v => fmt.money(Number(v))} /></Col>
        </Row>
      </Card>

      <Card title={<Space><EditOutlined /> Líneas de llenado manual — el ERP no las registra</Space>}>
        <Table
          rowKey="concepto" size="small" pagination={false}
          dataSource={data?.lineasLlenadoManual ?? []}
          columns={[
            { title: 'Concepto', dataIndex: 'concepto', width: 220 },
            { title: 'Por qué el ERP no la llena', dataIndex: 'motivo' },
          ]}
        />
      </Card>
    </div>
  );
}
