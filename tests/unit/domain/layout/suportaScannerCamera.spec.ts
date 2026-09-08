import { describe, expect, it } from 'vitest';
import { suportaScannerCamera } from '../../../../src/client/domain/layout/suportaScannerCamera';

/**
 * T022 — o recorte de AD-086/AD-090 (`data-model.md` §3).
 *
 * Todas as user agents abaixo são sintéticas, escritas no formato que cada
 * navegador publica; nenhuma vem de telemetria ou de aparelho real.
 */
const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  chromeDesktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  edgeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
  operaAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 OPR/80.0.0.0',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
} as const;

describe('suportaScannerCamera', () => {
  it('libera em Chrome no Android com BarcodeDetector', () => {
    expect(suportaScannerCamera(UA.chromeAndroid, true)).toBe(true);
  });

  it('recusa Chrome no Android sem BarcodeDetector — a UA pode estar desatualizada', () => {
    expect(suportaScannerCamera(UA.chromeAndroid, false)).toBe(false);
  });

  it('recusa fora do Android mesmo com a API presente (AD-090)', () => {
    expect(suportaScannerCamera(UA.chromeDesktop, true)).toBe(false);
    expect(suportaScannerCamera(UA.safariIos, true)).toBe(false);
    // Chrome-em-iOS: o motor ainda é WebKit, e a UA não traz `Android`.
    expect(suportaScannerCamera(UA.chromeIos, true)).toBe(false);
  });

  it('recusa outros Chromium em Android, que reescrevem a UA', () => {
    expect(suportaScannerCamera(UA.edgeAndroid, true)).toBe(false);
    expect(suportaScannerCamera(UA.operaAndroid, true)).toBe(false);
    expect(suportaScannerCamera(UA.samsungAndroid, true)).toBe(false);
  });

  it('recusa uma UA vazia sem estourar', () => {
    expect(suportaScannerCamera('', true)).toBe(false);
  });
});
