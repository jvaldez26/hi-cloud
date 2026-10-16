import { Select, Input, Tooltip, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useUomUnidadesQuery } from '../../hooks/useCatalogQueries';

const { Text } = Typography;

export function UomSelect({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const { data: unidades } = useUomUnidadesQuery();

  const opts = (unidades ?? []).map((u: any) => ({
    value: u.codigo,
    label: `${u.codigo} — ${u.nombre}${u.simbolo ? ` (${u.simbolo})` : ''}`,
  }));

  // El producto puede traer una unidad que ya no (o nunca) estuvo en el
  // catálogo (import CSV viejo, alta antes de que existiera <UomSelect/>,
  // mayúsculas/minúsculas distintas que la normalización no pudo resolver
  // sin ambigüedad). Mostrarla tal cual, nunca en blanco ni cambiada en
  // silencio por la primera opción del Select — quien edita decide.
  const fueraDeCatalogo = !!value && opts.length > 0 && !opts.some((o: { value: string }) => o.value === value);
  const optsConValorActual = fueraDeCatalogo
    ? [{ value, label: `${value} — no está en tu catálogo` }, ...opts]
    : opts;

  if (opts.length > 0) {
    return (
      <>
        <Select
          showSearch optionFilterProp="label"
          value={value} onChange={onChange}
          placeholder="Seleccionar o buscar unidad"
          options={optsConValorActual}
          // Sin `width: 100%` este Select se encogía al tamaño de su contenido
          // —«pza» y poco más— en vez de ocupar su columna. Es la convención del
          // resto del proyecto y aquí faltaba.
          style={{ width: '100%' }}
          // Y el desplegable copia el ancho del control: con el control encogido,
          // «GAL — Galón (gal)» salía como «GA...» y el enlace de abajo se partía
          // en una palabra por línea. Con `false` el menú se mide por su contenido
          // y el minWidth evita que quede más estrecho que el propio campo.
          popupMatchSelectWidth={false}
          styles={{ popup: { root: { minWidth: 240 } } }}
          popupRender={menu => (
            <>
              {menu}
              <div style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  <a href="/uom" target="_blank" rel="noreferrer">+ Configurar unidades</a>
                </Text>
              </div>
            </>
          )}
        />
        {fueraDeCatalogo && (
          <Text type="warning" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
            <WarningOutlined /> "{value}" no está en el catálogo de unidades de esta empresa — elige una del catálogo o agrégala en Configuración.
          </Text>
        )}
      </>
    );
  }

  return (
    <Input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder="PZA, KG, LT..."
      addonAfter={
        <Tooltip title="Configura el catálogo de unidades para buscar aquí">
          <a href="/uom" target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>UOM</a>
        </Tooltip>
      }
    />
  );
}
