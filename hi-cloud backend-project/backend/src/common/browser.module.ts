import { Global, Module } from '@nestjs/common';
import { BrowserService } from './services/browser.service';

/**
 * Módulo Global — registra BrowserService UNA SOLA VEZ en toda la aplicación.
 *
 * Sin @Global(): cada módulo que añade BrowserService a providers crea
 * su propia instancia → N procesos de Chromium en paralelo al arrancar.
 *
 * Con @Global(): existe un único BrowserService compartido por todo el app,
 * que lanza Chromium una vez y lo reutiliza indefinidamente.
 */
@Global()
@Module({
  providers: [BrowserService],
  exports:   [BrowserService],
})
export class BrowserModule {}
