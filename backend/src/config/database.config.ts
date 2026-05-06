import { Signer } from '@aws-sdk/rds-signer';

const AURORA_HOST   = 'database-1.cluster-cjc0a822i31y.us-east-2.rds.amazonaws.com';
const AURORA_PORT   = 5432;
const AURORA_USER   = 'postgres';
const AURORA_REGION = process.env.AWS_REGION ?? 'us-east-2';

/**
 * Genera un token IAM temporal (15 min) para Aurora PostgreSQL.
 *
 * Pre-requisitos en AWS:
 * 1. Habilitar autenticación IAM en la instancia Aurora (RDS → Modify)
 * 2. Crear usuario en PostgreSQL: CREATE USER postgres WITH LOGIN;
 *    GRANT rds_iam TO postgres;
 * 3. El rol IAM debe tener permiso: rds-db:connect en arn:aws:rds-db:...
 *
 * Pre-requisitos en la máquina:
 * - AWS CLI configurado: aws configure
 * - O variables de entorno: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * - O rol IAM de EC2 (en producción)
 */
export async function getDbPassword(): Promise<string> {
  const signer = new Signer({
    hostname: AURORA_HOST,
    port:     AURORA_PORT,
    username: AURORA_USER,
    region:   AURORA_REGION,
  });
  return await signer.getAuthToken();
}

export const AURORA_CONFIG = {
  host:   AURORA_HOST,
  port:   AURORA_PORT,
  user:   AURORA_USER,
  region: AURORA_REGION,
};
