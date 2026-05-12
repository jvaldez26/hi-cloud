import { useEffect, useRef, useState } from 'react';
import { Card, Row, Col, Descriptions, Tag, Button, Space, Alert, Spin, Tooltip, Typography } from 'antd';
import { ReloadOutlined, CheckCircleFilled, SyncOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ecfApi } from '../../api/ecf.api';
import EcfBadge, { type EstadoEcf } from './EcfBadge';
import { fmt } from '../../utils/formatters';

const { Text } = Typography;

interface Props {
  /** ID de la factura — usar cuando el documento es una factura */
  facturaId?:        number;
  /** ID del documento origen — usar para compras, gastos, notas */
  documentoOrigenId?: number;
  /** Clave de query a invalidar al reenviar */
  queryKeyBase?:     string;
}

/**
 * Sección e-CF reutilizable para cualquier página de detalle.
 * Muestra estado, QR, código de seguridad y botón de reenvío.
 * Hace polling automático mientras el estado es pendiente.
 */
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // dejar de hacer polling después de 5 minutos

export default function EcfSeccion({ facturaId, documentoOrigenId, queryKeyBase }: Props) {
  const qc = useQueryClient();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const pollStartRef = useRef<number | null>(null);

  const queryKey = facturaId
    ? ['factura-ecf', facturaId]
    : ['documento-ecf', documentoOrigenId];

  const queryFn = facturaId
    ? () => ecfApi.getEcfByFactura(facturaId!)
    : () => ecfApi.getEcfByDocumento(documentoOrigenId!);

  const { data: ecf } = useQuery({
    queryKey,
    queryFn,
    enabled:         !!(facturaId || documentoOrigenId),
    staleTime:       5_000,
    refetchInterval: (query) => {
      const estado = (query.state.data as any)?.estadoDGII;
      const esPendiente = ['enviado', 'pendiente_envio'].includes(estado ?? '');

      if (!esPendiente) {
        pollStartRef.current = null;
        return false;
      }
      if (!pollStartRef.current) pollStartRef.current = Date.now();
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) return false;
      return 4_000;
    },
  });

  const procesando  = ['enviado', 'pendiente_envio'].includes(ecf?.estadoDGII ?? '');
  const esAceptado  = ecf?.estadoDGII === 'aceptado';
  const esRechazado = ecf?.estadoDGII === 'rechazado';

  useEffect(() => {
    if (ecf?.qrUrl) {
      QRCode.toDataURL(ecf.qrUrl, { width: 140, margin: 1 })
        .then(setQrDataUrl).catch(() => {});
    }
    if (!ecf?.qrUrl) setQrDataUrl('');
  }, [ecf?.qrUrl]);

  const reenviarMut = useMutation({
    mutationFn: () => ecfApi.reenviar(ecf!.numero),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      if (queryKeyBase) qc.invalidateQueries({ queryKey: [queryKeyBase] });
    },
  });

  if (!ecf) {
    return (
      <Card size="small" style={{ borderStyle: 'dashed', marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          📄 Sin comprobante fiscal electrónico asociado a este documento.
        </Text>
      </Card>
    );
  }

  const puedeReenviar = ['rechazado', 'contingencia', 'pendiente_envio'].includes(ecf.estadoDGII);

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <span>📋 Comprobante Fiscal Electrónico</span>
          <EcfBadge estado={ecf.estadoDGII as EstadoEcf} />
          {procesando && <SyncOutlined spin style={{ color: '#1677ff', fontSize: 13 }} />}
        </Space>
      }
      extra={
        <Space>
          {procesando && (
            <Text type="secondary" style={{ fontSize: 11 }}>Verificando con DGII…</Text>
          )}
          {puedeReenviar && (
            <Tooltip title="Reenviar a MSeller">
              <Button size="small" icon={<ReloadOutlined />}
                loading={reenviarMut.isPending}
                onClick={() => reenviarMut.mutate()}>
                Reenviar
              </Button>
            </Tooltip>
          )}
        </Space>
      }
    >
      {procesando && (
        <Alert type="info" showIcon icon={<Spin size="small" />}
          style={{ marginBottom: 10 }}
          message="Enviado — esperando respuesta de la DGII"
          description="El comprobante fue enviado a MSeller. Se actualizará automáticamente cuando la DGII responda." />
      )}
      {esAceptado && (
        <Alert type="success" showIcon icon={<CheckCircleFilled />}
          style={{ marginBottom: 10 }}
          message="Aceptado por la DGII"
          description={`eNCF ${ecf.numero} — Cód. seguridad: ${ecf.codigoSeguridad}`} />
      )}
      {esRechazado && (
        <Alert type="error" showIcon style={{ marginBottom: 10 }}
          message="Rechazado por la DGII"
          description={(ecf as any).errorEnvio ?? 'El comprobante fue rechazado. Usa Reenviar para intentar de nuevo.'} />
      )}

      <Row gutter={[16, 0]} align="middle">
        <Col xs={24} md={qrDataUrl ? 16 : 24}>
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="eNCF">
              <Text code strong style={{ fontSize: 12 }}>{ecf.numero}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Tipo">
              <Tag color="blue">{(ecf as any).tipoECF?.codigo}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Cód. seguridad">
              <Text code>{ecf.codigoSeguridad ?? '—'}</Text>
            </Descriptions.Item>
            {ecf.trackId && (
              <Descriptions.Item label="Track ID" span={2}>
                <Text copyable={{ text: ecf.trackId }}
                  style={{ fontSize: 10, fontFamily: 'monospace' }}>
                  {ecf.trackId}
                </Text>
              </Descriptions.Item>
            )}
            {(ecf as any).montoTotal && (
              <>
                <Descriptions.Item label="Monto gravado">
                  {fmt.money((ecf as any).montoGravado)}
                </Descriptions.Item>
                <Descriptions.Item label="ITBIS">
                  {fmt.money((ecf as any).montoItbis)}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        </Col>

        {qrDataUrl ? (
          <Col xs={24} md={8} style={{ textAlign: 'center' }}>
            <img src={qrDataUrl} alt="QR DGII"
              style={{ width: 130, height: 130, borderRadius: 8, border: '1px solid #E2E8F0', display: 'block', margin: '0 auto' }} />
            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>Escanear en DGII</div>
          </Col>
        ) : procesando ? (
          <Col xs={24} md={8} style={{ textAlign: 'center' }}>
            <div style={{
              width: 130, height: 130, borderRadius: 8, border: '2px dashed #d9d9d9',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              margin: '0 auto', color: '#bfbfbf',
            }}>
              <SyncOutlined spin style={{ fontSize: 26, marginBottom: 8 }} />
              <span style={{ fontSize: 10 }}>QR pendiente</span>
            </div>
          </Col>
        ) : null}
      </Row>
    </Card>
  );
}
