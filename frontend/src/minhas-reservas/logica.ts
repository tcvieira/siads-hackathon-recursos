/**
 * Status e permissões de reserva no client (RN13 / RN12), espelhando o domínio.
 * A verificação definitiva é do servidor; aqui é para habilitar/desabilitar ações
 * e rotular a lista. Puro e com `agora` injetado.
 */
import type { Config, Reserva, StatusReserva } from '../api/tipos'

/** RN13: status derivado do horário. */
export function status(reserva: Reserva, agora: Date): StatusReserva {
  if (reserva.cancelada) return 'cancelada'
  if (reserva.periodos.length === 0) return 'prevista'
  const inicios = reserva.periodos.map((p) => new Date(p.inicio).getTime())
  const terminos = reserva.periodos.map((p) => new Date(p.termino).getTime())
  const menorInicio = Math.min(...inicios)
  const maiorTermino = Math.max(...terminos)
  const t = agora.getTime()
  if (t < menorInicio) return 'prevista'
  if (t >= maiorTermino) return 'transcorrida'
  return 'em_andamento'
}

/** Rótulo legível do status (texto, nunca só cor — 5.11.1). */
export function rotuloStatus(s: StatusReserva): string {
  switch (s) {
    case 'prevista':
      return 'Prevista'
    case 'em_andamento':
      return 'Em andamento'
    case 'transcorrida':
      return 'Transcorrida'
    case 'cancelada':
      return 'Cancelada'
  }
}

/** RN12: só altera reservas não transcorridas nem canceladas. */
export function podeAlterar(reserva: Reserva, agora: Date): boolean {
  const s = status(reserva, agora)
  return s === 'prevista' || s === 'em_andamento'
}

/** RN12: cancelar exige antecedência mínima até o menor início. */
export function podeCancelar(reserva: Reserva, config: Config, agora: Date): boolean {
  if (reserva.cancelada || reserva.periodos.length === 0) return false
  if (status(reserva, agora) === 'transcorrida') return false
  const menorInicio = Math.min(...reserva.periodos.map((p) => new Date(p.inicio).getTime()))
  const limite = agora.getTime() + config.antecedenciaMin * 60_000
  return menorInicio >= limite
}
