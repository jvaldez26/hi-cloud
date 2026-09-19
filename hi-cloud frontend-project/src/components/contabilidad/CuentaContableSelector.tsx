// Selector de cuenta contable en formularios transaccionales (2026-09-19).
// Compartido por los formularios donde la cuenta es una decisión de
// criterio real (Gastos, Compras, Asientos manuales, Activos Fijos, CxC/CxP)
// — nunca en Ventas/POS/Facturación/Inventario/Nómina/Colegiatura, donde la
// contabilización es única y correcta y no es materia de opinión.
//
// Solo ofrece cuentas de movimiento (permiteMovimientos) — el motor ya lo
// valida desde P3, pero este selector no debe ni mostrar las de agrupación.
// Solo cuentas de la empresa del usuario actual (lo resuelve el backend por
// tenant). Muestra las etiquetas fiscales (606, anexo IR-2) junto al
// nombre — el mismo efecto fiscal que se construyó en las fases anteriores,
// visible en el momento de elegir.

import { useMemo } from 'react';
import { Select, Tag, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { contabilidadApi } from '../../api/contabilidad.api';
import { TIPOS_BIENES_606 } from '../../constants/dgii-606';

interface CuentaContableSelectorProps {
  value?: string | number; // código (default) o id de la cuenta, según valueField
  onChange?: (v: any) => void;
  /** Restringe las opciones a uno o varios TipoCuenta ('gasto', 'costo', 'activo'...) cuando la posición del asiento lo permite inferir. */
  tipo?: string | string[];
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
  size?: 'small' | 'middle' | 'large';
  /**
   * Qué campo de la cuenta se usa como value/onChange. 'codigo' (default) es lo
   * que consume el motor de asientos (AsientosAutomaticosService). Los asientos
   * manuales (ContabilidadService.createAsiento) trabajan con el id numérico de
   * la cuenta — usa 'id' ahí.
   */
  valueField?: 'codigo' | 'id';
}

function etiquetasDeCuenta(c: any) {
  const tags: React.ReactNode[] = [];
  if (c.tipoGasto606) {
    const label = TIPOS_BIENES_606.find(t => t.value === c.tipoGasto606)?.label ?? c.tipoGasto606;
    tags.push(<Tooltip key="606" title={label}><Tag style={{ fontSize: 10, marginRight: 2 }}>{c.tipoGasto606}</Tag></Tooltip>);
  }
  for (const a of c.anexosIR2 ?? []) {
    tags.push(<Tag key={`anexo-${a.anexoIR2}`} color="blue" style={{ fontSize: 10, marginRight: 2 }}>{a.anexoIR2}</Tag>);
  }
  if (c.requiereNCF === false) {
    tags.push(<Tag key="sinncf" color="purple" style={{ fontSize: 10, marginRight: 2 }}>Sin NCF</Tag>);
  }
  return tags;
}

export default function CuentaContableSelector({
  value, onChange, tipo, placeholder = 'Buscar cuenta por código o nombre', disabled, allowClear = true, style, size,
  valueField = 'codigo',
}: CuentaContableSelectorProps) {
  const { data: cuentas, isLoading } = useQuery({
    queryKey: ['cuentas-selector'],
    queryFn: () => contabilidadApi.cuentas(true), // soloMovimientos=true — nunca cuentas de agrupación
  });

  const tipos = tipo ? (Array.isArray(tipo) ? tipo : [tipo]) : undefined;

  const opciones = useMemo(() => {
    const base = (cuentas ?? []) as any[];
    const filtradas = tipos ? base.filter(c => tipos.includes(c.tipo)) : base;
    return filtradas.map(c => ({
      value: valueField === 'id' ? c.id : c.codigo,
      label: `${c.codigo} — ${c.nombre}`, // texto plano para que el buscador filtre por código y nombre
      cuenta: c,
    }));
  }, [cuentas, tipo, valueField]);

  return (
    <Select
      showSearch
      allowClear={allowClear}
      value={value}
      onChange={onChange}
      loading={isLoading}
      placeholder={placeholder}
      disabled={disabled}
      size={size}
      style={{ width: '100%', ...style }}
      optionFilterProp="label"
      filterOption={(input, option: any) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      options={opciones}
      optionRender={(option: any) => {
        const c = option.data.cuenta;
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888' }}>{c.codigo}</span>{' '}
              {c.nombre}
            </span>
            <span>{etiquetasDeCuenta(c)}</span>
          </div>
        );
      }}
    />
  );
}
