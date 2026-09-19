// Configuración Contable por Módulo (2026-09-19) — cada empresa define qué
// cuenta usa cada concepto del motor de asientos (Clientes, Bancos, cobro
// por tarjeta/transferencia/cheque, etc.) en vez de depender de los códigos
// hardcodeados de siempre. Sin configurar nada, cada concepto sigue usando
// exactamente el mismo código que usaba antes de esta pantalla existir.
import { useMemo } from 'react';
import { usePlanGuard } from '../../hooks/usePlan';
import ModuloBloqueado from '../../components/ui/ModuloBloqueado';
import { Typography, Table, Tag, Button, Space, message, Alert, Popconfirm, Collapse } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configuracionContableApi, type ConceptoContableRow } from '../../api/configuracion-contable.api';
import CuentaContableSelector from '../../components/contabilidad/CuentaContableSelector';
import { RefreshByKeyButton, VideoTutorialButton } from '../../components/ui/TableToolbar';

const { Title, Text } = Typography;

function GrupoTabla({ grupo, filas, onCambiar, onRestaurar, pendiente }: {
  grupo: string;
  filas: ConceptoContableRow[];
  onCambiar: (concepto: string, cuentaCodigo: string) => void;
  onRestaurar: (concepto: string) => void;
  pendiente: string | null;
}) {
  return (
    <Table
      size="small"
      pagination={false}
      rowKey="concepto"
      scroll={{ x: 'max-content' }}
      dataSource={filas}
      columns={[
        { title: 'Concepto', dataIndex: 'label', key: 'label', width: 260 },
        {
          title: 'Cuenta', key: 'cuenta', width: 320,
          render: (_: any, r: ConceptoContableRow) => (
            <CuentaContableSelector
              value={r.valorActual}
              onChange={(v) => v && onCambiar(r.concepto, String(v))}
              allowClear={false}
              size="small"
            />
          ),
        },
        {
          title: 'Estado', key: 'estado', width: 160,
          render: (_: any, r: ConceptoContableRow) => (
            <Space size={4}>
              {r.esDefault
                ? <Tag>Por defecto</Tag>
                : <Tag color="blue">Personalizada</Tag>}
              {r.advertencia && <Tag color="orange">Revisar</Tag>}
            </Space>
          ),
        },
        {
          title: '', key: 'acciones', width: 90, align: 'right' as const,
          render: (_: any, r: ConceptoContableRow) => !r.esDefault && (
            <Popconfirm title={`¿Volver "${r.label}" a su valor por defecto (${r.default})?`}
              onConfirm={() => onRestaurar(r.concepto)}>
              <Button size="small" type="text" icon={<UndoOutlined />} loading={pendiente === r.concepto} />
            </Popconfirm>
          ),
        },
      ]}
      expandable={{
        rowExpandable: (r) => !!r.advertencia,
        expandedRowRender: (r) => <Alert type="warning" showIcon message={r.advertencia} style={{ margin: 0 }} />,
        expandRowByClick: false,
      }}
    />
  );
}

function ConfiguracionContable() {
  const qc = useQueryClient();
  const { data: filas, isLoading } = useQuery({
    queryKey: ['configuracion-contable'],
    queryFn: configuracionContableApi.listar,
  });

  const cambiarMut = useMutation({
    mutationFn: ({ concepto, cuentaCodigo }: { concepto: string; cuentaCodigo: string }) =>
      configuracionContableApi.actualizar(concepto, cuentaCodigo),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['configuracion-contable'] }); message.success('Configuración actualizada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? e?.response?.data?.errors?.[0] ?? 'Error al actualizar'),
  });

  const restaurarMut = useMutation({
    mutationFn: (concepto: string) => configuracionContableApi.restaurar(concepto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['configuracion-contable'] }); message.success('Vuelto al valor por defecto'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error al restaurar'),
  });

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, ConceptoContableRow[]>();
    for (const f of filas ?? []) {
      if (!mapa.has(f.grupo)) mapa.set(f.grupo, []);
      mapa.get(f.grupo)!.push(f);
    }
    return mapa;
  }, [filas]);

  const advertencias = (filas ?? []).filter(f => f.advertencia).length;

  return (
    <>
      <Space align="center" style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Configuración Contable</Title>
          <Text type="secondary">
            Qué cuenta usa cada concepto del motor de asientos. Sin configurar nada, cada uno sigue usando el valor por defecto de siempre.
          </Text>
        </div>
        <Space>
          <RefreshByKeyButton queryKey={['configuracion-contable']} />
          <VideoTutorialButton />
        </Space>
      </Space>

      {advertencias > 0 && (
        <Alert
          style={{ marginBottom: 12 }}
          type="warning" showIcon
          message={`${advertencias} concepto(s) apuntan a una cuenta que ya no existe, está inactiva, o no permite movimientos`}
          description="El próximo asiento que necesite esa cuenta se generará sin ella (y quedará reportado) — corrígelo aquí antes de que pase."
        />
      )}

      <Collapse
        defaultActiveKey={[...porGrupo.keys()]}
        items={[...porGrupo.entries()].map(([grupo, rows]) => ({
          key: grupo,
          label: <Space>{grupo}{rows.some(r => r.advertencia) && <Tag color="orange">Revisar</Tag>}</Space>,
          children: (
            <GrupoTabla
              grupo={grupo}
              filas={rows}
              onCambiar={(concepto, cuentaCodigo) => cambiarMut.mutate({ concepto, cuentaCodigo })}
              onRestaurar={(concepto) => restaurarMut.mutate(concepto)}
              pendiente={restaurarMut.isPending ? (restaurarMut.variables as string) : null}
            />
          ),
        }))}
        style={{ opacity: isLoading ? 0.6 : 1 }}
      />
    </>
  );
}

export default function ConfiguracionContablePage() {
  const { bloqueado, config, plan } = usePlanGuard();
  if (bloqueado && config) return <ModuloBloqueado modulo="Contabilidad General" planMinimo={config.planMinimo} planActual={plan} />;
  return <ConfiguracionContable />;
}
