/**
 * O "Scanner" por câmera está disponível? (T021, `data-model.md` §3)
 *
 * Exige **as duas** condições (I1): a API `BarcodeDetector` existir e a UA
 * indicar Chrome em Android.
 *
 * **Por que não basta a capacidade.** `BarcodeDetector` também existe em Chrome
 * desktop e em outros navegadores Chromium; checar só `'BarcodeDetector' in
 * window` exporia o botão fora do escopo que o usuário aprovou (AD-086: "só
 * funciona em Chrome no Android"), e AD-090 é explícita — o botão fica
 * **ausente** fora desse escopo, não "ausente onde a API falhar".
 *
 * **Por que não basta a UA.** Uma UA pode mentir ou estar desatualizada (Android
 * antigo que se identifica como Chrome sem ter a API implementada); nesse caso a
 * checagem de capacidade é a rede de segurança e a função ainda devolve `false`
 * (`research.md` D4).
 *
 * **Chrome-em-iOS devolve `false`** mesmo carregando `CriOS` na UA: o motor lá
 * ainda é WebKit, e `BarcodeDetector` não existe. A ausência de `/Android/`
 * já o exclui, sem regra extra.
 *
 * Pura: recebe a UA e a presença da API como parâmetros, nunca lê `navigator`
 * nem `window` por conta própria — é o componente (`ScannerCamera.tsx`) que faz
 * essa leitura na borda.
 */

/** Chromium que reescreve a UA e, por decisão de escopo, fica de fora. */
const OUTROS_CHROMIUM = /Edg|EdgA|OPR|OPT|SamsungBrowser|YaBrowser|MiuiBrowser/;

export function suportaScannerCamera(userAgent: string, hasBarcodeDetector: boolean): boolean {
  if (!hasBarcodeDetector) {
    return false;
  }

  return (
    /Android/.test(userAgent) &&
    /Chrome\//.test(userAgent) &&
    !OUTROS_CHROMIUM.test(userAgent)
  );
}
