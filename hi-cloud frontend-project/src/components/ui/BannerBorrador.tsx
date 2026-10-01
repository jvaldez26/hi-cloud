import { Alert, Button, Space } from 'antd';
import { fechaHora } from '../../utils/fechaRD';

interface YaExiste {
  numero: string;
  href:   string;
}

interface BannerBorradorProps {
  savedAt:      number;
  /** Si la clave de idempotencia del borrador ya generó el documento, no se ofrece restaurar. */
  yaExiste?:    YaExiste | null;
  onRestaurar:  () => void;
  onDescartar:  () => void;
  descartando?: boolean;
}

/** Banner reutilizable para los formularios con recuperación de borrador (useFormDraft). */
export default function BannerBorrador({ savedAt, yaExiste, onRestaurar, onDescartar, descartando }: BannerBorradorProps) {
  if (yaExiste) {
    return (
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={<>Esto ya se guardó como <a href={yaExiste.href}>{yaExiste.numero}</a></>}
        action={
          <Button size="small" onClick={onDescartar} loading={descartando}>
            Descartar borrador
          </Button>
        }
      />
    );
  }

  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      message={`Tienes un borrador sin guardar de ${fechaHora(savedAt)}`}
      action={
        <Space>
          <Button size="small" type="primary" onClick={onRestaurar}>Restaurar</Button>
          <Button size="small" onClick={onDescartar} loading={descartando}>Descartar</Button>
        </Space>
      }
    />
  );
}
