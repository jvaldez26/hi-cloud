import { Injectable, Logger } from '@nestjs/common';
import type { Browser } from 'puppeteer';
import { reportServiceError } from '../observability/sentry';

// Máximo tiempo para generar un PDF (cubre setContent + evaluate + pdf())
const PDF_TIMEOUT_MS = 25_000;

/**
 * BrowserService — ON-DEMAND (sin Chrome persistente).
 *
 * Cada llamada a htmlToPDF lanza un Chrome, genera el PDF y lo cierra
 * en el finally. Nunca hay un proceso Chrome idle consumiendo RAM.
 *
 * Antes era un singleton (OnModuleInit) que mantenía Chrome vivo 24/7
 * y lo respawnaba en caso de muerte — eso agotaba la RAM de la EC2
 * (1 GB) y causaba OOM-kills silenciosos del proceso Node.
 */
@Injectable()
export class BrowserService {
  private readonly logger = new Logger(BrowserService.name);

  private readonly ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-client-side-phishing-detection',
  ];

  /**
   * Genera un PDF a partir de HTML.
   * Lanza Chrome, genera el PDF y lo cierra siempre (éxito o error).
   *
   * @param html         HTML completo (estilos inline, logo como data URI)
   * @param opts.thermal true = recibo térmico 80mm; false/omitido = A4
   */
  async htmlToPDF(
    html: string,
    opts: { thermal?: boolean } = {},
  ): Promise<Buffer> {
    const puppeteer = await import('puppeteer');
    let browser: Browser | null = null;

    try {
      const executablePath = process.env['PUPPETEER_EXECUTABLE_PATH'] || undefined;
      browser = await puppeteer.default.launch({ headless: true, executablePath, args: this.ARGS });

      const t0   = Date.now();
      const page = await browser.newPage();

      // Timeout por operación — si cuelga, Puppeteer lanza TimeoutError
      page.setDefaultTimeout(PDF_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(PDF_TIMEOUT_MS);

      try {
        await page.setRequestInterception(true);
        page.on('request', req => {
          const type = req.resourceType();
          const url  = req.url();
          if (type === 'document' || url.startsWith('data:')) {
            req.continue();
          } else if (['xhr', 'fetch', 'media', 'websocket'].includes(type)) {
            req.abort();
          } else {
            req.continue();
          }
        });

        if (opts.thermal) {
          await page.setViewport({ width: 302, height: 800 });
          await page.setContent(html, { waitUntil: 'domcontentloaded' });
          const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
          const pdf = await page.pdf({
            width:           '80mm',
            height:          `${bodyHeight + 20}px`,
            printBackground:  true,
            margin:           { top: 0, bottom: 0, left: 0, right: 0 },
          });
          this.logger.debug(`PDF térmico en ${Date.now() - t0} ms`);
          return Buffer.from(pdf);
        }

        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const pdf = await page.pdf({
          format:          'A4',
          printBackground: true,
          margin:          { top: '0', bottom: '0', left: '0', right: '0' },
        });
        this.logger.debug(`PDF A4 en ${Date.now() - t0} ms`);
        return Buffer.from(pdf);

      } finally {
        await page.close().catch(() => {});
      }

    } catch (err: any) {
      reportServiceError(err, 'browser_pdf_htmlToPDF', { thermal: String(!!opts.thermal) });
      throw err;
    } finally {
      // Garantía: Chrome se cierra SIEMPRE, pase lo que pase
      await browser?.close().catch(() => {});
    }
  }
}
