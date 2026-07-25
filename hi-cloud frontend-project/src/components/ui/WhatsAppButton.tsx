import { useState } from 'react';
import { Button, Tooltip, Modal, Input, message, Space } from 'antd';
import { WhatsAppOutlined, SendOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import api from '../../api/client';

const { Text } = Typography;

type TipoDocumento =
  | 'factura'
  | 'cotizacion'
  | 'conduce'
  | 'cxc'
  | 'nota-credito'
  | 'nota-debito';

interface Props {
  tipo:       TipoDocumento;
  id:         number;
  size?:      'small' | 'middle' | 'large';
  ghost?:     boolean;
  label?:     string;
  onlyIcon?:  boolean;
  /** Adjunta el PDF al compartir (usa navigator.share en móvil; descarga en escritorio) */
  sendPdf?:   boolean;
  /** Nombre del archivo para la descarga en escritorio */
  folio?:     string;
}

const ENDPOINT: Record<TipoDocumento, string> = {
  'factura':      (id: number) => `/comunicaciones/whatsapp/factura/${id}`,
  'cotizacion':   (id: number) => `/comunicaciones/whatsapp/cotizacion/${id}`,
  'conduce':      (id: number) => `/comunicaciones/whatsapp/conduce/${id}`,
  'cxc':          (id: number) => `/comunicaciones/whatsapp/cxc/${id}`,
  'nota-credito': (id: number) => `/comunicaciones/whatsapp/nota-credito/${id}`,
  'nota-debito':  (id: number) => `/comunicaciones/whatsapp/nota-debito/${id}`,
} as any;

function getEndpoint(tipo: TipoDocumento, id: number): string {
  const fn = (ENDPOINT as any)[tipo];
  return typeof fn === 'function' ? fn(id) : fn;
}

const PDF_ENDPOINT: Partial<Record<TipoDocumento, (id: number) => string>> = {
  'factura':      id => `/facturas/${id}/pdf`,
  'cotizacion':   id => `/cotizaciones/${id}/pdf`,
  'nota-credito': id => `/notas-credito/${id}/pdf`,
  'nota-debito':  id => `/notas-debito/${id}/pdf`,
};

export default function WhatsAppButton({
  tipo, id, size = 'small', ghost = false, label, onlyIcon = false, sendPdf = false, folio,
}: Props) {
  const [loading,      setLoading]      = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [telefono,     setTelefono]     = useState('');
  const [mensajeEdit,  setMensajeEdit]  = useState('');
  const [waLink,       setWaLink]       = useState('');
  const [linkPublico,  setLinkPublico]  = useState('');

  const abrirModal = async () => {
    setLoading(true);
    try {
      const res = await api.get(getEndpoint(tipo, id));
      const data: { link: string; texto: string; numero?: string; linkPublico?: string } =
        (res as any).data?.data ?? (res as any).data;

      if (!data?.link) { message.warning('No se pudo generar el link de WhatsApp'); return; }

      setTelefono(data.numero ?? '');
      setMensajeEdit(data.texto);
      setWaLink(data.link);
      setLinkPublico(data.linkPublico ?? '');
      setModalOpen(true);
    } catch {
      message.error('Error al preparar el mensaje de WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  const enviar = async () => {
    // Reconstruir link con número y texto editados
    const num = telefono.replace(/\D/g, '');
    const numFmt = num
      ? (num.startsWith('1809') || num.startsWith('1829') || num.startsWith('1849')
          ? num
          : num.startsWith('1') ? num : `1${num}`)
      : '';
    const link = numFmt
      ? `https://wa.me/${numFmt}?text=${encodeURIComponent(mensajeEdit)}`
      : `https://wa.me/?text=${encodeURIComponent(mensajeEdit)}`;

    // Si sendPdf y tiene PDF, intentar compartir/descargar
    const pdfFn = PDF_ENDPOINT[tipo];
    if (sendPdf && pdfFn) {
      try {
        const eid    = localStorage.getItem('empresaId') ?? '';
        const pdfRes = await fetch(`/api/v1${pdfFn(id)}`, {
          credentials: 'include',
          headers: { 'X-Empresa-ID': eid },
        });
        if (pdfRes.ok) {
          const blob     = await pdfRes.blob();
          const filename = folio ? `${folio}.pdf` : `documento-${id}.pdf`;
          const file     = new File([blob], filename, { type: 'application/pdf' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: mensajeEdit });
            setModalOpen(false);
            return;
          }
          // Escritorio: descarga + abre WhatsApp
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href = url; a.download = filename; a.click();
          URL.revokeObjectURL(url);
          setTimeout(() => window.open(link, '_blank', 'noopener,noreferrer'), 600);
          message.success('PDF descargado. Adjúntalo en WhatsApp.');
          setModalOpen(false);
          return;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') { setModalOpen(false); return; }
      }
    }

    window.open(link, '_blank', 'noopener,noreferrer');
    setModalOpen(false);
  };

  return (
    <>
      <Tooltip title={onlyIcon ? 'Enviar por WhatsApp' : undefined}>
        <Button
          size={size} ghost={ghost} loading={loading}
          onClick={abrirModal}
          icon={<WhatsAppOutlined />}
          style={{ color: '#25D366', borderColor: '#25D366', background: ghost ? 'transparent' : undefined }}
        >
          {!onlyIcon && (label ?? 'WhatsApp')}
        </Button>
      </Tooltip>

      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        title={<Space><WhatsAppOutlined style={{ color: '#25D366', fontSize: 18 }} /><span>Enviar por WhatsApp</span></Space>}
        width={480}
        destroyOnClose
      >
        <div style={{ marginBottom: 14 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            Teléfono del destinatario
          </Text>
          <Input
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="+1 (809) 000-0000"
            prefix={<WhatsAppOutlined style={{ color: '#25D366' }} />}
            size="large"
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            Incluye código de país. Ej: 8091234567 → se formatea automáticamente.
          </Text>
        </div>

        {linkPublico && (
          <div style={{ marginBottom: 14 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              <LinkOutlined style={{ marginRight: 4 }} />
              Link de factura (el cliente puede ver y descargar el PDF)
            </Text>
            <Input
              readOnly
              value={linkPublico}
              style={{ fontSize: 11, fontFamily: 'monospace' }}
              suffix={
                <CopyOutlined
                  style={{ cursor: 'pointer', color: '#1677ff' }}
                  title="Copiar link"
                  onClick={() => {
                    navigator.clipboard.writeText(linkPublico);
                    message.success('Link copiado al portapapeles');
                  }}
                />
              }
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Ya incluido en el mensaje. El cliente no necesita iniciar sesión.
            </Text>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            Mensaje (editable)
          </Text>
          <Input.TextArea
            value={mensajeEdit}
            onChange={e => setMensajeEdit(e.target.value)}
            rows={6}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={enviar}
            style={{ background: '#25D366', borderColor: '#25D366' }}
          >
            Enviar por WhatsApp
          </Button>
        </div>
      </Modal>
    </>
  );
}
