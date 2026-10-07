/**
 * Agrupamento de cards de atendimento por data (R8). Puro e testável.
 *
 * Um card entra num dia se qualquer um dos períodos da reserva intersecta aquele
 * dia (as reservas podem cruzar a meia-noite). Reservas canceladas são filtradas
 * fora (R8.1). `deData` é o primeiro dia exibido; `numeroDias` a janela.
 */
import type { CardAtendimento } from '../api/tipos'

export interface DiaAtendimento {
  data: Date
  cards: CardAtendimento[]
}

function inicioDoDia(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function cardNoDia(card: CardAtendimento, diaIni: Date, diaFim: Date): boolean {
  return card.reserva.periodos.some((p) => {
    const pi = new Date(p.inicio).getTime()
    const pf = new Date(p.termino).getTime()
    return pi < diaFim.getTime() && diaIni.getTime() < pf
  })
}

export function agruparPorData(
  cards: CardAtendimento[],
  deData: Date,
  numeroDias: number,
): DiaAtendimento[] {
  const ativos = cards.filter((c) => !c.reserva.cancelada)
  const dias: DiaAtendimento[] = []
  const base = inicioDoDia(deData)
  for (let i = 0; i < numeroDias; i++) {
    const diaIni = new Date(base)
    diaIni.setDate(base.getDate() + i)
    const diaFim = new Date(diaIni)
    diaFim.setDate(diaIni.getDate() + 1)
    const doDia = ativos
      .filter((c) => cardNoDia(c, diaIni, diaFim))
      .sort((a, b) => {
        const ia = Math.min(...a.reserva.periodos.map((p) => new Date(p.inicio).getTime()))
        const ib = Math.min(...b.reserva.periodos.map((p) => new Date(p.inicio).getTime()))
        return ia - ib
      })
    dias.push({ data: diaIni, cards: doDia })
  }
  return dias
}

export function rotuloDiaLongo(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function faixaHorarioDoDia(card: CardAtendimento, dia: Date): string {
  const diaIni = inicioDoDia(dia).getTime()
  const diaFim = diaIni + 86_400_000
  const noDia = card.reserva.periodos.filter((p) => {
    const pi = new Date(p.inicio).getTime()
    const pf = new Date(p.termino).getTime()
    return pi < diaFim && diaIni < pf
  })
  return noDia
    .map((p) => {
      const i = new Date(p.inicio)
      const f = new Date(p.termino)
      const hh = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      return `${hh(i)}–${hh(f)}`
    })
    .join(', ')
}
