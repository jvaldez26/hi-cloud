export const ECF_CONFIG = {

  31: {
    nombre:                  'Factura de Crédito Fiscal',
    compradorTipo:           'RNC' as const,
    compradorObligatorio:    true,
    itbisAplicable:          true,
    tieneInformacionReferencia: false,
    tieneTablaFormasPago:    false,
    itemUsa:                 'TablaImpuesto' as const,
  },

  32: {
    nombre:                  'Factura de Consumo',
    compradorTipo:           'GENERICO' as const,
    compradorObligatorio:    false,
    rncObligatorioSiMonto:   250_000,
    itbisAplicable:          true,
    tieneInformacionReferencia: false,
    tieneTablaFormasPago:    false,
    itemUsa:                 'ninguno' as const,
  },

  33: {
    nombre:                  'Nota de Débito',
    compradorTipo:           'RNC' as const,
    compradorObligatorio:    true,
    itbisAplicable:          false,
    tieneInformacionReferencia: true,
    tieneTablaFormasPago:    true,
    itemUsa:                 'E33_strings' as const,
  },

  34: {
    nombre:                  'Nota de Crédito',
    compradorTipo:           'RNC' as const,
    compradorObligatorio:    true,
    itbisAplicable:          false,
    tieneInformacionReferencia: true,
    tieneTablaFormasPago:    false,
    itemUsa:                 'ninguno' as const,
  },

  41: {
    nombre:                  'Compras',
    compradorTipo:           'RNC' as const,
    compradorObligatorio:    true,
    itbisAplicable:          true,
    tieneInformacionReferencia: false,
    tieneTablaFormasPago:    false,
    itemUsa:                 'TablaImpuesto' as const,
  },

  43: {
    nombre:                  'Gastos Menores',
    compradorTipo:           'GASTOS_MENORES' as const,
    compradorObligatorio:    true,      // SÍ tiene Comprador (131880657)
    itbisAplicable:          false,
    tieneInformacionReferencia: false,
    tieneTablaFormasPago:    false,
    itemUsa:                 'ninguno' as const,
  },

  44: {
    nombre:                  'Regímenes Especiales',
    compradorTipo:           'RNC' as const,
    compradorObligatorio:    true,
    itbisAplicable:          false,
    tieneInformacionReferencia: false,
    tieneTablaFormasPago:    false,
    itemUsa:                 'ninguno' as const,
  },

  45: {
    nombre:                  'Gubernamental',
    compradorTipo:           'RNC' as const,
    compradorObligatorio:    true,
    itbisAplicable:          true,
    tieneInformacionReferencia: false,
    tieneTablaFormasPago:    false,
    itemUsa:                 'TablaImpuesto' as const,
  },

  46: {
    nombre:                  'Exportaciones',
    compradorTipo:           'EXTRANJERO' as const,
    compradorObligatorio:    true,
    itbisAplicable:          false,
    tieneInformacionReferencia: false,
    tieneTablaFormasPago:    false,
    itemUsa:                 'ninguno' as const,
  },

  47: {
    nombre:                  'Pagos al Exterior',
    compradorTipo:           'EXTRANJERO' as const,
    compradorObligatorio:    true,
    itbisAplicable:          false,
    tieneInformacionReferencia: false,
    tieneTablaFormasPago:    false,
    itemUsa:                 'ninguno' as const,
  },

} as const;

export const ECF_TIPOS_SOPORTADOS = Object.keys(ECF_CONFIG).map(Number);

export const ECF_VALORES = {
  TipoPago: { 1: 'Contado', 2: 'Crédito', 3: 'Gratuito' },
  IndicadorBienoServicio: { 1: 'Bien', 2: 'Servicio' },
  IndicadorFacturacion:   { 1: 'ITBIS 18%', 2: 'ITBIS 16%', 3: 'ITBIS 0%', 4: 'Exento' },
  TasaImpuesto:           { 1: '18%', 2: '16%', 3: '0%' },
  TipoIngresos:           { '01': 'Operaciones', '02': 'Financieros', '03': 'Extraordinarios', '04': 'Arrendamiento', '05': 'Otros' },
  CodigoModificacion:     { '1': 'Anulación total', '2': 'Corrección texto', '3': 'Corrección montos', '4': 'Reemplazo contingencia', '5': 'Referencia consumo' },
} as const;
