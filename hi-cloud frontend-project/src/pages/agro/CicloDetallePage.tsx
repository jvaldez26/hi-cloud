import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Tag, Row, Col, Statistic, Progress } from 'antd';
import { Plus, FileText, TrendingUp } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

export default function CicloDetallePage() {
  const { id } = useParams<{ id: string }>();
  const cicloId = Number(id);
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [laborModal, setLaborModal] = useState(false);
  const [insumoModal, setInsumoModal] = useState(false);
  const [cosechaModal, setCosechaModal] = useState(false);
  const [cerrarModal, setCerrarModal] = useState(false);
  const [laborForm] = Form.useForm();
  const [insumoForm] = Form.useForm();
  const [cosechaForm] = Form.useForm();
  const [cerrarForm] = Form.useForm();

  const { data: ciclo, isLoading } = useQuery({ queryKey: ['agro-ciclo', cicloId], queryFn: () => agroApi.getCiclo(cicloId) });
  const { data: rent } = useQuery({ queryKey: ['agro-rent', cicloId], queryFn: () => agroApi.getRentabilidadCiclo(cicloId) });

  const crearLabor = useMutation({
    mutationFn: (v: any) => agroApi.crearLabor({ ...v, cicloId, fecha: v.fecha?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-ciclo', cicloId] }); setLaborModal(false); laborForm.resetFields(); message.success('Labor registrada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const crearInsumo = useMutation({
    mutationFn: (v: any) => agroApi.crearAplicacion({ ...v, cicloId, fecha: v.fecha?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-ciclo', cicloId] }); setInsumoModal(false); insumoForm.resetFields(); message.success('Aplicación registrada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const crearCosecha = useMutation({
    mutationFn: (v: any) => agroApi.crearCosecha({ ...v, cicloId, fecha: v.fecha?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-ciclo', cicloId] }); setCosechaModal(false); cosechaForm.resetFields(); message.success('Cosecha registrada'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  const cerrarCiclo = useMutation({
    mutationFn: (v: any) => agroApi.cerrarCiclo(cicloId, { ...v, fechaCosechaReal: v.fechaCosechaReal?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-ciclo', cicloId] }); setCerrarModal(false); message.success('Ciclo cerrado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  if (isLoading || !ciclo) return null;

  const cTotal  = Number(ciclo.costoTotal);
  const ingreso = Number(ciclo.ingresoVentas);
  const rentVal = ingreso - cTotal;

  const costoItems = [
    { label: 'Semilla', val: Number(ciclo.costoSemilla) },
    { label: 'Insumos', val: Number(ciclo.costoInsumos) },
    { label: 'Mano de Obra', val: Number(ciclo.costoManoObra) },
    { label: 'Maquinaria', val: Number(ciclo.costoMaquinaria) },
    { label: 'Otros', val: Number(ciclo.costoOtros) },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: C.colorText, margin: 0 }}>{ciclo.numero} — {ciclo.cultivoNombre}</h2>
          <span style={{ color: C.colorTextSecondary }}>{ciclo.parcelaNombre} · Siembra: {String(ciclo.fechaSiembra).split('T')[0]}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<FileText size={14} />} href={agroApi.pdfTrazabilidad(cicloId)} target="_blank">PDF Trazabilidad</Button>
          <Button icon={<TrendingUp size={14} />} href={agroApi.pdfCostos(cicloId)} target="_blank">PDF Costos</Button>
          {ciclo.estado !== 'cerrado' && <Button type="default" danger onClick={() => { cerrarForm.resetFields(); setCerrarModal(true); }}>Cerrar Ciclo</Button>}
        </div>
      </div>

      <Tabs items={[
        {
          key: 'resumen', label: 'Resumen',
          children: (
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}><Card><Statistic title="Estado" value={ciclo.estado} /></Card></Col>
              <Col xs={12} md={6}><Card><Statistic title="Área Sembrada" value={ciclo.areaSembrada ?? '-'} suffix={ciclo.unidadArea ?? 'tareas'} /></Card></Col>
              <Col xs={12} md={6}><Card><Statistic title="Días Transcurridos" value={ciclo.diasTranscurridos ?? 0} /></Card></Col>
              <Col xs={12} md={6}><Card><Statistic title="Para Cosechar" value={ciclo.diasParaCosecha ?? '-'} suffix="días" /></Card></Col>
            </Row>
          ),
        },
        {
          key: 'labores', label: 'Labores',
          children: (
            <div>
              <Button type="primary" icon={<Plus size={14} />} onClick={() => { laborForm.resetFields(); setLaborModal(true); }} style={{ marginBottom: 12 }}>Registrar Labor</Button>
              <Table size="small" scroll={{ x: 'max-content' }} dataSource={ciclo.labores ?? []} rowKey="id"
                columns={[
                  { title: 'Fecha', dataIndex: 'fecha', key: 'f', render: (v: string) => String(v).split('T')[0] },
                  { title: 'Tipo', dataIndex: 'tipo', key: 't' },
                  { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                  { title: 'Trabajadores', dataIndex: 'cantidadTrabajadores', key: 'tr' },
                  { title: 'Horas', dataIndex: 'horasTrabajadas', key: 'h' },
                  { title: 'Costo M.O.', dataIndex: 'costoManoObra', key: 'cm', render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
                  { title: 'Maquinaria', dataIndex: 'usoMaquinaria', key: 'maq' },
                  { title: 'Costo Maq.', dataIndex: 'costoMaquinaria', key: 'cmaq', render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
                  { title: 'Estado', dataIndex: 'estado', key: 'est', render: (v: string) => <Tag color="blue">{v}</Tag> },
                ]} />
            </div>
          ),
        },
        {
          key: 'insumos', label: 'Insumos',
          children: (
            <div>
              <Button type="primary" icon={<Plus size={14} />} onClick={() => { insumoForm.resetFields(); setInsumoModal(true); }} style={{ marginBottom: 12 }}>Registrar Aplicación</Button>
              <Table size="small" scroll={{ x: 'max-content' }} dataSource={ciclo.aplicaciones ?? []} rowKey="id"
                columns={[
                  { title: 'Fecha', dataIndex: 'fecha', key: 'f', render: (v: string) => String(v).split('T')[0] },
                  { title: 'Insumo', dataIndex: 'insumoNombre', key: 'i' },
                  { title: 'Tipo', dataIndex: 'tipo', key: 't' },
                  { title: 'Cantidad', key: 'c', render: (_: any, r: any) => `${r.cantidad} ${r.unidad ?? ''}` },
                  { title: 'Dosis/Área', dataIndex: 'dosisPorArea', key: 'd' },
                  { title: 'Carencia', dataIndex: 'periodoCarencia', key: 'car', render: (v: any) => v ? `${v} días` : '-' },
                  { title: 'Costo', dataIndex: 'costoTotal', key: 'ct', render: (v: any) => `RD$${Number(v).toLocaleString('es-DO')}` },
                ]} />
            </div>
          ),
        },
        {
          key: 'cosechas', label: 'Cosechas',
          children: (
            <div>
              <Button type="primary" icon={<Plus size={14} />} onClick={() => { cosechaForm.resetFields(); setCosechaModal(true); }} style={{ marginBottom: 12 }}>Registrar Cosecha</Button>
              <Table size="small" scroll={{ x: 'max-content' }} dataSource={ciclo.cosechas ?? []} rowKey="id"
                columns={[
                  { title: 'N°', dataIndex: 'numero', key: 'n' },
                  { title: 'Fecha', dataIndex: 'fecha', key: 'f', render: (v: string) => String(v).split('T')[0] },
                  { title: 'Cantidad', key: 'c', render: (_: any, r: any) => `${r.cantidad} ${r.unidad ?? ''}` },
                  { title: 'Calidad', dataIndex: 'calidad', key: 'q' },
                  { title: 'Destino', dataIndex: 'destino', key: 'd' },
                  { title: 'Inventario', dataIndex: 'ingresadoInventario', key: 'inv', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Sí' : 'No'}</Tag> },
                ]} />
            </div>
          ),
        },
        {
          key: 'costos', label: 'Costos',
          children: (
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card title="Desglose de Costos">
                  {costoItems.map(item => (
                    <div key={item.label} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>{item.label}</span>
                        <strong>RD${item.val.toLocaleString('es-DO')}</strong>
                      </div>
                      <Progress percent={cTotal > 0 ? +((item.val / cTotal) * 100).toFixed(1) : 0} size="small" />
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${C.colorBorder}`, paddingTop: 8, marginTop: 8 }}>
                    <strong>Costo Total: RD${cTotal.toLocaleString('es-DO')}</strong>
                  </div>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card title="Análisis de Rentabilidad">
                  <Statistic title="Costo Total" value={cTotal} prefix="RD$" precision={2} />
                  <Statistic title="Ingreso Ventas" value={ingreso} prefix="RD$" precision={2} style={{ marginTop: 12 }} />
                  <Statistic title="Rentabilidad" value={rentVal} prefix="RD$" precision={2}
                    valueStyle={{ color: rentVal >= 0 ? C.colorSuccess : '#ff4d4f' }} style={{ marginTop: 12 }} />
                  {rent && <Statistic title="Margen" value={rent.margenPct} suffix="%" style={{ marginTop: 12 }} />}
                  {rent?.costoPorUnidad > 0 && <Statistic title={`Costo por ${ciclo.unidadCosecha ?? 'unidad'}`} value={rent.costoPorUnidad} prefix="RD$" precision={2} style={{ marginTop: 12 }} />}
                </Card>
              </Col>
            </Row>
          ),
        },
      ]} />

      {/* Modal labor */}
      <Modal open={laborModal} title="Registrar Labor" onCancel={() => setLaborModal(false)}
        onOk={() => laborForm.validateFields().then(v => crearLabor.mutate(v))} confirmLoading={crearLabor.isPending}>
        <Form form={laborForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[
              { value: 'preparacion_suelo', label: 'Preparación Suelo' }, { value: 'siembra', label: 'Siembra' },
              { value: 'fertilizacion', label: 'Fertilización' }, { value: 'fumigacion', label: 'Fumigación' },
              { value: 'riego', label: 'Riego' }, { value: 'deshierbe', label: 'Deshierbe' },
              { value: 'poda', label: 'Poda' }, { value: 'cosecha', label: 'Cosecha' }, { value: 'otro', label: 'Otro' },
            ]} />
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input /></Form.Item>
          <Form.Item name="cantidadTrabajadores" label="Trabajadores"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="horasTrabajadas" label="Horas Trabajadas"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="costoManoObra" label="Costo Mano de Obra (RD$)" initialValue={0}><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="usoMaquinaria" label="Maquinaria Usada"><Input /></Form.Item>
          <Form.Item name="costoMaquinaria" label="Costo Maquinaria (RD$)" initialValue={0}><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal insumo */}
      <Modal open={insumoModal} title="Registrar Aplicación de Insumo" onCancel={() => setInsumoModal(false)}
        onOk={() => insumoForm.validateFields().then(v => crearInsumo.mutate(v))} confirmLoading={crearInsumo.isPending}>
        <Form form={insumoForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="insumoNombre" label="Nombre del Insumo" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tipo" label="Tipo">
            <Select allowClear options={[
              { value: 'fertilizante', label: 'Fertilizante' }, { value: 'herbicida', label: 'Herbicida' },
              { value: 'fungicida', label: 'Fungicida' }, { value: 'insecticida', label: 'Insecticida' },
              { value: 'semilla', label: 'Semilla' }, { value: 'abono', label: 'Abono' }, { value: 'otro', label: 'Otro' },
            ]} />
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="unidad" label="Unidad"><Input placeholder="litro, kg, saco, galón..." /></Form.Item>
          <Form.Item name="costoUnitario" label="Costo Unitario (RD$)"><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="dosisPorArea" label="Dosis por Área"><Input placeholder="ej: 2 kg/tarea" /></Form.Item>
          <Form.Item name="periodoCarencia" label="Período de Carencia (días)"><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="loteInsumo" label="Lote del Insumo"><Input /></Form.Item>
        </Form>
      </Modal>

      {/* Modal cosecha */}
      <Modal open={cosechaModal} title="Registrar Cosecha" onCancel={() => setCosechaModal(false)}
        onOk={() => cosechaForm.validateFields().then(v => crearCosecha.mutate(v))} confirmLoading={crearCosecha.isPending}>
        <Form form={cosechaForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}><InputNumber min={0} style={{ width: 150 }} /></Form.Item>
          <Form.Item name="unidad" label="Unidad"><Input /></Form.Item>
          <Form.Item name="calidad" label="Calidad">
            <Select allowClear options={[{ value: 'primera', label: 'Primera' }, { value: 'segunda', label: 'Segunda' }, { value: 'tercera', label: 'Tercera' }, { value: 'rechazo', label: 'Rechazo' }]} />
          </Form.Item>
          <Form.Item name="destino" label="Destino">
            <Select allowClear options={[{ value: 'venta', label: 'Venta' }, { value: 'almacen', label: 'Almacén' }, { value: 'procesamiento', label: 'Procesamiento' }, { value: 'autoconsumo', label: 'Autoconsumo' }]} />
          </Form.Item>
          <Form.Item name="costoManoObra" label="Costo Mano de Obra Cosecha (RD$)" initialValue={0}><InputNumber min={0} style={{ width: 200 }} /></Form.Item>
          <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Modal cerrar ciclo */}
      <Modal open={cerrarModal} title="Cerrar Ciclo de Producción" onCancel={() => setCerrarModal(false)}
        onOk={() => cerrarForm.validateFields().then(v => cerrarCiclo.mutate(v))} confirmLoading={cerrarCiclo.isPending}>
        <Form form={cerrarForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="fechaCosechaReal" label="Fecha Real de Cosecha"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="ingresoVentas" label="Ingreso Total por Ventas (RD$)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: 250 }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
