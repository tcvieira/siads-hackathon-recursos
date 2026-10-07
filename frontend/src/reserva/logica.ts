/**
 * Validação client-side do formulário de reserva (R2) e filtro de recursos (RN9).
 *
 * Espelha as regras básicas do domínio para dar feedback imediato ao solicitante;
 * a validação definitiva (RN5/RN6/RN8, conflitos) é do servidor via
 * POST /reservas/validar. Puro e testável: recebe `agora` injetado.
 *
 * Os campos/códigos seguem os contratos de `../api/tipos.ts`.
 */
import type { Config, Erro, Recurso, ReservaEntrada } from '../api/tipos'

export const FINALIDADE_MAX = 200

function hhmmParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Recursos oferecidos para um ambiente (RN9): sem vínculo = todos; com vínculo = só os ambientes vinculados. */
export function recursosOferecidos(
  recursos: Recurso[],
  ambienteId: string | null,
): Recurso[] {
  return recursos.filter((r) => {
    if (!r.ativo) return false
    if (r.ambientesVinculados.length === 0) return true
    return ambienteId !== null && r.ambientesVinculados.includes(ambienteId)
  })
}

/**
 * Valida a entrada da reserva no client (R2). Retorna lista de `Erro` com o
 * mesmo shape do servidor, para o resumo de erros reaproveitar a estrutura.
 * `agora` e `config` permitem checar faixa (RN3) e antecedência (RN4).
 */
export function validarReserva(
  reserva: ReservaEntrada,
  recursos: Recurso[],
  config: Config,
  agora: Date,
): Erro[] {
  const erros: Erro[] = []

  // Finalidade (R2.2)
  const finalidade = reserva.finalidade?.trim() ?? ''
  if (finalidade.length === 0) {
    erros.push({ campo: 'finalidade', codigo: 'CAMPO_OBRIGATORIO', mensagem: 'Informe a finalidade.' })
  } else if (reserva.finalidade.length > FINALIDADE_MAX) {
    erros.push({
      campo: 'finalidade',
      codigo: 'CAMPO_OBRIGATORIO',
      mensagem: `Finalidade com no máximo ${FINALIDADE_MAX} caracteres.`,
    })
  }

  // Participantes (R2.2)
  if (!Number.isInteger(reserva.participantes) || reserva.participantes < 1) {
    erros.push({
      campo: 'participantes',
      codigo: 'CAMPO_OBRIGATORIO',
      mensagem: 'Participantes deve ser um inteiro maior ou igual a 1.',
    })
  }

  // Complemento obrigatório quando "Não solicitado / local próprio" (RN2)
  if (reserva.ambienteId === null) {
    if (!reserva.complemento || reserva.complemento.trim().length === 0) {
      erros.push({
        campo: 'complemento',
        codigo: 'CAMPO_OBRIGATORIO',
        mensagem: 'Complemento do ambiente é obrigatório quando não há ambiente.',
      })
    }
  }

  // Períodos (RN1, RN3, RN4)
  if (reserva.periodos.length === 0) {
    erros.push({ campo: 'periodos', codigo: 'PERIODO_INVALIDO', mensagem: 'Adicione ao menos um período.' })
  }
  const faixaIni = hhmmParaMin(config.faixaInicio)
  const faixaFim = hhmmParaMin(config.faixaFim)
  const limiteAntecedencia = new Date(agora.getTime() + config.antecedenciaMin * 60_000)

  reserva.periodos.forEach((p, idx) => {
    const inicio = new Date(p.inicio)
    const termino = new Date(p.termino)
    if (!(termino.getTime() > inicio.getTime())) {
      erros.push({
        campo: 'periodos',
        periodoIndex: idx,
        codigo: 'PERIODO_INVALIDO',
        mensagem: 'O término deve ser depois do início.',
      })
      return
    }
    const iniMin = inicio.getHours() * 60 + inicio.getMinutes()
    const fimMin = termino.getHours() * 60 + termino.getMinutes()
    if (iniMin < faixaIni || fimMin > faixaFim) {
      erros.push({
        campo: 'periodos',
        periodoIndex: idx,
        codigo: 'FORA_FAIXA',
        mensagem: `Horário fora da faixa permitida (${config.faixaInicio}–${config.faixaFim}).`,
      })
    }
    if (inicio.getTime() < limiteAntecedencia.getTime()) {
      erros.push({
        campo: 'periodos',
        periodoIndex: idx,
        codigo: 'SEM_ANTECEDENCIA',
        mensagem: `O início deve respeitar a antecedência mínima de ${config.antecedenciaMin} min.`,
      })
    }
  })

  // Recursos: vínculo com ambiente (RN9) e quantidade (R2.6)
  const porId = new Map(recursos.map((r) => [r.id, r]))
  const oferecidos = new Set(recursosOferecidos(recursos, reserva.ambienteId).map((r) => r.id))
  reserva.recursos.forEach((item) => {
    const rec = porId.get(item.recursoId)
    if (!rec || !rec.ativo) {
      erros.push({ campo: 'recursos', codigo: 'CAMPO_OBRIGATORIO', mensagem: `Recurso ${item.recursoId} inválido.` })
      return
    }
    if (!oferecidos.has(rec.id)) {
      erros.push({
        campo: 'recursos',
        codigo: 'RECURSO_INDISPONIVEL_AMBIENTE',
        mensagem: `${rec.desc} não está disponível para o ambiente escolhido.`,
      })
    }
    if (!rec.limitado && item.qtd !== 1) {
      erros.push({ campo: 'recursos', codigo: 'CAMPO_OBRIGATORIO', mensagem: `${rec.desc} não é limitado; quantidade deve ser 1.` })
    }
    if (rec.limitado && item.qtd < 1) {
      erros.push({ campo: 'recursos', codigo: 'CAMPO_OBRIGATORIO', mensagem: `Quantidade de ${rec.desc} deve ser ≥ 1.` })
    }
  })

  return erros
}
