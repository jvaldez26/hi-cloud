import { useState } from 'react';
import {
  Table, Button, Select, DatePicker, Typography, Tag, Space, Card, message,
} from 'antd';
import { FilePdfOutlined, WarningOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { farmaciaApi } from '../../api/farmacia.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';

const { Title } = Typography;

const COLS_DEF = [
  { key: 'fecha', label: 'Fecha', defaultVisible: true },
  { key: 'nombreGenerico', label: 'Medicamento', defaultVisible: true },
  { key: 'numeroLote', label: 'Lote', defaultVisible: true },
  { key: 'tipo', label: 'Tipo', defaultVisible: true },
  { key: 'cantidad', label: 'Cantidad', defaultVisible: true },
  { key: 'saldoAnterior', label: 'Saldo Ant.', defaultVisible: false },
  { key: 'saldoActual', label: 'Saldo Act.', defaultVisible: true },
  { key: 'receptorNombre', label: 'Receptor', defaultVisible: true },
  { key: 'receptorCedula', label: 'Cédula', defaultVisible: false },
  { key: 'receptorMedico', label: 'Médico', defaultVisible: false },
  { key: 'recetaNumero', label: 'Receta', defaultVisible: false },
  { key: 'autorizadoPor', label: 'Autorizado por', defaultVisible: false },
];
const { RangePicker } = DatePicker;

export default function NarcoticoPage() {
  const [medId, setMedId] = useState<number | undefined>();
  const [rango, setRango] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('farmacia-narcoticos', COLS_DEF);

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
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 140, render: (v: string) => new Date(v).toLocaleString('es-DO') },
    { title: 'Medicamento', dataIndex: 'nombreGenerico', key: 'nombreGenerico', render: (v: string, r: any) => `${v} ${r.concentracion ?? ''}` },
    { title: 'Lote', dataIndex: 'numeroLote', key: 'numeroLote', width: 120 },
    {
      title: 'Tipo', dataIndex: 'tipo', key: 'tipo', width: 90,
      render: (v: string) => <Tag color={v === 'entrada' ? 'green' : 'red'}>{v?.toUpperCase()}</Tag>,
    },
    { title: 'Cantidad', dataIndex: 'cantidad', key: 'cantidad', width: 80 },
    { title: 'Saldo Ant.', dataIndex: 'saldoAnterior', key: 'saldoAnterior', width: 90 },
    { title: 'Saldo Act.', dataIndex: 'saldoActual', key: 'saldoActual', width: 90, render: (v: number) => <strong>{v}</strong> },
    { title: 'Receptor', dataIndex: 'receptorNombre', key: 'receptorNombre', ellipsis: true },
    { title: 'Cédula', dataIndex: 'receptorCedula', key: 'receptorCedula', width: 120 },
    { title: 'Médico', dataIndex: 'receptorMedico', key: 'receptorMedico', width: 140 },
    { title: 'Receta', dataIndex: 'recetaNumero', key: 'recetaNumero', width: 110 },
    { title: 'Autorizado por', dataIndex: 'autorizadoPor', key: 'autorizadoPor', width: 130 },
  ];

  const exportarExcelNarcoticos = () => {
    const filas = (libro ?? []).map((r: any) => ({
      'Fecha': new Date(r.fecha).toLocaleString('es-DO'),
      'Medicamento': `${r.nombreGenerico} ${r.concentracion ?? ''}`,
      'Lote': r.numeroLote,
      'Tipo': r.tipo,
      'Cantidad': r.cantidad,
      'Saldo Anterior': r.saldoAnterior,
      'Saldo Actual': r.saldoActual,
      'Receptor': r.receptorNombre ?? '',
      'Cédula': r.receptorCedula ?? '',
      'Médico': r.receptorMedico ?? '',
      'Receta': r.recetaNumero ?? '',
      'Autorizado por': r.autorizadoPor ?? '',
    }));
    exportarExcel(filas, `Narcoticos-${new Date().toISOString().split('T')[0]}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          <WarningOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />
          Libro de Control de Narcóticos y Psicotrópicos
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportarExcelNarcoticos}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['farmacia-narcoticos']} />
          <VideoTutorialButton />
        </div>
      </div>

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
        columns={filterColumns(cols as any)}
        rowKey="id"
        size="small"
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 50, showTotal: (t) => `${t} registros` }}
      />
    </div>
  );
}
