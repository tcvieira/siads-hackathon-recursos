import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import App from '@/App'
import { usarMocks } from '@/config'

/**
 * Em dev, roda o axe-core a cada mudança do DOM (com espera) e lista as violações A/AA no console.
 * O @axe-core/react não funciona com React 19 (usa findDOMNode e troca React.createElement).
 */
async function vigiarAcessibilidade() {
  const { default: axe } = await import('axe-core')
  let espera: number | undefined
  let rodando = false
  const rodar = async () => {
    if (rodando) return
    rodando = true
    const { violations } = await axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
    })
    rodando = false
    for (const v of violations) {
      console.warn(`[axe] ${v.impact}: ${v.help}`, v.nodes.map((n) => n.target.join(' ')), v.helpUrl)
    }
  }
  new MutationObserver(() => {
    clearTimeout(espera)
    espera = window.setTimeout(rodar, 1000)
  }).observe(document.body, { subtree: true, childList: true })
}

async function iniciar() {
  if (usarMocks) {
    const { worker } = await import('@/mocks/navegador')
    // Sem service worker (ex.: navegador embutido), a tela abre e as consultas mostram o erro.
    await worker.start({ quiet: true, onUnhandledFrame: 'bypass' }).catch((erro: unknown) => console.error(erro))
  }
  if (import.meta.env.DEV) void vigiarAcessibilidade()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void iniciar()
