import { Injectable } from '@nestjs/common';
import { buildECF, ECF_TIPOS_SOPORTADOS_LIST } from '../builders/ecf-compositor';
import type { ECFBuildInput, MSellerPayload } from '../builders/ecf-compositor';

// Re-exportar tipos públicos — el use-case y el controller los importan desde aquí
export type { ECFBuildInput, MSellerPayload, MSellerInfoReferencia } from '../builders/ecf-compositor';

@Injectable()
export class ECFBuilderService {
  build(tipoEcf: number, input: ECFBuildInput): MSellerPayload {
    return buildECF(tipoEcf, input);
  }

  getTiposSoportados(): number[] {
    return ECF_TIPOS_SOPORTADOS_LIST;
  }
}
