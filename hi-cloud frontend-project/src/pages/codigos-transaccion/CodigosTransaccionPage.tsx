import { useMemo, useState } from 'react';
import { Card, Typography, Input, Table, Tag, Button, Space } from 'antd';
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../store/auth.store';
import { useMisModulosAddon } from '../../hooks/useCatalogQueries';
import { usePlan } from '../../hooks/usePlan';
import {
  construirNavItems, construirCodigosParametrizados, construirIndiceCodigos,
  type CodigoEntry,
} from '../../components/ui/CommandPalette';

const { Title, Text } = Typography;

/**
 * AD90 — Códigos de Transacción. Tabla de referencia (tipo SAP) de TODAS las
 * pantallas que el usuario puede ver, con su código, para consulta e
 * impresión. Usa la MISMA fuente y las MISMAS reglas de rol/add-on/plan que
 * el sidebar y el buscador global (CommandPalette) — nunca una lista aparte.
 */
export default function CodigosTransaccionPage() {
  const [busqueda, setBusqueda] = useState('');

  const { user } = useAuthStore();
  const userRole = user?.role ?? 'viewer';
  const { data: misModulosRes } = useMisModulosAddon(!!user);
  const modulosActivos: string[] = misModulosRes?.modulos ?? [];
  const { tieneModulo } = usePlan();
  const xlinkHabilitado = tieneModulo('xlink');

  const filas = useMemo<CodigoEntry[]>(() => {
    const navItems = construirNavItems(userRole, modulosActivos, xlinkHabilitado);
    const parametrizados = construirCodigosParametrizados(userRole, modulosActivos);
    return construirIndiceCodigos(navItems, parametrizados)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [userRole, modulosActivos, xlinkHabilitado]);

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(f =>
      f.codigo.toLowerCase().includes(q) ||
      f.label.toLowerCase().includes(q) ||
      f.group.toLowerCase().includes(q) ||
      f.path.toLowerCase().includes(q),
    );
  }, [filas, busqueda]);

  return (
    <div className="codigos-transaccion-page">
      <style>{`
        @media print {
          .ant-layout-sider, .ant-layout-header, .no-imprimir { display: none !important; }
          .codigos-transaccion-page { padding: 0 !important; }
        }
      `}</style>

      <Card>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} className="no-imprimir">
          <div>
            <Title level={4} style={{ margin: 0 }}>Códigos de Transacción</Title>
            <Text type="secondary">
              Atajo tipo SAP para cada pantalla — escríbelo en el buscador global (⌘K / Ctrl+K) para abrirla directo.
            </Text>
          </div>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            Imprimir / Guardar PDF
          </Button>
        </Space>

        <Input
          className="no-imprimir"
          placeholder="Buscar por código, pantalla o área..."
          prefix={<SearchOutlined />}
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ marginBottom: 16, maxWidth: 420 }}
          allowClear
        />

        <Table
          dataSource={filasFiltradas}
          rowKey="codigo"
          size="small"
          pagination={{ pageSize: 50, showSizeChanger: false }}
          columns={[
            {
              title: 'Código', dataIndex: 'codigo', width: 110,
              render: (c: string) => <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 12 }}>{c}</Tag>,
            },
            { title: 'Pantalla', dataIndex: 'label' },
            { title: 'Área', dataIndex: 'group' },
            {
              title: 'Ruta', dataIndex: 'path',
              render: (p: string, row: CodigoEntry) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {p}{row.parametrizado ? ` (parámetro: ${row.parametrizado.paramDescripcion || '—'})` : ''}
                </Text>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
