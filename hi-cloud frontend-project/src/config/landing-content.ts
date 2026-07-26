/**
 * HiCloud — Contenido de la landing pública.
 *
 * Todo el texto y los datos viven aquí para que reemplazarlos sea editar UN
 * archivo, no cazar por los componentes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ⚠️  LO QUE HAY QUE REEMPLAZAR ANTES DE PUBLICAR                          │
 * │                                                                          │
 * │ Está todo agrupado al final del archivo, bajo PLACEHOLDER_*:             │
 * │   · PLACEHOLDER_METRICS       cifras de la franja de prueba social       │
 * │   · PLACEHOLDER_LOGOS         logos de clientes (requiere autorización)  │
 * │   · PLACEHOLDER_TESTIMONIALS  citas, nombres y enlaces a casos          │
 * │   · PLACEHOLDER_CONTACT       correo y teléfono del footer               │
 * │   · Las capturas: cada SOLUTION tiene shotLabel + datos de ejemplo       │
 * │                                                                          │
 * │ Se pintan con la clase .hcl-ph (subrayado punteado naranja + tooltip)    │
 * │ para que se vean a simple vista mientras sigan siendo provisionales.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/* ══════════════════════════════════════════════════════════════════════════
   RUTAS — jerarquía de los 3 ejes
   Hoy la landing vive en una sola página, así que apuntan a anclas (#id).
   Cuando existan las páginas reales, basta cambiar los valores de aquí:
   los componentes ya leen las rutas de este objeto.
   ══════════════════════════════════════════════════════════════════════════ */
export const LANDING_ROUTES = {
  // Eje 1 — Funcionalidades  →  /funcionalidades/*
  fx: {
    facturacionEcf: '#facturacion',   // futuro: /funcionalidades/facturacion-ecf
    pos:            '#pos',           // futuro: /funcionalidades/punto-de-venta
    inventario:     '#inventario',    // futuro: /funcionalidades/inventario
    compras:        '#compras',       // futuro: /funcionalidades/compras-cxp
    contabilidad:   '#contabilidad',  // futuro: /funcionalidades/contabilidad
    tesoreria:      '#tesoreria',     // futuro: /funcionalidades/tesoreria
    reportes:       '#reportes',      // futuro: /funcionalidades/reportes
    nomina:         '#nomina',        // futuro: /funcionalidades/nomina
  },
  // Eje 2 — Soluciones  →  /soluciones/*
  sol: {
    retail:      '#retail',       // futuro: /soluciones/retail-pos
    ferreteria:  '#ferreteria',   // futuro: /soluciones/ferreteria
    colmado:     '#colmado',      // futuro: /soluciones/colmado
    prestamista: '#prestamista',  // futuro: /soluciones/prestamista
    agro:        '#agro',         // futuro: /soluciones/agro-finca
    firmas:      '#firmas',       // futuro: /soluciones/firmas-contables
  },
  // Eje 3 — Por tamaño  →  /por-tamano/*
  size: {
    emprendedor: '#emprendedor',  // futuro: /por-tamano/emprendedor
    pequena:     '#pequena',      // futuro: /por-tamano/pequena-empresa
    mediana:     '#mediana',      // futuro: /por-tamano/mediana-empresa
  },
  // Transversales
  precios:  '#precios',
  login:    '/login',
  registro: '/registrar',
  demo:     '#demo',
  prueba:   '/registrar',
  whatsapp: '#whatsapp',
  ayuda:    '#ayuda',
  ecfGuia:  '#ecf-guia',
  casos:    '#casos',
  blog:     '#blog',
  estado:   '#estado',
  nosotros: '#nosotros',
  contacto: '#contacto',
  soporte:  '#soporte',
  privacidad: '#privacidad',
  terminos: '#terminos',
} as const;

export type IconName =
  | 'invoice' | 'pos' | 'box' | 'cart' | 'ledger' | 'bank' | 'chart' | 'people'
  | 'trend' | 'lock' | 'grid' | 'gear' | 'check' | 'cloud' | 'chevron' | 'menu';

/* ══════════════════════════════════════════════════════════════════════════
   EJE 1 — Funcionalidades
   ══════════════════════════════════════════════════════════════════════════ */
export interface FeatureItem {
  id: string;
  icon: IconName;
  title: string;
  blurb: string;      // nav: línea corta
  desc: string;       // tarjeta: descripción
  href: string;
}

export const FEATURES: FeatureItem[] = [
  { id: 'facturacion', icon: 'invoice', title: 'Facturación e-CF', href: LANDING_ROUTES.fx.facturacionEcf,
    blurb: 'Emisión y acuse ante la DGII',
    desc: 'Emite E31, E32, E33 y E34 con acuse de la DGII en segundos. Secuencias y vencimientos controlados por el sistema.' },
  { id: 'pos', icon: 'pos', title: 'Punto de Venta', href: LANDING_ROUTES.fx.pos,
    blurb: 'Cobro rápido, caja y turnos',
    desc: 'Cobro rápido con teclado o lector, apertura y cierre de caja por turno, y arqueo que cuadra sin pelea.' },
  { id: 'inventario', icon: 'box', title: 'Inventario', href: LANDING_ROUTES.fx.inventario,
    blurb: 'Existencias por almacén y sucursal',
    desc: 'Existencias por almacén y sucursal, costo promedio, mínimos y conteos físicos sin cerrar la tienda.' },
  { id: 'compras', icon: 'cart', title: 'Compras & CxP', href: LANDING_ROUTES.fx.compras,
    blurb: 'Órdenes, recepción y pago a suplidores',
    desc: 'Órdenes, recepción parcial y cuentas por pagar con antigüedad de saldos por suplidor.' },
  { id: 'contabilidad', icon: 'ledger', title: 'Contabilidad', href: LANDING_ROUTES.fx.contabilidad,
    blurb: 'Asientos automáticos desde la operación',
    desc: 'Asientos automáticos desde ventas, compras y nómina. Catálogo dominicano listo desde el primer día.' },
  { id: 'tesoreria', icon: 'bank', title: 'Cuentas y Tesorería', href: LANDING_ROUTES.fx.tesoreria,
    blurb: 'Bancos, conciliación y flujo de caja',
    desc: 'Bancos, transferencias, cheques y conciliación. Sabes cuánto hay y cuánto sale esta semana.' },
  { id: 'reportes', icon: 'chart', title: 'Reportes', href: LANDING_ROUTES.fx.reportes,
    blurb: 'Ventas, márgenes y formatos DGII',
    desc: 'Ventas por producto, vendedor y sucursal, márgenes reales y los formatos 606, 607 y 608 al día.' },
  { id: 'nomina', icon: 'people', title: 'Nómina', href: LANDING_ROUTES.fx.nomina,
    blurb: 'Cálculo, TSS y volantes de pago',
    desc: 'Cálculo de sueldos, TSS, ISR y regalía, con volantes que el empleado recibe por su cuenta.' },
];

/* ══════════════════════════════════════════════════════════════════════════
   EJE 2 — Soluciones por tipo de negocio
   `seal` marca los dos módulos que la competencia no tiene.
   ══════════════════════════════════════════════════════════════════════════ */
export interface SolutionNavItem {
  id: string;
  title: string;
  blurb: string;
  href: string;
  seal?: string;
}

export const SOLUTIONS_NAV: SolutionNavItem[] = [
  { id: 'retail',      title: 'Retail & POS',            blurb: 'Tiendas con mostrador y varias cajas',        href: LANDING_ROUTES.sol.retail },
  { id: 'ferreteria',  title: 'Ferretería y repuestos',  blurb: 'Catálogos largos, códigos y equivalencias',   href: LANDING_ROUTES.sol.ferreteria },
  { id: 'colmado',     title: 'Colmado y minimarket',    blurb: 'Venta rápida, fiado y control de menudeo',    href: LANDING_ROUTES.sol.colmado },
  { id: 'prestamista', title: 'Prestamista',             blurb: 'Préstamos, cuotas, mora y cobranza',          href: LANDING_ROUTES.sol.prestamista, seal: 'Solo HiCloud' },
  { id: 'agro',        title: 'Agro y finca',            blurb: 'Cosecha, insumos, lotes y jornales',          href: LANDING_ROUTES.sol.agro,        seal: 'Solo HiCloud' },
  { id: 'firmas',      title: 'Firmas contables',        blurb: 'Varias empresas desde una sola cuenta',       href: LANDING_ROUTES.sol.firmas },
];

/* ══════════════════════════════════════════════════════════════════════════
   EJE 3 — Por tamaño
   ══════════════════════════════════════════════════════════════════════════ */
export interface SizeStep { id: string; title: string; scope: string; href: string; }

export const SIZE_STEPS: SizeStep[] = [
  { id: 'emprendedor', title: 'Emprendedor',     scope: '1 usuario · 1 sucursal',                     href: LANDING_ROUTES.size.emprendedor },
  { id: 'pequena',     title: 'Pequeña empresa', scope: 'Hasta 10 usuarios · inventario y nómina',    href: LANDING_ROUTES.size.pequena },
  { id: 'mediana',     title: 'Mediana empresa', scope: 'Multi-sucursal · contabilidad completa',     href: LANDING_ROUTES.size.mediana },
];

/* ══════════════════════════════════════════════════════════════════════════
   HERO
   ══════════════════════════════════════════════════════════════════════════ */
export const HERO = {
  eyebrow: 'e-CF nativo · DGII',
  titleStart: 'Factura a la DGII ',
  titleEm: 'sin dejar de vender',
  lead:
    'HiCloud es el ERP operativo del comercio dominicano: punto de venta, inventario, ' +
    'compras y comprobantes fiscales electrónicos en un solo sistema. Hecho para que lo ' +
    'maneje quien está en el mostrador, no solo el contador.',
  bullets: [
    'Emites, la DGII lo acepta, tú sigues vendiendo.',
    'Inventario, caja y contabilidad cuadran solos al cierre del día.',
    'Soporte dominicano que conoce tu negocio y contesta.',
  ],
  ctaPrimary: 'Prueba gratis 15 días',
  ctaSecondary: 'Ver demo',
  note: 'Sin tarjeta de crédito · Configuración asistida por nuestro equipo',
};

/* ══════════════════════════════════════════════════════════════════════════
   SOLUCIONES CON CAPTURA (sección 5)
   Los importes y e-NCF son de ejemplo: sirven para componer el mockup y
   desaparecen al pegar la captura real.
   ══════════════════════════════════════════════════════════════════════════ */
export interface ShotRow { width: 'w25' | 'w40' | 'w60' | 'w80'; amount: string; }

export interface SolutionShowcase {
  id: string;
  title: string;
  desc: string;
  bullets: string[];
  flip: boolean;
  shot: {
    url: string;
    label: string;              // etiqueta [captura: …] — PLACEHOLDER
    rows: ShotRow[];
    totalLabel?: string;
    total?: string;
    chips?: { text: string; state: 'ok' | 'wait' | 'plain' }[];
    meta?: string;
  };
}

export const SOLUTION_SHOWCASES: SolutionShowcase[] = [
  {
    id: 'retail', flip: false,
    title: 'Retail & POS: cobrar sin cola',
    desc: 'El cajero busca por código o nombre, cobra en efectivo, tarjeta o mixto, y el comprobante sale con su e-NCF sin pasos extra.',
    bullets: [
      'Varias cajas y turnos por usuario, con supervisor para anulaciones',
      'Impresión térmica y descuento de inventario en el mismo golpe',
      'Sigue vendiendo aunque se caiga el internet; sincroniza al volver',
    ],
    shot: {
      url: 'hicloudrd.com/pos',
      label: '[captura: POS — cobro mixto efectivo + tarjeta]',
      rows: [
        { width: 'w60', amount: '350.00' },
        { width: 'w80', amount: '1,120.00' },
        { width: 'w25', amount: '75.00' },
      ],
      totalLabel: 'Total RD$', total: '1,545.00',
    },
  },
  {
    id: 'ecf', flip: true,
    title: 'e-CF: emites y la DGII responde',
    desc: 'HiCloud arma el comprobante, lo firma y espera el acuse. Si la DGII lo rechaza, te dice por qué en español y te deja corregir.',
    bullets: [
      'E31, E32, E33, E34, E41, E43, E44, E45, E46 y E47',
      'Aviso antes de que se agoten o venzan tus secuencias',
      'Reintento automático cuando el servicio de la DGII se cae',
    ],
    shot: {
      url: 'hicloudrd.com/ecf',
      label: '[captura: e-CF — bandeja de comprobantes con estado DGII]',
      chips: [
        { text: 'E31 · ACEPTADO',  state: 'ok' },
        { text: 'E32 · ACEPTADO',  state: 'ok' },
        { text: 'E33 · EN PROCESO', state: 'wait' },
      ],
      rows: [
        { width: 'w60', amount: 'E310000000147' },
        { width: 'w40', amount: 'E320000000982' },
        { width: 'w60', amount: 'E330000000015' },
      ],
    },
  },
  {
    id: 'ferreteria', flip: false,
    title: 'Inventario: saber qué hay, dónde y a cómo',
    desc: 'Pensado para catálogos largos de ferretería y repuestos: códigos del suplidor, equivalencias y variantes sin duplicar productos.',
    bullets: [
      'Costo promedio y margen real por producto, no estimado',
      'Traspasos entre sucursales con confirmación de recibido',
      'Alertas de mínimo antes de quedarte sin lo que más rota',
    ],
    shot: {
      url: 'hicloudrd.com/inventario',
      label: '[captura: Inventario — existencias por almacén con alertas]',
      rows: [
        { width: 'w60', amount: '142 und' },
        { width: 'w80', amount: '8 und' },
        { width: 'w40', amount: '1,204 und' },
      ],
      chips: [{ text: '2 productos bajo mínimo', state: 'wait' }],
    },
  },
  {
    id: 'nomina', flip: true,
    title: 'Nómina: pagar sin sacar la calculadora',
    desc: 'Calcula sueldos, horas extra, TSS e ISR según la ley dominicana, y guarda el histórico para cuando toque una carta de trabajo.',
    bullets: [
      'Regalía pascual y vacaciones calculadas solas',
      'Volantes que el empleado consulta desde su celular',
      'El asiento contable de la nómina se genera al cerrarla',
    ],
    shot: {
      url: 'hicloudrd.com/nomina',
      label: '[captura: Nómina — detalle de un volante de pago]',
      rows: [
        { width: 'w60', amount: '28,500.00' },
        { width: 'w40', amount: '-1,596.00' },
        { width: 'w60', amount: '-856.00' },
      ],
      totalLabel: 'Neto a pagar RD$', total: '26,048.00',
    },
  },
];

/* Mockup del hero — mismo formato que los de arriba */
export const HERO_SHOT = {
  url: 'hicloudrd.com/pos',
  label: '[captura: POS — pantalla de cobro con e-CF aceptado]',
  chipLeft:  'Caja 1 · Turno abierto',
  chipRight: 'E31 · ACEPTADO',
  rows: [
    { width: 'w60' as const, amount: '1,450.00' },
    { width: 'w40' as const, amount: '890.00' },
    { width: 'w80' as const, amount: '2,300.00' },
  ],
  totalLabel: 'Total RD$',
  total: '4,640.00',
  meta: 'e-NCF E310000000147 · RNC 130-12345-6',
};

/* ══════════════════════════════════════════════════════════════════════════
   DIFERENCIADORES (sección 6)
   ══════════════════════════════════════════════════════════════════════════ */
export interface Differentiator {
  id: string;
  tag?: string;
  title: string;
  desc: string;
  bullets?: string[];
}

export const DIFFERENTIATORS: Differentiator[] = [
  {
    id: 'prestamista', tag: 'Solo HiCloud', title: 'Módulo Prestamista',
    desc: 'Si además de vender prestas, no necesitas un segundo sistema ni una hoja de cálculo aparte.',
    bullets: [
      'Tablas de amortización, cuotas y fechas de cobro',
      'Mora automática y estado de cada cliente al día',
      'Ruta de cobro y recibos desde el celular del cobrador',
    ],
  },
  {
    id: 'agro', tag: 'Solo HiCloud', title: 'Módulo Agro y Finca',
    desc: 'Para el que produce: la finca se controla por lote, no por factura suelta.',
    bullets: [
      'Costos por lote, parcela y ciclo de cosecha',
      'Insumos, aplicaciones y jornales del personal de campo',
      'Rendimiento por tarea para saber qué siembra deja',
    ],
  },
  {
    id: 'soporte', title: 'Soporte dominicano de verdad',
    desc: 'Atención desde República Dominicana, en horario de acá y por WhatsApp. Quien contesta sabe lo que es un 607 y por qué corre el día 20.',
  },
  {
    id: 'ecf-nativo', title: 'e-CF nativo, sin asteriscos',
    desc: 'La facturación electrónica viene incluida en el sistema: no es un módulo aparte, ni un intermediario, ni un cargo por comprobante emitido.',
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   FUNCIONES AVANZADAS (sección 7)
   ══════════════════════════════════════════════════════════════════════════ */
export const ADVANCED: { id: string; icon: IconName; title: string; desc: string }[] = [
  { id: 'reportes', icon: 'trend', title: 'Reportes y tablero',
    desc: 'Ventas del día, márgenes y comparativas por sucursal en una pantalla. Exportables a Excel y PDF.' },
  { id: 'roles', icon: 'lock', title: 'Roles y permisos',
    desc: 'Cada quien ve lo suyo: el cajero cobra, el encargado autoriza, el dueño mira todo. Con registro de quién hizo qué.' },
  { id: 'multi', icon: 'grid', title: 'Multi-empresa y multi-sucursal',
    desc: 'Varias razones sociales y sucursales desde un mismo login, con datos separados y consolidado cuando lo necesitas.' },
  { id: 'auto', icon: 'gear', title: 'Automatización',
    desc: 'Facturas recurrentes, recordatorios de cobro, respaldos diarios y cierres programados que corren sin que nadie se acuerde.' },
];

/* ══════════════════════════════════════════════════════════════════════════
   CTA FINAL + FOOTER
   ══════════════════════════════════════════════════════════════════════════ */
export const FINAL_CTA = {
  eyebrow: 'Empieza hoy',
  title: 'Prueba HiCloud 15 días, con tus productos y tu RNC',
  lead: 'Te ayudamos a cargar tu catálogo y a dejar lista tu primera secuencia de e-CF. Si no te sirve, no pasa nada: no pedimos tarjeta.',
  primary: 'Crear mi cuenta gratis',
  secondary: 'Hablar con ventas',
};

export const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Producto',
    links: [
      { label: 'Facturación e-CF', href: LANDING_ROUTES.fx.facturacionEcf },
      { label: 'Punto de Venta',   href: LANDING_ROUTES.fx.pos },
      { label: 'Inventario',       href: LANDING_ROUTES.fx.inventario },
      { label: 'Compras & CxP',    href: LANDING_ROUTES.fx.compras },
      { label: 'Contabilidad',     href: LANDING_ROUTES.fx.contabilidad },
      { label: 'Nómina',           href: LANDING_ROUTES.fx.nomina },
    ],
  },
  {
    title: 'Soluciones',
    links: [
      { label: 'Retail & POS',      href: LANDING_ROUTES.sol.retail },
      { label: 'Ferretería',        href: LANDING_ROUTES.sol.ferreteria },
      { label: 'Colmado',           href: LANDING_ROUTES.sol.colmado },
      { label: 'Prestamista',       href: LANDING_ROUTES.sol.prestamista },
      { label: 'Agro y finca',      href: LANDING_ROUTES.sol.agro },
      { label: 'Firmas contables',  href: LANDING_ROUTES.sol.firmas },
    ],
  },
  {
    title: 'Por tamaño',
    links: [
      { label: 'Emprendedor',     href: LANDING_ROUTES.size.emprendedor },
      { label: 'Pequeña empresa', href: LANDING_ROUTES.size.pequena },
      { label: 'Mediana empresa', href: LANDING_ROUTES.size.mediana },
      { label: 'Precios',         href: LANDING_ROUTES.precios },
    ],
  },
  {
    title: 'Recursos',
    links: [
      { label: 'Centro de ayuda',     href: LANDING_ROUTES.ayuda },
      { label: 'Guía de e-CF',        href: LANDING_ROUTES.ecfGuia },
      { label: 'Casos de clientes',   href: LANDING_ROUTES.casos },
      { label: 'Blog',                href: LANDING_ROUTES.blog },
      { label: 'Estado del servicio', href: LANDING_ROUTES.estado },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Nosotros',   href: LANDING_ROUTES.nosotros },
      { label: 'Contacto',   href: LANDING_ROUTES.contacto },
      { label: 'Soporte',    href: LANDING_ROUTES.soporte },
      { label: 'Privacidad', href: LANDING_ROUTES.privacidad },
      { label: 'Términos',   href: LANDING_ROUTES.terminos },
    ],
  },
];

export const FOOTER_BRAND = {
  tagline: 'El ERP del negocio dominicano. Facturación e-CF, punto de venta y control, hechos aquí.',
  badge: 'e-CF certificado DGII',
  legal: '© 2026 HiCloud ERP · Santo Domingo, República Dominicana',
};

/* ══════════════════════════════════════════════════════════════════════════
   ⚠️  PLACEHOLDERS — REEMPLAZAR ANTES DE PUBLICAR
   Nada de lo que sigue está verificado. Se renderiza con la clase .hcl-ph
   (subrayado punteado) para que salte a la vista mientras siga siendo falso.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Interruptores de publicación.
 *
 * La landing está EN VIVO como home, así que los bloques que solo contienen
 * datos sin verificar están apagados: publicar cifras inventadas o testimonios
 * de personas que no existen sería engañar al visitante.
 *
 * Para encender cada uno: sustituye primero los datos de abajo por los reales
 * (y consigue autorización escrita de los clientes para sus logos y citas),
 * luego pon el flag en true. No hace falta tocar ningún componente.
 */
export const MOSTRAR = {
  /** Franja de logos de clientes + métricas de la plataforma. */
  pruebaSocial: false,
  /** Citas de clientes con nombre y negocio. */
  testimonios: false,
  /** Etiquetas naranjas "[captura: …]" sobre los mockups. Apagadas en vivo:
   *  el mockup esquemático se queda (es ilustrativo, no afirma nada), pero la
   *  etiqueta de trabajo interno no debe verla un visitante. */
  etiquetasCaptura: false,
};

/** Cifras de ejemplo. Sustituir por los datos reales de la plataforma. */
export const PLACEHOLDER_METRICS = [
  { value: '50,000+', label: 'e-CF aceptados por la DGII' },
  { value: '120+',    label: 'negocios activos' },
  { value: '99.9%',   label: 'de disponibilidad' },
  { value: '0',       label: 'rechazos causados por el sistema' },
];

/** Requiere autorización escrita de cada cliente para usar su marca. */
export const PLACEHOLDER_LOGOS = [
  'Logo cliente 1', 'Logo cliente 2', 'Logo cliente 3', 'Logo cliente 4', 'Logo cliente 5',
];

/** Citas inventadas como muestra de formato. Necesitan cita real y consentimiento. */
export const PLACEHOLDER_TESTIMONIALS = [
  {
    id: 'caso-1', initials: 'RM', name: 'Ramón M.', business: 'Ferretería · Santiago',
    quote: 'Antes cerraba a las 7 y me quedaba dos horas cuadrando. Ahora cierro la caja y el reporte ya está hecho.',
    href: '#caso-1',
  },
  {
    id: 'caso-2', initials: 'CJ', name: 'Carmen J.', business: 'Financiera · San Cristóbal',
    quote: 'Lo que más me sirvió fue el módulo de préstamos. Tenía todo en cuadernos y ahora sé quién me debe sin buscar.',
    href: '#caso-2',
  },
  {
    id: 'caso-3', initials: 'JP', name: 'José P.', business: 'Supermercado · La Vega',
    quote: 'Cuando empezó lo del e-CF pensé que iba a ser un lío. Emitimos el primero el mismo día que nos instalaron.',
    href: '#caso-3',
  },
];

/**
 * Contacto del footer.
 * El correo es el real (es el que usan los emails del sistema). El teléfono se
 * retiró por no tener un número confirmado: mejor sin dato que con uno falso.
 * Cuando haya número, añadirlo aquí y quitar la clase .hcl-ph del Footer.
 */
export const FOOTER_CONTACT = 'soporte@hicloudrd.com';
