import { describe, expect, it } from 'vitest';
import { textoSemHtml } from '../../../../src/client/lib/textoSemHtml';

/**
 * Pendência 50 / AD-238 — `NotaFiscal.ErroMensagem` pode vir como um documento
 * HTML. O Checkout exibe só o texto, sempre como texto.
 */
describe('textoSemHtml', () => {
  it('devolve texto puro intacto, inclusive com < solto', () => {
    expect(textoSemHtml('Rejeicao: valor < 10 e > 5')).toBe('Rejeicao: valor < 10 e > 5');
  });

  it('remove tags, preserva quebras de bloco e decodifica entidades', () => {
    expect(
      textoSemHtml(
        '<div class="x"><pre>531 - Rejeicao: A &amp; B</pre><p>linha&nbsp;2</p>linha 3<br/>fim &lt;ok&gt; &#39;q&#39; &#x41;</div>',
      ),
    ).toBe("531 - Rejeicao: A & B\nlinha 2\nlinha 3\nfim <ok> 'q' A");
  });

  it('descarta script e style por inteiro', () => {
    expect(textoSemHtml('<style>.a{color:red}</style><p>ok</p><script>alert("x")</script>')).toBe(
      'ok',
    );
  });

  it('não reconstrói tag a partir de entidades — o resultado é só texto', () => {
    expect(textoSemHtml('<b>x</b>&lt;img src=x onerror=alert(1)&gt;')).toBe(
      'x<img src=x onerror=alert(1)>',
    );
  });

  it('colapsa espaços e linhas vazias', () => {
    expect(textoSemHtml('<div>\n  a   b \n\n</div>\n\n<div> c</div>')).toBe('a b\nc');
  });

  it('lê tag aninhada como o navegador, sem reabrir o texto já emitido', () => {
    // `<scr<script>` é uma tag só (`scr`, com `<script` dentro dos atributos):
    // o que sobra é texto, e a varredura nunca o reexamina.
    expect(textoSemHtml('<scr<script>ipt>531 - Rejeicao')).toBe('ipt>531 - Rejeicao');
    // `<` solto é texto; só o `<b>` seguinte é tag — igual ao textContent do DOM.
    expect(textoSemHtml('<<b>b>x')).toBe('<b>x');
  });

  it('descarta até o fim quando o bloco não fecha', () => {
    expect(textoSemHtml('<p>ok</p><script>alert("x")')).toBe('ok');
  });
});
