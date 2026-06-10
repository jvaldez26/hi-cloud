import { useQuery } from '@tanstack/react-query';
import { modulosAddonApi } from '../api/modulos-addon.api';

export function useModuloAddon(codigo: string) {
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['modulo-addon', codigo],
    queryFn: () => modulosAddonApi.check(codigo),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  return {
    activo: data?.activo ?? false,
    isLoading,
    isFetching,
    isError,
    refetch,
  };
}
