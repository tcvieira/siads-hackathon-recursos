/** Telas fora do leiaute logado: configuração ausente, carregando e login (R1.1). */
import { useEffect, type ReactNode } from 'react'
import { useSessao } from '@/auth/contexto'
import { TituloPagina } from '@/componentes/TituloPagina'
import { Button } from '@/components/ui/button'

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

/** Sem sessão: redireciona para o login do Cognito; com erro, oferece tentar de novo. */
export function TelaLogin() {
  const { entrar, erro } = useSessao()
  useEffect(() => {
    if (!erro) entrar()
  }, [erro, entrar])
  return (
    <TelaAvulsa titulo="Entrar no SISGARES">
      {erro ? <p role="alert">{erro}</p> : <output className="block">Redirecionando para a página de login…</output>}
      <Button onClick={entrar}>Entrar</Button>
    </TelaAvulsa>
  )
}
