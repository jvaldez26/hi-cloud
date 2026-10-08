/**
 * Última línea de defensa — migración 1771000000000-AmpliarUnicidadEcfOrigenVivo.
 *
 * El chequeo de idempotencia de execute() (findOne + decisión) tiene una
 * ventana de carrera: dos llamadas que ambas ven "no existe" antes de que
 * cualquiera inserte, pueden intentar el INSERT casi juntas. Antes de la
 * migración, el único índice único (idx_ecf_origen_unico_aceptado) solo
 * cubre 'aceptado' — dos inserts en 'pendiente_envio' pasaban los dos. Con
 * idx_ecf_origen_unico_vivo (cualquier estado salvo 'rechazado'), el
 * SEGUNDO insert falla con 23505 — y execute() debe convertir eso en la
 * misma respuesta enCurso:true, nunca en un 500 crudo.
 */
import { EmitirECFUseCase } from './emitir-ecf.use-case';
import { DocumentoOrigenTipo, EstadoDGII } from '../entities/ecf.entity';

const INPUT = {
  empresaId: 1,
  documentoOrigenTipo: DocumentoOrigenTipo.FACTURA,
  documentoOrigenId: 19777,
  tipoEcf: 32,
};

function montarCaso() {
  const existenteTrasElChoque = { numero: 'E320000012345', estadoDGII: EstadoDGII.PENDIENTE_ENVIO } as any;

  // findOne() del paso 1 (idempotencia): la PRIMERA vez dice "no existe" (para
  // que execute() siga de largo hasta el INSERT); después del choque,
  // devuelve la fila que la OTRA petición sí insertó.
  const ecfRepo = {
    findOne: jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existenteTrasElChoque),
  };

  const generator = { generateNextEnTransaccion: jest.fn().mockResolvedValue('E320000012345') };

  const errorUniqueViolation: any = new Error(
    'duplicate key value violates unique constraint "idx_ecf_origen_unico_vivo"',
  );
  errorUniqueViolation.code = '23505';

  const ds = {
    transaction: jest.fn().mockRejectedValue(errorUniqueViolation),
    getRepository: () => ({ findOne: jest.fn().mockResolvedValue({ id: 1, codigo: 'E32' }) }),
  };

  const secuenciaRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: () => ({
      innerJoinAndSelect: () => ({
        where: () => ({
          andWhere: () => ({
            andWhere: () => ({
              andWhere: () => ({ getOne: jest.fn().mockResolvedValue(null) }),
            }),
          }),
        }),
      }),
    }),
  };

  const uc = new EmitirECFUseCase(
    ecfRepo as any,                                                // ecfRepo
    { save: jest.fn().mockResolvedValue(undefined) } as any,       // eventoRepo
    secuenciaRepo as any,                                          // secuenciaRepo
    { findOne: jest.fn().mockResolvedValue({ empresaId: 1, rncEmisor: '123', razonSocialEmisor: 'X', modo: 'PRUEBAS' }) } as any, // configRepo
    { findOne: jest.fn().mockResolvedValue({ id: 1, empresaId: 1, detalles: [], cliente: {} }) } as any, // facturaRepo
    {} as any, {} as any, {} as any, {} as any,                     // notaDebito/notaCredito/compra/gasto repos
    generator as any,
    { build: jest.fn().mockReturnValue({ ECF: { Encabezado: { Emisor: {}, IdDoc: { eNCF: 'E320000012345' } } } }) } as any, // builder
    {} as any,                                                      // mseller
    {} as any,                                                      // configSvc
    {} as any,                                                      // rncService
    {} as any,                                                      // vinculoCliente
    {} as any,                                                      // cuotaEcf
    ds as any,                                                      // DataSource
  );
  return { uc, ecfRepo, ds };
}

describe('EmitirECFUseCase.execute — choque contra idx_ecf_origen_unico_vivo', () => {
  it('el INSERT falla con 23505 → devuelve enCurso:true con el estado de la fila que SÍ se insertó, nunca un 500 crudo', async () => {
    const { uc } = montarCaso();

    const resultado = await uc.execute(INPUT);

    expect(resultado).toMatchObject({
      encf:    'E320000012345',
      estado:  EstadoDGII.PENDIENTE_ENVIO,
      enCurso: true,
    });
  });

  it('un 23505 de OTRO índice/constraint (no el nuestro) se relanza tal cual — no se confunde con "en curso"', async () => {
    const { uc, ds } = montarCaso();
    const otroError: any = new Error('duplicate key value violates unique constraint "otra_constraint_cualquiera"');
    otroError.code = '23505';
    (ds.transaction as jest.Mock).mockRejectedValue(otroError);

    await expect(uc.execute(INPUT)).rejects.toBe(otroError);
  });
});
