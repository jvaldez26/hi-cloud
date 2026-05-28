import { useEffect, useState } from 'react';
import { Modal, Space, Descriptions, Tag, Spin, Alert, Typography, Row, Col } from 'antd';
import { CheckCircleFilled, SyncOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ecfApi } from '../../api/ecf.api';
import EcfBadge, { type EstadoEcf } from './EcfBadge';

const { Text } = Typography;

interface Props {
  /** eNCF del comprobante recién emitido. null = modal cerrado. */
  encf:    string | null;
  onClose: () => void;
}

/**
 * Modal reutilizable que se muestra justo después de emitir cualquier e-CF.
 * Hace polling automático hasta obtener estado definitivo de DGII.
 * Funciona para E31, E33, E34, E41, E43, E44, E45, E46, E47.
 */
export default function EcfResultModal({ encf, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const { data: ecf } = useQuery({
    queryKey:        ['ecf-by-numero', encf],
    queryFn:         () => ecfApi.getByNumero(encf!),
    enabled:         !!encf,
    staleTime:       3_000,
    refetchInterval: (query) => {
      const estado = (query.state.data as any)?.estadoDGII;
      return ['enviado', 'pendiente_envio'].includes(estado ?? '') ? 3_000 : false;
    },
  });

  useEffect(() => {
    if (ecf?.qrUrl) {
      QRCode.toDataURL(ecf.qrUrl, { width: 160, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => {});
    }
    if (!encf) setQrDataUrl('');
  }, [ecf?.qrUrl, encf]);

  const procesando  = ['enviado', 'pendiente_envio'].includes(ecf?.estadoDGII ?? '');
  const esAceptado  = ecf?.estadoDGII === 'aceptado';
  const esRechazado = ecf?.estadoDGII === 'rechazado';

  const tipoLabel: Record<string, string> = {
    E31: 'Factura de Crédito Fiscal',
    E32: 'Factura de Consumo',
    E33: 'Nota de Débito',
    E34: 'Nota de Crédito',
    E41: 'Comprobante de Compras',
    E43: 'Gasto Menor',
    E44: 'Régimen Especial',
    E45: 'Gubernamental',
    E46: 'Exportación',
    E47: 'Pago al Exterior',
  };

  const tipo   = ecf ? (ecf as any).tipoECF?.codigo ?? encf?.slice(0, 3) : encf?.slice(0, 3);
  const titulo = tipo ? `${tipo} — ${tipoLabel[tipo] ?? 'Comprobante Fiscal'}` : 'Comprobante Fiscal Electrónico';

  return (
    <Modal
      open={!!encf}
      onCancel={onClose}
      onOk={onClose}
      okText="Cerrar"
      cancelButtonProps={{ style: { display: 'none' } }}
      title={
        <Space>
          <span>📋 {titulo}</span>
          {ecf && <EcfBadge estado={ecf.estadoDGII as EstadoEcf} />}
          {procesando && <SyncOutlined spin style={{ color: '#1677ff' }} />}
        </Space>
      }
      width={560}
      destroyOnClose
    >
      {!ecf && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#94A3B8' }}>Obteniendo estado del comprobante…</div>
        </div>
      )}

      {ecf && (
        <>
          {/* Estado procesando */}
          {procesando && (
            <Alert
              type="info" showIcon icon={<Spin size="small" />}
              style={{ marginBottom: 12 }}
              message={
                ecf.estadoDGII === 'enviado' && ecf.trackId
                  ? 'Recibido por MSeller — verificando aceptación DGII'
                  : ecf.estadoDGII === 'enviado'
                  ? 'Enviado a MSeller — esperando confirmación de recepción'
                  : 'Enviando a MSeller…'
              }
              description={
                ecf.estadoDGII === 'enviado' && ecf.trackId
                  ? 'El documento fue recibido. Se actualizará automáticamente cuando la DGII procese la respuesta.'
                  : 'El comprobante fue enviado. Verificando confirmación automáticamente…'
              }
            />
          )}

          {/* Estado aceptado */}
          {esAceptado && (
            <Alert
              type="success" showIcon icon={<CheckCircleFilled />}
              style={{ marginBottom: 12 }}
              message="Aceptado por la DGII"
              description={`Código de seguridad: ${ecf.codigoSeguridad}`}
            />
          )}

          {/* Estado rechazado */}
          {esRechazado && (
            <Alert
              type="error" showIcon
              style={{ marginBottom: 12 }}
              message="Rechazado por la DGII"
              description={(ecf as any).errorEnvio ?? 'El comprobante fue rechazado.'}
            />
          )}

          <Row gutter={[16, 0]} align="middle">
            <Col xs={24} sm={qrDataUrl ? 16 : 24}>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="eNCF" span={2}>
                  <Text code strong style={{ fontSize: 13 }}>{ecf.numero}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Estado">
                  <EcfBadge estado={ecf.estadoDGII as EstadoEcf} />
                </Descriptions.Item>
                <Descriptions.Item label="Tipo">
                  <Tag color="blue">{(ecf as any).tipoECF?.codigo ?? tipo}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Cód. seguridad" span={2}>
                  <Text code>{ecf.codigoSeguridad}</Text>
                </Descriptions.Item>
                {ecf.trackId && (
                  <Descriptions.Item label="Track ID" span={2}>
                    <Text copyable={{ text: ecf.trackId }}
                      style={{ fontSize: 10, fontFamily: 'monospace' }}>
                      {ecf.trackId}
                    </Text>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Col>

            {qrDataUrl ? (
              <Col xs={24} sm={8} style={{ textAlign: 'center', paddingTop: 8 }}>
                <img src={qrDataUrl} alt="QR DGII"
                  style={{ width: 130, height: 130, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                  Escanear para verificar en DGII
                </div>
              </Col>
            ) : procesando ? (
              <Col xs={24} sm={8} style={{ textAlign: 'center', paddingTop: 8 }}>
                <div style={{
                  width: 130, height: 130, borderRadius: 8,
                  border: '2px dashed #d9d9d9',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto', color: '#bfbfbf',
                }}>
                  <SyncOutlined spin style={{ fontSize: 28, marginBottom: 8 }} />
                  <span style={{ fontSize: 11 }}>QR pendiente</span>
                </div>
              </Col>
            ) : null}
          </Row>
        </>
      )}
    </Modal>
  );
}
