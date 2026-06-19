import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, message, theme, Descriptions, Tag } from 'antd';
import { Plus, FileText } from 'lucide-react';
import { agroApi } from '../../api/agro.api';

export default function AnimalDetallePage() {
  const { id } = useParams<{ id: string }>();
  const animalId = Number(id);
  const { token: C } = theme.useToken();
  const qc = useQueryClient();
  const [evModal, setEvModal] = useState(false);
  const [evForm] = Form.useForm();

  const { data: animal, isLoading } = useQuery({ queryKey: ['agro-animal', animalId], queryFn: () => agroApi.getAnimal(animalId) });
  const { data: eventos = [] } = useQuery({ queryKey: ['agro-eventos', animalId], queryFn: () => agroApi.getEventosAnimal(animalId) });
  const { data: genealogia } = useQuery({ queryKey: ['agro-genealogia', animalId], queryFn: () => agroApi.getGenealogia(animalId) });
  const { data: produccionResp } = useQuery({ queryKey: ['agro-leche', animalId], queryFn: () => agroApi.getProduccionLeche({ animalId }) });
  const produccionLeche: any[] = (produccionResp as any)?.data ?? produccionResp ?? [];

  const crearEvento = useMutation({
    mutationFn: (v: any) => agroApi.crearEventoAnimal(animalId, { ...v, fecha: v.fecha?.format('YYYY-MM-DD'), proximaFecha: v.proximaFecha?.format('YYYY-MM-DD') }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agro-eventos', animalId] }); qc.invalidateQueries({ queryKey: ['agro-animal', animalId] }); setEvModal(false); evForm.resetFields(); message.success('Evento registrado'); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Error'),
  });

  if (isLoading || !animal) return null;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: C.colorText, margin: 0 }}>{animal.nombre ?? animal.arete} <Tag>{animal.tipo}</Tag></h2>
          <span style={{ color: C.colorTextSecondary }}>Arete: {animal.arete} · {animal.raza} · {animal.sexo}</span>
        </div>
        <Button icon={<FileText size={14} />} href={agroApi.pdfAnimal(animalId)} target="_blank">PDF Ficha</Button>
      </div>

      <Tabs items={[
        {
          key: 'datos', label: 'Datos',
          children: (
            <Card>
              <Descriptions bordered column={2}>
                <Descriptions.Item label="Arete">{animal.arete}</Descriptions.Item>
                <Descriptions.Item label="Nombre">{animal.nombre ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Tipo">{animal.tipo}</Descriptions.Item>
                <Descriptions.Item label="Raza">{animal.raza ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Sexo">{animal.sexo}</Descriptions.Item>
                <Descriptions.Item label="Propósito">{animal.proposito ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="F. Nacimiento">{animal.fechaNacimiento ? String(animal.fechaNacimiento).split('T')[0] : '-'}</Descriptions.Item>
                <Descriptions.Item label="Peso Nacer">{animal.pesoNacimiento ? `${animal.pesoNacimiento} kg` : '-'}</Descriptions.Item>
                <Descriptions.Item label="Peso Actual">{animal.pesoActual ? `${animal.pesoActual} kg` : '-'}</Descriptions.Item>
                <Descriptions.Item label="Estado"><Tag color={animal.estado === 'activo' ? 'green' : 'red'}>{animal.estado}</Tag></Descriptions.Item>
                <Descriptions.Item label="Color">{animal.colorPelaje ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Marcas">{animal.marcas ?? '-'}</Descriptions.Item>
              </Descriptions>
            </Card>
          ),
        },
        {
          key: 'genealogia', label: 'Genealogía',
          children: genealogia ? (
            <Card>
              {genealogia.madre && <div style={{ marginBottom: 12 }}><strong>Madre:</strong> {genealogia.madre.arete} {genealogia.madre.nombre ?? ''} — {genealogia.madre.raza}</div>}
              {genealogia.padre && <div style={{ marginBottom: 12 }}><strong>Padre:</strong> {genealogia.padre.arete} {genealogia.padre.nombre ?? ''} — {genealogia.padre.raza}</div>}
              {genealogia.crias?.length > 0 && (
                <div>
                  <strong>Crías ({genealogia.crias.length}):</strong>
                  <Table size="small" style={{ marginTop: 8 }} scroll={{ x: 'max-content' }} pagination={false}
                    dataSource={genealogia.crias} rowKey="id"
                    columns={[
                      { title: 'Arete', dataIndex: 'arete', key: 'a' },
                      { title: 'Nombre', dataIndex: 'nombre', key: 'n' },
                      { title: 'Sexo', dataIndex: 'sexo', key: 's' },
                      { title: 'F. Nac.', dataIndex: 'fechaNacimiento', key: 'fn', render: (v: string) => v ? String(v).split('T')[0] : '-' },
                      { title: 'Estado', dataIndex: 'estado', key: 'e', render: (v: string) => <Tag color={v === 'activo' ? 'green' : 'red'}>{v}</Tag> },
                    ]} />
                </div>
              )}
            </Card>
          ) : <Card>Sin datos genealógicos</Card>,
        },
        {
          key: 'eventos', label: 'Historial Sanitario / Eventos',
          children: (
            <div>
              <Button type="primary" icon={<Plus size={14} />} onClick={() => { evForm.resetFields(); setEvModal(true); }} style={{ marginBottom: 12 }}>Registrar Evento</Button>
              <Table size="small" scroll={{ x: 'max-content' }} dataSource={eventos as any[]} rowKey="id"
                columns={[
                  { title: 'Fecha', dataIndex: 'fecha', key: 'f', render: (v: string) => String(v).split('T')[0] },
                  { title: 'Tipo', dataIndex: 'tipo', key: 't' },
                  { title: 'Descripción', dataIndex: 'descripcion', key: 'd' },
                  { title: 'Producto', dataIndex: 'producto', key: 'p' },
                  { title: 'Dosis', dataIndex: 'dosis', key: 'dos' },
                  { title: 'Veterinario', dataIndex: 'veterinario', key: 'v' },
                  { title: 'Prox. Fecha', dataIndex: 'proximaFecha', key: 'pf', render: (v: string) => v ? String(v).split('T')[0] : '-' },
                  { title: 'Valor', key: 'val', render: (_: any, r: any) => r.valor ? `${r.valor} ${r.unidadProduccion ?? ''}` : '-' },
                ]} />
            </div>
          ),
        },
        {
          key: 'produccion', label: 'Producción de Leche',
          children: (
            <Table size="small" scroll={{ x: 'max-content' }} dataSource={produccionLeche} rowKey="id"
              columns={[
                { title: 'Fecha', dataIndex: 'fecha', key: 'f', render: (v: string) => String(v).split('T')[0] },
                { title: 'Cantidad', key: 'c', render: (_: any, r: any) => `${r.valor} ${r.unidadProduccion ?? 'L'}` },
                { title: 'Turno', dataIndex: 'descripcion', key: 'd' },
              ]} />
          ),
        },
      ]} />

      <Modal open={evModal} title="Registrar Evento" onCancel={() => setEvModal(false)}
        onOk={() => evForm.validateFields().then(v => crearEvento.mutate(v))} confirmLoading={crearEvento.isPending} width={600}>
        <Form form={evForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="tipo" label="Tipo de Evento" rules={[{ required: true }]}>
            <Select options={[
              { value: 'vacuna', label: 'Vacuna' }, { value: 'desparasitacion', label: 'Desparasitación' },
              { value: 'vitamina', label: 'Vitamina' }, { value: 'tratamiento', label: 'Tratamiento' },
              { value: 'peso', label: 'Peso' }, { value: 'produccion_leche', label: 'Producción Leche' },
              { value: 'parto', label: 'Parto' }, { value: 'inseminacion', label: 'Inseminación' },
              { value: 'descarte', label: 'Descarte' }, { value: 'otro', label: 'Otro' },
            ]} />
          </Form.Item>
          <Form.Item name="fecha" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="descripcion" label="Descripción"><Input /></Form.Item>
          <Form.Item name="producto" label="Producto / Vacuna"><Input /></Form.Item>
          <Form.Item name="dosis" label="Dosis"><Input /></Form.Item>
          <Form.Item name="valor" label="Valor (para peso / producción)"><InputNumber min={0} style={{ width: 180 }} /></Form.Item>
          <Form.Item name="unidadProduccion" label="Unidad"><Input placeholder="kg, litros, etc." /></Form.Item>
          <Form.Item name="veterinario" label="Veterinario"><Input /></Form.Item>
          <Form.Item name="costo" label="Costo (RD$)"><InputNumber min={0} style={{ width: 180 }} /></Form.Item>
          <Form.Item name="proximaFecha" label="Próxima Fecha"><DatePicker style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
