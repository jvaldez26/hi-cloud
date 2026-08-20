import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import { contabilidadApi } from '../../api/contabilidad.api';

const tipoColor: Record<string, string> = {
  activo: '#1677ff', pasivo: '#fa8c16', patrimonio: '#722ed1',
  ingreso: '#52c41a', costo: '#ff4d4f', gasto: '#ff7a45',
};

export default function PlanCuentasPage() {
  const { bloqueado, config, plan } = usePlanGuard();
  if (bloqueado && config) return <ModuloBloqueado modulo="Contabilidad General" planMinimo={config.planMinimo} planActual={plan} />;

  const { data: cuentas, isLoading } = useQuery({
    queryKey: ['cuentas'],
    queryFn: () => contabilidadApi.cuentas(),
  });

  const cols = [
    { title: 'Código',  dataIndex: 'codigo',    width: 110 },
    { title: 'Nombre',  dataIndex: 'nombre',    ellipsis: true,
      render: (v: string, r: any) => <span style={{ paddingLeft: (r.nivel - 1) * 16 }}>{v}</span> },
    { title: 'Tipo',    dataIndex: 'tipo',      width: 100,
      render: (v: string) => <Tag color={tipoColor[v]} style={{ textTransform: 'capitalize' }}>{v}</Tag> },
    { title: 'Naturaleza', dataIndex: 'naturaleza', width: 100,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Nivel',   dataIndex: 'nivel',     width: 60 },
    { title: 'Movim.',  dataIndex: 'permiteMovimientos', width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
  ];

  return (
    <Table columns={cols} dataSource={cuentas ?? []} rowKey="id" loading={isLoading}
      size="small"
      scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 10, showSizeChanger: false }}
      rowClassName={(r: any) => r.nivel <= 2 ? 'ant-table-row-level-header' : ''} />
  );
}

