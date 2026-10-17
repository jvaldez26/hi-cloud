import { describe, it, expect } from 'vitest';
import { traducirMensajeValidacion, extraerErroresPorCampo } from './erroresValidacion';

describe('traducirMensajeValidacion', () => {
  it('IsNumber con decimales fuera de rango (el bug real: costoUnitario de 4 decimales contra un DTO de 2)', () => {
    expect(traducirMensajeValidacion('costoUnitario must be a number conforming to the specified constraints'))
      .toBe('El costo unitario debe ser un número válido');
  });

  it('IsPositive', () => {
    expect(traducirMensajeValidacion('cantidad must be a positive number'))
      .toBe('La cantidad debe ser mayor que cero');
  });

  it('IsInt', () => {
    expect(traducirMensajeValidacion('productoId must be an integer number'))
      .toBe('El producto debe ser un número entero');
  });

  it('Min', () => {
    expect(traducirMensajeValidacion('costoUnitario must not be less than 0'))
      .toBe('El costo unitario no puede ser menor que 0');
  });

  it('Max', () => {
    expect(traducirMensajeValidacion('cantidad must not be greater than 1000000'))
      .toBe('La cantidad no puede ser mayor que 1000000');
  });

  it('IsNotEmpty', () => {
    expect(traducirMensajeValidacion('motivo should not be empty'))
      .toBe('El motivo es obligatorio');
  });

  it('MaxLength', () => {
    expect(traducirMensajeValidacion('referencia must be shorter than or equal to 50 characters'))
      .toBe('La referencia no puede superar los 50 caracteres');
  });

  it('campo sin etiqueta conocida: humaniza el camelCase igual', () => {
    expect(traducirMensajeValidacion('descuentoMaximo must be a positive number'))
      .toBe('El campo "descuento maximo" debe ser mayor que cero');
  });

  it('mensaje que no calza con ningún patrón (ya en español, o constraint no cubierta): se devuelve igual', () => {
    expect(traducirMensajeValidacion('El RNC ya está registrado'))
      .toBe('El RNC ya está registrado');
  });
});

describe('extraerErroresPorCampo', () => {
  it('con un array de mensajes de class-validator: arma el mapa campo → mensaje traducido', () => {
    const err = { response: { data: { message: [
      'costoUnitario must be a number conforming to the specified constraints',
      'cantidad must be a positive number',
    ] } } };
    expect(extraerErroresPorCampo(err)).toEqual({
      costoUnitario: 'El costo unitario debe ser un número válido',
      cantidad: 'La cantidad debe ser mayor que cero',
    });
  });

  it('sin array (mensaje de negocio como string simple): undefined — el formulario cae a su manejo normal', () => {
    const err = { response: { data: { message: 'El RNC ya está registrado' } } };
    expect(extraerErroresPorCampo(err)).toBeUndefined();
  });

  it('sin response.data.message: undefined', () => {
    expect(extraerErroresPorCampo({})).toBeUndefined();
    expect(extraerErroresPorCampo(undefined)).toBeUndefined();
  });

  it('array vacío: undefined', () => {
    expect(extraerErroresPorCampo({ response: { data: { message: [] } } })).toBeUndefined();
  });
});
