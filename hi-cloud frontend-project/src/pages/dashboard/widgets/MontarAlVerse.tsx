import { useEffect, useRef, useState, type ReactNode } from 'react';
import { theme } from 'antd';

/**
 * No monta a sus hijos hasta que el hueco se acerca a la pantalla.
 *
 * Es lo que impide que diez gráficas apiladas en un móvil disparen diez
 * peticiones al abrir. Como cada gráfica trae su consulta dentro, no montarla es
 * literalmente no pedir sus datos: no hay `enabled` que recordar ni consulta que
 * cancelar.
 *
 * Una vez montada se queda montada. Desmontarla al salir de pantalla haría que
 * volver a subir la remontara y, si el dato ya está viejo, volviera a pedirlo —
 * peticiones a cambio de nada mientras alguien recorre el panel.
 *
 * El margen de 600px hace que lo que está justo debajo del pliegue ya se cargue:
 * en un escritorio el panel entero entra en ese margen y se comporta como antes.
 * En un móvil, lo que está a tres pantallas de distancia espera su turno.
 */
export function MontarAlVerse({ alto, children }: { alto: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { token } = theme.useToken();

  useEffect(() => {
    if (visible) return;
    const nodo = ref.current;
    if (!nodo) return;

    // Sin IntersectionObserver (navegador viejo) se monta todo: mejor gastar
    // peticiones que dejar el panel en blanco.
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }

    const obs = new IntersectionObserver(
      entradas => {
        if (entradas.some(e => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    obs.observe(nodo);
    return () => obs.disconnect();
  }, [visible]);

  return (
    <div ref={ref}>
      {visible ? children : (
        // El hueco reserva la altura real para que el panel no pegue saltos
        // cuando la gráfica entra.
        <div
          aria-hidden
          style={{
            height: alto,
            marginBottom: 16,
            borderRadius: 12,
            border: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorFillAlter,
          }}
        />
      )}
    </div>
  );
}
