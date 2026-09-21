import { useEffect, useState } from 'react';
import { Modal, Button, Alert, Table, Tag, Typography, Space, message, Divider } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contabilidadApi, type ResultadoImportacionCuentas } from '../../api/contabilidad.api';

const { Text, Paragraph } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * "Completar con el catálogo estándar" (enriquecimiento del catálogo,
 * 2026-09-21) — mismo par previsualizar/ejecutar que ImportarCuentasModal,
 * pero sin subir archivo: el backend genera el archivo del catálogo
 * estándar y lo pasa por el MISMO motor de importación. La vista previa
 * SOLO puede traer altas (nunca actualizaciones) — es una garantía del
 * backend, no algo que esta pantalla tenga que reforzar.
 */
export default function CompletarCatalogoEstandarModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  const { data: preview, isLoading, isError, refetch } = useQuery({
    queryKey: ['cuentas-estandar-preview'],
    queryFn: () => contabilidadApi.previsualizarEstandar(),
    enabled: open,
  });

  const [resultado, setResultado] = useState<ResultadoImportacionCuentas | null>(null);

  useEffect(() => {
    if (open) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const completarMut = useMutation({
    mutationFn: () => contabilidadApi.completarEstandar(),
    onSuccess: (data) => {
      setResultado(data);
      qc.invalidateQueries({ queryKey: ['cuentas'] });
      qc.invalidateQueries({ queryKey: ['cuentas-todas-para-padre'] });
      qc.invalidateQueries({ queryKey: ['cuentas-sin-etiquetar'] });
      message.success(`Catálogo completado: ${data.creadas} cuenta(s) agregada(s)`);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'No se pudo completar el catálogo'),
  });

  const cerrar = () => { setResultado(null); onClose(); };

  const nada = !!preview && preview.crear.length === 0;

  return (
    <Modal
      title="Completar con el catálogo estándar"
      open={open} onCancel={cerrar} footer={null} width={720} destroyOnClose
    >
      {!resultado && (
        <>
          <Paragraph type="secondary">
            Agrega al catálogo las cuentas del plan estándar de HiCloud que a esta empresa le falten.
            Nunca modifica ni renombra una cuenta que ya exista — solo altas.
          </Paragraph>

          {isLoading && <Alert type="info" showIcon message="Comparando contra el catálogo estándar..." />}
          {isError && <Alert type="error" showIcon message="No se pudo generar la comparación." />}

          {preview && nada && (
            <Alert
              type="success" showIcon icon={<CheckCircleOutlined />}
              message="El catálogo ya está completo"
              description="Esta empresa ya tiene todas las cuentas del catálogo estándar — no hay nada que agregar."
            />
          )}

          {preview && !nada && (
            <>
              <Alert
                style={{ marginBottom: 16 }}
                type="info" showIcon
                message={`${preview.crear.length} cuenta(s) nueva(s) se agregarían`}
                description={`${preview.noTocadas} cuenta(s) que ya tiene esta empresa se dejan intactas — esta acción nunca las toca.`}
              />
              <Divider orientation="left" orientationMargin={0}>Cuentas a agregar ({preview.crear.length})</Divider>
              <Table
                size="small" pagination={{ pageSize: 8, showSizeChanger: false }} rowKey="codigo"
                dataSource={preview.crear}
                columns={[
                  { title: 'Código', dataIndex: 'codigo', width: 110 },
                  { title: 'Nombre', dataIndex: 'nombre', ellipsis: true },
                  { title: 'Tipo', dataIndex: 'tipo', width: 90, render: (v: string) => <Tag style={{ textTransform: 'capitalize' }}>{v}</Tag> },
                  { title: 'Madre', dataIndex: 'codigoMadre', width: 100, render: (v?: string) => v ?? '— (raíz)' },
                  { title: 'Grupo', dataIndex: 'esCuentaGrupo', width: 70, render: (v: boolean) => v ? 'Sí' : 'No' },
                ]}
              />
              <Space style={{ marginTop: 16 }}>
                <Button
                  type="primary" loading={completarMut.isPending}
                  onClick={() => completarMut.mutate()}
                >
                  Agregar {preview.crear.length} cuenta{preview.crear.length === 1 ? '' : 's'}
                </Button>
              </Space>
            </>
          )}
        </>
      )}

      {resultado && (
        <>
          <Alert
            type="success" showIcon icon={<CheckCircleOutlined />}
            message="Catálogo completado"
            description={`${resultado.creadas} cuenta(s) agregada(s). ${resultado.noTocadas} cuenta(s) existentes se dejaron intactas.`}
          />
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" onClick={cerrar}>Cerrar</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
