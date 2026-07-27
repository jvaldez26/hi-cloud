import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table, Select, Space, Tag, DatePicker, Typography, Card, Statistic, Row, Col,
} from 'antd';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const fmt = new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 0 });

const METODO_COLOR: Record<string, string> = {
  efectivo: 'green', transferencia: 'blue', tarjeta: 'purple', cheque: 'orange',
};

export default function PagosEdPage() {
  const [estudianteId, setEstudianteId] = useState<number | undefined>();
  const [rango, setRango] = useState<[string, string] | null>(null);

  const { data: estudiantes = [] } = useQuery<any[]>({
    queryKey: ['educativo', 'estudiantes-all'],
    queryFn: () => api.get('/educativo/estudiantes').then(r => r.data?.data ?? r.data ?? []),
    staleTime: 60_000,
  });

  const params = {
    estudianteId: estudianteId || undefined,
    fechaInicio: rango?.[0] || undefined,
    fechaFin:    rango?.[1] || undefined,
  };

  const { data: pagos = [], isLoading } = useQuery<any[]>({
    queryKey: ['educativo', 'colegiatura', 'pagos', params],
    queryFn: () =>
      api.get('/educativo/colegiatura/pagos', { params })
        .then(r => r.data?.data ?? r.data ?? []),
    staleTime: 15_000,
  });

  const totalCobrado = (pagos as any[]).reduce((s, p) => s + Number(p.monto), 0);

  return (
    <div style={{ padding: '24px 24px 40px' }}>
      <Title level={4} style={{ marginBottom: 16 }}>Historial de Pagos</Title>

      {pagos.length > 0 && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col>
            <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
              <Statistic title="Total en rango" value={fmt.format(totalCobrado)} valueStyle={{ fontSize: 16, color: '#52c41a' }} />
            </Card>
          </Col>
          <Col>
            <Card size="small" styles={{ body: { padding: '8px 16px' } }}>
              <Statistic title="Transacciones" value={pagos.length} valueStyle={{ fontSize: 16 }} />
            </Card>
          </Col>
        </Row>
      )}

      <Space wrap style={{ marginBottom: 12 }}>
        <RangePicker
          format="YYYY-MM-DD"
          defaultValue={[dayjs().startOf('month'), dayjs()]}
          onChange={dates => {
            if (dates?.[0] && dates?.[1]) {
              setRango([dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')]);
            } else {
              setRango(null);
            }
          }}
        />
        <Select style={{ width: 240 }} placeholder="Filtrar por estudiante" allowClear showSearch
          filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
          options={estudiantes.map((e: any) => ({
            value: e.id, label: `${e.apellidos}, ${e.nombres}`,
          }))}
          onChange={setEstudianteId}
        />
      </Space>

      <Table
        dataSource={pagos}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 'max-content' }}
        summary={rows => {
          const total = rows.reduce((s, r: any) => s + Number(r.monto), 0);
          return total > 0 ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}><strong>Total</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><strong>{fmt.format(total)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={4} colSpan={3} />
            </Table.Summary.Row>
          ) : null;
        }}
        columns={[
          { title: 'Fecha', dataIndex: 'fecha', width: 110, render: (v: any) => v?.substring(0, 10) ?? '—' },
          { title: 'Estudiante', dataIndex: 'estudianteNombre', ellipsis: true },
          { title: 'Concepto', dataIndex: 'cargoDescripcion', ellipsis: true, render: (v: any) => v ?? '—' },
          { title: 'Monto', dataIndex: 'monto', align: 'right', render: (v: any) => fmt.format(v) },
          {
            title: 'Método',
            dataIndex: 'metodoPago',
            render: (v: string) => <Tag color={METODO_COLOR[v] ?? 'default'}>{v}</Tag>,
          },
          { title: 'Referencia', dataIndex: 'referencia', render: (v: any) => v ?? '—' },
          { title: 'Observaciones', dataIndex: 'observaciones', ellipsis: true, render: (v: any) => v ?? '—' },
        ]}
      />
    </div>
  );
}
