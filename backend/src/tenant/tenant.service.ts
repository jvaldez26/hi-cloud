import { Injectable, ForbiddenException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

const TENANT_KEY   = 'empresaId';
const USER_KEY     = 'userId';
const ROL_KEY      = 'rolEmpresa';

@Injectable()
export class TenantService {
  constructor(private readonly cls: ClsService) {}

  /** Retorna el empresaId del request actual. Lanza 403 si no está establecido. */
  getEmpresaId(): number {
    const id = this.cls.get<number>(TENANT_KEY);
    if (!id) throw new ForbiddenException('Se requiere contexto de empresa. Incluye el header X-Empresa-ID.');
    return id;
  }

  /** Retorna null si no hay contexto de empresa (útil en rutas sin tenant). */
  getEmpresaIdOrNull(): number | null {
    return this.cls.get<number>(TENANT_KEY) ?? null;
  }

  setEmpresaId(id: number): void {
    this.cls.set(TENANT_KEY, id);
  }

  getUserId(): number | null {
    return this.cls.get<number>(USER_KEY) ?? null;
  }

  setUserId(id: number): void {
    this.cls.set(USER_KEY, id);
  }

  getRolEmpresa(): string | null {
    return this.cls.get<string>(ROL_KEY) ?? null;
  }

  setRolEmpresa(rol: string): void {
    this.cls.set(ROL_KEY, rol);
  }
}
