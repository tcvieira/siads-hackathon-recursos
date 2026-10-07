/**
 * Cliente HTTP da API: envia o ID token em `Authorization: Bearer` (R1.2) e transforma
 * as respostas de erro em `ErroApi` tipado (400/409 → `RespostaErro`; 403/404 → `{mensagem}`).
 */
import { fetchAuthSession, signOut } from 'aws-amplify/auth'
import type { Erro, RespostaErro } from '@/api/tipos'
import { lerPapelMock } from '@/auth/papelMock'
import { apiUrl, usarMocks } from '@/config'

export class ErroApi extends Error {
  status: number
  /** Erros do domínio (400/409); vazio nos demais casos. */
  erros: Erro[]

  constructor(status: number, mensagem: string, erros: Erro[] = []) {
    super(mensagem)
    this.name = 'ErroApi'
    this.status = status
    this.erros = erros
  }
}

/** ID token atual; o Amplify renova com o refresh token quando está perto de expirar. */
export async function tokenAtual(): Promise<string | null> {
  if (usarMocks) return `mock:${lerPapelMock()}`
  try {
    return (await fetchAuthSession()).tokens?.idToken?.toString() ?? null
  } catch {
    return null
  }
}

const MENSAGENS: Record<number, string> = {
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Registro não encontrado.',
}

export async function requisitar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenAtual()
  let resposta: Response
  try {
    resposta = await fetch(`${apiUrl}${caminho}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ErroApi(0, 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.')
  }
  const ehJson = resposta.headers.get('Content-Type')?.includes('json')
  const corpo: unknown = ehJson ? await resposta.json().catch(() => null) : null
  if (resposta.ok && (ehJson || resposta.status === 204)) return corpo as T
  if (resposta.ok) throw new ErroApi(resposta.status, 'Resposta inesperada do servidor (a API está configurada?).')

  if (resposta.status === 401 && token && !usarMocks) {
    // Token recusado mesmo após a renovação: encerra a sessão e volta para a tela de login.
    void signOut().finally(() => window.location.assign('/'))
  }
  const erros = (corpo as Partial<RespostaErro> | null)?.erros ?? []
  const mensagem =
    erros[0]?.mensagem ??
    (corpo as { mensagem?: string } | null)?.mensagem ??
    MENSAGENS[resposta.status] ??
    `Erro inesperado do servidor (${resposta.status}).`
  throw new ErroApi(resposta.status, mensagem, erros)
}
