import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsuarioEmpresa } from './entities/usuario-empresa.entity';
import { Empresa } from '../configuracion/entities/empresa.entity';
import { Sucursal } from '../configuracion/entities/sucursal.entity';
import { User } from '../users/users.entity';
import {
  AsignarUsuarioEmpresaDto,
  CambiarEmpresaDto,
  CreateEmpresaTenantDto,
} from './dto/multi-empresa.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { ContabilidadService } from '../contabilidad/services/contabilidad.service';

@Injectable()
export class MultiEmpresaService {
  constructor(
    @InjectRepository(UsuarioEmpresa)
    private usuarioEmpresaRepo: Repository<UsuarioEmpresa>,
    @InjectRepository(Empresa)
    private empresaRepo:        Repository<Empresa>,
    @InjectRepository(Sucursal)
    private sucursalRepo:       Repository<Sucursal>,
    @InjectRepository(User)
    private usuarioRepo:        Repository<User>,
    private contabilidadSvc:    ContabilidadService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Gestión de empresas
  // ──────────────────────────────────────────────────────────────────

  async getTodasEmpresas() {
    return this.empresaRepo.find({
      where: { isActive: true },
      order: { nombre: 'ASC' },
    });
  }

  async createEmpresa(dto: CreateEmpresaTenantDto): Promise<Empresa> {
    const existe = await this.empresaRepo.findOne({ where: { rnc: dto.rnc } });
    if (existe) throw new ConflictException(`RNC ${dto.rnc} ya está registrado`);

    const empresa = this.empresaRepo.create({
      ...dto,
      moneda:      'DOP',
      zonaHoraria: 'America/Santo_Domingo',
    });
    return this.empresaRepo.save(empresa);
  }

  async createEmpresaConAdmin(dto: CreateEmpresaTenantDto, adminId: number): Promise<Empresa & { empresaId: number }> {
    const empresa = await this.createEmpresa(dto);

    // Vincular al creador como admin principal de la empresa
    const asignacion = new UsuarioEmpresa();
    asignacion.userId      = adminId;
    asignacion.empresaId   = empresa.id;
    asignacion.rol         = UserRole.ADMIN;
    asignacion.isPrincipal = true;
    await this.usuarioEmpresaRepo.save(asignacion);

    // Crear sucursal principal por defecto
    await this.sucursalRepo.save(
      this.sucursalRepo.create({
        empresaId:   empresa.id,
        codigo:      'PRIN',
        nombre:      'Sucursal Principal',
        ciudad:      dto.ciudad ?? 'Santo Domingo',
        esPrincipal: true,
      }),
    );

    // Sembrar Plan de Cuentas dominicano para la nueva empresa
    try { await this.contabilidadSvc.seedPlanCuentas(empresa.id); } catch {}

    return Object.assign({}, empresa, { empresaId: empresa.id }) as Empresa & { empresaId: number };
  }

  async getEmpresaById(id: number): Promise<Empresa> {
    const empresa = await this.empresaRepo.findOne({ where: { id, isActive: true } });
    if (!empresa) throw new NotFoundException(`Empresa #${id} no encontrada`);
    return empresa;
  }

  async updateEmpresa(id: number, dto: Partial<CreateEmpresaTenantDto>): Promise<Empresa> {
    await this.getEmpresaById(id);
    await this.empresaRepo.update(id, dto);
    return this.getEmpresaById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Gestión de accesos de usuarios a empresas
  // ──────────────────────────────────────────────────────────────────

  async getEmpresasDeUsuario(userId: number, isGlobalAdmin = false) {
    const accesos = await this.usuarioEmpresaRepo.find({
      where: { userId, isActive: true },
      relations: ['empresa'],
      order: { isPrincipal: 'DESC' },
    });

    if (accesos.length > 0) {
      return accesos.map((a) => ({
        empresaId:   a.empresaId,
        nombre:      a.empresa.nombre,
        rnc:         a.empresa.rnc,
        rol:         a.rol,
        isPrincipal: a.isPrincipal,
      }));
    }

    // Admin global sin vinculación explícita → devuelve todas las empresas
    if (isGlobalAdmin) {
      const todas = await this.empresaRepo.find({ where: { isActive: true }, order: { nombre: 'ASC' } });
      return todas.map((e) => ({
        empresaId:   e.id,
        nombre:      e.nombre,
        rnc:         e.rnc,
        rol:         'admin',
        isPrincipal: false,
      }));
    }

    return [];
  }

  async getUsuariosDeEmpresa(empresaId: number) {
    await this.getEmpresaById(empresaId);
    return this.usuarioEmpresaRepo.find({
      where: { empresaId, isActive: true },
      relations: ['user'],
      order: { rol: 'ASC' },
    });
  }

  async asignarUsuario(empresaId: number, dto: AsignarUsuarioEmpresaDto, adminId: number) {
    await this.getEmpresaById(empresaId);

    const usuario = await this.usuarioRepo.findOne({ where: { id: dto.userId, isActive: true } });
    if (!usuario) throw new NotFoundException(`Usuario #${dto.userId} no encontrado`);

    const yaAsignado = await this.usuarioEmpresaRepo.findOne({
      where: { userId: dto.userId, empresaId, isActive: true },
    });
    if (yaAsignado) {
      await this.usuarioEmpresaRepo.update(yaAsignado.id, {
        rol:        dto.rol,
        isPrincipal: dto.isPrincipal ?? yaAsignado.isPrincipal,
      });
      return this.usuarioEmpresaRepo.findOne({ where: { id: yaAsignado.id } });
    }

    if (dto.isPrincipal) {
      await this.usuarioEmpresaRepo.update(
        { userId: dto.userId, isPrincipal: true },
        { isPrincipal: false },
      );
    }

    const asignacion = this.usuarioEmpresaRepo.create({
      userId:      dto.userId,
      empresaId,
      rol:         dto.rol,
      isPrincipal: dto.isPrincipal ?? false,
    });

    return this.usuarioEmpresaRepo.save(asignacion);
  }

  async removerUsuario(empresaId: number, userId: number) {
    const asignacion = await this.usuarioEmpresaRepo.findOne({
      where: { empresaId, userId, isActive: true },
    });
    if (!asignacion) throw new NotFoundException('Asignación no encontrada');

    await this.usuarioEmpresaRepo.update(asignacion.id, { isActive: false });
    return { message: `Usuario #${userId} removido de empresa #${empresaId}` };
  }

  // ──────────────────────────────────────────────────────────────────
  // Cambio de contexto empresarial
  // ──────────────────────────────────────────────────────────────────

  async validarAccesoEmpresa(userId: number, empresaId: number) {
    const usuario = await this.usuarioRepo.findOne({ where: { id: userId } });

    // Admins globales acceden a todas las empresas
    if (usuario?.role === UserRole.ADMIN) {
      const empresa = await this.getEmpresaById(empresaId);
      return { empresaId, empresaNombre: empresa.nombre, rnc: empresa.rnc, rol: UserRole.ADMIN };
    }

    const acceso = await this.usuarioEmpresaRepo.findOne({
      where: { userId, empresaId, isActive: true },
      relations: ['empresa'],
    });

    if (!acceso) {
      throw new ForbiddenException(`Sin acceso a empresa #${empresaId}`);
    }

    return {
      empresaId,
      empresaNombre: acceso.empresa.nombre,
      rnc:           acceso.empresa.rnc,
      rol:           acceso.rol,
    };
  }

  async getEmpresaPrincipal(userId: number) {
    const principal = await this.usuarioEmpresaRepo.findOne({
      where: { userId, isPrincipal: true, isActive: true },
      relations: ['empresa'],
    });

    if (principal) {
      return {
        empresaId:    principal.empresaId,
        empresaNombre: principal.empresa.nombre,
        rnc:          principal.empresa.rnc,
        rol:          principal.rol,
      };
    }

    // Si no tiene empresa principal, usar la primera empresa del sistema
    const primeraEmpresa = await this.empresaRepo.findOne({
      where: { isActive: true },
      order: { id: 'ASC' },
    });

    if (primeraEmpresa) {
      return {
        empresaId:    primeraEmpresa.id,
        empresaNombre: primeraEmpresa.nombre,
        rnc:          primeraEmpresa.rnc,
        rol:          UserRole.VIEWER,
      };
    }

    return null;
  }

  // ──────────────────────────────────────────────────────────────────
  // Resumen
  // ──────────────────────────────────────────────────────────────────

  async getResumen() {
    const [totalEmpresas, totalAsignaciones] = await Promise.all([
      this.empresaRepo.count({ where: { isActive: true } }),
      this.usuarioEmpresaRepo.count({ where: { isActive: true } }),
    ]);

    const empresas = await this.empresaRepo.find({ where: { isActive: true }, order: { nombre: 'ASC' } });

    const detalle = await Promise.all(
      empresas.map(async (e) => {
        const usuarios = await this.usuarioEmpresaRepo.count({
          where: { empresaId: e.id, isActive: true },
        });
        return { id: e.id, nombre: e.nombre, rnc: e.rnc, usuarios };
      }),
    );

    return { totalEmpresas, totalAsignaciones, empresas: detalle };
  }
}
