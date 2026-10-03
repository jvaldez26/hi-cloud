import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import XlinkColumnaEstado from './XlinkColumnaEstado';
import type { EstadoXlinkItem } from '../../api/xlink.api';

describe('XlinkColumnaEstado', () => {
  it('sin estado aún (cargando), muestra el placeholder de carga', () => {
    render(<XlinkColumnaEstado estado={undefined} cargando={true} />);
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('ya enviado y procesado: tag verde con el número generado en el tooltip', () => {
    const estado: EstadoXlinkItem = { id: 1, yaEnviado: true, estadoReceptor: 'procesado', numeroGenerado: 'FAC-50', elegible: false };
    render(<XlinkColumnaEstado estado={estado} cargando={false} />);
    expect(screen.getByText('Recibido')).toBeInTheDocument();
  });

  it('ya enviado y descartado: tag rojo', () => {
    const estado: EstadoXlinkItem = { id: 2, yaEnviado: true, estadoReceptor: 'descartado', elegible: false };
    render(<XlinkColumnaEstado estado={estado} cargando={false} />);
    expect(screen.getByText('Descartado')).toBeInTheDocument();
  });

  it('ya enviado y pendiente: tag azul', () => {
    const estado: EstadoXlinkItem = { id: 3, yaEnviado: true, estadoReceptor: 'pendiente', elegible: false };
    render(<XlinkColumnaEstado estado={estado} cargando={false} />);
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('no elegible: "No enviado" (el motivo va en el tooltip, nunca oculto)', () => {
    const estado: EstadoXlinkItem = { id: 4, yaEnviado: false, elegible: false, motivo: 'Solo se pueden enviar facturas a crédito' };
    render(<XlinkColumnaEstado estado={estado} cargando={false} />);
    expect(screen.getByText('No enviado')).toBeInTheDocument();
  });

  it('elegible y aún no enviado: "No enviado" sin motivo', () => {
    const estado: EstadoXlinkItem = { id: 5, yaEnviado: false, elegible: true };
    render(<XlinkColumnaEstado estado={estado} cargando={false} />);
    expect(screen.getByText('No enviado')).toBeInTheDocument();
  });
});
