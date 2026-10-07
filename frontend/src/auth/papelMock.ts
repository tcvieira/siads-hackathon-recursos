/** Papel do usuário simulado (modo mock), guardado na sessão do navegador. */
import { PAPEIS, type Papel } from '@/auth/usuario'

const CHAVE = 'sisgares:papel-mock'

export function lerPapelMock(): Papel {
  try {
    const valor = sessionStorage.getItem(CHAVE)
    return PAPEIS.find((p) => p === valor) ?? 'solicitante'
  } catch {
    return 'solicitante'
  }
}

export function gravarPapelMock(papel: Papel): void {
  try {
    sessionStorage.setItem(CHAVE, papel)
  } catch {
    // sem sessionStorage: o papel volta ao padrão no próximo carregamento
  }
}
