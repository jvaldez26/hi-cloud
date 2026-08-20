import {
  Controller, Post, Get, UploadedFile, UseInterceptors,
  BadRequestException, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { EcfRecibidosService } from './ecf-recibidos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { PlanGuard } from '../suscripciones/guards/plan.guard';
import { RequiereModulo } from '../suscripciones/decorators/requiere-modulo.decorator';

@ApiTags('e-CF Recibidos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@RequiereModulo('ecf')
@Controller('ecf-recibidos')
export class EcfRecibidosController {
  constructor(private readonly service: EcfRecibidosService) {}

  private static readonly CSV_FILTER = (
    _: any,
    file: { mimetype: string; originalname: string },
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    const MIME_OK = [
      'text/csv', 'text/plain', 'text/comma-separated-values',
      'application/csv', 'application/vnd.ms-excel', 'application/octet-stream',
    ];
    const ok = MIME_OK.includes(file.mimetype) || file.originalname?.toLowerCase().endsWith('.csv');
    cb(ok ? null : new BadRequestException('Solo se permiten archivos CSV (.csv)'), ok);
  };

  @Post('importar-csv')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: EcfRecibidosController.CSV_FILTER,
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Importar e-CFs recibidos desde CSV exportado de MSeller (idempotente — re-importar no duplica)' })
  importarCsv(@UploadedFile() file: { buffer: Buffer; originalname: string } | undefined) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo CSV');
    return this.service.importarCsv(file.buffer);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Listar e-CFs recibidos con paginación y filtros. exportar=true devuelve todos sin paginar.' })
  listar(
    @Query('page')       page?: string,
    @Query('limit')      limit?: string,
    @Query('desde')      desde?: string,
    @Query('hasta')      hasta?: string,
    @Query('rncEmisor')  rncEmisor?: string,
    @Query('tipoEcf')    tipoEcf?: string,
    @Query('status')     status?: string,
    @Query('exportar')   exportar?: string,
  ) {
    return this.service.listar({
      page:     page  ? parseInt(page,  10) : undefined,
      limit:    limit ? parseInt(limit, 10) : undefined,
      desde, hasta, rncEmisor, tipoEcf, status,
      exportar: exportar === 'true',
    });
  }
}
