// FASE 4 Bloque C del catálogo fiscal dominicano — Anexo B1 del IR-2
// (Estado de Resultados). Se arma desde las cuentas etiquetadas con el
// anexo B1 (Fase 4 Bloque A) y sus asientos contabilizados en el período.
//
// El ISR estimado NO aparece aquí: se calcula sobre renta imponible fiscal,
// no sobre utilidad contable, y eso exige una conciliación que el ERP no
// hace — la pantalla lo dice explícitamente, no lo omite en silencio.
// Tampoco se calla que un producto sin historial de compra no genera línea
// de costo: la alerta de abajo avisa con el monto afectado.

import { useState } from 'react';
import { Card, Table, Tag, Row, Col, Statistic, Button, Space, Typography, Alert, DatePicker } from 'antd';
import { DownloadOutlined, FileTextOutlined, WarningOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { exportarAnexoB1 } from '../../utils/exportExcel';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const anexoB1Api = {
  get: (desde: string, hasta: string) =>
    api.get(`/declaraciones/anexo-b1?desde=${desde}&hasta=${hasta}`).then(r => r.data?.data ?? r.data),
};

function columnasSeccion() {
  return [
    { title: 'Código', dataIndex: 'codigo', width: 110 },
    { title: 'Cuenta', dataIndex: 'nombre', ellipsis: true },
    {
      title: 'Casilla B1', dataIndex: 'casillaIR2', width: 140,
      render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : <Tag>Sin casilla — a criterio del contador</Tag>,
    },
    { title: 'Monto', dataIndex: 'saldo', width: 130, align: 'right' as const, render: (v: number) => fmt.money(v) },
  ];
}

function Seccion({ titulo, cuentas, total }: { titulo: string; cuentas: any[]; total: number }) {
  return (
    <Table
      rowKey="codigo" size="small" pagination={false}
      columns={columnasSeccion()}
      dataSource={cuentas}
      title={() => <Text strong>{titulo}</Text>}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total {titulo.toLowerCase()}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={1} align="right"><Text strong>{fmt.money(total)}</Text></Table.Summary.Cell>
        </Table.Summary.Row>
      )}
      style={{ marginBottom: 16 }}
    />
  );
}

export default function AnexoB1Panel() {
  const [rango, setRango] = useState<[Dayjs, Dayjs]>([dayjs().startOf('year'), dayjs()]);
  const [exportando, setExportando] = useState(false);
  const desde = rango[0].format('YYYY-MM-DD');
  const hasta = rango[1].format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['anexo-b1', desde, hasta],
    queryFn: () => anexoB1Api.get(desde, hasta),
  });

  async function handleExportar() {
    if (!data) return;
    setExportando(true);
    try { await exportarAnexoB1(data, desde, hasta); } finally { setExportando(false); }
  }

  const alertaVentas = data?.alertas?.ventasSinHistorialCosto;
  const sinEtiqueta = data?.alertas?.cuentasDeResultadosSinEtiquetaB1 ?? [];

  return (
    <div>
      <Alert
        type="info" showIcon icon={<FileTextOutlined />} style={{ marginBottom: 16 }}
        message="Anexo B1 — Estado de Resultados"
        description={
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            Se arma solo con las cuentas etiquetadas con el anexo B1 (Plan de Cuentas → columna "606 / IR-2").
            El ISR estimado no aparece aquí — se calcula sobre renta imponible fiscal, no sobre utilidad
            contable, y eso exige una conciliación que este ERP no hace. DGII no tiene mecanismo de carga de
            archivo para el IR-2 (a diferencia del 606/607/608) — esta pantalla y su Excel son de trabajo, para
            transcribir a mano en la Oficina Virtual, igual que la propia plantilla Excel oficial de DGII.
          </Paragraph>
        }
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Text type="secondary">Período:</Text>
        <RangePicker value={rango} onChange={(v) => v && v[0] && v[1] && setRango([v[0], v[1]])} allowClear={false} />
        <Button icon={<DownloadOutlined />} loading={exportando} disabled={!data} onClick={handleExportar}>
          Exportar Excel
        </Button>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small"><Statistic title="Ingresos" value={data?.ingresos?.total ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small"><Statistic title="Utilidad bruta" value={data?.resultados?.utilidadBruta ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#7c3aed' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small"><Statistic title="Total gastos" value={data?.gastos?.total ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#ef4444' }} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small"><Statistic title="Utilidad neta" value={data?.resultados?.utilidadNeta ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading}
            valueStyle={{ color: (data?.resultados?.utilidadNeta ?? 0) >= 0 ? '#10b981' : '#ef4444' }} /></Card>
        </Col>
      </Row>

      <Alert
        type="warning" showIcon icon={<InfoCircleOutlined />} style={{ marginBottom: 16 }}
        message="ISR no incluido en este anexo"
        description={data?.isr?.motivo ?? 'Se calcula sobre renta imponible fiscal, no sobre utilidad contable.'}
      />

      <Card style={{ marginBottom: 16 }}>
        <Seccion titulo="Ingresos" cuentas={data?.ingresos?.cuentas ?? []} total={data?.ingresos?.total ?? 0} />
        <Seccion titulo="Costos" cuentas={data?.costos?.cuentas ?? []} total={data?.costos?.total ?? 0} />
        <Seccion titulo="Gastos" cuentas={data?.gastos?.cuentas ?? []} total={data?.gastos?.total ?? 0} />
      </Card>

      {alertaVentas && alertaVentas.cantidadFacturas > 0 && (
        <Alert
          type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }}
          message={`Costo de venta posiblemente subestimado — ${alertaVentas.cantidadFacturas} factura(s) con productos sin historial de costo`}
          description={
            <>
              <Paragraph style={{ margin: '0 0 8px', fontSize: 13 }}>{alertaVentas.nota}</Paragraph>
              <Table
                rowKey="id" size="small" pagination={false}
                dataSource={alertaVentas.facturas}
                columns={[
                  { title: 'Folio', dataIndex: 'folio', width: 120 },
                  { title: 'Fecha', dataIndex: 'fecha', width: 110 },
                  { title: 'Líneas sin costo', dataIndex: 'lineasSinCosto', width: 130, align: 'right' as const },
                  { title: 'Monto vendido sin costo', dataIndex: 'monto', align: 'right' as const, render: (v: number) => fmt.money(v) },
                ]}
              />
            </>
          }
        />
      )}

      {sinEtiqueta.length > 0 && (
        <Alert
          type="warning" showIcon icon={<WarningOutlined />}
          message={`${sinEtiqueta.length} cuenta(s) de resultados con saldo y sin etiqueta B1 — no están incluidas en los totales de arriba`}
          description={
            <Table
              rowKey="codigo" size="small" pagination={false} style={{ marginTop: 8 }}
              dataSource={sinEtiqueta}
              columns={[
                { title: 'Código', dataIndex: 'codigo', width: 110 },
                { title: 'Cuenta', dataIndex: 'nombre' },
                { title: 'Tipo', dataIndex: 'tipo', width: 100 },
                { title: 'Saldo', dataIndex: 'saldo', width: 120, align: 'right' as const, render: (v: number) => fmt.money(v) },
              ]}
            />
          }
        />
      )}
    </div>
  );
}
