/* ──────────────────────────────────────────────
   HiCloud ERP — Recibo Térmico POS 80mm

   Aquí ya solo vive la FORMA de los datos. El HTML que había en este archivo
   (`generarHTMLRecibo`) se borró: no lo llamaba nadie. El recibo térmico del
   backend se dibuja con PDFKit en `generarReciboPOSPDF()`
   (`common/pdf/factura-pdf.helper.ts`), y el ticket que ve el cliente en el POS
   lo arma el frontend en `buildReciboTermicoHTML()`.

   Un tercer maquetado del mismo ticket, sin llamadores, solo servía para que
   alguien lo "arreglara" un día creyendo que era el que se imprime.
──────────────────────────────────────────────── */

export interface ReciboPOSData {
  empresaNombre:   string;
  empresaRNC:      string;
  empresaTelefono?: string;
  empresaWeb?:     string;
  vendedor?:       string;
  sucursal?:       string;
  fechaHora:       string;
  numero:          string;       // FAC-2026-0001
  ecfNumero?:      string;       // E320000000001
  metodoPago:      string;
  items: Array<{ descripcion: string; cantidad: number; precio: number; total: number }>;
  subtotal:   number;
  itbis:      number;
  total:      number;
  /** Desglose ITBIS por tasa — mismo criterio que builder ECF */
  subtotalGravado?: number;   // base 18% + 16% (MontoGravadoTotal)
  subtotalExento?:  number;   // MontoExento
  itbis18?:         number;   // TotalITBIS1 (18%)
  itbis16?:         number;   // TotalITBIS2 (16%)
  totalLineas?:     number;   // cantidad de líneas del ticket
  recibido?:             number;
  cambio?:               number;
  qrBase64?:             string;
  rncComprador?:         string;
  razonSocialComprador?: string;
}
