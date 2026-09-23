// Anexo A del IT-1 (ITBIS) — Commit 5 del rebuild 2026-09-22. NO confundir
// con "Anexo A1" (pestaña aparte, IR-2/Balance General — otro impuesto).
//
// Secciones II (por tipo de NCF), III (por forma de pago), IV (por tipo de
// ingreso) e IX (ITBIS pagado, con proporcionalidad) — mismas casillas y
// mismos números que el formulario oficial DGII. Las casillas sin fuente de
// datos real en el sistema se muestran marcadas (no_aplica/requiere_revision
// con su motivo), nunca ocultas ni en 0 mudo — mismo criterio que ya aplica
// el motor en el backend.

import { useState } from 'react';
import { Card, Row, Col, Statistic, Button, Space, Typography, Alert, DatePicker, Tag } from 'antd';
import { DownloadOutlined, FileTextOutlined, FilePdfOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import api from '../../api/client';
import { fmt } from '../../utils/formatters';
import { exportarAnexoAItbis } from '../../utils/exportExcel';
import { CasillaTable, flattenCasillas, conLabels } from './CasillaTable';
import { LABELS_ANEXO_A } from './casillasLabels';
import { FUENTE_ANEXO_A } from './casillasFuente';

const { Text, Paragraph } = Typography;

function authHeaders() {
  return { 'X-Empresa-ID': localStorage.getItem('empresaId') ?? '' };
}

const anexoAApi = {
  get: (mes: number, anio: number) =>
    api.get(`/declaraciones/it1/anexo-a?mes=${mes}&anio=${anio}`).then(r => r.data?.data ?? r.data),
};

export default function AnexoAItbisPanel() {
  const [periodo, setPeriodo] = useState<Dayjs>(dayjs());
  const [exportando, setExportando] = useState(false);
  const [pdfCargando, setPdfCargando] = useState(false);
  const mes  = periodo.month() + 1;
  const anio = periodo.year();

  const { data, isLoading } = useQuery({
    queryKey: ['anexo-a-itbis', mes, anio],
    queryFn: () => anexoAApi.get(mes, anio),
  });

  async function handleExportarExcel() {
    if (!data) return;
    setExportando(true);
    try { await exportarAnexoAItbis(data, mes, anio); } finally { setExportando(false); }
  }

  async function handleExportarPDF() {
    setPdfCargando(true);
    try {
      const res = await fetch(`/api/v1/declaraciones/it1/anexo-a/pdf?mes=${mes}&anio=${anio}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `AnexoA-ITBIS_${anio}${String(mes).padStart(2, '0')}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // silencioso a propósito: el botón queda disponible para reintentar, sin bloquear la pantalla
    } finally {
      setPdfCargando(false);
    }
  }

  const avisos: string[] = data?.avisos ?? [];
  const filasII  = data ? conLabels(flattenCasillas(data.seccionII),  LABELS_ANEXO_A) : [];
  const filasIII = data ? conLabels(flattenCasillas(data.seccionIII), LABELS_ANEXO_A) : [];
  const filasIV  = data ? conLabels(flattenCasillas(data.seccionIV),  LABELS_ANEXO_A) : [];
  const filasIX  = data ? conLabels(flattenCasillas(data.seccionIX),  LABELS_ANEXO_A) : [];
  // Todas juntas — el visor de origen resuelve referencias cruzadas entre
  // secciones (ej. Casilla 55 de la IX cita la 53 y la 54, ambas en la IX,
  // pero la 26 de la IV cita casillas 20-25 también de la IV).
  const todasLasCasillas = [...filasII, ...filasIII, ...filasIV, ...filasIX];
  const periodoVisor = { mes, anio };

  const totalOperaciones = filasII.find(f => f.casilla === 11)?.monto ?? 0;
  const totalItbisDeducible = filasIX.find(f => f.casilla === 56)?.monto ?? 0;
  const coeficiente = filasIX.find(f => f.casilla === 54);

  return (
    <div>
      <Alert
        type="info" showIcon icon={<FileTextOutlined />} style={{ marginBottom: 16 }}
        message="Anexo A del IT-1 — ITBIS"
        description={
          <Paragraph style={{ margin: 0, fontSize: 13 }}>
            Secciones II (por tipo de NCF), III (por forma de pago), IV (por tipo de ingreso) e IX (ITBIS pagado,
            con proporcionalidad Art. 349) — mismas casillas que el formulario oficial DGII. Las casillas sin fuente
            de datos real en el sistema quedan marcadas con su motivo, nunca en cero silencioso.
          </Paragraph>
        }
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Text type="secondary">Período:</Text>
        <DatePicker picker="month" value={periodo} onChange={(d) => d && setPeriodo(d)} allowClear={false} format="MMMM YYYY" />
        <Button icon={<DownloadOutlined />} loading={exportando} disabled={!data} onClick={handleExportarExcel}>
          Excel
        </Button>
        <Button icon={<FilePdfOutlined />} danger loading={pdfCargando} disabled={!data} onClick={handleExportarPDF}>
          PDF
        </Button>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title="Total Operaciones (Casilla 11)" value={totalOperaciones}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title="Total ITBIS Deducible (Casilla 56)" value={totalItbisDeducible}
            formatter={v => fmt.money(Number(v))} loading={isLoading} valueStyle={{ color: '#10b981' }} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic title="Coeficiente de Proporcionalidad" value={coeficiente?.monto ?? 0}
              formatter={v => `${Number(v).toFixed(2)}%`} loading={isLoading}
              valueStyle={{ color: coeficiente?.estado === 'no_aplica' ? '#94a3b8' : '#7c3aed' }} />
            {coeficiente && (
              <Tag color={coeficiente.estado === 'no_aplica' ? 'default' : coeficiente.estado === 'requiere_revision' ? 'orange' : 'purple'} style={{ marginTop: 6 }}>
                {coeficiente.estado === 'no_aplica' ? '100% gravado — no aplicó' : coeficiente.estado === 'requiere_revision' ? 'Requiere revisión' : 'Aplicado'}
              </Tag>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Sección II — Operaciones por Tipo de NCF" style={{ marginBottom: 16 }}>
        <CasillaTable rows={filasII} conCantidad avisos={avisos} fuenteMap={FUENTE_ANEXO_A} periodo={periodoVisor} todasLasCasillas={todasLasCasillas} />
      </Card>

      <Card title="Sección III — Operaciones por Forma de Pago (monto bruto)" style={{ marginBottom: 16 }}>
        <CasillaTable rows={filasIII} avisos={avisos} fuenteMap={FUENTE_ANEXO_A} periodo={periodoVisor} todasLasCasillas={todasLasCasillas} />
      </Card>

      <Card title="Sección IV — Operaciones por Tipo de Ingreso" style={{ marginBottom: 16 }}>
        <CasillaTable rows={filasIV} avisos={avisos} fuenteMap={FUENTE_ANEXO_A} periodo={periodoVisor} todasLasCasillas={todasLasCasillas} />
      </Card>

      <Card title="Sección IX — ITBIS Pagado (Compras Locales)" style={{ marginBottom: 16 }}>
        <CasillaTable rows={filasIX} avisos={avisos} fuenteMap={FUENTE_ANEXO_A} periodo={periodoVisor} todasLasCasillas={todasLasCasillas} />
      </Card>

      {avisos.length > 0 && (
        <Alert
          type="warning" showIcon icon={<WarningOutlined />}
          message={`${avisos.length} nota${avisos.length !== 1 ? 's' : ''} sobre este período`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {avisos.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
            </ul>
          }
        />
      )}
    </div>
  );
}
