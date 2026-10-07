/** Telas fora do leiaute logado: configuração ausente e carregando (o login fica em TelaLogin.tsx). */
import type { ReactNode } from 'react'
import { TituloPagina } from '@/componentes/TituloPagina'

function TelaAvulsa({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-12">
      <p className="text-lg font-semibold">SISGARES</p>
      <TituloPagina>{titulo}</TituloPagina>
      {children}
    </main>
  )
}

export function ConfiguracaoAusente({ nomes }: { nomes: string[] }) {
  return (
    <TelaAvulsa titulo="Configuração ausente">
      <p role="alert">
        O frontend está no modo real (API e Cognito), mas faltam variáveis de ambiente no <code>.env</code> da raiz
        do repositório:
      </p>
      <ul className="list-disc pl-6">
        {nomes.map((nome) => (
          <li key={nome}>
            <code>{nome}</code>
          </li>
        ))}
      </ul>
      <p>
        Preencha as variáveis e reinicie o <code>npm run dev</code>, ou use os dados simulados com{' '}
        <code>VITE_USE_MOCKS=1</code>.
      </p>
    </TelaAvulsa>
  )
}

export function TelaCarregando() {
  return (
    <TelaAvulsa titulo="Carregando">
      <output className="block">Conferindo sua sessão…</output>
    </TelaAvulsa>
  )
}
