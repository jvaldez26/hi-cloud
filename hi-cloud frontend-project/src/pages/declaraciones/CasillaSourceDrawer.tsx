// Visor de origen de una casilla — reusa DetailDrawer (el único Drawer
// genérico reutilizable del proyecto; no hay un "drawer de detalle de
// cuenta contable" literal — el drill-down de Balance General es
// navegación a /libro-mayor, no un componente, verificado antes de
// construir esto). Muestra la fórmula exacta, el conteo de documentos
// reales, la cadena de casillas referenciadas (con su monto real) y un
// enlace que abre el listado filtrado real — mismo rango de fechas, misma
// empresa — para auditar con un clic.

import { Link } from 'react-router-dom';
import { Button, Tag, Typography } from 'antd';
import { ArrowRightOutlined, FileSearchOutlined } from '@ant-design/icons';
import { DetailDrawer, type DetailSection } from '../../components/ui/DetailDrawer';
import { fmt } from '../../utils/formatters';
import type { CasillaFila } from './CasillaTable';
import type { FuenteCasilla } from './casillasFuente';

const { Text } = Typography;

const RUTA_MODULO: Record<NonNullable<FuenteCasilla['modulo']>, string> = {
  facturas: '/facturas',
  compras: '/compras',
  'notas-credito': '/notas-credito',
  'notas-debito': '/notas-debito',
  gastos: '/gastos',
};

function construirEnlace(fuente: FuenteCasilla, periodo: { mes: number; anio: number }): string | null {
  if (!fuente.modulo) return null;
  const ruta = RUTA_MODULO[fuente.modulo];
  const params = new URLSearchParams();
  if (fuente.modulo === 'gastos') {
    params.set('mes', String(periodo.mes));
    params.set('anio', String(periodo.anio));
  } else {
    const desde = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-01`;
    const ultimoDia = new Date(periodo.anio, periodo.mes, 0).getDate();
    const hasta = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    params.set('desde', desde);
    params.set('hasta', hasta);
  }
  if (fuente.filtroExtra) {
    for (const [k, v] of Object.entries(fuente.filtroExtra)) params.set(k, v);
  }
  return `${ruta}?${params.toString()}`;
}

export interface CasillaSourceDrawerProps {
  open: boolean;
  onClose: () => void;
  casilla: CasillaFila | null;
  fuente?: FuenteCasilla;
  todasLasCasillas: CasillaFila[];
  periodo: { mes: number; anio: number };
  avisoNota?: string;
}

export function CasillaSourceDrawer({
  open, onClose, casilla, fuente, todasLasCasillas, periodo, avisoNota,
}: CasillaSourceDrawerProps) {
  if (!casilla) return null;

  const esCalculada = !casilla.estado || casilla.estado === 'calculada';
  const enlace = fuente ? construirEnlace(fuente, periodo) : null;

  const sections: DetailSection[] = [];

  if (!esCalculada) {
    sections.push({
      title: 'Motivo',
      fields: [{ label: 'Por qué no se calcula', value: avisoNota ?? 'Ver nota en la fila.', span: 2 }],
    });
  }

  if (fuente) {
    sections.push({
      title: 'Fórmula',
      fields: [{ label: 'Cálculo exacto', value: fuente.formula, span: 2 }],
    });

    if (fuente.referenciaExterna) {
      sections.push({
        title: 'Origen',
        fields: [{ label: 'Viene de', value: fuente.referenciaExterna, span: 2 }],
      });
    }

    if (casilla.conteo) {
      const partes: string[] = [];
      if ('facturas' in casilla.conteo)     partes.push(`${casilla.conteo.facturas} factura${casilla.conteo.facturas !== 1 ? 's' : ''}`);
      if ('notasCredito' in casilla.conteo) partes.push(`${casilla.conteo.notasCredito} nota${casilla.conteo.notasCredito !== 1 ? 's' : ''} de crédito`);
      if ('notasDebito' in casilla.conteo)  partes.push(`${casilla.conteo.notasDebito} nota${casilla.conteo.notasDebito !== 1 ? 's' : ''} de débito`);
      if ('compras' in casilla.conteo)      partes.push(`${casilla.conteo.compras} compra${casilla.conteo.compras !== 1 ? 's' : ''}`);
      if ('gastosOperativos' in casilla.conteo) partes.push(`${casilla.conteo.gastosOperativos} gasto${casilla.conteo.gastosOperativos !== 1 ? 's' : ''} operativo${casilla.conteo.gastosOperativos !== 1 ? 's' : ''}`);
      sections.push({
        title: 'Documentos que entraron',
        fields: [{ label: 'Conteo real del período', value: partes.join(', ') || 'Ninguno', span: 2 }],
      });
    }

    if (fuente.referencias?.length) {
      const filas = fuente.referencias.map(n => todasLasCasillas.find(f => f.casilla === n));
      sections.push({
        title: 'Casillas referenciadas',
        fields: filas.map((f, i) => ({
          label: `Casilla ${fuente.referencias![i]}`,
          value: f ? <>{f.label} — <Text strong>{fmt.money(f.monto)}</Text></> : <Text type="secondary">No disponible en esta pantalla</Text>,
          span: 2 as const,
        })),
      });
    }
  }

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={<><FileSearchOutlined /> Casilla {casilla.casilla} — {casilla.label}</>}
      sections={sections}
      width={520}
      footer={enlace ? (
        <Link to={enlace} target="_blank">
          <Button type="primary" icon={<ArrowRightOutlined />} block>
            Ver listado real (mismo período)
          </Button>
        </Link>
      ) : undefined}
    >
      <div style={{ marginBottom: 16 }}>
        <Tag color={esCalculada ? 'green' : casilla.estado === 'requiere_revision' ? 'orange' : 'default'}>
          {esCalculada ? 'Calculada' : casilla.estado === 'requiere_revision' ? 'Requiere revisión' : 'No aplica'}
        </Tag>
        <Text strong style={{ marginLeft: 8, fontSize: 16 }}>{fmt.money(casilla.monto)}</Text>
      </div>
    </DetailDrawer>
  );
}
