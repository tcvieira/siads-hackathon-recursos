/**
 * Sessão do usuário. Modo real: react-oidc-context (Authorization Code + PKCE, R1.1) com o
 * Cognito. Modo mock: usuário simulado com troca de papel, sem Cognito.
 * As telas usam `useSessao()`/`useUsuario()` de auth/contexto.ts.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { AuthProvider, useAuth } from 'react-oidc-context'
import { ContextoSessao, type Sessao } from '@/auth/contexto'
import { gravarPapelMock, lerPapelMock } from '@/auth/papelMock'
import { USUARIOS_MOCK, usuarioDasClaims, type Papel } from '@/auth/usuario'
import { cognito, usarMocks } from '@/config'

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
    entrar: () => {},
    sair: () => trocarPapel('solicitante'),
    trocarPapel,
  }
  return <ContextoSessao.Provider value={sessao}>{children}</ContextoSessao.Provider>
}

function SessaoOidc({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const clienteQuery = useQueryClient()
  const sessao: Sessao = {
    usuario: auth.user ? usuarioDasClaims(auth.user.profile as Record<string, unknown>) : null,
    carregando: auth.isLoading || !!auth.activeNavigator,
    erro: auth.error ? 'Não foi possível concluir o login. Tente entrar de novo.' : null,
    entrar: () => void auth.signinRedirect(),
    sair: () => {
      clienteQuery.clear()
      void auth.removeUser().then(() => {
        // Endpoint /logout do domínio hospedado do Cognito (design.md §7).
        const qs = new URLSearchParams({ client_id: cognito.clientId, logout_uri: cognito.redirectUri })
        window.location.assign(`${cognito.dominio}/logout?${qs}`)
      })
    },
    trocarPapel: null,
  }
  return <ContextoSessao.Provider value={sessao}>{children}</ContextoSessao.Provider>
}

export function ProvedorSessao({ children }: { children: ReactNode }) {
  if (usarMocks) return <SessaoMock>{children}</SessaoMock>
  return (
    <AuthProvider
      authority={cognito.authority}
      client_id={cognito.clientId}
      redirect_uri={cognito.redirectUri}
      response_type="code"
      scope="openid email profile"
      onSigninCallback={() => window.history.replaceState({}, document.title, window.location.pathname)}
    >
      <SessaoOidc>{children}</SessaoOidc>
    </AuthProvider>
  )
}
