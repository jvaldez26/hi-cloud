import { useState } from 'react';
import { Button, Dropdown, message } from 'antd';
import { PrinterOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import { descargarPDFDesdeURL, verPDFDesdeURL, imprimirHtml } from '../../utils/printUtils';

interface Props {
  /** URL del endpoint del backend que devuelve el PDF (puppeteer) */
  apiUrl?: string;
  /** Función que devuelve HTML para imprimir en ventana nueva */
  getHtml?: () => string | Promise<string>;
  /** Nombre del archivo para descarga */
  nombreArchivo: string;
  size?:  'small' | 'middle' | 'large';
  label?: string;
  /** Si true, solo muestra el botón de imprimir sin menú desplegable */
  simple?: boolean;
}

export default function PrintButton({
  apiUrl,
  getHtml,
  nombreArchivo,
  size   = 'small',
  label,
  simple = false,
}: Props) {
  const [loading, setLoading] = useState(false);

  const ejecutar = async (accion: 'imprimir' | 'ver' | 'descargar') => {
    setLoading(true);
    try {
      if (apiUrl) {
        if (accion === 'descargar') await descargarPDFDesdeURL(apiUrl, nombreArchivo);
        else                        await verPDFDesdeURL(apiUrl);
      } else if (getHtml) {
        const html = await getHtml();
        imprimirHtml(html);
      }
    } catch (err) {
      console.error('Error al generar PDF:', err);
      message.error('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (simple) {
    return (
      <Button
        size={size}
        icon={<PrinterOutlined />}
        loading={loading}
        onClick={() => ejecutar('imprimir')}
      >
        {label ?? 'Imprimir'}
      </Button>
    );
  }

  return (
    <Dropdown
      trigger={['click']}
      disabled={loading}
      menu={{
        items: [
          {
            key:     'imprimir',
            icon:    <PrinterOutlined />,
            label:   'Imprimir',
            onClick: () => ejecutar('imprimir'),
          },
          {
            key:     'ver',
            icon:    <EyeOutlined />,
            label:   'Ver PDF',
            onClick: () => ejecutar('ver'),
          },
          {
            key:     'descargar',
            icon:    <DownloadOutlined />,
            label:   'Descargar PDF',
            onClick: () => ejecutar('descargar'),
          },
        ],
      }}
    >
      <Button size={size} icon={<PrinterOutlined />} loading={loading}>
        {label ?? 'PDF'}
      </Button>
    </Dropdown>
  );
}
