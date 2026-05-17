import { Drawer, Tag } from 'antd';
import type { ReactNode } from 'react';
import { useThemeStore } from '../../store/theme.store';

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

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sections: DetailSection[];
  footer?: ReactNode;
  width?: number;
  extra?: ReactNode;
}

export function DetailDrawer({
  open, onClose, title, sections, footer, width = 480, extra,
}: DetailDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      width={width}
      footer={footer}
      extra={extra}
      destroyOnClose={false}
    >
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
            gridTemplateColumns: '1fr 1fr',
            gap: '12px 16px',
          }}>
            {section.fields.filter(f => !f.hidden).map((field, fi) => (
              <div key={fi} style={{ gridColumn: field.span === 2 ? '1 / -1' : undefined }}>
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
    </Drawer>
  );
}
