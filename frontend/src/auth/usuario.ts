/** Usuário logado, montado das claims do ID token (R1.3). */

export const PAPEIS = ['solicitante', 'atendente', 'admin'] as const
export type Papel = (typeof PAPEIS)[number]

export interface Usuario {
  sub: string
  email: string
  grupos: Papel[]
  /** `custom:setorId` (só atendente). */
  setorId: string | null
  /** Papel principal: admin > atendente > solicitante. */
  papel: Papel
}

/** `cognito:groups` vem como array no ID token, mas também aceitamos a string "[a b]". */
export function lerGrupos(valor: unknown): Papel[] {
  const lista = Array.isArray(valor)
    ? valor.map(String)
    : typeof valor === 'string'
      ? valor.replace(/^\[|\]$/g, '').split(/[\s,]+/)
      : []
  return PAPEIS.filter((p) => lista.includes(p))
}

export function papelPrincipal(grupos: Papel[]): Papel {
  return grupos.includes('admin') ? 'admin' : grupos.includes('atendente') ? 'atendente' : 'solicitante'
}

export function usuarioDasClaims(claims: Record<string, unknown>): Usuario {
  const grupos = lerGrupos(claims['cognito:groups'])
  return {
    sub: String(claims.sub ?? ''),
    email: String(claims.email ?? ''),
    grupos,
    setorId: claims['custom:setorId'] ? String(claims['custom:setorId']) : null,
    papel: papelPrincipal(grupos),
  }
}

/** Contas de demo simuladas no modo mock (mesmos e-mails do Cognito; setor 1 = SMSG). */
export const USUARIOS_MOCK: Record<Papel, Usuario> = {
  solicitante: {
    sub: 'mock-solicitante',
    email: 'solicitante@example.com',
    grupos: ['solicitante'],
    setorId: null,
    papel: 'solicitante',
  },
  atendente: {
    sub: 'mock-atendente',
    email: 'atendente@example.com',
    grupos: ['atendente'],
    setorId: '1',
    papel: 'atendente',
  },
  admin: { sub: 'mock-admin', email: 'admin@example.com', grupos: ['admin'], setorId: null, papel: 'admin' },
}

/** Telas que o papel acessa (R1.4): o admin também acessa as do solicitante. */
export function pode(usuario: Usuario | null, papeis: readonly Papel[]): boolean {
  return !!usuario && usuario.grupos.some((g) => papeis.includes(g))
}
