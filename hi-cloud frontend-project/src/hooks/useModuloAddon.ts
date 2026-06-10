import { useQuery } from '@tanstack/react-query';
import { modulosAddonApi } from '../api/modulos-addon.api';

export function useModuloAddon(codigo: string) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['modulo-addon', codigo],
    queryFn: () => modulosAddonApi.check(codigo),
    staleTime: 30_000,
    refetchOnMount: 'always',
    retry: 1,
  });

  return {
    activo: data?.activo ?? false,
    isLoading,
    isError,
    refetch,
  };
}
