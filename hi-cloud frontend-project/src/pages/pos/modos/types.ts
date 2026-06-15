export interface ModoPOSProps {
  palette: Record<string, string>;
  addToCart: (producto: any) => void;
  empresaId: string;
  onContextoLoaded?: (id: number) => void;
  precioConsultaDefault?: number;
}
