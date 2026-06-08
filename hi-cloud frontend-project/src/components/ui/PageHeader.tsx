import { ReactNode } from 'react';
import { useMobile } from '../../hooks/useMediaQuery';

interface Props {
  title:    ReactNode;
  subtitle?: ReactNode;
  extra?:   ReactNode;
  style?:   React.CSSProperties;
}

export default function PageHeader({ title, subtitle, extra, style }: Props) {
  const isMobile = useMobile();

  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  isMobile ? 'column' : 'row',
        alignItems:     isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap:            isMobile ? 12 : 0,
        marginBottom:   20,
        flexWrap:       'wrap',
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 600, lineHeight: 1.3 }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '4px 0 0', color: 'var(--hc-text-2, #64748b)', fontSize: 13 }}>
            {subtitle}
          </p>
        )}
      </div>
      {extra && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
          {extra}
        </div>
      )}
    </div>
  );
}
