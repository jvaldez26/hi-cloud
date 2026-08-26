/**
 * Campo de chofer — el MISMO en los tres sitios que crean un conduce: el
 * módulo, el panel de conduces del POS y el checkout del POS en modo Conduce.
 *
 * No hay tabla de choferes y no hace falta: el catálogo es el histórico. Las
 * opciones salen de GET /conduces/conductores, que devuelve los choferes que
 * esa empresa ya ha usado, del más reciente al más antiguo. El primero que se
 * teclea queda disponible para el siguiente conduce.
 *
 * Es un AutoComplete y no un Select a propósito: un chofer eventual se escribe
 * y se manda, sin pasar por Configuración ni crear nada antes. Lo que se guarda
 * es siempre el texto tecleado.
 */
import { AutoComplete } from 'antd';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

/** Choferes ya usados por la empresa. Compartido por los tres formularios. */
export function useChoferes() {
  return useQuery<string[]>({
    queryKey: ['conduces-conductores'],
    queryFn:  () => api.get('/conduces/conductores').then(r => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60_000,
  });
}

interface Props {
  value?:       string;
  onChange?:    (v: string) => void;
  placeholder?: string;
  autoFocus?:   boolean;
  /** Estilo del contenedor — el POS lo necesita para encajar en su tema oscuro. */
  style?:       React.CSSProperties;
  status?:      '' | 'error';
}

export default function ChoferInput({
  value, onChange, placeholder = 'Nombre del chofer', autoFocus, style, status,
}: Props) {
  const { data: choferes = [] } = useChoferes();

  return (
    <AutoComplete
      value={value}
      onChange={v => onChange?.(v ?? '')}
      options={choferes.map(c => ({ value: c }))}
      // Filtra sobre lo ya usado, pero nunca impide escribir uno nuevo.
      filterOption={(input, option) =>
        String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
      }
      placeholder={placeholder}
      autoFocus={autoFocus}
      status={status}
      allowClear
      style={{ width: '100%', ...style }}
    />
  );
}
