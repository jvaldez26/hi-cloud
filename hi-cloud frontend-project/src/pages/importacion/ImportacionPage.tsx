import { useState } from 'react';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';
import { Card, Row, Col, Typography, Button, Upload, Table, Tag, Alert,
         Space, Steps, Tabs, Divider, Modal, message } from 'antd';
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

interface PreviewResult {
  encoding: 'utf-8' | 'windows-1252';
  headers: string[];
  rows: string[][];
}

const importApi = {
  importar: (tipo: TipoImport, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    // Sin Content-Type explícito: el browser lo setea con el boundary multipart correcto.
    // Si se deja el default 'application/json' del cliente, multer no parsea el archivo.
    return api.post(`/importacion/${tipo}`, fd, {
      headers: { 'Content-Type': undefined },
    }).then((r: any) => r.data?.data ?? r.data) as Promise<ImportResult>;
  },
  preview: (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/importacion/preview', fd, {
      headers: { 'Content-Type': undefined },
    }).then((r: any) => r.data?.data ?? r.data) as Promise<PreviewResult>;
  },
  descargarPlantilla: (tipo: TipoImport) => {
    const link = document.createElement('a');
    link.href  = `/api/v1/importacion/plantilla/${tipo}`;
    link.download = `plantilla-${tipo}.csv`;
    link.click();
  },
};

function ImportCard({ tipo, title, campos }: { tipo: TipoImport; title: string; campos: string[] }) {
  const [resultado,   setResultado]   = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
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
      message.error(e?.friendlyMessage ?? e?.response?.data?.errors?.[0] ?? e?.message ?? 'Error durante la importación');
    },
  });

  const previewMut = useMutation({
    mutationFn: (file: File) => importApi.preview(file),
    onSuccess: (data, file) => {
      setPendingFile(file);
      setPreviewData(data);
      setPreviewOpen(true);
    },
    onError: (e: any) => {
      message.error(e?.friendlyMessage ?? 'Error al leer el archivo CSV');
    },
  });

  const cancelPreview = () => {
    setPreviewOpen(false);
    setPendingFile(null);
    setPreviewData(null);
  };

  const confirmarImport = () => {
    if (!pendingFile) return;
    importMut.mutate(pendingFile);
    cancelPreview();
  };

  const previewCols = (previewData?.headers ?? []).map(h => ({
    title: h, dataIndex: h, ellipsis: true,
  }));
  const previewRows = (previewData?.rows ?? []).map((row, i) => ({
    key: i,
    ...Object.fromEntries((previewData?.headers ?? []).map((h, j) => [h, row[j] ?? ''])),
  }));

  const cols = [
    { title: 'Fila',   dataIndex: 'fila',   width: 70 },
    { title: 'Estado', dataIndex: 'estado', width: 90,
      render: (v: string) => v === 'ok'
        ? <Tag color="green" icon={<CheckCircleOutlined />}>OK</Tag>
        : <Tag color="red"   icon={<CloseCircleOutlined />}>Error</Tag> },
    { title: 'Detalle', dataIndex: 'error', ellipsis: true,
      render: (v?: string) => v ?? <Text type="secondary">Importado correctamente</Text> },
  ];

  const isLoading = importMut.isPending || previewMut.isPending;

  return (
    <Card title={title}>
      <Steps size="small" current={resultado ? 2 : isLoading ? 1 : 0} style={{ marginBottom: 20 }}
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
            beforeUpload={(file) => { previewMut.mutate(file); return false; }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={isLoading}>
              Subir archivo CSV
            </Button>
          </Upload>
        </Col>
      </Row>

      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="Formato CSV requerido"
        description={<>Columnas: <Text code>{campos.join(', ')}</Text>. La primera fila es el encabezado y debe coincidir exactamente.</>} />

      {/* ── Modal de vista previa ── */}
      <Modal
        title="Vista previa — confirma que los nombres se ven correctamente"
        open={previewOpen}
        width={820}
        onCancel={cancelPreview}
        footer={[
          <Button key="cancel" onClick={cancelPreview}>Cancelar</Button>,
          <Button key="import" type="primary" loading={importMut.isPending} onClick={confirmarImport}>
            Se ve bien — Importar
          </Button>,
        ]}
      >
        <Alert
          type={previewData?.encoding === 'windows-1252' ? 'warning' : 'success'}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            previewData?.encoding === 'windows-1252'
              ? 'Archivo Excel / Windows-1252 detectado — revisa que acentos y Ñ aparezcan correctamente abajo'
              : 'Archivo UTF-8 — encoding estándar'
          }
        />
        <Table
          dataSource={previewRows}
          columns={previewCols}
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
        <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
          Primeras {previewData?.rows.length ?? 0} filas de datos. Si los nombres se ven bien, haz clic en «Se ve bien — Importar».
        </Text>
      </Modal>

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
