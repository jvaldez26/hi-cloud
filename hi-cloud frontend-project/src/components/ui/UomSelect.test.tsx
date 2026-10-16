import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UomSelect } from './UomSelect';

/**
 * Formulario único de producto (2026-10-16) — una unidad fuera del catálogo
 * de la empresa (import CSV viejo, alta antes de <UomSelect/>, o un
 * mismatch de mayúsculas que la migración no pudo normalizar sin
 * ambigüedad) se muestra TAL CUAL, con un aviso — nunca en blanco ni
 * cambiada en silencio a la primera opción del catálogo.
 */

const useUomUnidadesQueryMock = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useCatalogQueries', () => ({ useUomUnidadesQuery: useUomUnidadesQueryMock }));

const CATALOGO = [
  { codigo: 'PZA', nombre: 'Pieza', simbolo: 'pza' },
  { codigo: 'KG', nombre: 'Kilogramo', simbolo: 'kg' },
];

describe('UomSelect — unidad fuera del catálogo', () => {
  it('con el catálogo cargado y value dentro del catálogo: sin aviso', () => {
    useUomUnidadesQueryMock.mockReturnValue({ data: CATALOGO });
    render(<UomSelect value="PZA" onChange={vi.fn()} />);
    expect(screen.queryByText(/no está en el catálogo/i)).not.toBeInTheDocument();
  });

  it('con value fuera del catálogo: lo muestra tal cual y avisa, no lo deja en blanco', () => {
    useUomUnidadesQueryMock.mockReturnValue({ data: CATALOGO });
    render(<UomSelect value="PAZ" onChange={vi.fn()} />);
    expect(screen.getByText(/no está en el catálogo/i)).toBeInTheDocument();
    // El Select muestra el valor actual como texto — no queda vacío (aparece
    // tanto en el control como en el aviso, por eso getAllByText).
    expect(screen.getAllByText(/PAZ/).length).toBeGreaterThan(0);
  });

  it('sin catálogo configurado (opts vacío): cae al Input libre con el value intacto', () => {
    useUomUnidadesQueryMock.mockReturnValue({ data: [] });
    render(<UomSelect value="PAZ" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('PAZ')).toBeInTheDocument();
  });
});
