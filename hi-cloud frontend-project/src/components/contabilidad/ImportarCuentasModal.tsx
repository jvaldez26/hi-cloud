import { useState } from 'react';
import { Modal, Upload, Button, Alert, Table, Tag, Typography, Space, message, Divider } from 'antd';
import { InboxOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  contabilidadApi,
  type PreviewImportacionCuentas, type ResultadoImportacionCuentas,
  type CambioCampoImport,
} from '../../api/contabilidad.api';

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

interface Props {
  open: boolean;
  onClose: () => void;
}

function renderCambio(c: CambioCampoImport) {
  const fmt = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v);
  return `${c.campo}: ${fmt(c.antes)} → ${fmt(c.despues)}`;
}

/**
 * NUEVO — Importación de Plan de Cuentas por plantilla (2026-09-21).
 * Sube → vista previa (nada se escribe todavía) → confirmar. El mismo
 * archivo (guardado en estado, no en el servidor) se reenvía tal cual al
 * confirmar — no hay sesión de importación en el backend, cada llamada
 * reparsea el archivo desde cero.
 */
export default function ImportarCuentasModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewImportacionCuentas | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionCuentas | null>(null);

  const previewMut = useMutation({
    mutationFn: (f: File) => contabilidadApi.previsualizarImportacionCuentas(f),
    onSuccess: (data) => setPreview(data),
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo leer el archivo'),
  });

  const ejecutarMut = useMutation({
    mutationFn: () => contabilidadApi.ejecutarImportacionCuentas(file!),
    onSuccess: (data) => {
      setResultado(data);
      qc.invalidateQueries({ queryKey: ['cuentas'] });
      qc.invalidateQueries({ queryKey: ['cuentas-todas-para-padre'] });
      qc.invalidateQueries({ queryKey: ['cuentas-sin-etiquetar'] });
      message.success(`Importación aplicada: ${data.creadas} creada(s), ${data.actualizadas} actualizada(s)`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo aplicar la importación'),
  });

  const reiniciar = () => { setFile(null); setPreview(null); setResultado(null); };
  const cerrar = () => { reiniciar(); onClose(); };

  const uploadProps: UploadProps = {
    accept: '.xlsx,.csv',
    multiple: false,
    showUploadList: false,
    beforeUpload: (f) => {
      setFile(f);
      previewMut.mutate(f);
      return false; // nunca subir sola — el POST lo dispara la mutation
    },
  };

  const hayErroresBloqueantes = (preview?.errores.length ?? 0) > 0;
  const nadaQueHacer = !!preview && preview.crear.length === 0 && preview.actualizar.length === 0;

  return (
    <Modal
      title="Importar Plan de Cuentas"
      open={open}
      onCancel={cerrar}
      footer={null}
      width={860}
      destroyOnClose
    >
      {!preview && !resultado && (
        <>
          <Paragraph type="secondary">
            Sube el archivo con la <a href="#" onClick={e => { e.preventDefault(); contabilidadApi.descargarPlantillaCuentas(); }}>plantilla</a> ya
            completada (.xlsx o .csv). Nada se escribe todavía — primero se muestra una vista previa.
          </Paragraph>
          <Dragger {...uploadProps} disabled={previewMut.isPending}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Haz clic o arrastra el archivo aquí</p>
            <p className="ant-upload-hint">Solo .xlsx o .csv, máximo 2,000 filas</p>
          </Dragger>
          {previewMut.isPending && <Alert style={{ marginTop: 12 }} type="info" message="Leyendo y validando el archivo..." showIcon />}
        </>
      )}

      {preview && !resultado && (
        <>
          <Alert
            style={{ marginBottom: 16 }}
            type={hayErroresBloqueantes ? 'warning' : 'success'}
            showIcon
            message={`${preview.totalFilas} fila(s) leídas — ${preview.crear.length} a crear, ${preview.actualizar.length} a actualizar, ${preview.errores.length} con error`}
            description={`${preview.noTocadas} cuenta(s) del catálogo actual NO vienen en este archivo — se dejan intactas, esta importación nunca las borra ni las desactiva.`}
          />

          {preview.advertencias.length > 0 && (
            <Alert
              style={{ marginBottom: 16 }}
              type="warning" showIcon
              message={`${preview.advertencias.length} advertencia(s) — no bloquean la importación`}
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {preview.advertencias.map((a, i) => <li key={i}>Fila {a.fila} ({a.codigo}): {a.motivo}</li>)}
                </ul>
              }
            />
          )}

          {preview.errores.length > 0 && (
            <>
              <Divider orientation="left" orientationMargin={0}>Filas con error ({preview.errores.length})</Divider>
              <Table
                size="small" pagination={{ pageSize: 5, showSizeChanger: false }} rowKey="fila"
                dataSource={preview.errores}
                columns={[
                  { title: 'Fila', dataIndex: 'fila', width: 70 },
                  { title: 'Motivo', dataIndex: 'motivo' },
                ]}
              />
            </>
          )}

          {preview.crear.length > 0 && (
            <>
              <Divider orientation="left" orientationMargin={0}>A crear ({preview.crear.length})</Divider>
              <Table
                size="small" pagination={{ pageSize: 5, showSizeChanger: false }} rowKey="codigo"
                dataSource={preview.crear}
                columns={[
                  { title: 'Fila', dataIndex: 'fila', width: 60 },
                  { title: 'Código', dataIndex: 'codigo', width: 110 },
                  { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
                  { title: 'Tipo', dataIndex: 'tipo', width: 90, render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag> },
                  { title: 'Madre', dataIndex: 'codigoMadre', width: 100, render: (v?: string) => v ?? '— (raíz)' },
                  { title: 'Grupo', dataIndex: 'esCuentaGrupo', width: 70, render: (v: boolean) => v ? 'Sí' : 'No' },
                ]}
              />
            </>
          )}

          {preview.actualizar.length > 0 && (
            <>
              <Divider orientation="left" orientationMargin={0}>A actualizar ({preview.actualizar.length})</Divider>
              <Table
                size="small" pagination={{ pageSize: 5, showSizeChanger: false }} rowKey="codigo"
                dataSource={preview.actualizar}
                columns={[
                  { title: 'Fila', dataIndex: 'fila', width: 60 },
                  { title: 'Código', dataIndex: 'codigo', width: 110 },
                  { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
                  { title: 'Cambios', key: 'cambios', render: (_: unknown, r) => (
                    <Space direction="vertical" size={2}>
                      {r.cambios.map((c, i) => <Text key={i} style={{ fontSize: 12 }}>{renderCambio(c)}</Text>)}
                    </Space>
                  ) },
                ]}
              />
            </>
          )}

          {nadaQueHacer && !hayErroresBloqueantes && (
            <Alert type="info" showIcon message="No hay nada que crear ni actualizar — el archivo coincide exactamente con el catálogo actual." />
          )}

          <Space style={{ marginTop: 16 }}>
            <Button onClick={reiniciar}>Elegir otro archivo</Button>
            <Button
              type="primary"
              disabled={preview.crear.length === 0 && preview.actualizar.length === 0}
              loading={ejecutarMut.isPending}
              onClick={() => ejecutarMut.mutate()}
            >
              Confirmar importación ({preview.crear.length + preview.actualizar.length} cuenta{preview.crear.length + preview.actualizar.length === 1 ? '' : 's'})
            </Button>
          </Space>
        </>
      )}

      {resultado && (
        <>
          <Alert
            type="success" showIcon icon={<CheckCircleOutlined />}
            message="Importación aplicada"
            description={`${resultado.creadas} cuenta(s) creada(s), ${resultado.actualizadas} actualizada(s). ${resultado.noTocadas} cuenta(s) existentes se dejaron intactas.`}
          />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" onClick={cerrar}>Cerrar</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
