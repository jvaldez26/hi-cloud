import { useState } from 'react';
import { Card, Row, Col, Button, Select, DatePicker, Table, Tag, Statistic } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { serviciosProApi } from '../../api/servicios-pro.api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function ReportesPage() {
  const hoy = dayjs();
  const [rangoTiempo, setRangoTiempo] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([hoy.startOf('month'), hoy]);
  const [profesionalId, setProfesionalId] = useState<number | undefined>();

  const { data: profesionales = [] } = useQuery({ queryKey: ['sp-profesionales-sel'], queryFn: serviciosProApi.getProfesionales });

  const { data: reporteTiempo, isLoading: loadTiempo } = useQuery({
    queryKey: ['sp-reporte-tiempo', rangoTiempo[0].format('YYYY-MM-DD'), rangoTiempo[1].format('YYYY-MM-DD'), profesionalId],
    queryFn: () => serviciosProApi.getReporteTiempo({
      desde: rangoTiempo[0].format('YYYY-MM-DD'),
      hasta: rangoTiempo[1].format('YYYY-MM-DD'),
      ...(profesionalId ? { profesionalId } : {}),
    }),
  });

  const { data: reporteRentabilidad, isLoading: loadRent } = useQuery({
    queryKey: ['sp-reporte-rentabilidad', rangoTiempo[0].format('YYYY-MM-DD'), rangoTiempo[1].format('YYYY-MM-DD')],
    queryFn: () => serviciosProApi.getReporteRentabilidad({
      desde: rangoTiempo[0].format('YYYY-MM-DD'),
      hasta: rangoTiempo[1].format('YYYY-MM-DD'),
    }),
  });

  const tiempoArr: any[] = Array.isArray(reporteTiempo) ? reporteTiempo : (reporteTiempo as any)?.detalle ?? [];
  const rentArr: any[]   = Array.isArray(reporteRentabilidad) ? reporteRentabilidad : (reporteRentabilidad as any)?.expedientes ?? [];

  const totalHoras = tiempoArr.reduce((s: number, t: any) => s + Number(t.horas ?? 0), 0);
  const totalMonto = tiempoArr.reduce((s: number, t: any) => s + Number(t.monto ?? 0), 0);
  const horasFacturables = tiempoArr.filter((t: any) => t.facturable).reduce((s: number, t: any) => s + Number(t.horas ?? 0), 0);

  const descargarPdfTiempo = () => serviciosProApi.downloadReporteTiempoPdf({
    desde: rangoTiempo[0].format('YYYY-MM-DD'),
    hasta: rangoTiempo[1].format('YYYY-MM-DD'),
    ...(profesionalId ? { profesionalId } : {}),
  });

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: '0 0 16px' }}>📊 Reportes</h2>

      {/* Filtros globales */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Periodo</div>
            <RangePicker value={rangoTiempo} onChange={(v: any) => v && setRangoTiempo(v)} style={{ width: 260 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Profesional</div>
            <Select allowClear style={{ width: 200 }} value={profesionalId} onChange={v => setProfesionalId(v)} placeholder="Todos" showSearch optionFilterProp="children">
              {(profesionales as any[]).map(p => <Select.Option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</Select.Option>)}
            </Select>
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        {/* KPIs de tiempo */}
        <Col xs={8} md={6}><Card size="small"><Statistic title="Total Horas" value={totalHoras.toFixed(2)} suffix="h" valueStyle={{ color: '#1d4ed8' }} /></Card></Col>
        <Col xs={8} md={6}><Card size="small"><Statistic title="Horas Facturables" value={horasFacturables.toFixed(2)} suffix="h" valueStyle={{ color: '#16a34a' }} /></Card></Col>
        <Col xs={8} md={6}><Card size="small"><Statistic title="Monto Estimado" value={totalMonto} prefix="RD$" precision={2} valueStyle={{ color: '#d97706' }} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Reporte de Tiempo */}
        <Col xs={24} xl={14}>
          <Card title="⏱️ Tiempo por Profesional"
            extra={<Button size="small" icon={<FilePdfOutlined />} onClick={descargarPdfTiempo}>PDF</Button>}
            size="small">
            <Table dataSource={tiempoArr} rowKey={(r: any, i: any) => `${r.profesionalId ?? i}`} size="small"
              loading={loadTiempo} scroll={{ x: 'max-content' }} pagination={{ pageSize: 10 }}
              columns={[
                { title: 'Profesional', render: (_: any, r: any) => `${r.profesionalNombre ?? ''} ${r.profesionalApellidos ?? ''}`.trim() || r.profesionalId },
                { title: 'Expediente', render: (_: any, r: any) => r.expedienteNombre ?? r.expedienteNumero ?? '' },
                { title: 'Fecha', dataIndex: 'fecha', render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '' },
                { title: 'Horas', dataIndex: 'horas', render: (v: number) => `${Number(v).toFixed(2)}h`, width: 80 },
                { title: 'Monto', dataIndex: 'monto', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '' },
                { title: 'F', dataIndex: 'facturable', render: (v: boolean) => <Tag color={v ? 'blue' : 'default'} style={{ fontSize: 10 }}>{v ? '✓' : '—'}</Tag>, width: 40 },
                { title: 'Facturado', dataIndex: 'facturado', render: (v: boolean) => <Tag color={v ? 'green' : 'default'} style={{ fontSize: 10 }}>{v ? '✓' : '—'}</Tag>, width: 70 },
              ]} />
          </Card>
        </Col>

        {/* Rentabilidad por expediente */}
        <Col xs={24} xl={10}>
          <Card title="💹 Rentabilidad por Expediente" size="small" loading={loadRent}>
            <Table dataSource={rentArr} rowKey={(r: any, i: any) => `${r.expedienteId ?? i}`} size="small"
              scroll={{ x: 'max-content' }} pagination={{ pageSize: 15 }}
              columns={[
                { title: 'Expediente', render: (_: any, r: any) => (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{r.nombre}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{r.numero}</div>
                  </div>
                )},
                { title: 'Horas', dataIndex: 'totalHoras', render: (v: number) => `${Number(v ?? 0).toFixed(1)}h`, width: 70 },
                { title: 'Facturado', dataIndex: 'totalFacturado', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 0 })}` : '—' },
                { title: 'Cobrado', dataIndex: 'totalCobrado', render: (v: number) => v ? `RD$${Number(v).toLocaleString('es-DO', { minimumFractionDigits: 0 })}` : '—' },
              ]} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

