import { useState } from 'react';
import { Table, Tag, Row, Col, Card, Statistic, DatePicker, Select, Button, message } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';
import { ColumnToggle } from '../../components/ui/ColumnToggle';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { exportarExcel } from '../../utils/exportExcel';
import { hoyRD } from '../../utils/fechaRD';

const COLS_DEF = [
  { key: 'fechaHora', label: 'Fecha/Hora', defaultVisible: true },
  { key: 'miembroNombre', label: 'Miembro', defaultVisible: true },
  { key: 'tipo', label: 'Tipo', defaultVisible: true },
  { key: 'autorizado', label: 'Autorizado', defaultVisible: true },
  { key: 'motivoRechazo', label: 'Motivo Rechazo', defaultVisible: false },
];

export default function AccesosPage() {
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [miembroFiltro, setMiembroFiltro] = useState<number | undefined>();

  const { visibleColumns, updateVisibility, filterColumns } = useColumnVisibility('gimnasio-accesos', COLS_DEF);

  const exportar = () => {
    const filas = (Array.isArray(data) ? data : []).map((r: any) => ({
      'Fecha/Hora': r.fechaHora ? new Date(r.fechaHora).toLocaleString('es-DO') : '',
      'Miembro': r.miembroNombre,
      'Tipo': r.tipo,
      'Autorizado': r.autorizado ? 'Si' : 'No',
      'Motivo Rechazo': r.motivoRechazo,
    }));
    exportarExcel(filas, `Accesos-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['gimnasio-accesos', desde, hasta, miembroFiltro],
    queryFn: () => gimnasioApi.getAccesos({ desde, hasta, miembroId: miembroFiltro }),
  });
  const accesos = Array.isArray(data) ? data : [];

  const { data: miembrosData } = useQuery({ queryKey: ['gimnasio-miembros-sel'], queryFn: () => gimnasioApi.getMiembros({ limit: 500 }) });
  const miembros = Array.isArray(miembrosData) ? miembrosData : miembrosData?.data ?? [];

  const totalHoy = accesos.filter((a: any) => a.autorizado).length;
  const totalDenegados = accesos.filter((a: any) => !a.autorizado).length;

  const columns = [
    { key: 'fechaHora', title: 'Fecha/Hora', dataIndex: 'fechaHora', render: (v: string) => new Date(v).toLocaleString('es-DO') },
    { key: 'miembroNombre', title: 'Miembro', dataIndex: 'miembroNombre' },
    { key: 'tipo', title: 'Tipo', dataIndex: 'tipo' },
    { key: 'autorizado', title: 'Autorizado', dataIndex: 'autorizado', render: (v: boolean) => v ? <Tag color="green">Si</Tag> : <Tag color="red">No</Tag> },
    { key: 'motivoRechazo', title: 'Motivo Rechazo', dataIndex: 'motivoRechazo' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Historial de Accesos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button icon={<FileExcelOutlined />} onClick={exportar}>Excel</Button>
          <ColumnToggle columns={COLS_DEF} visibleColumns={visibleColumns} onChange={updateVisibility} />
          <RefreshByKeyButton queryKey={['gimnasio-accesos']} />
          <VideoTutorialButton />
        </div>
      </div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card><Statistic title="Entradas Autorizadas" value={totalHoy} valueStyle={{ color: '#10b981' }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Accesos Denegados" value={totalDenegados} valueStyle={{ color: '#ef4444' }} /></Card></Col>
      </Row>
      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}>
          <DatePicker placeholder="Desde" style={{ width: '100%' }} onChange={d => setDesde(d ? d.format('YYYY-MM-DD') : '')} />
        </Col>
        <Col xs={24} md={6}>
          <DatePicker placeholder="Hasta" style={{ width: '100%' }} onChange={d => setHasta(d ? d.format('YYYY-MM-DD') : '')} />
        </Col>
        <Col xs={24} md={8}>
          <Select style={{ width: '100%' }} placeholder="Filtrar por miembro" allowClear showSearch optionFilterProp="children"
            value={miembroFiltro} onChange={v => setMiembroFiltro(v)}>
            {miembros.map((m: any) => <Select.Option key={m.id} value={m.id}>{m.nombre} {m.apellidos ?? ''}</Select.Option>)}
          </Select>
        </Col>
      </Row>
      <Table dataSource={accesos} columns={filterColumns(columns as any)} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
    </div>
  );
}
