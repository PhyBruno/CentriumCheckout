import { Check, UserRoundPlus, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { validarFormatoCEP, validarFormatoCPF } from '../../domain/cliente/documento';
import type { CadastroSimplificadoInput } from '../../domain/cliente/clienteVenda';

/**
 * Cadastro simplificado de cliente (T024, `CLI-03`/`CLI-04`) — réplica do frame
 * "PDV Online Web - Modal cadastro de cliente" do Pencil
 * (`design/CentriumCheckout.pen`, nó `R6FmKw`/`m5As4q`, lido via MCP): modal de
 * 640px, cabeçalho de 78px com ícone `user-round-plus`, conteúdo em duas seções
 * ("Dados do cliente" e "Endereço") e rodapé de 76px com Cancelar + Salvar.
 *
 * **Sem campos de crédito** (`FR-014`, AD-026): `LimiteCredito` e
 * `PermiteVendaCredito` existem no schema `ClienteCheckout`, mas
 * `PCheckout_PostCliente` não os grava — exibi-los faria o operador acreditar
 * que configurou algo que nunca foi persistido. Também não há campo de tipo de
 * pessoa: `CliTip` é hardcoded `'F'` dentro da procedure do ERP (AD-024), então
 * este caminho só cria pessoa física.
 *
 * Endereço é texto livre, sem validação de IBGE — só a máscara do CEP
 * (`FR-013`, AD-023).
 */
export interface FormCadastroSimplificadoProps {
  readonly aberto: boolean;
  /** Pré-preenche o CPF quando a busca que não achou nada era um documento. */
  readonly cpfInicial?: string;
  readonly onFechar: () => void;
  readonly onConfirmar: (dados: CadastroSimplificadoInput) => Promise<void> | void;
}

type CampoCadastro = keyof CadastroSimplificadoInput;

const CAMPOS_VAZIOS: CadastroSimplificadoInput = {
  nome: '',
  cpf: '',
  email: '',
  celular: '',
  cep: '',
  endereco: '',
  bairro: '',
  numero: '',
  cidade: '',
  uf: '',
};

export function FormCadastroSimplificado({
  aberto,
  cpfInicial = '',
  onFechar,
  onConfirmar,
}: FormCadastroSimplificadoProps): ReactElement | null {
  const [valores, setValores] = useState<CadastroSimplificadoInput>({
    ...CAMPOS_VAZIOS,
    cpf: cpfInicial,
  });
  const [enviando, setEnviando] = useState(false);

  // Mesmo padrão de `ModalBuscaProduto`: o componente não desmonta ao fechar,
  // então reabrir precisa começar do zero — ajustado durante a renderização,
  // não num efeito, para não haver um quadro com os dados do cadastro anterior.
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setValores({ ...CAMPOS_VAZIOS, cpf: cpfInicial });
      setEnviando(false);
    }
  }

  if (!aberto) {
    return null;
  }

  function alterar(campo: CampoCadastro, valor: string): void {
    setValores((atuais) => ({ ...atuais, [campo]: valor }));
  }

  // `FR-012`: formato de CPF e CEP validados **antes** do envio. Nome é o único
  // outro campo obrigatório — os demais o ERP aceita vazios.
  const cpfValido = validarFormatoCPF(valores.cpf);
  const cepValido = validarFormatoCEP(valores.cep);
  const podeEnviar = valores.nome.trim() !== '' && cpfValido && cepValido && !enviando;

  async function confirmar(): Promise<void> {
    if (!podeEnviar) {
      return;
    }
    setEnviando(true);
    try {
      await onConfirmar(valores);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--cc-color-ink)_40%,transparent)] p-lg"
      data-testid="modal-cadastro-cliente"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          onFechar();
        }
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Cadastrar cliente"
        className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        onSubmit={(evento) => {
          evento.preventDefault();
          void confirmar();
        }}
      >
        <header className="flex h-[78px] shrink-0 items-center justify-between gap-sm border-b border-border px-lg">
          <div className="flex items-center gap-sm">
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-secondary">
              <UserRoundPlus className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-[2px]">
              <h2 className="text-xl font-semibold text-foreground">Cadastrar cliente</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Preencha as informações do novo cliente
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            className="shrink-0 rounded-full"
            aria-label="Fechar"
            onClick={onFechar}
          >
            <X className="size-4.5" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-1 flex-col gap-md overflow-y-auto p-md">
          <section className="flex flex-col gap-base">
            <h3 className="text-md font-bold text-foreground">Dados do cliente</h3>
            <Campo
              campo="nome"
              rotulo="Nome completo"
              placeholder="Digite o nome completo"
              valor={valores.nome}
              onChange={alterar}
              autoFocus
            />
            <div className="flex gap-base">
              <Campo
                campo="cpf"
                rotulo="CPF"
                placeholder="000.000.000-00"
                valor={valores.cpf}
                onChange={alterar}
                invalido={valores.cpf !== '' && !cpfValido}
                dica="Informe os 11 dígitos do CPF."
                inputMode="numeric"
              />
              <Campo
                campo="email"
                rotulo="E-mail"
                placeholder="nome@exemplo.com"
                valor={valores.email}
                onChange={alterar}
              />
              <Campo
                campo="celular"
                rotulo="Celular"
                placeholder="(11) 90000-0000"
                valor={valores.celular}
                onChange={alterar}
                inputMode="tel"
              />
            </div>
          </section>

          <section className="flex flex-col gap-base">
            <h3 className="text-md font-bold text-foreground">Endereço</h3>
            <div className="flex gap-base">
              <Campo
                campo="cep"
                rotulo="CEP"
                placeholder="00000-000"
                valor={valores.cep}
                onChange={alterar}
                invalido={valores.cep !== '' && !cepValido}
                dica="Informe os 8 dígitos do CEP."
                largura="w-[140px]"
                inputMode="numeric"
              />
              <Campo
                campo="endereco"
                rotulo="Endereço"
                placeholder="Rua, avenida..."
                valor={valores.endereco}
                onChange={alterar}
              />
            </div>
            <div className="flex gap-base">
              <Campo
                campo="bairro"
                rotulo="Bairro"
                placeholder="Bairro"
                valor={valores.bairro}
                onChange={alterar}
              />
              <Campo
                campo="numero"
                rotulo="Número"
                placeholder="Nº"
                valor={valores.numero}
                onChange={alterar}
                largura="w-[140px]"
              />
            </div>
            <div className="flex gap-base">
              <Campo
                campo="cidade"
                rotulo="Cidade"
                placeholder="Cidade"
                valor={valores.cidade}
                onChange={alterar}
              />
              <Campo
                campo="uf"
                rotulo="UF"
                placeholder="UF"
                valor={valores.uf}
                onChange={alterar}
                largura="w-[100px]"
              />
            </div>
          </section>
        </div>

        <footer className="flex h-[76px] shrink-0 items-center justify-end gap-sm border-t border-border px-lg">
          <Button
            type="button"
            variant="secondary"
            className="rounded-full px-md py-sm text-lg font-semibold"
            onClick={onFechar}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="gap-xs rounded-full px-md py-sm text-lg font-semibold"
            data-testid="salvar-cliente"
            disabled={!podeEnviar}
          >
            <Check className="size-4.5" aria-hidden="true" />
            Salvar cliente
          </Button>
        </footer>
      </form>
    </div>
  );
}

interface CampoProps {
  readonly campo: CampoCadastro;
  readonly rotulo: string;
  readonly placeholder: string;
  readonly valor: string;
  readonly onChange: (campo: CampoCadastro, valor: string) => void;
  readonly invalido?: boolean;
  readonly dica?: string;
  readonly largura?: string;
  readonly autoFocus?: boolean;
  readonly inputMode?: 'numeric' | 'tel';
}

/** Réplica do componente "Text Field" do Pencil (nó `d31Pi5`). */
function Campo({
  campo,
  rotulo,
  placeholder,
  valor,
  onChange,
  invalido = false,
  dica,
  largura = 'flex-1',
  autoFocus = false,
  inputMode,
}: CampoProps): ReactElement {
  return (
    <label className={cn('flex min-w-0 flex-col gap-[7px]', largura)}>
      <span className="text-base font-semibold text-foreground">{rotulo}</span>
      <input
        className={cn(
          'h-[46px] rounded-lg border bg-background px-[14px] text-lg outline-none placeholder:text-[var(--cc-color-muted)] focus-visible:border-ring',
          invalido ? 'border-destructive' : 'border-border',
        )}
        data-testid={`campo-cadastro-${campo}`}
        autoComplete="off"
        autoFocus={autoFocus}
        {...(inputMode ? { inputMode } : {})}
        placeholder={placeholder}
        value={valor}
        aria-invalid={invalido}
        onChange={(evento) => {
          onChange(campo, evento.target.value);
        }}
      />
      {invalido && dica !== undefined ? (
        <span className="text-sm text-destructive">{dica}</span>
      ) : null}
    </label>
  );
}
