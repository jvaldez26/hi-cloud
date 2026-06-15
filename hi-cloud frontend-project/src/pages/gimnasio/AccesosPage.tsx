import { useState } from 'react';
import { Table, Tag, Row, Col, Card, Statistic, DatePicker, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { gimnasioApi } from '../../api/gimnasio.api';

export default function AccesosPage() {
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [miembroFiltro, setMiembroFiltro] = useState<number | undefined>();

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
    { title: 'Fecha/Hora', dataIndex: 'fechaHora', render: (v: string) => new Date(v).toLocaleString('es-DO') },
    { title: 'Miembro', dataIndex: 'miembroNombre' },
    { title: 'Tipo', dataIndex: 'tipo' },
    { title: 'Autorizado', dataIndex: 'autorizado', render: (v: boolean) => v ? <Tag color="green">Si</Tag> : <Tag color="red">No</Tag> },
    { title: 'Motivo Rechazo', dataIndex: 'motivoRechazo' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Historial de Accesos</h2>
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
      <Table dataSource={accesos} columns={columns} rowKey="id" loading={isLoading} scroll={{ x: 'max-content' }} />
    </div>
  );
}
