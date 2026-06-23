import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { Card, Row, Col, Typography, Button, Upload, Table, Tag, Alert,
         Space, Steps, Tabs, Divider, message } from 'antd';
import { UploadOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../api/client';

const { Title, Text, Paragraph } = Typography;

interface ImportResult {
  total:    number; exitosos: number; errores: number;
  detalles: Array<{ fila: number; error?: string; estado: 'ok' | 'error' }>;
}

type TipoImport = 'clientes' | 'productos' | 'proveedores';

const importApi = {
  importar: (tipo: TipoImport, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    // Sin Content-Type explícito: el browser lo setea con el boundary multipart correcto.
    // Si se deja el default 'application/json' del cliente, multer no parsea el archivo.
    return api.post(`/importacion/${tipo}`, fd, {
      headers: { 'Content-Type': undefined },
    }).then((r: any) => r.data?.data ?? r.data) as Promise<ImportResult>;
  },
  descargarPlantilla: (tipo: TipoImport) => {
    const link = document.createElement('a');
    link.href  = `/api/v1/importacion/plantilla/${tipo}`;
    link.download = `plantilla-${tipo}.csv`;
    link.click();
  },
};

function ImportCard({ tipo, title, campos }: { tipo: TipoImport; title: string; campos: string[] }) {
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const qc = useQueryClient();

  const importMut = useMutation({
    mutationFn: (file: File) => importApi.importar(tipo, file),
    onSuccess: (data) => {
      setResultado(data);
      qc.invalidateQueries({ queryKey: [tipo] });
      qc.invalidateQueries({ queryKey: [`${tipo}-sel`] });
      if (data.exitosos > 0) message.success(`${data.exitosos} registros importados correctamente`);
    },
    onError: (e: any) => {
      setResultado(null);
      // El interceptor extrae data.errors[0] en e.friendlyMessage; fallback al mensaje de axios
      message.error(e?.friendlyMessage ?? e?.response?.data?.errors?.[0] ?? e?.message ?? 'Error durante la importación');
    },
  });

  const cols = [
    { title: 'Fila',   dataIndex: 'fila',   width: 70 },
    { title: 'Estado', dataIndex: 'estado', width: 90,
      render: (v: string) => v === 'ok'
        ? <Tag color="green" icon={<CheckCircleOutlined />}>OK</Tag>
        : <Tag color="red"   icon={<CloseCircleOutlined />}>Error</Tag> },
    { title: 'Detalle', dataIndex: 'error', ellipsis: true,
      render: (v?: string) => v ?? <Text type="secondary">Importado correctamente</Text> },
  ];

  return (
    <Card title={title}>
      <Steps size="small" current={resultado ? 2 : importMut.isPending ? 1 : 0} style={{ marginBottom: 20 }}
        items={[
          { title: 'Preparar CSV', description: 'Descarga la plantilla' },
          { title: 'Subir archivo', description: 'Selecciona tu CSV' },
          { title: 'Resultado', description: 'Verifica los registros' },
        ]} />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col>
          <Button icon={<DownloadOutlined />} onClick={() => importApi.descargarPlantilla(tipo)}>
            Descargar plantilla CSV
          </Button>
        </Col>
        <Col>
          <Upload
            accept=".csv"
            showUploadList={false}
            beforeUpload={(file) => { importMut.mutate(file); return false; }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={importMut.isPending}>
              Subir archivo CSV
            </Button>
          </Upload>
        </Col>
      </Row>

      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="Formato CSV requerido"
        description={<>Columnas: <Text code>{campos.join(', ')}</Text>. La primera fila es el encabezado y debe coincidir exactamente.</>} />

      {resultado && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Row gutter={[16, 16]} style={{ marginBottom: 12 }}>
            <Col xs={24} sm={8}><Card size="small"><Text>Total: <strong>{resultado.total}</strong></Text></Card></Col>
            <Col xs={24} sm={8}><Card size="small" style={{ borderColor: '#86efac' }}><Text style={{ color: '#059669' }}>✓ Exitosos: <strong>{resultado.exitosos}</strong></Text></Card></Col>
            <Col xs={24} sm={8}><Card size="small" style={{ borderColor: resultado.errores > 0 ? '#fca5a5' : undefined }}><Text style={{ color: resultado.errores > 0 ? '#dc2626' : undefined }}>✗ Errores: <strong>{resultado.errores}</strong></Text></Card></Col>
          </Row>

          {resultado.errores > 0 && (
            <Table columns={cols}
              dataSource={resultado.detalles.filter(d => d.estado === 'error')}
              rowKey="fila" size="small" pagination={{ pageSize: 10 }}
              title={() => <Text type="danger">Filas con error:</Text>} 
        scroll={{ x: 'max-content' }} />
          )}

          {resultado.exitosos > 0 && (
            <Alert type="success" showIcon
              message={`${resultado.exitosos} registros importados correctamente`} />
          )}
        </motion.div>
      )}
    </Card>
  );
}

export default function ImportacionPage() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Title level={4} style={{ margin: 0 }}>Importación Masiva de Datos</Title>
        <Space>
          <RefreshByKeyButton queryKey={['importacion']} />
          <VideoTutorialButton />
        </Space>
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        Importa clientes y productos en masa desde archivos CSV. Útil para migrar de otro sistema o cargar datos iniciales.
      </Paragraph>

      <Tabs items={[
        {
          key: 'clientes',
          label: '👥 Clientes',
          children: (
            <ImportCard
              tipo="clientes"
              title="Importar Clientes desde CSV"
              campos={['nombre', 'rnc', 'email', 'telefono', 'direccion', 'ciudad']}
            />
          ),
        },
        {
          key: 'productos',
          label: '🛍️ Productos',
          children: (
            <ImportCard
              tipo="productos"
              title="Importar Productos / Catálogo desde CSV"
              campos={['codigo', 'nombre', 'precio', 'precio2', 'precio3', 'porcentajeItbis', 'unidadMedida', 'stock', 'stockMinimo', 'categoria', 'descripcion', 'tipo', 'almacen']}
            />
          ),
        },
        {
          key: 'proveedores',
          label: '🏭 Proveedores',
          children: (
            <ImportCard
              tipo="proveedores"
              title="Importar Proveedores desde CSV"
              campos={['nombre', 'rnc', 'telefono', 'email', 'direccion', 'contacto', 'categoria', 'diasPago']}
            />
          ),
        },
      ]} />
    </div>
  );
}
