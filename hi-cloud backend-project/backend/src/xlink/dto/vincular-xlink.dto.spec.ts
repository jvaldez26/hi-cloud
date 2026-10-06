/**
 * El formulario "Crear" del Directorio (ProveedorFormModal/ClienteFormModal)
 * manda TODO lo que trae el Form de antd como `datos` — incluido `rnc`/`rfc`
 * (el campo existe en el formulario, solo que bloqueado) y, para proveedor,
 * `esInformal`. Ninguno de los dos existe en VincularXlinkDatosDto a
 * propósito (el RNC lo decide el backend, nunca el formulario) — pero el
 * ValidationPipe real de main.ts corre con `forbidNonWhitelisted: true`, así
 * que si el frontend no los excluyera antes de mandar, esto 400-earía en
 * producción. Este test corre el MISMO ValidationPipe (no una approximación)
 * para que esa integración quede probada, no solo asumida.
 */
import 'reflect-metadata';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { VincularXlinkDto } from './vincular-xlink.dto';

const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const metadata = { type: 'body' as const, metatype: VincularXlinkDto, data: '' };
// @IsUUID() valida el formato completo (versión + variante RFC4122) — un
// relleno de puros "1" no pasa; se usa un UUID v4 real en todo este archivo.
const XLINK_ID = '11111111-1111-4111-8111-111111111111';

describe('VincularXlinkDto — con el ValidationPipe real (whitelist + forbidNonWhitelisted)', () => {
  it('acepta exactamente lo que manda ProveedorFormModal (sin rnc/esInformal, ya los excluye el frontend)', async () => {
    const datosProveedorEnviados = {
      nombre: 'Mi Proveedor SRL', telefono: '809-555-0000', email: 'p@test.com',
      direccion: 'Calle 1', contacto: 'Juan', categoria: 'Servicios', diasPago: 30,
      banco: 'Popular', cuentaBancaria: '123', notas: 'nota', sincronizarArticulosXlink: true,
    };
    await expect(pipe.transform(
      { xlinkId: XLINK_ID, rol: 'proveedor', datos: datosProveedorEnviados },
      metadata,
    )).resolves.toBeDefined();
  });

  it('acepta exactamente lo que manda ClienteFormModal (sin rfc, ya lo excluye el frontend)', async () => {
    const datosClienteEnviados = {
      nombre: 'Mi Cliente SRL', razonSocial: 'RS', rncReceptor: '130000009',
      identificadorExtranjero: '', regimenFiscal: 'ORDINARIO', email: 'c@test.com',
      telefono: '809-555-0000', direccion: 'Calle 1', ciudad: 'Santo Domingo',
      estado: 'DN', codigoPostal: '10101', sector: 'Comercio', diasCredito: 15,
      limiteCredito: 5000, notas: 'nota',
    };
    await expect(pipe.transform(
      { xlinkId: XLINK_ID, rol: 'cliente', datos: datosClienteEnviados },
      metadata,
    )).resolves.toBeDefined();
  });

  it('REGRESIÓN: si `datos` trajera `rnc` (el formulario sin excluirlo), forbidNonWhitelisted lo rechaza con 400', async () => {
    await expect(pipe.transform(
      { xlinkId: XLINK_ID, rol: 'proveedor', datos: { nombre: 'X', rnc: '130000001' } },
      metadata,
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REGRESIÓN: si `datos` trajera `rfc` (el formulario sin excluirlo), forbidNonWhitelisted lo rechaza con 400', async () => {
    await expect(pipe.transform(
      { xlinkId: XLINK_ID, rol: 'cliente', datos: { nombre: 'X', rfc: '130000001' } },
      metadata,
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin `datos` (botón "Vincular" de un clic): sigue siendo válido, como siempre', async () => {
    await expect(pipe.transform(
      { xlinkId: XLINK_ID, rol: 'proveedor' },
      metadata,
    )).resolves.toBeDefined();
  });
});
