import { Table, Empty, Spin } from 'antd';
import type { TableProps, ColumnType } from 'antd/es/table';
import { useMobile } from '../../hooks/useMediaQuery';

// ── Extensión de la columna antd ─────────────────────────────────────────────

export interface SmartColumn<T = any> extends ColumnType<T> {
  /** Ocultar en mobile card view — por defecto los primeros 3 se muestran */
  mobileHide?: boolean;
  /** Etiqueta en la card mobile (si difiere del title) */
  mobileLabel?: string;
  /** Es el título principal de la card (toma el primer campo si no se define) */
  mobileTitle?: boolean;
  /** Es el subtítulo de la card (fecha, código, etc.) */
  mobileSub?: boolean;
  /** Es monto — alinear derecha, tabular nums */
  isAmount?: boolean;
  /** Es estado/badge — centrado */
  isStatus?: boolean;
  /** Solo acciones — sin mostrar en cards */
  isActions?: boolean;
}

// ── Props del SmartTable ──────────────────────────────────────────────────────

export interface SmartTableProps<T extends object> extends Omit<TableProps<T>, 'columns'> {
  columns: SmartColumn<T>[];
  /** Mensaje vacío adicional */
  emptyDescription?: string;
  /** Muestra skeleton en lugar de spinner */
  skeletonRows?: number;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function SmartTable<T extends object>({
  columns,
  dataSource,
  loading,
  emptyDescription,
  size = 'small',
  ...rest
}: SmartTableProps<T>) {
  const isMobile = useMobile();

  // Preparar columnas antd con clases CSS estándar
  const antdColumns = columns.map(col => ({
    ...col,
    align: col.isAmount ? 'right' : col.isStatus ? 'center' : (col.align ?? 'left'),
    className: [
      col.isAmount ? 'hc-cell-amount' : '',
      col.isStatus ? 'hc-col-status' : '',
      col.isActions ? 'hc-col-actions' : '',
      col.className ?? '',
    ].filter(Boolean).join(' '),
    title: typeof col.title === 'string' ? (
      <span>{col.title as string}</span>
    ) : col.title,
  })) as any[];

  // ── Vista mobile: cards apiladas ──────────────────────────────────────────

  if (isMobile && dataSource && dataSource.length > 0) {
    const titleCol  = columns.find(c => c.mobileTitle) ?? columns.find(c => !c.isActions && !c.isStatus);
    const subCol    = columns.find(c => c.mobileSub);
    const statusCol = columns.find(c => c.isStatus);
    const actCol    = columns.find(c => c.isActions);
    const bodyColsRaw = columns.filter(
      c => !c.isActions && !c.mobileHide && c !== titleCol && c !== subCol && c !== statusCol,
    );
    // Máximo 4 campos en la grid de datos
    const bodyCols = bodyColsRaw.slice(0, 4);

    return (
      <div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Spin />
          </div>
        ) : (
          <div className="hc-mobile-cards">
            {(dataSource as T[]).map((row: T, idx) => {
              const rowKey = rest.rowKey;
              const key = typeof rowKey === 'function'
                ? String((rowKey as any)(row, idx))
                : String((row as any)[rowKey as string] ?? idx);

              const renderCell = (col: SmartColumn<T> | undefined) => {
                if (!col) return null;
                const raw = col.dataIndex ? (row as any)[col.dataIndex as string] : null;
                return col.render ? col.render(raw, row, idx) : raw;
              };

              return (
                <div
                  key={key}
                  className="hc-mobile-card"
                  onClick={rest.onRow ? () => (rest.onRow as any)(row, idx)?.onClick?.() : undefined}
                  style={{ cursor: rest.onRow ? 'pointer' : 'default' }}>

                  {/* Header: título + estado */}
                  <div className="hc-mobile-card-header">
                    <div style={{ minWidth: 0 }}>
                      <div className="hc-mobile-card-title">
                        {renderCell(titleCol)}
                      </div>
                      {subCol && (
                        <div className="hc-mobile-card-sub">
                          {renderCell(subCol)}
                        </div>
                      )}
                    </div>
                    {statusCol && (
                      <div style={{ flexShrink: 0 }}>
                        {renderCell(statusCol)}
                      </div>
                    )}
                  </div>

                  {/* Grid de campos */}
                  {bodyCols.length > 0 && (
                    <div className="hc-mobile-card-grid">
                      {bodyCols.map(col => (
                        <div key={String(col.key ?? col.dataIndex)}>
                          <div className="hc-mobile-card-field-label">
                            {col.mobileLabel ?? (typeof col.title === 'string' ? col.title : String(col.key ?? ''))}
                          </div>
                          <div className="hc-mobile-card-field-value">
                            {renderCell(col)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Acciones */}
                  {actCol && (
                    <div className="hc-mobile-card-actions">
                      {renderCell(actCol)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Vista vacía en mobile ──────────────────────────────────────────────────

  if (isMobile && (!dataSource || dataSource.length === 0) && !loading) {
    return (
      <Empty
        description={emptyDescription ?? 'Sin datos'}
        style={{ padding: '32px 0', color: 'var(--hc-text-2)' }}
      />
    );
  }

  // ── Vista desktop/tablet: tabla antd estándar ─────────────────────────────

  return (
    <Table<T>
      columns={antdColumns}
      dataSource={dataSource}
      loading={loading}
      size={size}
      scroll={{ x: 'max-content' }}
      locale={{
        emptyText: (
          <Empty
            description={emptyDescription ?? 'Sin datos'}
            style={{ padding: '24px 0', color: 'var(--hc-text-2)' }}
          />
        ),
      }}
      {...rest}
    />
  );
}
