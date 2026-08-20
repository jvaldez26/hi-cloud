import { useState } from 'react';
import {
  Card, Row, Col, Table, Tag, Button, Space, Statistic, Alert,
  Tooltip, Modal, Typography, Badge,
} from 'antd';
import {
  CloudUploadOutlined, DownloadOutlined, SyncOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  DatabaseOutlined, SafetyOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/es';
import api from '../../api/client';

dayjs.extend(relativeTime);
dayjs.locale('es');

const { Text, Title } = Typography;

const adminApi = {
  backups:   (page = 1) => api.get(`/admin/backups?page=${page}`).then(r => r.data?.data ?? r.data),
  s3Status:  ()         => api.get('/admin/backups/s3-status').then(r => r.data?.data ?? r.data),
  trigger:   ()         => api.post('/admin/backups/trigger').then(r => r.data?.data ?? r.data),
};

function tamanioColor(t: string) {
  if (!t) return '#94a3b8';
  const mb = parseFloat(t);
  if (t.includes('G')) return '#ef4444';
  if (mb > 100) return '#f59e0b';
  return '#10b981';
}

export default function BackupsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-backups', page],
    queryFn:  () => adminApi.backups(page),
    refetchInterval: 30_000,
  });

  const { data: s3 } = useQuery({
    queryKey: ['admin-s3-status'],
    queryFn:  adminApi.s3Status,
    staleTime: 60_000,
  });

  const triggerMut = useMutation({
    mutationFn: adminApi.trigger,
    onSuccess: (r) => {
      Modal.success({ title: 'Backup iniciado', content: r?.mensaje ?? 'El backup está en progreso. Se notificará al completar.' });
      setTimeout(() => { qc.invalidateQueries({ queryKey: ['admin-backups'] }); refetch(); }, 3000);
    },
    onError: () => Modal.error({ title: 'Error', content: 'No se pudo iniciar el backup.' }),
  });

  const items      = data?.items ?? [];
  const stats      = data?.stats ?? {};
  const meta       = data?.meta  ?? {};
  const ultimo     = items[0];
  const horasDesde = ultimo ? Math.floor((Date.now() - new Date(ultimo.createdAt).getTime()) / 3_600_000) : null;
  const alertaVencido = horasDesde !== null && horasDesde > 25;

  const cols = [
    {
      title: 'Fecha', dataIndex: 'createdAt', width: 155,
      render: (v: string) => (
        <Tooltip title={dayjs(v).format('DD/MM/YYYY HH:mm:ss')}>
          <span style={{ fontSize: 12 }}>{dayjs(v).format('DD MMM YYYY HH:mm')}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Tipo', dataIndex: 'tipo', width: 90,
      render: (v: string) => {
        const colors: Record<string, string> = { daily:'blue', weekly:'purple', monthly:'orange', manual:'cyan' };
        return <Tag color={colors[v] ?? 'default'} style={{ fontSize: 11 }}>{v.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Estado', dataIndex: 'estado', width: 120,
      render: (v: string) => {
        if (v === 'EXITOSO')      return <Tag color="green"  icon={<CheckCircleOutlined />}>Exitoso</Tag>;
        if (v === 'FALLIDO')      return <Tag color="red"    icon={<CloseCircleOutlined />}>Fallido</Tag>;
        return                           <Tag color="blue"   icon={<SyncOutlined spin />}>En progreso</Tag>;
      },
    },
    {
      title: 'Tamaño', dataIndex: 'tamanio', width: 90, align: 'right' as const,
      render: (v: string) => v
        ? <Text style={{ color: tamanioColor(v), fontSize: 12, fontFamily: 'monospace' }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Duración', dataIndex: 'duracionSegundos', width: 90, align: 'right' as const,
      render: (v: number) => v ? <Text style={{ fontSize: 12 }}>{v}s</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Integridad', dataIndex: 'integridadVerificada', width: 110, align: 'center' as const,
      render: (v: boolean) => v
        ? <Tooltip title="SHA-256 verificado"><Tag color="green" icon={<SafetyOutlined />}>✅</Tag></Tooltip>
        : <Tag color="default">N/A</Tag>,
    },
    {
      title: 'S3 Key', dataIndex: 's3Key', ellipsis: true,
      render: (v: string) => v
        ? <Text code style={{ fontSize: 10 }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: '', width: 100, align: 'right' as const,
      render: (_: any, r: any) => (
        <Button size="small" icon={<DownloadOutlined />}
          disabled={r.estado !== 'EXITOSO' || !r.s3Key}
          onClick={() => window.open(`/api/v1/admin/backups/${r.id}/download`, '_blank')}>
          Descargar
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <DatabaseOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Backups del Sistema
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Copias de seguridad automáticas · Daily 02:00 AM · S3 STANDARD_IA
          </Text>
        </Col>
        <Col xs={24} sm="auto">
          <Space wrap>
            <Button icon={<SyncOutlined />} onClick={() => refetch()}>Actualizar</Button>
            <Button type="primary" icon={<CloudUploadOutlined />}
              loading={triggerMut.isPending}
              onClick={() => {
                setConfirming(true);
                Modal.confirm({
                  title: 'Ejecutar backup manual',
                  content: 'Se ejecutará pg_dump y se subirá a S3. Puede tardar 1-3 minutos.',
                  okText: 'Ejecutar', cancelText: 'Cancelar',
                  onOk: () => { setConfirming(false); triggerMut.mutate(); },
                  onCancel: () => setConfirming(false),
                });
              }}>
              Backup manual
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Alerta si el último backup tiene más de 25h */}
      {alertaVencido && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }}
          icon={<ExclamationCircleOutlined />}
          message={`⚠️ El último backup fue hace ${horasDesde} horas — verifica el cron job`}
          description="Un backup diario debería ejecutarse cada 24 horas. Si el cron job falló, ejecuta un backup manual."
          action={
            <Button danger size="small" onClick={() => triggerMut.mutate()} loading={triggerMut.isPending}>
              Ejecutar ahora
            </Button>
          }
        />
      )}

      {/* S3 status */}
      {s3 && (
        <Alert
          type={s3.ok ? 'success' : s3.habilitado ? 'error' : 'warning'}
          showIcon style={{ marginBottom: 16 }}
          message={
            s3.ok ? `✅ S3 conectado — bucket: ${s3.bucket}` :
            s3.habilitado ? `❌ S3 no responde — bucket: ${s3.bucket}` :
            '⚠️ S3 no configurado — establece AWS_S3_BACKUP_BUCKET en el .env del servidor'
          }
        />
      )}

      {/* Estadísticas */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Último backup"
              value={ultimo ? `hace ${horasDesde}h` : 'Nunca'}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ fontSize: 16, color: alertaVencido ? '#ef4444' : '#10b981' }} />
            {ultimo && <Text type="secondary" style={{ fontSize: 11 }}>{ultimo.tamanio}</Text>}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Tasa de éxito"
              value={stats.tasaExito ?? 100}
              suffix="%"
              valueStyle={{ fontSize: 16, color: (stats.tasaExito ?? 100) >= 95 ? '#10b981' : '#ef4444' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Exitosos" value={stats.exitosos ?? 0} prefix="✅"
              valueStyle={{ fontSize: 16, color: '#10b981' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Fallidos" value={stats.fallidos ?? 0} prefix="❌"
              valueStyle={{ fontSize: 16, color: stats.fallidos > 0 ? '#ef4444' : '#94a3b8' }} />
          </Card>
        </Col>
      </Row>

      {/* Tabla */}
      <Card
        title={<Space><DatabaseOutlined /> Historial de backups</Space>}
        extra={<Badge count={meta.total ?? 0} style={{ background: '#6b7280' }} showZero />}
      >
        <Table
          columns={cols}
          dataSource={items}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: 10,
            total: meta.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `${t} backups`,
          }}
          rowClassName={(r: any) => r.estado === 'FALLIDO' ? 'ant-table-row-error' : ''}
          locale={{ emptyText: 'Sin backups registrados aún — ejecuta el primero manualmente' }}
        />
      </Card>

      {/* Instrucciones de configuración */}
      <Card title="⚙️ Configuración del servidor EC2" size="small" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Variables .env requeridas:</Text>
            <pre style={{ background: '#f1f5f9', padding: 12, borderRadius: 6, fontSize: 12, margin: 0 }}>
{`AWS_S3_BACKUP_BUCKET=hicloud-backups-xxxxx
AWS_REGION=us-east-2
INTERNAL_API_KEY=genera-un-secreto-aqui
BACKUP_SCRIPT_PATH=/home/ubuntu/scripts/backup-hicloud.sh`}
            </pre>
          </Col>
          <Col xs={24} md={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Configurar crontab (02:00 AM diario):</Text>
            <pre style={{ background: '#f1f5f9', padding: 12, borderRadius: 6, fontSize: 12, margin: 0 }}>
{`# En el servidor EC2:
chmod +x /home/ubuntu/scripts/backup-hicloud.sh
crontab -e
# Agregar esta línea:
0 2 * * * /home/ubuntu/scripts/backup-hicloud.sh`}
            </pre>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

