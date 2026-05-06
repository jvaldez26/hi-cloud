import { SetMetadata } from '@nestjs/common';
import { SKIP_TENANT_KEY } from '../guards/tenant-required.guard';

/** Marca una ruta pública que no requiere X-Empresa-ID (ej: login, registro, invitaciones). */
export const SkipTenantGuard = () => SetMetadata(SKIP_TENANT_KEY, true);
