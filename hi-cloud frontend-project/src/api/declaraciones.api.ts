import api from './client';

const BASE = '/declaraciones';

function descargar(url: string, filename: string) {
  return api.get(url, { responseType: 'blob' }).then(r => {
    const blob = new Blob([r.data]);
    const href = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = href; a.download = filename; a.click();
    URL.revokeObjectURL(href);
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

export const declaracionesApi = {
  it1:         (mes: number, anio: number) => api.get(`${BASE}/it1?mes=${mes}&anio=${anio}`).then(r => r.data.data),
  formato606:  (mes: number, anio: number) => api.get(`${BASE}/formato606?mes=${mes}&anio=${anio}`).then(r => r.data.data),
  formato607:  (mes: number, anio: number) => api.get(`${BASE}/formato607?mes=${mes}&anio=${anio}`).then(r => r.data.data),
  formato608:  (mes: number, anio: number) => api.get(`${BASE}/formato608?mes=${mes}&anio=${anio}`).then(r => r.data.data),
  ir17:        (mes: number, anio: number) => api.get(`${BASE}/ir17?mes=${mes}&anio=${anio}`).then(r => r.data.data),
  historial:   ()                          => api.get(`${BASE}/historial`).then(r => r.data.data),
  validar:     (tipo: string, mes: number, anio: number) =>
    api.post(`${BASE}/validar`, { tipo, mes, anio }).then(r => r.data.data),
  resumenAnual: (anio: number) => api.get(`${BASE}/resumen-anual?anio=${anio}`).then(r => r.data.data),

  descargarXml: (tipo: '606'|'607'|'608', mes: number, anio: number) =>
    descargar(`${BASE}/formato${tipo}/xml?mes=${mes}&anio=${anio}`, `${tipo}_${anio}${pad(mes)}.xml`),
  descargarTxt: (tipo: '606'|'607'|'608', mes: number, anio: number) =>
    descargar(`${BASE}/formato${tipo}/txt?mes=${mes}&anio=${anio}`, `${tipo}_${anio}${pad(mes)}.txt`),
  descargarPdf606: (mes: number, anio: number) =>
    descargar(`${BASE}/formato606/pdf?mes=${mes}&anio=${anio}`, `606_${anio}${pad(mes)}.pdf`),
  descargarPdf607: (mes: number, anio: number) =>
    descargar(`${BASE}/formato607/pdf?mes=${mes}&anio=${anio}`, `607_${anio}${pad(mes)}.pdf`),
  descargarPdf608: (mes: number, anio: number) =>
    descargar(`${BASE}/formato608/pdf?mes=${mes}&anio=${anio}`, `608_${anio}${pad(mes)}.pdf`),
  descargarPdfIT1: (mes: number, anio: number) =>
    descargar(`${BASE}/it1/pdf?mes=${mes}&anio=${anio}`, `IT1_${anio}${pad(mes)}.pdf`),
};
