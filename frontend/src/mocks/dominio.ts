/**
 * Regras do domínio no mock, portadas de backend/src/dominio/{regras,conflitos,hierarquia}.py
 * com as mesmas mensagens, campos e sugestões (RN1–RN9, RN12, RN13).
 */
import type { Erro, Periodo, Recurso, Reserva, ReservaEntrada, StatusReserva } from '@/api/tipos'
import { formatarData, formatarHora, formatarPeriodo, paraIso, somarMinutos } from '@/lib/datas'
import { catalogo } from '@/mocks/catalogo'

const { config } = catalogo
const MAX_LIMITADOS = 5
const TAMANHO_FINALIDADE = 200
const ms = Date.parse

export const ambientePorId = new Map(catalogo.ambientes.map((a) => [a.id, a]))
export const recursoPorId = new Map(catalogo.recursos.map((r) => [r.id, r]))

/** O próprio ambiente, ancestrais e descendentes (RN6). Irmãos não entram. */
export function familia(ambienteId: string): Set<string> {
  const resultado = new Set([ambienteId])
  for (let pai = ambientePorId.get(ambienteId)?.paiId; pai && !resultado.has(pai); pai = ambientePorId.get(pai)?.paiId) {
    resultado.add(pai)
  }
  const fila = [ambienteId]
  while (fila.length) {
    const atual = fila.shift()!
    for (const a of catalogo.ambientes) {
      if (a.paiId === atual && !resultado.has(a.id)) {
        resultado.add(a.id)
        fila.push(a.id)
      }
    }
  }
  return resultado
}

const hhmmLocal = (iso: string) => formatarHora(iso)
const descricao = (n: number, p: Periodo) =>
  `período ${n + 1} (${formatarData(p.inicio)} ${formatarHora(p.inicio)}–${formatarData(p.termino)} ${formatarHora(p.termino)})`

/** Primeiro início possível: grade de 30 min dentro da faixa (RN3). */
function primeiroHorario(minimo: number): string {
  const passo = 30 * 60 * 1000
  let iso = paraIso(Math.ceil(minimo / passo) * passo)
  if (hhmmLocal(iso) < config.faixaInicio) iso = `${iso.slice(0, 10)}T${config.faixaInicio}:00-03:00`
  else if (hhmmLocal(iso) >= config.faixaFim) iso = `${somarMinutos(iso, 24 * 60).slice(0, 10)}T${config.faixaInicio}:00-03:00`
  return iso
}

function validarPeriodos(entrada: ReservaEntrada, agora: number, alterados: Set<number> | null): Erro[] {
  if (!entrada.periodos?.length) {
    return [{ campo: 'periodos', codigo: 'PERIODO_INVALIDO', mensagem: 'Informe ao menos um período.' }]
  }
  const erros: Erro[] = []
  const limite = agora + config.antecedenciaMin * 60 * 1000
  entrada.periodos.forEach((p, n) => {
    if (Number.isNaN(ms(p.inicio)) || Number.isNaN(ms(p.termino))) {
      erros.push({ campo: 'periodos', codigo: 'PERIODO_INVALIDO', periodoIndex: n, mensagem: `O período ${n + 1} tem data ou hora inválida.` })
      return
    }
    if (ms(p.termino) <= ms(p.inicio)) {
      erros.push({
        campo: 'periodos',
        codigo: 'PERIODO_INVALIDO',
        periodoIndex: n,
        mensagem: `No período ${n + 1}, o término (${formatarData(p.termino)} ${formatarHora(p.termino)}) deve ser depois do início (${formatarData(p.inicio)} ${formatarHora(p.inicio)}).`,
      })
      return
    }
    const fora = (
      [
        ['início', p.inicio],
        ['término', p.termino],
      ] as const
    )
      .filter(([, iso]) => hhmmLocal(iso) < config.faixaInicio || hhmmLocal(iso) > config.faixaFim)
      .map(([nome]) => nome)
    if (fora.length) {
      erros.push({
        campo: 'periodos',
        codigo: 'FORA_FAIXA',
        periodoIndex: n,
        mensagem: `O ${fora.join(' e o ')} do ${descricao(n, p)} devem ficar entre ${config.faixaInicio} e ${config.faixaFim}.`,
      })
    }
    if ((alterados === null || alterados.has(n)) && ms(p.inicio) < limite) {
      const sugestao = primeiroHorario(limite)
      erros.push({
        campo: 'periodos',
        codigo: 'SEM_ANTECEDENCIA',
        periodoIndex: n,
        mensagem: `O ${descricao(n, p)} precisa começar com pelo menos ${config.antecedenciaMin} minutos de antecedência.`,
        sugestao: `a partir de ${formatarHora(sugestao)} de ${formatarData(sugestao)}`,
      })
    }
  })
  return erros
}

function validarCampos(entrada: ReservaEntrada): Erro[] {
  const erros: Erro[] = []
  const finalidade = (entrada.finalidade ?? '').trim()
  if (finalidade.length < 1 || finalidade.length > TAMANHO_FINALIDADE) {
    erros.push({ campo: 'finalidade', codigo: 'CAMPO_OBRIGATORIO', mensagem: `Informe a finalidade, com 1 a ${TAMANHO_FINALIDADE} caracteres.` })
  }
  if (!Number.isInteger(entrada.participantes) || entrada.participantes < 1) {
    erros.push({ campo: 'participantes', codigo: 'CAMPO_OBRIGATORIO', mensagem: 'Informe o número de participantes (inteiro, 1 ou mais).' })
  }
  if (entrada.ambienteId == null) {
    if (!(entrada.complemento ?? '').trim()) {
      erros.push({ campo: 'complemento', codigo: 'CAMPO_OBRIGATORIO', mensagem: 'Sem ambiente (local próprio), informe o complemento com o local.' })
    }
  } else if (!ambientePorId.get(entrada.ambienteId)?.ativo) {
    erros.push({ campo: 'ambienteId', codigo: 'CAMPO_OBRIGATORIO', mensagem: 'Escolha um ambiente ativo ou "Não solicitado / local próprio".' })
  }
  if (entrada.disposicaoId != null && !catalogo.disposicoes.find((d) => d.id === entrada.disposicaoId)?.ativo) {
    erros.push({ campo: 'disposicaoId', codigo: 'CAMPO_OBRIGATORIO', mensagem: 'Escolha uma disposição ativa.' })
  }
  return erros
}

export const oferecido = (recurso: Recurso, ambienteId: string | null | undefined) =>
  !recurso.ambientesVinculados.length || (!!ambienteId && recurso.ambientesVinculados.includes(ambienteId))

function validarRecursos(entrada: ReservaEntrada): Erro[] {
  const erros: Erro[] = []
  const vistos = new Set<string>()
  let limitados = 0
  for (const item of entrada.recursos ?? []) {
    const recurso = recursoPorId.get(item.recursoId)
    const nome = recurso?.desc ?? item.recursoId
    if (vistos.has(item.recursoId)) {
      erros.push({ campo: 'recursos', codigo: 'CAMPO_OBRIGATORIO', mensagem: `O recurso ${nome} foi pedido mais de uma vez.` })
      continue
    }
    vistos.add(item.recursoId)
    if (!recurso?.ativo) {
      erros.push({ campo: 'recursos', codigo: 'RECURSO_INDISPONIVEL_AMBIENTE', mensagem: `O recurso ${nome} não está disponível.` })
      continue
    }
    if (!oferecido(recurso, entrada.ambienteId)) {
      const local = entrada.ambienteId
        ? `no ambiente ${ambientePorId.get(entrada.ambienteId)?.desc ?? entrada.ambienteId}`
        : 'em local próprio'
      erros.push({ campo: 'recursos', codigo: 'RECURSO_INDISPONIVEL_AMBIENTE', mensagem: `O recurso ${recurso.desc} não está disponível ${local}.` })
      continue
    }
    if (recurso.limitado) {
      limitados += 1
      if (!Number.isInteger(item.qtd) || item.qtd < 1) {
        erros.push({ campo: 'recursos', codigo: 'CAMPO_OBRIGATORIO', mensagem: `Informe a quantidade de ${recurso.desc} (1 ou mais).` })
      } else if (item.qtd > recurso.disponibilidade) {
        erros.push({
          campo: 'recursos',
          codigo: 'RECURSO_ESGOTADO',
          mensagem: `${recurso.desc}: pedida ${item.qtd}, mas só existem ${recurso.disponibilidade} no total.`,
        })
      }
    } else if (item.qtd !== 1) {
      erros.push({ campo: 'recursos', codigo: 'CAMPO_OBRIGATORIO', mensagem: `O recurso ${recurso.desc} não tem quantidade: use 1.` })
    }
  }
  if (limitados > MAX_LIMITADOS) {
    erros.push({ campo: 'recursos', codigo: 'CAMPO_OBRIGATORIO', mensagem: `Peça no máximo ${MAX_LIMITADOS} recursos com quantidade limitada.` })
  }
  return erros
}

/** RN1, RN2, RN3, RN4 (só nos `alterados`; `null` = todos), RN9 e quantidades. */
export function validarBasico(entrada: ReservaEntrada, agora: number, alterados: Set<number> | null = null): Erro[] {
  return [...validarPeriodos(entrada, agora, alterados), ...validarCampos(entrada), ...validarRecursos(entrada)]
}

/** Períodos válidos (início < término), com o índice original. */
const periodosValidos = (periodos: Periodo[]) =>
  periodos.map((p, n) => ({ ...p, n })).filter((p) => ms(p.inicio) < ms(p.termino))

/** RN5 + RN6: um `CONFLITO_AMBIENTE` por período, com margem e sugestão de horário livre. */
export function conflitosAmbiente(entrada: ReservaEntrada, reservas: Iterable<Reserva>, ignorarId?: string): Erro[] {
  if (!entrada.ambienteId) return []
  const afetados = familia(entrada.ambienteId)
  const margem = config.margemMin * 60 * 1000
  const existentes = [...reservas]
    .filter((r) => !r.cancelada && r.id !== ignorarId && r.ambienteId && afetados.has(r.ambienteId))
    .flatMap((r) => r.periodos.map((p) => ({ ambienteId: r.ambienteId!, ...p })))
    .sort((a, b) => ms(a.inicio) - ms(b.inicio))
  const erros: Erro[] = []
  for (const p of periodosValidos(entrada.periodos ?? [])) {
    const choques = existentes.filter((e) => ms(p.inicio) < ms(e.termino) + margem && ms(e.inicio) < ms(p.termino) + margem)
    if (!choques.length) continue
    const ocupados = choques
      .map((e) => `${ambientePorId.get(e.ambienteId)?.desc ?? e.ambienteId} ocupado em ${formatarPeriodo(e.inicio, e.termino)}`)
      .join('; ')
    const livre = paraIso(Math.max(...choques.map((e) => ms(e.termino))) + margem)
    let sugestao = `livre a partir de ${formatarHora(livre)}`
    if (livre.slice(0, 10) !== paraIso(p.inicio).slice(0, 10)) sugestao += ` de ${formatarData(livre)}`
    erros.push({
      campo: 'periodos',
      codigo: 'CONFLITO_AMBIENTE',
      periodoIndex: p.n,
      mensagem: `Período ${p.n + 1} (${formatarPeriodo(p.inicio, p.termino)}) em conflito: ${ocupados} (margem de ${config.margemMin} min).`,
      sugestao,
    })
  }
  return erros
}

/** RN8: `RECURSO_ESGOTADO` por período em que a soma das reservas sobrepostas + qtd passa do disponível. */
export function excessoRecursos(entrada: ReservaEntrada, reservas: Iterable<Reserva>, ignorarId?: string): Erro[] {
  const lista = [...reservas].filter((r) => !r.cancelada && r.id !== ignorarId)
  const erros: Erro[] = []
  for (const item of entrada.recursos ?? []) {
    const recurso = recursoPorId.get(item.recursoId)
    if (!recurso?.limitado) continue
    for (const p of periodosValidos(entrada.periodos ?? [])) {
      // Uma reserva com vários períodos sobrepostos conta uma vez (R4.2).
      const reservado = lista
        .filter((r) => r.periodos.some((e) => ms(e.inicio) < ms(p.termino) && ms(p.inicio) < ms(e.termino)))
        .reduce((soma, r) => soma + (r.recursos.find((i) => i.recursoId === recurso.id)?.qtd ?? 0), 0)
      if (reservado + item.qtd <= recurso.disponibilidade) continue
      const disponivel = Math.max(recurso.disponibilidade - reservado, 0)
      erros.push({
        campo: 'recursos',
        codigo: 'RECURSO_ESGOTADO',
        periodoIndex: p.n,
        mensagem: `${recurso.desc} no período ${p.n + 1} (${formatarPeriodo(p.inicio, p.termino)}): disponível ${disponivel}, pedida ${item.qtd}.`,
        sugestao: disponivel ? `peça até ${disponivel}` : null,
      })
    }
  }
  return erros
}

/** RN13: cancelada > prevista > em_andamento > transcorrida. */
export function status(reserva: Reserva, agora: number): StatusReserva {
  if (reserva.cancelada) return 'cancelada'
  const inicios = reserva.periodos.map((p) => ms(p.inicio))
  const terminos = reserva.periodos.map((p) => ms(p.termino))
  if (!inicios.length || agora < Math.min(...inicios)) return 'prevista'
  if (agora < Math.max(...terminos)) return 'em_andamento'
  return 'transcorrida'
}

/** RN12: transcorrida ou cancelada não pode ser alterada. */
export function podeAlterar(reserva: Reserva, agora: number): Erro[] {
  const situacao = status(reserva, agora)
  return situacao === 'transcorrida' || situacao === 'cancelada'
    ? [{ campo: 'reserva', codigo: 'RESERVA_ENCERRADA', mensagem: `A reserva ${reserva.id} está ${situacao} e não pode ser alterada.` }]
    : []
}

/** RN12: encerrada não cancela; senão exige antecedência mínima até o menor início. */
export function podeCancelar(reserva: Reserva, agora: number): Erro[] {
  const situacao = status(reserva, agora)
  if (situacao === 'transcorrida' || situacao === 'cancelada') {
    return [{ campo: 'reserva', codigo: 'RESERVA_ENCERRADA', mensagem: `A reserva ${reserva.id} está ${situacao} e não pode ser cancelada.` }]
  }
  const primeiro = Math.min(...reserva.periodos.map((p) => ms(p.inicio)))
  if (agora + config.antecedenciaMin * 60 * 1000 > primeiro) {
    return [
      {
        campo: 'reserva',
        codigo: 'CANCELAMENTO_SEM_ANTECEDENCIA',
        mensagem: `O cancelamento exige ${config.antecedenciaMin} minutos de antecedência do início (${formatarData(primeiro)} ${formatarHora(primeiro)}).`,
      },
    ]
  }
  return []
}

/** Índices dos períodos novos cujo início não existia na reserva antiga (RN4 na alteração). */
export function periodosAlterados(antiga: Reserva, nova: ReservaEntrada): Set<number> {
  const inicios = new Set(antiga.periodos.map((p) => ms(p.inicio)))
  return new Set((nova.periodos ?? []).flatMap((p, n) => (inicios.has(ms(p.inicio)) ? [] : [n])))
}
