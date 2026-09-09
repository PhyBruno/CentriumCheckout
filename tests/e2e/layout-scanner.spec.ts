import { expect, test } from '@playwright/test';
import { URL_ERP_MOCK, urlSessionStart } from './support/constants';

/**
 * T026 — `quickstart.md` §5 / `FR-011`: o botão "Scanner" só existe em
 * Chrome/Android com `BarcodeDetector`, e em nenhum outro lugar aparece — nem
 * desabilitado, nem como mensagem de indisponibilidade.
 *
 * O CI roda Chromium em desktop, então o **ambiente suportado é simulado**: a
 * UA e a presença de `BarcodeDetector` são injetadas antes de qualquer script da
 * página (`addInitScript`), que é exatamente o par de sinais que
 * `suportaScannerCamera` consulta. A decodificação em si não é exercitada aqui —
 * ela depende de uma câmera real e já está coberta ponta a ponta pelo teste de
 * integração `scannerCamera.spec.tsx`, que prova a igualdade com a digitação.
 *
 * O que este spec cobre e nenhum outro cobre: que o recorte de AD-086/AD-090
 * vale na **aplicação montada**, e não só na função pura.
 */
const UA_CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const UA_SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const VIEWPORT_MOBILE = { width: 390, height: 844 };

test.use({ viewport: VIEWPORT_MOBILE });

test.beforeEach(async ({ request }) => {
  await request.post(`${URL_ERP_MOCK}/__mock/reset`);
});

test.describe('Scanner por câmera — disponibilidade (FR-011)', () => {
  test('aparece em Chrome/Android com BarcodeDetector', async ({ page }) => {
    await page.addInitScript(
      ({ userAgent }) => {
        Object.defineProperty(navigator, 'userAgent', { get: () => userAgent });
        Object.defineProperty(window, 'BarcodeDetector', {
          configurable: true,
          value: class {
            detect(): Promise<readonly unknown[]> {
              return Promise.resolve([]);
            }
          },
        });
      },
      { userAgent: UA_CHROME_ANDROID },
    );

    await page.goto(urlSessionStart());
    await expect(page.getByTestId('etapa-cliente-produtos')).toBeVisible();

    await expect(page.getByTestId('abrir-scanner-camera')).toBeVisible();
  });

  test('não aparece em Chrome/Android sem a API — sem botão apagado nem aviso', async ({
    page,
  }) => {
    await page.addInitScript(
      ({ userAgent }) => {
        Object.defineProperty(navigator, 'userAgent', { get: () => userAgent });
      },
      { userAgent: UA_CHROME_ANDROID },
    );

    await page.goto(urlSessionStart());
    await expect(page.getByTestId('etapa-cliente-produtos')).toBeVisible();

    await expect(page.getByTestId('abrir-scanner-camera')).toHaveCount(0);
    await expect(page.getByText(/scanner/i)).toHaveCount(0);
  });

  test('não aparece em Safari/iOS, mesmo com a API presente (AD-090)', async ({ page }) => {
    await page.addInitScript(
      ({ userAgent }) => {
        Object.defineProperty(navigator, 'userAgent', { get: () => userAgent });
        Object.defineProperty(window, 'BarcodeDetector', {
          configurable: true,
          value: class {
            detect(): Promise<readonly unknown[]> {
              return Promise.resolve([]);
            }
          },
        });
      },
      { userAgent: UA_SAFARI_IOS },
    );

    await page.goto(urlSessionStart());
    await expect(page.getByTestId('etapa-cliente-produtos')).toBeVisible();

    await expect(page.getByTestId('abrir-scanner-camera')).toHaveCount(0);
  });

  test('não aparece no desktop, onde o wizard nem existe', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(urlSessionStart());
    await expect(page.getByTestId('painel-pagamento-totais')).toBeVisible();

    await expect(page.getByTestId('abrir-scanner-camera')).toHaveCount(0);
  });
});
