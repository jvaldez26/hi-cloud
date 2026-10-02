import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Button, Select, theme } from 'antd';
import { ArrowLeft, Printer } from 'lucide-react';
import ContenidoDocumentacion, { SECCIONES } from './contenido';

const { Title, Paragraph } = Typography;

/** El contenido de AppLayout scrollea en su propio div (overflowY:auto), no en
 *  el `window` — IntersectionObserver necesita ese div como `root`, nunca
 *  `null` (que es "el viewport", no "el ancestro con scroll"). */
function encontrarContenedorScroll(el: HTMLElement | null): HTMLElement | null {
  let n = el?.parentElement ?? null;
  while (n) {
    const overflowY = window.getComputedStyle(n).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return n;
    n = n.parentElement;
  }
  return null;
}

function useEsMovil(breakpoint = 860): boolean {
  const [esMovil, setEsMovil] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setEsMovil(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return esMovil;
}

function irASeccion(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.history.replaceState(null, '', `#${id}`);
}

export default function XlinkDocumentacionPage() {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const esMovil = useEsMovil();
  const raizRef = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(SECCIONES[0].id);

  // Scroll a la sección del hash al abrir — '/xlink/documentacion#homologacion'
  // entra directo en esa sección.
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'start' });
    });
  }, []);

  // Resalta en el índice la sección visible mientras se hace scroll.
  useEffect(() => {
    const root = encontrarContenedorScroll(raizRef.current);
    const visibles = new Set<string>();

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visibles.add(id); else visibles.delete(id);
        }
        const primeraVisible = SECCIONES.find(s => visibles.has(s.id));
        if (primeraVisible) setActivo(primeraVisible.id);
      },
      { root, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );

    for (const s of SECCIONES) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={raizRef} style={{ padding: 24 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .xlink-doc-imprimible, .xlink-doc-imprimible * { visibility: visible; }
          .xlink-doc-imprimible {
            position: absolute; left: 0; top: 0; width: 100%; padding: 0;
          }
          .xlink-doc-imprimible, .xlink-doc-imprimible * {
            color: #000 !important; background: #fff !important; box-shadow: none !important;
          }
          .xlink-doc-imprimible section, .xlink-doc-imprimible .ant-alert, .xlink-doc-imprimible .ant-table {
            break-inside: avoid; page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Encabezado — oculto al imprimir */}
      <div
        className="xlink-doc-no-imprimir"
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>Documentación de HiCloud Xlink</Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Todo lo que un usuario puede hacer con el intercambio de documentos entre empresas HiCloud.
          </Paragraph>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/xlink')}>Volver a HiCloud Xlink</Button>
          <Button icon={<Printer size={16} />} onClick={() => window.print()}>Imprimir / Guardar PDF</Button>
        </div>
      </div>

      {esMovil && (
        <Select
          className="xlink-doc-no-imprimir"
          value={activo}
          onChange={irASeccion}
          style={{ width: '100%', marginBottom: 20 }}
          options={SECCIONES.map(s => ({ value: s.id, label: s.titulo }))}
        />
      )}

      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
        {!esMovil && (
          <nav
            aria-label="Índice de la documentación"
            className="xlink-doc-no-imprimir"
            style={{ position: 'sticky', top: 24, width: 220, flexShrink: 0 }}
          >
            {SECCIONES.map(s => (
              <div
                key={s.id}
                onClick={() => irASeccion(s.id)}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  borderLeft: `2px solid ${activo === s.id ? token.colorPrimary : 'transparent'}`,
                  color: activo === s.id ? token.colorPrimary : token.colorTextSecondary,
                  fontWeight: activo === s.id ? 600 : 400,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  transition: 'color .15s, border-color .15s',
                }}
              >
                {s.titulo}
              </div>
            ))}
          </nav>
        )}

        <div
          className="xlink-doc-imprimible"
          style={{ maxWidth: 760, fontSize: 16, lineHeight: 1.7, minWidth: 0, flex: 1 }}
        >
          <ContenidoDocumentacion />
        </div>
      </div>
    </div>
  );
}
