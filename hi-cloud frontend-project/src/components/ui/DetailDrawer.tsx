import { Drawer } from 'antd';
import type { ReactNode } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';

export interface DetailField {
  label: string;
  value?: ReactNode;
  span?: 1 | 2;           // 2 = ocupa todo el ancho
  hidden?: boolean;
}

export interface DetailSection {
  title?: string;
  fields: DetailField[];
}

/**
 * Los bloques de pares etiqueta/valor del panel de detalle.
 *
 * Vivía dentro de DetailDrawer y no se podía usar por separado, así que las
 * pantallas que meten pestañas en el panel —Productos y Facturas Recurrentes—
 * pasaban `sections={[]}` y se copiaban el marcado dentro de la pestaña. Copiado
 * quiere decir que se separa: la copia de Recurrentes acabó siendo una tabla de
 * antd sin aire entre filas, que es de donde viene el "se ve todo pegado".
 *
 * Se extrae para que haya UNA forma de pintar esto, con o sin pestañas.
 */
export function DetailSections({ sections }: { sections: DetailSection[] }) {
  const isMobile = useMobile();

  return (
    <>
      {sections.map((section, si) => (
        <div key={si} style={{ marginBottom: section.title ? 24 : 16 }}>
          {section.title && (
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: 'rgba(0,0,0,0.45)',
              marginBottom: 10, paddingBottom: 6,
              borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}>
              {section.title}
            </div>
          )}
          <div style={{
            display: 'grid',
            // En móvil el panel ocupa toda la pantalla y dos columnas dejan cada
            // valor en una tira de ~150px, donde una fecha o un correo se parten
            // en tres líneas. Una sola columna se lee igual que en escritorio.
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: '12px 16px',
          }}>
            {section.fields.filter(f => !f.hidden).map((field, fi) => (
              <div key={fi} style={{
                gridColumn: !isMobile && field.span === 2 ? '1 / -1' : undefined,
              }}>
                <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginBottom: 3 }}>
                  {field.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-word' }}>
                  {field.value ?? <span style={{ color: 'rgba(0,0,0,0.25)' }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sections: DetailSection[];
  footer?: ReactNode;
  width?: number;
  extra?: ReactNode;
  /** Contenido libre que se renderiza en lugar de (o después de) las sections */
  children?: ReactNode;
}

export function DetailDrawer({
  open, onClose, title, sections, footer, width = 480, extra, children,
}: DetailDrawerProps) {
  const isMobile = useMobile();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      // Un ancho fijo mayor que la pantalla deja el contenido cortado por la
      // derecha en un móvil estrecho.
      width={isMobile ? '100%' : width}
      footer={footer}
      extra={extra}
      destroyOnClose={false}
    >
      {children}
      <DetailSections sections={sections} />
    </Drawer>
  );
}
