import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GooeyToaster } from 'goey-toast';
import { App } from './App';
// Bones gerados por `npm run bones` (CLI do Boneyard). Sem este import,
// `<Skeleton name="pdv-venda">` não acha a geometria capturada e cai no
// `fallback` estático — sem shimmer nenhum (AUTH-05).
import './bones/registry';
import './styles/global.css';
// Obrigatório uma única vez no entry, senão os toasts saem sem estilo.
import 'goey-toast/styles.css';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Elemento #root não encontrado em index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
    {/* Montado uma única vez perto da raiz — as features de venda, pagamento e
        finalização disparam toasts por `gooeyToast` sem remontar nada. */}
    <GooeyToaster position="bottom-right" />
  </StrictMode>,
);
