/**
 * Sessão do usuário. Modo real: login próprio por SRP direto no Cognito (aws-amplify/auth, R1.1);
 * o Amplify guarda e renova os tokens. Modo mock: usuário simulado com troca de papel, sem Cognito.
 * As telas usam `useSessao()`/`useUsuario()` de auth/contexto.ts.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Amplify } from 'aws-amplify'
import { confirmSignIn, fetchAuthSession, signIn, signOut } from 'aws-amplify/auth'
import { useEffect, useState, type ReactNode } from 'react'
import { ContextoSessao, type PassoEntrada, type Sessao } from '@/auth/contexto'
import { mensagemErroAuth } from '@/auth/erros'
import { gravarPapelMock, lerPapelMock } from '@/auth/papelMock'
import { USUARIOS_MOCK, usuarioDasClaims, type Papel, type Usuario } from '@/auth/usuario'
import { cognito, configuracaoAusente, usarMocks } from '@/config'

if (!usarMocks && !configuracaoAusente.length) {
  Amplify.configure({ Auth: { Cognito: { userPoolId: cognito.userPoolId, userPoolClientId: cognito.clientId } } })
}

function SessaoMock({ children }: { children: ReactNode }) {
  const clienteQuery = useQueryClient()
  const [papel, setPapel] = useState(lerPapelMock)
  const trocarPapel = (novo: Papel) => {
    gravarPapelMock(novo)
    clienteQuery.clear() // os dados do papel anterior não valem para o novo
    setPapel(novo)
  }
  const sessao: Sessao = {
    usuario: USUARIOS_MOCK[papel],
    carregando: false,
    erro: null,
    entrar: async () => 'concluido',
    confirmarNovaSenha: async () => {},
    sair: () => trocarPapel('solicitante'),
    trocarPapel,
  }
  return <ContextoSessao.Provider value={sessao}>{children}</ContextoSessao.Provider>
}

/** Usuário das claims do ID token da sessão atual (renovada pelo refresh token); null sem sessão. */
async function usuarioAtual(): Promise<Usuario | null> {
  const idToken = (await fetchAuthSession()).tokens?.idToken
  return idToken ? usuarioDasClaims(idToken.payload as Record<string, unknown>) : null
}

function SessaoCognito({ children }: { children: ReactNode }) {
  const clienteQuery = useQueryClient()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    usuarioAtual()
      .then(setUsuario)
      .catch(() => setErro('Não foi possível conferir sua sessão. Entre novamente.'))
      .finally(() => setCarregando(false))
  }, [])

  /** Encerra o login com o usuário já autenticado; `DONE` é o único passo que o completa. */
  const concluir = async (): Promise<PassoEntrada> => {
    const atual = await usuarioAtual()
    if (!atual) throw new Error('sem sessão')
    clienteQuery.clear()
    setErro(null)
    setUsuario(atual)
    return 'concluido'
  }

  const proximoPasso = async (passo: string): Promise<PassoEntrada> => {
    if (passo === 'DONE') return concluir()
    if (passo === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') return 'nova-senha'
    const erro = new Error(passo)
    erro.name = passo === 'RESET_PASSWORD' ? 'PasswordResetRequiredException' : 'PassoNaoSuportado'
    throw erro
  }

  const sessao: Sessao = {
    usuario,
    carregando,
    erro,
    entrar: async (email, senha) => {
      try {
        await signOut().catch(() => {}) // signIn recusa se sobrou uma sessão local
        const { nextStep } = await signIn({ username: email.trim(), password: senha })
        return await proximoPasso(nextStep.signInStep)
      } catch (e) {
        throw new Error(mensagemErroAuth(e))
      }
    },
    confirmarNovaSenha: async (novaSenha) => {
      try {
        const { nextStep } = await confirmSignIn({ challengeResponse: novaSenha })
        await proximoPasso(nextStep.signInStep)
      } catch (e) {
        throw new Error(mensagemErroAuth(e, 'nova-senha'))
      }
    },
    sair: () => {
      clienteQuery.clear()
      setUsuario(null)
      void signOut().catch(() => {})
    },
    trocarPapel: null,
  }
  return <ContextoSessao.Provider value={sessao}>{children}</ContextoSessao.Provider>
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  return usarMocks ? <SessaoMock>{children}</SessaoMock> : <SessaoCognito>{children}</SessaoCognito>
}
