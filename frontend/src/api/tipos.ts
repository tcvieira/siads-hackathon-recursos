/**
 * Contratos congelados da API (Fase 0).
 *
 * Mesmo shape de `backend/src/dominio/modelos.py`, campo a campo; mudar um exige mudar o
 * outro e avisar as frentes. Fontes: design.md §3 (modelo de dados) e §4 (API e erros).
 * Datas: strings ISO 8601 com offset −03:00 (`YYYY-MM-DDTHH:MM:SS-03:00`).
 * Campos opcionais do Python (`X | None = None`) aparecem aqui como `X | null`.
 */

// --- Códigos de erro do domínio (design.md §4) ---------------------------------------------

export const CODIGOS_ERRO = [
  'PERIODO_INVALIDO',
  'CAMPO_OBRIGATORIO',
  'FORA_FAIXA',
  'SEM_ANTECEDENCIA',
  'RECURSO_INDISPONIVEL_AMBIENTE',
  'CONFLITO_AMBIENTE',
  'RECURSO_ESGOTADO',
  'RESERVA_ENCERRADA',
  'CANCELAMENTO_SEM_ANTECEDENCIA',
] as const

export type CodigoErro = (typeof CODIGOS_ERRO)[number]

/** Item de `erros[]` nas respostas 400/409 e em POST /reservas/validar. */
export interface Erro {
  campo: string
  codigo: CodigoErro
  mensagem: string
  periodoIndex?: number | null
  sugestao?: string | null
}

/** Corpo das respostas 400 e 409 de POST/PUT /reservas e DELETE /reservas/{id}. */
export interface RespostaErro {
  erros: Erro[]
}

/** Resposta de POST /reservas/validar. */
export interface ResultadoValidacao {
  ok: boolean
  erros: Erro[]
}

// --- Catálogo (CAT#…) -------------------------------------------------------------------

/** CAT#AMBI. `paiId` define a hierarquia (RN6); `setores` são os ids de CAT#ENVO. */
export interface Ambiente {
  id: string
  desc: string
  ativo: boolean
  paiId?: string | null
  setores: string[]
}

/** CAT#DISP. `icone` é o nome do arquivo em public/icones/. */
export interface Disposicao {
  id: string
  desc: string
  ativo: boolean
  icone: string
}

/** Grupo usado para agrupar recursos no formulário (`Recurso.grupoId`). */
export interface GrupoRecurso {
  id: string
  desc: string
}

/** CAT#RECU. Sem `ambientesVinculados` vale para todos os ambientes (RN9). */
export interface Recurso {
  id: string
  desc: string
  grupoId: string
  limitado: boolean
  disponibilidade: number
  ativo: boolean
  icone: string
  ambientesVinculados: string[]
  setores: string[]
}

/** CAT#ENVO. O `email` nunca sai em GET /catalogo. */
export interface Setor {
  id: string
  desc: string
  email: string
  ativo: boolean
}

/** CAT#VINC: SK `AMBI#<alvoId>#ENVO#<setorId>` ou `RECU#<alvoId>#ENVO#<setorId>`. */
export interface VinculoSetor {
  tipo: 'AMBI' | 'RECU'
  alvoId: string
  setorId: string
  codigoServicoSnp?: string | null
}

/** CAT#CONF / GLOBAL. Faixa em "HH:MM"; antecedência e margem em minutos. */
export interface Config {
  faixaInicio: string
  faixaFim: string
  antecedenciaMin: number
  margemMin: number
}

/** Resposta de GET /catalogo (sem e-mail de setor). */
export interface Catalogo {
  ambientes: Ambiente[]
  disposicoes: Disposicao[]
  grupos: GrupoRecurso[]
  recursos: Recurso[]
  config: Config
}

// --- Reserva (RESE#<id>) ------------------------------------------------------------------

export type StatusReserva = 'prevista' | 'em_andamento' | 'transcorrida' | 'cancelada'

/** Intervalo [inicio, termino) de uma reserva. */
export interface Periodo {
  inicio: string
  termino: string
}

/** Recurso pedido. `qtd` é 1 para recursos não limitados. */
export interface ItemRecurso {
  recursoId: string
  qtd: number
}

/**
 * Corpo de POST /reservas, PUT /reservas/{id} e POST /reservas/validar.
 * `ambienteId = null` é "Não solicitado / local próprio" e exige `complemento` (RN2).
 */
export interface ReservaEntrada {
  finalidade: string
  participantes: number
  ambienteId: string | null
  periodos: Periodo[]
  recursos: ItemRecurso[]
  complemento?: string | null
  disposicaoId?: string | null
}

/** RESE#<id> / META. `status` é calculado (RN13), não gravado. */
export interface Reserva {
  id: string
  finalidade: string
  participantes: number
  ambienteId: string | null
  periodos: Periodo[]
  recursos: ItemRecurso[]
  solicitanteSub: string
  solicitanteEmail: string
  setoresIds: string[]
  cancelada: boolean
  versao: number
  criadoEm: string
  complemento?: string | null
  disposicaoId?: string | null
  status?: StatusReserva | null
}

// --- Ocupações (OCUP#…) -------------------------------------------------------------------

/** OCUP#AMBI#<a> ou OCUP#RECU#<r>. `qtd` só importa para recurso limitado (RN8). */
export interface Ocupacao {
  inicio: string
  termino: string
  reservaId: string
  qtd: number
}

/** Item de GET /ambientes/{id}/ocupacao: sem dados da reserva. */
export interface PeriodoOcupado {
  ambienteId: string
  inicio: string
  termino: string
}

// --- Notificações (RESE#<id> / EMAIL#… e SNP#…) -------------------------------------------

export type TipoEmail = 'criada' | 'alterada' | 'cancelada'
export type SituacaoSnp = 'ativo' | 'cancelado'

export interface Alteracao {
  campo: string
  antes: string
  depois: string
}

/** RESE#<id> / EMAIL#<ts>#<setor>. O frontend mostra os campos, nunca o `html`. */
export interface EmailSimulado {
  reservaId: string
  ts: string
  setorId: string
  para: string
  assunto: string
  tipo: TipoEmail
  html: string
  alteracoes: Alteracao[]
}

/** RESE#<id> / SNP#<setor>. `numero` no formato SNP-2026-NNNNN (RN11). */
export interface PedidoSnp {
  reservaId: string
  setorId: string
  numero: string
  codigoServico: string
  situacao: SituacaoSnp
}

// --- Painéis ------------------------------------------------------------------------------

/** Item de GET /painel/atendimento. Para o atendente, `solicitanteEmail` vem mascarado. */
export interface CardAtendimento {
  reserva: Reserva
  pedidosSnp: PedidoSnp[]
}

/** Resposta de GET /notificacoes. */
export interface CaixaNotificacoes {
  emails: EmailSimulado[]
  pedidosSnp: PedidoSnp[]
}
