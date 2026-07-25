import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from './enums/user-role.enum';

/**
 * El controller declara @UseGuards(JwtAuthGuard, RolesGuard) a nivel de clase, y
 * Nest instancia esos guards al compilar el módulo de prueba. RolesGuard depende
 * de Reflector, DataSource y CACHE_MANAGER: sin ellos el test moría con un error
 * de DI antes de comprobar nada. Se proveen dobles en vez de saltarse los guards,
 * para que el módulo se compile tal y como se usa en producción.
 */
describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: {
          findAll:  jest.fn(async () => []),
          findById: jest.fn(async () => null),
          update:   jest.fn(async () => null),
          remove:   jest.fn(async () => undefined),
        } },
        { provide: DataSource,    useValue: { query: jest.fn(async () => []) } },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Regresión de control de acceso: /users gestiona usuarios de la empresa y
  // debe seguir exigiendo rol ADMIN a nivel de clase.
  it('exige rol ADMIN a nivel de clase', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController)).toEqual([UserRole.ADMIN]);
  });

  it('ningún método relaja el rol de la clase', () => {
    const proto = UsersController.prototype as any;
    const metodos = Object.getOwnPropertyNames(proto).filter(m => m !== 'constructor');
    for (const m of metodos) {
      const roles = Reflect.getMetadata(ROLES_KEY, proto[m]);
      // undefined = hereda el de la clase; si define alguno, no puede ser más laxo
      if (roles) expect(roles).not.toContain(UserRole.VIEWER);
    }
  });
});
