import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Tabs, Table, Tag, Button, Descriptions, Statistic, Row, Col, Spin, message, theme } from 'antd';
import { ArrowLeft, FileText } from 'lucide-react';
import { FileExcelOutlined } from '@ant-design/icons';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { exportarExcel } from '../../utils/exportExcel';
import { prestamistalApi } from '../../api/prestamista.api';
import { hoyRD } from '../../utils/fechaRD';

const fmt = (n: any) => `RD$ ${Number(n ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const estadoColor: Record<string, string> = { al_dia: 'green', moroso: 'orange', vencido: 'red', pagado: 'blue', cancelado: 'default', refinanciado: 'purple' };
const riesgoColor: Record<string, string> = { bajo: 'green', medio: 'blue', alto: 'orange', critico: 'red' };

export default function FichaDeudorPage() {
  const { token: C } = theme.useToken();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: deudor, isLoading } = useQuery({
    queryKey: ['prestamista-deudor', id],
    queryFn: () => prestamistalApi.getDeudor(Number(id)),
    enabled: !!id,
  });

  const { data: garantias } = useQuery({
    queryKey: ['prestamista-garantias-deudor', id],
    queryFn: () => prestamistalApi.getGarantiasByDeudor(Number(id)),
    enabled: !!id,
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  if (!deudor) return <div style={{ padding: 24 }}>Deudor no encontrado</div>;

  const prestamos: any[] = deudor.prestamos ?? [];

  const exportarPrestamos = () => {
    const filas = prestamos.map((r: any) => ({
      'N°': r.numero,
      'Capital': r.montoPrincipal,
      'Saldo': r.saldoTotal,
      'Estado': r.estado,
      'Desembolso': r.fechaDesembolso?.slice(0, 10),
      'Vencimiento': r.fechaVencimiento?.slice(0, 10),
    }));
    exportarExcel(filas, `Prestamos-Deudor-${deudor.numero}-${hoyRD()}`);
    message.success(`${filas.length} registros exportados`);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeft size={14} />} onClick={() => navigate('/prestamista/deudores')}>Volver</Button>
        <h2 style={{ margin: 0, color: C.colorText }}>{deudor.nombre} {deudor.apellidos ?? ''}</h2>
        <Tag color={riesgoColor[deudor.nivelRiesgo] ?? 'default'}>{deudor.nivelRiesgo}</Tag>
        {deudor.enListaNegra && <Tag color="red">Lista Negra</Tag>}
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Total Prestado" value={fmt(deudor.totalPrestado)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Total Pagado" value={fmt(deudor.totalPagado)} valueStyle={{ color: C.colorSuccess }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Préstamos Activos" value={deudor.prestamosActivos ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Días Mora Histórico" value={deudor.diasMoraHistorico ?? 0} valueStyle={{ color: (deudor.diasMoraHistorico ?? 0) > 0 ? C.colorError : undefined }} /></Card></Col>
      </Row>

      <Tabs items={[
        {
          key: 'info',
          label: 'Información Personal',
          children: (
            <Card>
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} bordered size="small">
                <Descriptions.Item label="N° Deudor">{deudor.numero}</Descriptions.Item>
                <Descriptions.Item label="Cédula">{deudor.cedula ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="RNC">{deudor.rnc ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Fecha Nacimiento">{deudor.fechaNacimiento ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Sexo">{deudor.sexo ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Estado Civil">{deudor.estadoCivil ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Teléfono">{deudor.telefono ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Tel. Trabajo">{deudor.telefonoTrabajo ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Email">{deudor.email ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Dirección" span={3}>{deudor.direccion ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Ocupación">{deudor.ocupacion ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Empresa">{deudor.empresaLabora ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Ingreso Mensual">{deudor.ingresoMensual ? fmt(deudor.ingresoMensual) : '—'}</Descriptions.Item>
                <Descriptions.Item label="Ref. 1">{deudor.referenciaNombre1 ?? '—'} {deudor.referenciaTelefono1 ? `· ${deudor.referenciaTelefono1}` : ''}</Descriptions.Item>
                <Descriptions.Item label="Ref. 2">{deudor.referenciaNombre2 ?? '—'} {deudor.referenciaTelefono2 ? `· ${deudor.referenciaTelefono2}` : ''}</Descriptions.Item>
                <Descriptions.Item label="Score Crédito">{deudor.scoreCredito ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Notas" span={3}>{deudor.notas ?? '—'}</Descriptions.Item>
              </Descriptions>
            </Card>
          ),
        },
        {
          key: 'prestamos',
          label: `Préstamos (${prestamos.length})`,
          children: (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, gap: 2 }}>
                <Button icon={<FileExcelOutlined />} onClick={exportarPrestamos}>Excel</Button>
                <RefreshByKeyButton queryKey={['prestamista-deudor']} />
                <VideoTutorialButton />
              </div>
              <Table
                dataSource={prestamos.map((r: any) => ({ ...r, key: r.id }))}
                scroll={{ x: 'max-content' }} size="small"
                columns={[
                  { title: 'N°', dataIndex: 'numero', width: 110 },
                  { title: 'Capital', dataIndex: 'montoPrincipal', render: fmt },
                  { title: 'Saldo', dataIndex: 'saldoTotal', render: fmt },
                  { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag color={estadoColor[v] ?? 'default'}>{v}</Tag> },
                  { title: 'Desembolso', dataIndex: 'fechaDesembolso', render: (v: string) => v?.slice(0, 10) },
                  { title: 'Vencimiento', dataIndex: 'fechaVencimiento', render: (v: string) => v?.slice(0, 10) },
                  {
                    title: '', key: 'acc', width: 80,
                    render: (_: any, r: any) => (
                      <Button size="small" icon={<FileText size={13} />} onClick={() => navigate(`/prestamista/prestamos/${r.id}`)}>Ver</Button>
                    ),
                  },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'garantias',
          label: `Garantías (${(garantias ?? []).length})`,
          children: (
            <Table
              dataSource={(garantias ?? []).map((r: any) => ({ ...r, key: r.id }))}
              scroll={{ x: 'max-content' }} size="small"
              columns={[
                { title: 'Tipo', dataIndex: 'tipo' },
                { title: 'Descripción', dataIndex: 'descripcion' },
                { title: 'Valor Tasado', dataIndex: 'valorTasado', render: fmt },
                { title: 'Estado', dataIndex: 'estado', render: (v: string) => <Tag>{v}</Tag> },
              ]}
            />
          ),
        },
        {
          key: 'estado-cuenta',
          label: 'Estado de Cuenta PDF',
          children: (
            <div style={{ padding: 16 }}>
              <Button type="primary" icon={<FileText size={14} />}
                onClick={() => window.open(prestamistalApi.pdfEstadoCuenta(Number(id)), '_blank')}>
                Descargar Estado de Cuenta
              </Button>
            </div>
          ),
        },
      ]} />
    </div>
  );
}
