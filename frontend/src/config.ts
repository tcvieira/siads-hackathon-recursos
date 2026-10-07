/**
 * Configuração do frontend (design.md §7). Só variáveis VITE_* chegam ao navegador.
 *
 * Mocks (MSW) ligados com VITE_USE_MOCKS=1 ou, em dev, quando não há VITE_API_URL
 * (o .env da raiz pode não ter as VITE_*). VITE_USE_MOCKS=0 força a API real.
 */
const env = import.meta.env

export const usarMocks =
  env.VITE_USE_MOCKS === '1' || (env.DEV && env.VITE_USE_MOCKS !== '0' && !env.VITE_API_URL)

/** Prefixo das rotas da API. Nos mocks é `/api`, para não confundir com as rotas da SPA. */
export const apiUrl = usarMocks ? '/api' : String(env.VITE_API_URL ?? '').replace(/\/+$/, '')

export const cognito = {
  authority: String(env.VITE_COGNITO_AUTHORITY ?? ''),
  clientId: String(env.VITE_COGNITO_CLIENT_ID ?? ''),
  /** URL do domínio hospedado (login e /logout), sem barra final. */
  dominio: String(env.VITE_COGNITO_DOMAIN ?? '').replace(/\/+$/, ''),
  redirectUri: String(env.VITE_REDIRECT_URI || `${window.location.origin}/`),
}

/** Nomes das variáveis que faltam para o modo real (vazio nos mocks). */
export const configuracaoAusente: string[] = usarMocks
  ? []
  : (
      [
        ['VITE_API_URL', apiUrl],
        ['VITE_COGNITO_AUTHORITY', cognito.authority],
        ['VITE_COGNITO_CLIENT_ID', cognito.clientId],
        ['VITE_COGNITO_DOMAIN', cognito.dominio],
      ] as const
    )
      .filter(([, valor]) => !valor)
      .map(([nome]) => nome)
