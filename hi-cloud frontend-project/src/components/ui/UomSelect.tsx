import { Select, Input, Tooltip, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

const { Text } = Typography;

export function UomSelect({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const { data: unidades } = useQuery({
    queryKey: ['uom-unidades'],
    queryFn: () => api.get('/uom').then((r: any) => r.data?.data ?? r.data),
    staleTime: 5 * 60 * 1000,
  });

  const opts = (unidades ?? []).map((u: any) => ({
    value: u.codigo,
    label: `${u.codigo} — ${u.nombre}${u.simbolo ? ` (${u.simbolo})` : ''}`,
  }));

  if (opts.length > 0) {
    return (
      <Select
        showSearch optionFilterProp="label"
        value={value} onChange={onChange}
        placeholder="Seleccionar o buscar unidad"
        options={opts}
        dropdownRender={menu => (
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
