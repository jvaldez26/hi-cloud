// FASE 4 Bloque B del catálogo fiscal dominicano — Anexo A1 del IR-2
// (Balance General). Se arma desde las cuentas etiquetadas con el anexo A1
// (Fase 4 Bloque A) y sus asientos contabilizados hasta la fecha de corte.
//
// Las líneas que el IR-2 pide y el ERP no tiene forma de calcular
// (revaluación de activos, dividendos a cuenta, aportes para futura
// capitalización) se muestran en cero y marcadas como llenado manual —
// nunca se inventa un valor para que la línea "no se vea vacía".

import { useState } from 'react';
import { Card, Table, Tag, Row, Col, Statistic, Button, Space, Typography, Alert, DatePicker, Empty } from 'antd';
import { DownloadOutlined, FileTextOutlined, EditOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { exportarAnexoA1 } from '../../utils/exportExcel';

const { Text, Paragraph } = Typography;

const anexoA1Api = {
  get: (fechaCorte: string) =>
    api.get(`/declaraciones/anexo-a1?fechaCorte=${fechaCorte}`).then(r => r.data?.data ?? r.data),
};

function columnasSeccion() {
  return [
    { title: 'Código', dataIndex: 'codigo', width: 110 },
    { title: 'Cuenta', dataIndex: 'nombre', ellipsis: true },
    {
      title: 'Casilla A1', dataIndex: 'casillaIR2', width: 140,
      render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : <Tag>Sin casilla — a criterio del contador</Tag>,
    },
    { title: 'Saldo', dataIndex: 'saldo', width: 130, align: 'right' as const, render: (v: number) => fmt.money(v) },
  ];
}

function Seccion({ titulo, cuentas, total }: { titulo: string; cuentas: any[]; total: number }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Table
        rowKey="codigo" size="small" pagination={false}
        scroll={{ x: 'max-content' }}
        columns={columnasSeccion()}
        dataSource={cuentas}
        locale={{ emptyText: <Empty description="Sin cuentas con saldo" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        title={() => <Text strong>{titulo}</Text>}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3}><Text strong>Total {titulo.toLowerCase()}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right"><Text strong>{fmt.money(total)}</Text></Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </div>
  );
}

export default function AnexoA1Panel() {
  const [fechaCorte, setFechaCorte] = useState<Dayjs>(dayjs());
  const [exportando, setExportando] = useState(false);
  const fechaStr = fechaCorte.format('YYYY-MM-DD');

  const { data, isLoading } = useQuery({
    queryKey: ['anexo-a1', fechaStr],
    queryFn: () => anexoA1Api.get(fechaStr),
  });

  async function handleExportar() {
    if (!data) return;
    setExportando(true);
    try { await exportarAnexoA1(data, fechaStr); } finally { setExportando(false); }
  }

  const alertasSinEtiqueta = data?.alertas?.cuentasDeBalanceSinEtiquetaA1 ?? [];

  return (
    <div>
      <Alert
        type="info" showIcon icon={<FileTextOutlined />} style={{ marginBottom: 16 }}
        message="Anexo A1 — Balance General"
        description={
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            Se arma solo con las cuentas etiquetadas con el anexo A1 (Plan de Cuentas → columna "606 / IR-2").
            Las líneas que el ERP no puede calcular quedan en cero, marcadas como llenado manual — el contador
            decide ese valor, esta pantalla no lo adivina. DGII no tiene mecanismo de carga de archivo para el
            IR-2 (a diferencia del 606/607/608) — esta pantalla y su Excel son de trabajo, para transcribir a
            mano en la Oficina Virtual, igual que la propia plantilla Excel oficial de DGII.
          </Paragraph>
        }
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Text type="secondary">Fecha de corte:</Text>
        <DatePicker value={fechaCorte} onChange={(d) => d && setFechaCorte(d)} allowClear={false} />
        <Button icon={<DownloadOutlined />} loading={exportando} disabled={!data} onClick={handleExportar}>
          Exportar Excel
        </Button>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title="Total Activo" value={data?.activo?.total ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title="Total Pasivo + Patrimonio" value={data?.totales?.pasivosPatrimonio ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#7c3aed' }} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic title="Ecuación contable" value={data?.totales?.ecuacion ?? 0}
              formatter={v => fmt.money(Number(v))} loading={isLoading}
              valueStyle={{ color: data?.totales?.cuadrado ? '#10b981' : '#d97706' }} />
            {data && (
              <Tag color={data.totales.cuadrado ? 'green' : 'orange'} style={{ marginTop: 6 }}>
                {data.totales.cuadrado ? 'Cuadra' : 'No cuadra'}
              </Tag>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Activo" style={{ marginBottom: 16 }}>
        <Seccion titulo="Activo corriente" cuentas={data?.activo?.corriente?.cuentas ?? []} total={data?.activo?.corriente?.total ?? 0} />
        <Seccion titulo="Activo no corriente" cuentas={data?.activo?.noCorriente?.cuentas ?? []} total={data?.activo?.noCorriente?.total ?? 0} />
      </Card>

      <Card title="Pasivo" style={{ marginBottom: 16 }}>
        <Seccion titulo="Pasivo corriente" cuentas={data?.pasivo?.corriente?.cuentas ?? []} total={data?.pasivo?.corriente?.total ?? 0} />
        <Seccion titulo="Pasivo no corriente" cuentas={data?.pasivo?.noCorriente?.cuentas ?? []} total={data?.pasivo?.noCorriente?.total ?? 0} />
      </Card>

      <Card title="Patrimonio" style={{ marginBottom: 16 }}>
        <Seccion titulo="Patrimonio" cuentas={data?.patrimonio?.cuentas ?? []} total={data?.patrimonio?.total ?? 0} />
      </Card>

      <Card title={<Space><EditOutlined /> Líneas de llenado manual — el ERP no las registra</Space>} style={{ marginBottom: 16 }}>
        <Table
          rowKey="concepto" size="small" pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={data?.lineasLlenadoManual ?? []}
          columns={[
            { title: 'Concepto', dataIndex: 'concepto', width: 260 },
            { title: 'Por qué el ERP no la llena', dataIndex: 'motivo' },
            { title: 'Valor', dataIndex: 'valor', width: 100, align: 'right' as const, render: () => <Tag>Llenado manual</Tag> },
          ]}
        />
      </Card>

      {alertasSinEtiqueta.length > 0 && (
        <Alert
          type="warning" showIcon icon={<WarningOutlined />}
          message={`${alertasSinEtiqueta.length} cuenta(s) de balance con saldo y sin etiqueta A1 — no están incluidas en los totales de arriba`}
          description={
            <Table
              rowKey="codigo" size="small" style={{ marginTop: 8 }}
              scroll={{ x: 'max-content' }}
              pagination={alertasSinEtiqueta.length > 10 ? { pageSize: 10, size: 'small' } : false}
              dataSource={alertasSinEtiqueta}
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
