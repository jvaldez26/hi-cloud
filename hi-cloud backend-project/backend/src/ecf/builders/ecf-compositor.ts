/**
 * Orquestador de builders de e-CF.
 * Solo decide qué builder usar según el tipo. La lógica de cada tipo
 * vive en su propio archivo: e31.builder.ts, e32.builder.ts, etc.
 */

export type { MSellerInfoReferencia, MSellerPayload, ECFBuildInput } from './base-ecf.builder';

import { ECFBuildInput, MSellerPayload } from './base-ecf.builder';
import { buildE31 } from './e31.builder';
import { buildE32 } from './e32.builder';
import { buildE33 } from './e33.builder';
import { buildE34 } from './e34.builder';
import { buildE41 } from './e41.builder';
import { buildE43 } from './e43.builder';
import { buildE44 } from './e44.builder';
import { buildE45 } from './e45.builder';
import { buildE46 } from './e46.builder';
import { buildE47 } from './e47.builder';

const BUILDERS: Record<number, (input: ECFBuildInput) => MSellerPayload> = {
  31: buildE31,
  32: buildE32,
  33: buildE33,
  34: buildE34,
  41: buildE41,
  43: buildE43,
  44: buildE44,
  45: buildE45,
  46: buildE46,
  47: buildE47,
};

export function buildECF(tipoEcf: number, input: ECFBuildInput): MSellerPayload {
  const builder = BUILDERS[tipoEcf];
  if (!builder) {
    throw new Error(
      `No hay builder registrado para E${tipoEcf}. ` +
      `Soportados: ${Object.keys(BUILDERS).map(k => `E${k}`).join(', ')}`,
    );
  }
  return builder(input);
}

export const ECF_TIPOS_SOPORTADOS_LIST = Object.keys(BUILDERS).map(Number).sort((a, b) => a - b);
