import { useQuery } from '@tanstack/react-query';
import { modulosAddonApi } from '../api/modulos-addon.api';

export function useModuloAddon(codigo: string) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['modulo-addon', codigo],
    queryFn: () => modulosAddonApi.check(codigo),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    activo: data?.activo ?? false,
    isLoading,
    isError,
  };
}
