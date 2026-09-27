import { IsOptional, IsEnum, IsInt, IsPositive, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { EstadoTicketSoporte, PrioridadTicketSoporte } from '../entities/soporte-ticket.entity';

export class FiltroSoporteTicketsDto extends PaginationDto {
  @IsOptional() @IsEnum(EstadoTicketSoporte)
  estado?: EstadoTicketSoporte;

  @IsOptional() @IsEnum(PrioridadTicketSoporte)
  prioridad?: PrioridadTicketSoporte;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  empresaId?: number;

  @IsOptional() @IsDateString()
  desde?: string;

  @IsOptional() @IsDateString()
  hasta?: string;
}
