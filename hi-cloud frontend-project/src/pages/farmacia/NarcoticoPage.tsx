import { useState } from 'react';
import {
  Table, Button, Select, DatePicker, Typography, Tag, Space, Card,
} from 'antd';
import { FilePdfOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { farmaciaApi } from '../../api/farmacia.api';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export default function NarcoticoPage() {
  const [medId, setMedId] = useState<number | undefined>();
  const [rango, setRango] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const { data: medsData } = useQuery({
    queryKey: ['farmacia-narcoticos-meds'],
    queryFn: () => farmaciaApi.medicamentos({ limit: 200, categoria: undefined }),
  });
  const narcoMeds = (medsData?.data ?? []).filter((m: any) => m.esNarcotico || m.esPsicotropico);

  const desde = rango?.[0]?.format('YYYY-MM-DD');
  const hasta = rango?.[1]?.format('YYYY-MM-DD');

  const { data: libro, isLoading } = useQuery({
    queryKey: ['farmacia-narcoticos', medId, desde, hasta],
    queryFn: () => farmaciaApi.narcoticos({ medicamentoId: medId, desde, hasta }),
  });

  const exportPdf = async () => {
    const blob = await farmaciaApi.pdfNarcoticos({ medicamentoId: medId, desde, hasta }).then(r => r.data);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const cols = [
    { title: 'Fecha', dataIndex: 'fecha', width: 140, render: (v: string) => new Date(v).toLocaleString('es-DO') },
    { title: 'Medicamento', dataIndex: 'nombreGenerico', render: (v: string, r: any) => `${v} ${r.concentracion ?? ''}` },
    { title: 'Lote', dataIndex: 'numeroLote', width: 120 },
    {
      title: 'Tipo', dataIndex: 'tipo', width: 90,
      render: (v: string) => <Tag color={v === 'entrada' ? 'green' : 'red'}>{v?.toUpperCase()}</Tag>,
    },
    { title: 'Cantidad', dataIndex: 'cantidad', width: 80 },
    { title: 'Saldo Ant.', dataIndex: 'saldoAnterior', width: 90 },
    { title: 'Saldo Act.', dataIndex: 'saldoActual', width: 90, render: (v: number) => <strong>{v}</strong> },
    { title: 'Receptor', dataIndex: 'receptorNombre', ellipsis: true },
    { title: 'Cédula', dataIndex: 'receptorCedula', width: 120 },
    { title: 'Médico', dataIndex: 'receptorMedico', width: 140 },
    { title: 'Receta', dataIndex: 'recetaNumero', width: 110 },
    { title: 'Autorizado por', dataIndex: 'autorizadoPor', width: 130 },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginBottom: 16 }}>
        <WarningOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />
        Libro de Control de Narcóticos y Psicotrópicos
      </Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Filtrar por medicamento"
            style={{ width: 280 }}
            allowClear
            showSearch
            optionFilterProp="label"
            onChange={v => setMedId(v)}
            options={narcoMeds.map((m: any) => ({ value: m.id, label: `${m.nombreGenerico} ${m.concentracion ?? ''}` }))}
          />
          <RangePicker
            format="DD/MM/YYYY"
            value={rango}
            onChange={v => setRango(v as any)}
            placeholder={['Desde', 'Hasta']}
          />
          <Button icon={<FilePdfOutlined />} onClick={exportPdf}>Exportar PDF</Button>
        </Space>
      </Card>

      <Table
        dataSource={libro ?? []}
        columns={cols}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 50, showTotal: (t) => `${t} registros` }}
      />
    </div>
  );
}
