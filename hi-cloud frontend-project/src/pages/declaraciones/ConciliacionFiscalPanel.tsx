// FASE 3 del catálogo fiscal dominicano — conciliación 606 vs IR-2.
//
// HERRAMIENTA DE CONTROL INTERNO, no un simulador de validaciones de DGII:
// la investigación previa a este módulo no encontró evidencia de que DGII
// cruce automáticamente el IR-2 contra los 606 enviados. Por eso esta
// pantalla NUNCA dice "DGII va a rechazar" ni "esto es un error" — dice qué
// dos números no coinciden y de qué se compone la diferencia. El contador
// decide si esa diferencia es legítima.
//
// El 606 sale de compras/gastos; el IR-2 (vía las etiquetas fiscales de
// Fase 1/2) sale de los asientos contables. Son dos caminos que nunca se
// habían cruzado antes de este módulo — se documenta la procedencia de cada
// número en la propia pantalla, no solo en comentarios de código.

import { useState } from 'react';
import { Card, Table, Tag, Alert, Collapse, Statistic, Row, Col, Button, Space, Typography, Tooltip, Empty } from 'antd';
import {
  InfoCircleOutlined, DownloadOutlined, FileSearchOutlined,
  QuestionCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { exportarConciliacion606IR2 } from '../../utils/exportExcel';

const { Text, Paragraph } = Typography;

const conciliacionApi = {
  get: (anio: number) =>
    api.get(`/declaraciones/conciliacion-606-ir2?anio=${anio}`).then(r => r.data?.data ?? r.data),
};

export default function ConciliacionFiscalPanel({ anio }: { anio: number }) {
  const [exportando, setExportando] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['conciliacion-606-ir2', anio],
    queryFn: () => conciliacionApi.get(anio),
  });

  const alertas = data?.alertas ?? {};
  const totalAlertas =
    (alertas.mesesSinTxtGenerado?.length ?? 0 ? 1 : 0) +
    (alertas.comprasSinRevisar?.length ?? 0) +
    (alertas.gastosSinComprobante?.length ?? 0) +
    (alertas.cuentasSinEtiquetaConSaldo?.length ?? 0);

  const columnasConciliacion = [
    {
      title: 'Tipo de gasto (606)', dataIndex: 'labelTipoBienes', width: 220,
      render: (v: string, r: any) => (
        <div>
          <Text strong>{r.codigo606} — {v}</Text>
          {r.correspondencia?.casillaIR2 ? (
            <div>
              <Tag color="blue" style={{ fontSize: 10 }}>Casilla {r.correspondencia.casillaIR2} · Anexo {r.correspondencia.anexoIR2}</Tag>
              <Tag color={r.correspondencia.confirmada ? 'green' : 'gold'} style={{ fontSize: 10 }}>
                {r.correspondencia.confirmada ? 'CONFIRMADA' : 'CONCEPTUAL'}
              </Tag>
            </div>
          ) : (
            <Tag style={{ fontSize: 10 }}>Sin casilla identificada — criterio pendiente</Tag>
          )}
        </div>
      ),
    },
    {
      title: (
        <span>Total 606{' '}
          <Tooltip title="Recálculo en vivo de compras y gastos del ejercicio clasificados con este código — no es el snapshot de ningún TXT ya descargado.">
            <InfoCircleOutlined style={{ color: '#999' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: ['total606', 'valor'], width: 150, align: 'right' as const,
      render: (v: number, r: any) => (
        <div>
          <Text>{fmt.money(r.total606.valor)}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.total606.cantidad} línea(s)</Text></div>
        </div>
      ),
    },
    {
      title: (
        <span>IR-2 — con NCF{' '}
          <Tooltip title="Suma de asientos contabilizados en cuentas etiquetadas con este código 606, en cuentas que sí requieren NCF (o sin dictamen todavía).">
            <InfoCircleOutlined style={{ color: '#999' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: ['totalIR2ConNCF', 'valor'], width: 150, align: 'right' as const,
      render: (v: number, r: any) => fmt.money(r.totalIR2ConNCF.valor),
    },
    {
      title: (
        <span>IR-2 — sin NCF{' '}
          <Tooltip title="Nómina, TSS, depreciación y destrucción de inventario autorizada: van al IR-2 pero por diseño del 606 NUNCA aparecen ahí. Se muestra aparte para no confundirlo con un descuadre.">
            <InfoCircleOutlined style={{ color: '#999' }} />
          </Tooltip>
        </span>
      ),
      dataIndex: ['totalIR2SinNCF', 'valor'], width: 150, align: 'right' as const,
      render: (v: number, r: any) => (
        <Text type="secondary">{fmt.money(r.totalIR2SinNCF.valor)}</Text>
      ),
    },
    {
      title: 'Estos dos números', dataIndex: 'diferencia', width: 160, align: 'right' as const,
      render: (v: number) => {
        const coincide = Math.abs(v) < 0.01;
        return (
          <Tag color={coincide ? 'green' : 'orange'} style={{ fontSize: 11 }}>
            {coincide ? 'coinciden' : `no coinciden — ${fmt.money(v)}`}
          </Tag>
        );
      },
    },
  ];

  const columnasCorrespondencias = [
    { title: 'Código 606', dataIndex: 'codigo606', width: 90 },
    { title: 'Casilla IR-2', dataIndex: 'casillaIR2', width: 110, render: (v: string | null) => v ?? '— sin identificar —' },
    { title: 'Anexo', dataIndex: 'anexoIR2', width: 80, render: (v: string | null) => v ?? '—' },
    {
      title: 'Marca', dataIndex: 'confirmada', width: 140,
      render: (v: boolean) => <Tag color={v ? 'green' : 'gold'}>{v ? 'CONFIRMADA' : 'CONCEPTUAL'}</Tag>,
    },
    { title: 'Nota', dataIndex: 'nota', render: (v?: string) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : '—' },
  ];

  async function handleExportar() {
    if (!data) return;
    setExportando(true);
    try { await exportarConciliacion606IR2(data, anio); } finally { setExportando(false); }
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        icon={<FileSearchOutlined />}
        style={{ marginBottom: 16 }}
        message="Herramienta de control interno"
        description={
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            Esta pantalla compara la clasificación 606 de compras/gastos contra el IR-2 armado a partir de
            los asientos contables — dos caminos que nunca se habían cruzado. No hay evidencia de que DGII
            valide automáticamente el IR-2 contra los 606 enviados: lo que sigue no es un veredicto de DGII,
            es la diferencia entre dos números y de qué se compone. La decisión de si esa diferencia es
            legítima es del contador.
          </Paragraph>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <Card size="small"><Statistic title={`Total 606 clasificado ${anio}`} value={data?.totales?.total606 ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small"><Statistic title="IR-2 — con NCF" value={data?.totales?.totalIR2ConNCF ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small"><Statistic title="IR-2 — sin NCF (nómina, TSS, depreciación...)" value={data?.totales?.totalIR2SinNCF ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#8c8c8c' }} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small"><Statistic title="Diferencia total (con NCF − 606)" value={data?.totales?.diferencia ?? 0}
            formatter={v => fmt.money(Number(v))} loading={isLoading}
            valueStyle={{ color: Math.abs(data?.totales?.diferencia ?? 0) < 0.01 ? '#10b981' : '#d97706' }} /></Card>
        </Col>
      </Row>

      <Card
        title="Conciliación por tipo de gasto 606"
        extra={<Button icon={<DownloadOutlined />} loading={exportando} disabled={!data} onClick={handleExportar}>Exportar Excel</Button>}
        style={{ marginBottom: 16 }}
      >
        <Table
          rowKey="codigo606"
          columns={columnasConciliacion as any}
          dataSource={data?.filasPorTipo ?? []}
          loading={isLoading}
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
        />
      </Card>

      <Collapse
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'correspondencias',
            label: <Space><QuestionCircleOutlined /> Correspondencias 606 ↔ IR-2 según el instructivo (6 confirmadas, 5 conceptuales)</Space>,
            children: (
              <Table
                rowKey="codigo606"
                columns={columnasCorrespondencias as any}
                dataSource={data?.correspondencias ?? []}
                pagination={false}
                scroll={{ x: 'max-content' }}
                size="small"
              />
            ),
          },
        ]}
      />

      <Card
        title={<Space><WarningOutlined style={{ color: '#d97706' }} /> Alertas preventivas {totalAlertas > 0 && <Tag color="gold">{totalAlertas}</Tag>}</Space>}
        style={{ marginBottom: 16 }}
      >
        <Collapse
          items={[
            {
              key: 'txt',
              label: `Meses sin TXT 606 generado (${alertas.mesesSinTxtGenerado?.length ?? 0})`,
              children: (alertas.mesesSinTxtGenerado?.length ?? 0) > 0 ? (
                <Paragraph style={{ margin: 0, fontSize: 13 }}>
                  No se generó ningún TXT 606 para: {alertas.mesesSinTxtGenerado.join(', ')} de {anio}. El total 606 de
                  esos meses en esta pantalla es un cálculo sobre la clasificación actual, no un envío confirmado.
                </Paragraph>
              ) : <Empty description="Todos los meses del año tienen un TXT 606 generado" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
            },
            {
              key: 'sinRevisar',
              label: `Compras con clasificación 606 por defecto, sin revisar (${alertas.comprasSinRevisar?.length ?? 0})`,
              children: (alertas.comprasSinRevisar?.length ?? 0) > 0 ? (
                <Table
                  size="small" rowKey="id"
                  scroll={{ x: 'max-content' }}
                  pagination={alertas.comprasSinRevisar.length > 10 ? { pageSize: 10, size: 'small' } : false}
                  dataSource={alertas.comprasSinRevisar}
                  columns={[
                    { title: 'Folio', dataIndex: 'folio' },
                    { title: 'Proveedor', dataIndex: 'proveedor' },
                    { title: 'Fecha', dataIndex: 'fecha' },
                    { title: 'Total', dataIndex: 'total', align: 'right' as const, render: (v: number) => fmt.money(v) },
                  ]}
                />
              ) : <Empty description="Sin compras pendientes de revisar" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
            },
            {
              key: 'sinComprobante',
              label: `Gastos contabilizados sin el comprobante que deberían tener (${alertas.gastosSinComprobante?.length ?? 0})`,
              children: (alertas.gastosSinComprobante?.length ?? 0) > 0 ? (
                <Table
                  size="small" rowKey="id"
                  scroll={{ x: 'max-content' }}
                  pagination={alertas.gastosSinComprobante.length > 10 ? { pageSize: 10, size: 'small' } : false}
                  dataSource={alertas.gastosSinComprobante}
                  columns={[
                    { title: 'Descripción', dataIndex: 'descripcion' },
                    { title: 'Categoría', dataIndex: 'categoria' },
                    { title: 'Fecha', dataIndex: 'fecha' },
                    { title: 'Total', dataIndex: 'total', align: 'right' as const, render: (v: number) => fmt.money(v) },
                  ]}
                />
              ) : <Empty description="Sin gastos pendientes" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
            },
            {
              key: 'sinEtiqueta',
              label: `Cuentas con saldo en el ejercicio y sin etiqueta fiscal (${alertas.cuentasSinEtiquetaConSaldo?.length ?? 0})`,
              children: (alertas.cuentasSinEtiquetaConSaldo?.length ?? 0) > 0 ? (
                <Table
                  size="small" rowKey="codigo"
                  scroll={{ x: 'max-content' }}
                  pagination={alertas.cuentasSinEtiquetaConSaldo.length > 10 ? { pageSize: 10, size: 'small' } : false}
                  dataSource={alertas.cuentasSinEtiquetaConSaldo}
                  columns={[
                    { title: 'Código', dataIndex: 'codigo' },
                    { title: 'Cuenta', dataIndex: 'nombre' },
                    { title: 'Tipo', dataIndex: 'tipo' },
                    { title: 'Saldo del ejercicio', dataIndex: 'saldo', align: 'right' as const, render: (v: number) => fmt.money(v) },
                  ]}
                />
              ) : <Empty description="Ninguna — todas las cuentas con movimiento tienen etiqueta fiscal" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
            },
          ]}
        />
      </Card>

      <Card title={<Space><FileSearchOutlined /> Anexo J — cantidad y monto por tipo de comprobante ({anio})</Space>}>
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          Sumatoria de los comprobantes de los 606 del ejercicio, agrupados por tipo (los 3 primeros caracteres del
          NCF). Es la misma tabla que el IR-2 pide llenar a mano en su Anexo J — el ERP la calcula sola.
        </Paragraph>
        <Table
          size="small" pagination={false} rowKey="tipoComprobante"
          scroll={{ x: 'max-content' }}
          dataSource={data?.anexoJ ?? []}
          loading={isLoading}
          columns={[
            { title: 'Tipo de comprobante', dataIndex: 'tipoComprobante' },
            { title: 'Cantidad', dataIndex: 'cantidad', align: 'right' as const },
            { title: 'Monto recibido', dataIndex: 'monto', align: 'right' as const, render: (v: number) => fmt.money(v) },
          ]}
        />
      </Card>
    </div>
  );
}
