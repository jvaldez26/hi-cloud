import { Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface TipoNCF {
  codigo:       string;
  titulo:       string;
  descripcion:  string;
  color:        string;
  requiereRNC:  boolean;
}

export const TIPOS_NCF: TipoNCF[] = [
  { codigo: 'E31', color: '#1a56db', requiereRNC: true,
    titulo: 'Crédito Fiscal',
    descripcion: 'Para empresas con RNC. El comprador puede usarla como crédito fiscal.' },
  { codigo: 'E32', color: '#059669', requiereRNC: false,
    titulo: 'Consumidor Final',
    descripcion: 'Para personas físicas o consumidores sin RNC.' },
  { codigo: 'E33', color: '#d97706', requiereRNC: false,
    titulo: 'Nota de Débito',
    descripcion: 'Para cobros adicionales a una factura ya emitida. Usa el módulo Notas de Débito.' },
  { codigo: 'E34', color: '#7c3aed', requiereRNC: false,
    titulo: 'Nota de Crédito',
    descripcion: 'Para devoluciones o descuentos sobre una factura ya emitida.' },
  { codigo: 'E41', color: '#b45309', requiereRNC: false,
    titulo: 'Compras',
    descripcion: 'Comprobante de Compras para proveedor informal (solo cédula, sin RNC). Sustenta el gasto y aplica retenciones.' },
  { codigo: 'E44', color: '#0891b2', requiereRNC: false,
    titulo: 'Regímenes Especiales',
    descripcion: 'Para entidades con regímenes fiscales especiales aprobados por DGII (Zonas Francas, etc.). ITBIS exento.' },
  { codigo: 'E45', color: '#64748b', requiereRNC: true,
    titulo: 'Gubernamental',
    descripcion: 'Para instituciones del Estado dominicano.' },
  { codigo: 'E46', color: '#0284c7', requiereRNC: false,
    titulo: 'Exportación',
    descripcion: 'Para ventas de exportación al exterior. ITBIS exento.' },
  { codigo: 'E47', color: '#7c3aed', requiereRNC: false,
    titulo: 'Pagos al Exterior',
    descripcion: 'Para pagos a proveedores extranjeros sin establecimiento permanente en RD. ITBIS exento.' },
];

interface Props {
  value?: string;
  onChange?: (v: string) => void;
  compact?: boolean;
  filtro?: string[];
}

export default function NCFSelector({ value, onChange, compact = false, filtro }: Props) {
  const opciones = filtro ? TIPOS_NCF.filter(t => filtro.includes(t.codigo)) : TIPOS_NCF;

  if (compact) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {opciones.map(tipo => {
          const selected = value === tipo.codigo;
          return (
            <Tooltip key={tipo.codigo} title={tipo.descripcion} placement="top">
              <button
                type="button"
                onClick={() => onChange?.(tipo.codigo)}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          5,
                  height:       30,
                  padding:      '0 10px',
                  borderRadius: 20,
                  border:       `1.5px solid ${selected ? tipo.color : '#e2e8f0'}`,
                  background:   selected ? `${tipo.color}18` : '#f8fafc',
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                  outline:      'none',
                }}
              >
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                  color: selected ? '#fff' : tipo.color,
                  background: selected ? tipo.color : `${tipo.color}18`,
                  padding: '1px 5px', borderRadius: 5,
                  border: `1px solid ${tipo.color}40`,
                }}>
                  {tipo.codigo}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: selected ? 600 : 400,
                  color: selected ? tipo.color : '#64748b',
                  whiteSpace: 'nowrap',
                }}>
                  {tipo.titulo}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {opciones.map(tipo => {
        const selected = value === tipo.codigo;
        return (
          <Tooltip key={tipo.codigo} title={tipo.descripcion} placement="top">
            <button
              type="button"
              onClick={() => onChange?.(tipo.codigo)}
              style={{
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                gap:           4,
                padding:       '10px 14px',
                borderRadius:  10,
                border:        `2px solid ${selected ? tipo.color : '#e2e8f0'}`,
                background:    selected ? `${tipo.color}15` : 'transparent',
                cursor:        'pointer',
                transition:    'all 0.15s',
                minWidth:      90,
                textAlign:     'center',
                outline:       'none',
              }}
            >
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                background: selected ? tipo.color : '#f1f5f9',
                color: selected ? '#fff' : tipo.color,
                fontWeight: 700, fontSize: 14, letterSpacing: 0.5, lineHeight: 1.6,
                border: `1px solid ${tipo.color}40`,
              }}>
                {tipo.codigo}
              </span>
              <Text style={{
                fontSize: 11, fontWeight: selected ? 600 : 400,
                color: selected ? tipo.color : '#64748b',
                lineHeight: 1.3, maxWidth: 90,
              }}>
                {tipo.titulo}
              </Text>
              {tipo.requiereRNC && (
                <Tooltip title="Requiere RNC del cliente">
                  <InfoCircleOutlined style={{ color: tipo.color, fontSize: 10, opacity: 0.7 }} />
                </Tooltip>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
