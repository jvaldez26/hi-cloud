import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Proveedor } from '../proveedores/entities/proveedor.entity';
import { Empleado } from '../nomina/entities/empleado.entity';
import { TenantService } from '../tenant/tenant.service';

export interface Contacto {
  id:       string;       // tipo-id
  origenId: number;
  tipo:     'cliente' | 'proveedor' | 'empleado';
  nombre:   string;
  empresa?: string;
  email?:   string;
  telefono?: string;
  rnc?:     string;
  tags:     string[];
}

@Injectable()
export class ContactosService {
  constructor(
    @InjectRepository(Cliente)   private clienteRepo:   Repository<Cliente>,
    @InjectRepository(Proveedor) private proveedorRepo: Repository<Proveedor>,
    @InjectRepository(Empleado)  private empleadoRepo:  Repository<Empleado>,
    private tenantSvc: TenantService,
  ) {}

  async listar(tipo?: string, q?: string): Promise<Contacto[]> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const contactos: Contacto[] = [];

    if (!tipo || tipo === 'cliente') {
      const clientes = await this.clienteRepo.find({
        where: { empresaId, isActive: true },
        order: { nombre: 'ASC' },
      });
      clientes.forEach(c => contactos.push({
        id:       `cliente-${c.id}`,
        origenId: c.id,
        tipo:     'cliente',
        nombre:   c.nombre,
        email:    c.email,
        telefono: c.telefono,
        rnc:      c.rncReceptor ?? (c as any).rfc,
        tags:     ['cliente'],
      }));
    }

    if (!tipo || tipo === 'proveedor') {
      const proveedores = await this.proveedorRepo.find({
        where: { empresaId, isActive: true },
        order: { nombre: 'ASC' },
      });
      proveedores.forEach(p => contactos.push({
        id:       `proveedor-${p.id}`,
        origenId: p.id,
        tipo:     'proveedor',
        nombre:   p.nombre,
        email:    p.email,
        telefono: p.telefono,
        rnc:      p.rnc,
        tags:     ['proveedor'],
      }));
    }

    if (!tipo || tipo === 'empleado') {
      const empleados = await this.empleadoRepo.find({
        where: { empresaId, isActive: true },
        order: { nombre: 'ASC' },
      });
      empleados.forEach(e => contactos.push({
        id:       `empleado-${e.id}`,
        origenId: e.id,
        tipo:     'empleado',
        nombre:   `${e.nombre} ${e.apellido}`,
        email:    e.email,
        telefono: e.telefono,
        tags:     ['empleado', e.cargo ?? ''],
      }));
    }

    const todos = contactos.sort((a, b) => a.nombre.localeCompare(b.nombre));

    if (q && q.trim().length >= 2) {
      const term = q.trim().toLowerCase();
      return todos.filter(c =>
        c.nombre.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.telefono?.includes(term) ||
        c.rnc?.includes(term)
      );
    }

    return todos;
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [clientes, proveedores, empleados] = await Promise.all([
      this.clienteRepo.count({ where: { empresaId, isActive: true } }),
      this.proveedorRepo.count({ where: { empresaId, isActive: true } }),
      this.empleadoRepo.count({ where: { empresaId, isActive: true } }),
    ]);
    return { clientes, proveedores, empleados, total: clientes + proveedores + empleados };
  }
}
