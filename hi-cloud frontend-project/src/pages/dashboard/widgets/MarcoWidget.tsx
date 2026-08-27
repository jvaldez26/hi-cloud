import { useState, type ReactNode } from 'react';
import { Tooltip, theme } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useMobile } from '../../../hooks/useMediaQuery';

/**
 * Envuelve una gráfica y le pone el botón de quitar.
 *
 * En escritorio aparece al pasar el ratón. En móvil está SIEMPRE visible: en
 * táctil no hay hover, y el POS de los clientes es táctil. Un botón que solo se
 * revela al pasar el ratón, en un móvil, es un botón que no existe.
 *
 * El área táctil es de 44px aunque el icono sea más pequeño — por debajo de eso
 * se falla el toque y se acaba pulsando la gráfica.
 */
export function MarcoWidget({
  titulo, children, onQuitar,
}: {
  titulo: string;
  children: ReactNode;
  onQuitar: () => void;
}) {
  const { token } = theme.useToken();
  const isMobile  = useMobile();
  const [hover, setHover] = useState(false);

  const visible = isMobile || hover;

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Tooltip title={`Quitar ${titulo}`} placement="left">
        <button
          type="button"
          aria-label={`Quitar ${titulo} del panel`}
          onClick={onQuitar}
          style={{
            position: 'absolute',
            // Encima de la esquina de la tarjeta, sin tapar el título.
            top: 6, right: 6, zIndex: 3,
            width: 44, height: 44,              // área táctil, no tamaño visual
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            background: visible ? token.colorBgElevated : 'transparent',
            boxShadow:  visible && !isMobile ? token.boxShadowTertiary : 'none',
            color: token.colorTextTertiary,
            opacity: visible ? 1 : 0,
            // En móvil no hay transición de aparición: está y ya.
            transition: isMobile ? 'none' : 'opacity 0.12s',
            pointerEvents: visible ? 'auto' : 'none',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = token.colorError; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = token.colorTextTertiary; }}
        >
          <DeleteOutlined style={{ fontSize: 15 }} />
        </button>
      </Tooltip>

      {children}
    </div>
  );
}
