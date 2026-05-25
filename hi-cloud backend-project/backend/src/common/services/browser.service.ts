import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Browser, Page } from 'puppeteer';

/**
 * Browser Puppeteer SINGLETON — se lanza UNA VEZ al iniciar el servidor
 * y se reutiliza en todos los servicios de PDF del sistema.
 *
 * ANTES: cada PDF → launch() + newPage() + close() ≈ 2-4 segundos de overhead
 * AHORA: cada PDF → newPage() + close() ≈ 50-200 ms
 *
 * Se autoreconecta si el proceso de Chromium muere inesperadamente.
 */
@Injectable()
export class BrowserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private browser: Browser | null = null;
  private launching = false;   // previene lanzamientos concurrentes

  private readonly ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',      // crítico en EC2 (evita errores de /dev/shm)
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process',             // necesario en entornos sin zygote (EC2/Docker)
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-client-side-phishing-detection',
  ];

  async onModuleInit() {
    await this.initBrowser();
  }

  async onModuleDestroy() {
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignorar */ }
      this.browser = null;
    }
  }

  private async initBrowser(): Promise<void> {
    if (this.launching) return;
    this.launching = true;
    try {
      const puppeteer = await import('puppeteer');

      // Soporte para PUPPETEER_EXECUTABLE_PATH (Chrome del sistema como fallback)
      const executablePath = process.env['PUPPETEER_EXECUTABLE_PATH'] || undefined;
      if (executablePath) {
        this.logger.log(`Usando Chrome externo: ${executablePath}`);
      }

      this.browser = await puppeteer.default.launch({
        headless: true,
        executablePath,
        args: this.ARGS,
      });
      this.logger.log('✅ Browser Puppeteer singleton iniciado');

      // Autoreconexión si Chromium muere
      this.browser.on('disconnected', () => {
        this.logger.warn('Browser desconectado — relanzando en 1 s…');
        this.browser  = null;
        this.launching = false;
        setTimeout(() => this.initBrowser(), 1_000);
      });
    } catch (err: any) {
      // Log completo para diagnosticar en PM2
      this.logger.error(
        `❌ Error iniciando Puppeteer browser — ${err.message}\n` +
        `   Verifica: npx puppeteer browsers install chrome && librerías del sistema`,
        err?.stack,
      );
      // this.browser queda en null → htmlToPDF lanzará error descriptivo
    } finally {
      this.launching = false;
    }
  }

  /**
   * Genera un PDF a partir de HTML usando el browser singleton.
   * Devuelve un Buffer listo para enviar como respuesta HTTP.
   *
   * @param html     - HTML completo (con estilos inline y logo como data URI)
   * @param opts.thermal - true = recibo térmico 80mm; false = A4
   */
  async htmlToPDF(
    html: string,
    opts: { thermal?: boolean } = {},
  ): Promise<Buffer> {
    // Garantizar browser disponible
    if (!this.browser || !this.browser.isConnected()) {
      await this.initBrowser();
      // Espera breve si se acaba de lanzar
      await new Promise(r => setTimeout(r, 200));
    }
    if (!this.browser) throw new Error('Browser Puppeteer no disponible');

    const t0   = Date.now();
    const page: Page = await this.browser.newPage();

    try {
      // Bloquear recursos externos innecesarios para el PDF.
      // El logo ya viene como data URI → no necesita red.
      await page.setRequestInterception(true);
      page.on('request', req => {
        const type = req.resourceType();
        const url  = req.url();
        // Permitir siempre: document (el HTML base) y data URIs (logo, fuentes inline)
        if (type === 'document' || url.startsWith('data:')) {
          req.continue();
        // Bloquear: XHR, fetch, media, websocket (innecesarios en PDF)
        } else if (['xhr', 'fetch', 'media', 'websocket'].includes(type)) {
          req.abort();
        } else {
          // Imágenes y fuentes externas: permitir (ej. Google Fonts en la plantilla)
          req.continue();
        }
      });

      if (opts.thermal) {
        // ── Recibo térmico 80mm ──
        await page.setViewport({ width: 302, height: 800 });
        await page.setContent(html, { waitUntil: 'domcontentloaded' });   // más rápido que networkidle0
        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        const pdf = await page.pdf({
          width:           '80mm',
          height:          `${bodyHeight + 20}px`,
          printBackground:  true,
          margin:           { top: 0, bottom: 0, left: 0, right: 0 },
        });
        this.logger.debug(`PDF térmico generado en ${Date.now() - t0} ms`);
        return Buffer.from(pdf);
      }

      // ── Factura / documento A4 ──
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format:          'A4',
        printBackground: true,
        margin:          { top: '0', bottom: '0', left: '0', right: '0' },
      });
      this.logger.debug(`PDF A4 generado en ${Date.now() - t0} ms`);
      return Buffer.from(pdf);

    } finally {
      await page.close().catch(() => {/* ignorar si ya cerró */});
    }
  }
}
