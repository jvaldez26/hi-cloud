import { useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import { WhatsAppOutlined } from '@ant-design/icons';
import api from '../../api/client';

interface Props {
  tipo:       'factura' | 'cotizacion' | 'conduce' | 'cxc';
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

export default function WhatsAppButton({
  tipo, id, size = 'small', ghost = false, label, onlyIcon = false, sendPdf = false, folio,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      // 1. Obtener texto + link wa.me del backend
      const endpoint: Record<typeof tipo, string> = {
        factura:    `/comunicaciones/whatsapp/factura/${id}`,
        cotizacion: `/comunicaciones/whatsapp/cotizacion/${id}`,
        conduce:    `/comunicaciones/whatsapp/conduce/${id}`,
        cxc:        `/comunicaciones/whatsapp/cxc/${id}`,
      };
      const res     = await api.get(endpoint[tipo]);
      const payload = (res as any).data;
      const data: { link: string; texto: string; numero?: string } = payload?.data ?? payload;

      if (!data?.link) {
        message.warning('No se pudo generar el link de WhatsApp');
        return;
      }

      // 2. Si sendPdf y es factura, intentar compartir el PDF
      if (sendPdf && tipo === 'factura') {
        const eid = localStorage.getItem('empresaId') ?? '';
        const pdfRes = await fetch(`/api/v1/facturas/${id}/pdf`, {
          credentials: 'include',
          headers: { 'X-Empresa-ID': eid },
        });

        if (pdfRes.ok) {
          const blob     = await pdfRes.blob();
          const filename = folio ? `${folio}.pdf` : `factura-${id}.pdf`;
          const file     = new File([blob], filename, { type: 'application/pdf' });

          // Móvil: API nativa de compartir — abre directamente WhatsApp con el PDF adjunto
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: data.texto });
            return;
          }

          // Escritorio: descargar el PDF y abrir WhatsApp Web simultáneamente
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href     = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          // Pequeño delay para que el PDF descargue antes de que el foco cambie
          setTimeout(() => window.open(data.link, '_blank', 'noopener,noreferrer'), 600);
          message.success('PDF descargado. Adjúntalo en el chat de WhatsApp que se abrió.');
          return;
        }
        // Si el PDF falla, caer al envío de solo texto
      }

      // 3. Fallback / comportamiento por defecto: solo link de texto
      window.open(data.link, '_blank', 'noopener,noreferrer');

    } catch (err: any) {
      // navigator.share lanza AbortError si el usuario cancela — no es un error real
      if (err?.name !== 'AbortError') {
        message.error('Error al compartir por WhatsApp');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip title={onlyIcon ? 'Compartir por WhatsApp' : undefined}>
      <Button
        size={size}
        ghost={ghost}
        loading={loading}
        onClick={handleClick}
        icon={<WhatsAppOutlined />}
        style={{
          color:       '#25D366',
          borderColor: '#25D366',
          background:  ghost ? 'transparent' : undefined,
        }}
      >
        {!onlyIcon && (label ?? 'WhatsApp')}
      </Button>
    </Tooltip>
  );
}
