import { useState } from 'react';
import {
  Card, Row, Col, Button, Table, Tag, Modal, Form, Input, Select,
  Upload, Space, Typography, Statistic, Popconfirm, message,
  Tabs, Tooltip,
} from 'antd';
import {
  FileOutlined, PlusOutlined, DeleteOutlined, EyeOutlined,
  FileTextOutlined, FilePdfOutlined, FileImageOutlined,
  FileExcelOutlined, PaperClipOutlined, InboxOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';

const { Title, Text, Link } = Typography;
const { Option } = Select;
const { Dragger } = Upload;

const TIPOS_ENTIDAD = [
  { value: 'factura',    label: 'Factura',    color: 'blue'   },
  { value: 'compra',     label: 'Compra',     color: 'purple' },
  { value: 'cliente',    label: 'Cliente',    color: 'cyan'   },
  { value: 'proveedor',  label: 'Proveedor',  color: 'orange' },
  { value: 'empleado',   label: 'Empleado',   color: 'green'  },
  { value: 'contrato',   label: 'Contrato',   color: 'gold'   },
  { value: 'gasto',      label: 'Gasto',      color: 'red'    },
  { value: 'asiento',    label: 'Asiento',    color: 'volcano'},
  { value: 'proyecto',   label: 'Proyecto',   color: 'lime'   },
  { value: 'licitacion', label: 'Licitación', color: 'magenta'},
  { value: 'general',    label: 'General',    color: 'default'},
];

function iconPorExtension(ext?: string) {
  if (!ext) return <FileOutlined />;
  const e = ext.toLowerCase();
  if (['pdf'].includes(e))         return <FilePdfOutlined style={{ color: '#ef4444' }} />;
  if (['jpg','jpeg','png','gif'].includes(e)) return <FileImageOutlined style={{ color: '#3b82f6' }} />;
  if (['xlsx','xls','csv'].includes(e))       return <FileExcelOutlined style={{ color: '#16a34a' }} />;
  return <FileTextOutlined style={{ color: '#6b7280' }} />;
}

export default function DocumentosPage() {
  const qc = useQueryClient();
  const [modalSubir, setModalSubir] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();

  const { data: resumen } = useQuery<any>({
    queryKey: ['documentos-resumen'],
    queryFn:  () => api.get('/documentos/resumen').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: documentos = [], isLoading } = useQuery<any[]>({
    queryKey: ['documentos', filtroTipo],
    queryFn:  () => api.get(`/documentos${filtroTipo ? `?tipoEntidad=${filtroTipo}` : ''}`).then((r: any) => r.data?.data ?? r.data),
  });

  const subirDocumento = useMutation({
    mutationFn: (dto: any) => api.post('/documentos', dto),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['documentos'] });
      qc.invalidateQueries({ queryKey: ['documentos-resumen'] });
      setModalSubir(false);
      form.resetFields();
      message.success('Documento registrado');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const eliminarDoc = useMutation({
    mutationFn: (id: number) => api.delete(`/documentos/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['documentos'] });
      qc.invalidateQueries({ queryKey: ['documentos-resumen'] });
      message.success('Documento eliminado');
    },
  onError: (e: any) => message.error(
      e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error inesperado', 5),
  });

  const totalKb = (resumen?.porTipo ?? []).reduce((s: number, t: any) => s + Number(t.totalKb), 0);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PaperClipOutlined style={{ fontSize: 28, color: '#1a56db' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Gestión de Documentos</Title>
            <Text type="secondary">Archivos adjuntos a facturas, contratos, clientes y más</Text>
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalSubir(true)}>
          Registrar Documento
        </Button>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#1a56db,#3b82f6)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Total Documentos</span>}
              value={resumen?.total ?? 0}
              prefix={<FileOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Tipos de Entidad</span>}
              value={(resumen?.porTipo ?? []).length}
              prefix={<InboxOutlined />}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,.8)' }}>Almacenamiento</span>}
              value={totalKb > 1024 ? (totalKb / 1024).toFixed(1) : totalKb}
              suffix={totalKb > 1024 ? ' MB' : ' KB'}
              valueStyle={{ color: '#fff', fontSize: 28 }}
            />
          </Card>
        </Col>
      </Row>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        {/* Filtro por tipo */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tag
            onClick={() => setFiltroTipo(undefined)}
            style={{ cursor: 'pointer', fontWeight: filtroTipo === undefined ? 700 : 400 }}
            color={filtroTipo === undefined ? 'blue' : 'default'}
          >
            Todos ({resumen?.total ?? 0})
          </Tag>
          {(resumen?.porTipo ?? []).map((t: any) => {
            const conf = TIPOS_ENTIDAD.find(x => x.value === t.tipo);
            return (
              <Tag
                key={t.tipo}
                onClick={() => setFiltroTipo(t.tipo)}
                style={{ cursor: 'pointer', fontWeight: filtroTipo === t.tipo ? 700 : 400 }}
                color={filtroTipo === t.tipo ? (conf?.color ?? 'default') : 'default'}
              >
                {conf?.label ?? t.tipo} ({t.cantidad})
              </Tag>
            );
          })}
        </div>

        <Table
          dataSource={documentos}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 15 }}
          columns={[
            {
              title: 'Archivo', key: 'archivo',
              render: (_, r: any) => (
                <Space>
                  {iconPorExtension(r.extension)}
                  <div>
                    <Text strong style={{ fontSize: 13 }}>{r.nombre}</Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {r.extension?.toUpperCase()} · {r.tamanioKb > 1024 ? `${(r.tamanioKb / 1024).toFixed(1)} MB` : `${r.tamanioKb} KB`}
                      </Text>
                    </div>
                  </div>
                </Space>
              ),
            },
            {
              title: 'Tipo', dataIndex: 'tipoEntidad', key: 'tipoEntidad',
              render: v => {
                const conf = TIPOS_ENTIDAD.find(x => x.value === v);
                return <Tag color={conf?.color}>{conf?.label ?? v}</Tag>;
              },
            },
            {
              title: 'Ref. ID', dataIndex: 'entidadId', key: 'entidadId',
              render: v => v ? <Tag>#{v}</Tag> : '—',
            },
            {
              title: 'Subido por', key: 'subidoPor',
              render: (_, r: any) => (
                <div>
                  <Text style={{ fontSize: 12 }}>{r.nombreSubidoPor ?? `Usuario #${r.subidoPorId}`}</Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(r.createdAt).toLocaleDateString('es-DO')}
                    </Text>
                  </div>
                </div>
              ),
            },
            {
              title: 'Descripción', dataIndex: 'descripcion', key: 'descripcion',
              render: v => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : '—',
            },
            {
              title: '', key: 'acc',
              render: (_, r: any) => (
                <Space>
                  <Tooltip title="Abrir archivo">
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      type="link"
                      onClick={() => window.open(r.url, '_blank')}
                    />
                  </Tooltip>
                  <Tooltip title="Descargar">
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      type="link"
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = r.url;
                        a.download = r.nombre;
                        a.click();
                      }}
                    />
                  </Tooltip>
                  <Popconfirm title="¿Eliminar documento?" onConfirm={() => eliminarDoc.mutate(r.id)}>
                    <Button size="small" icon={<DeleteOutlined />} type="link" danger />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Registrar Documento */}
      <Modal
        title={<Space><PaperClipOutlined />Registrar Documento</Space>}
        open={modalSubir}
        onCancel={() => { setModalSubir(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={subirDocumento.isPending}
        okText="Registrar"
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={v => subirDocumento.mutate(v)}>
          <Form.Item name="nombre" label="Nombre del archivo" rules={[{ required: true }]}>
            <Input placeholder="Ej. Factura_ENE_2026.pdf" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="tipoEntidad" label="Tipo de entidad" initialValue="general" rules={[{ required: true }]}>
                <Select>
                  {TIPOS_ENTIDAD.map(t => (
                    <Option key={t.value} value={t.value}>
                      <Tag color={t.color} style={{ marginRight: 4 }}>{t.label}</Tag>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="entidadId" label="ID del registro (opcional)">
                <Input type="number" placeholder="Ej. 123" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="url" label="URL del archivo" rules={[{ required: true }]}>
            <Input placeholder="https://drive.google.com/... o https://storage.hicloud.com/..." />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="extension" label="Extensión">
                <Select placeholder="pdf">
                  {['pdf','jpg','png','xlsx','xls','doc','docx','csv','zip'].map(e => (
                    <Option key={e} value={e}>{e.toUpperCase()}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tipoMime" label="Tipo MIME">
                <Input placeholder="application/pdf" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tamanioKb" label="Tamaño (KB)">
                <Input type="number" placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} placeholder="Notas sobre el documento..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
