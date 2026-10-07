/** Contexto da sessão e hooks de acesso (o provedor fica em sessao.tsx). */
import { createContext, useContext } from 'react'
import type { Papel, Usuario } from '@/auth/usuario'

export type PassoEntrada = 'concluido' | 'nova-senha'

export interface Sessao {
  usuario: Usuario | null
  carregando: boolean
  erro: string | null
  /** Login por e-mail e senha (SRP). `'nova-senha'`: conta em primeiro acesso, falta `confirmarNovaSenha`. */
  entrar: (email: string, senha: string) => Promise<PassoEntrada>
  confirmarNovaSenha: (novaSenha: string) => Promise<void>
  sair: () => void
  /** Só no modo mock: troca o papel do usuário simulado. */
  trocarPapel: ((papel: Papel) => void) | null
}

export const ContextoSessao = createContext<Sessao | null>(null)

export function useSessao(): Sessao {
  const sessao = useContext(ContextoSessao)
  if (!sessao) throw new Error('useSessao fora do ProvedorSessao')
  return sessao
}

/** Usuário logado (as rotas protegidas só renderizam com usuário). */
export function useUsuario(): Usuario {
  const { usuario } = useSessao()
  if (!usuario) throw new Error('useUsuario sem usuário logado')
  return usuario
}
