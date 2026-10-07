/**
 * Lógica pura da grade de horários do solicitante (R7 / RF16).
 *
 * Monta a matriz dias × faixas de 30 min e classifica cada célula num estado.
 * Separada do componente para ser testável e manter o React focado na marcação
 * acessível. A ocupação já deve considerar a hierarquia de ambientes (a camada de
 * API resolve ancestrais/descendentes — design.md §4 GET /ambientes/{id}/ocupacao).
 */
import type { Config, PeriodoOcupado } from '../api/tipos'

export type EstadoCelula =
  | 'livre' // link "Reservar às HH:MM"
  | 'ocupado'
  | 'margem' // "Margem de tolerância"
  | 'passado' // "Horário ultrapassado"
  | 'sem_antecedencia' // "Sem antecedência mínima"
  | 'fora_faixa' // fora do horário configurado (não exibida como linha, mas defensivo)

export interface Celula {
  /** início do slot (ISO local -03:00) */
  inicio: Date
  estado: EstadoCelula
}

export interface Coluna {
  dia: Date
  celulas: Celula[]
}

export interface Grade {
  horarios: string[] // rótulos "HH:MM" das linhas (faixa, passo 30 min)
  colunas: Coluna[]
}

const MIN_SLOT = 30

function hhmmParaMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function rotuloHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function rotuloDia(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

/** Gera os rótulos "HH:MM" das linhas, do início ao fim da faixa, de 30 em 30. */
export function faixaHorarios(config: Config): string[] {
  const ini = hhmmParaMinutos(config.faixaInicio)
  const fim = hhmmParaMinutos(config.faixaFim)
  const out: string[] = []
  for (let m = ini; m < fim; m += MIN_SLOT) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  }
  return out
}

function dentroDeAlgumPeriodo(slotInicio: Date, slotFim: Date, ocupacoes: PeriodoOcupado[]): boolean {
  return ocupacoes.some((o) => {
    const oi = new Date(o.inicio).getTime()
    const of = new Date(o.termino).getTime()
    return slotInicio.getTime() < of && oi < slotFim.getTime()
  })
}

function dentroDaMargem(
  slotInicio: Date,
  slotFim: Date,
  ocupacoes: PeriodoOcupado[],
  margemMin: number,
): boolean {
  const margem = margemMin * 60_000
  return ocupacoes.some((o) => {
    const oi = new Date(o.inicio).getTime()
    const of = new Date(o.termino).getTime()
    // slot encosta na janela de tolerância antes do início ou depois do término
    const antes = slotFim.getTime() > oi - margem && slotInicio.getTime() < oi
    const depois = slotInicio.getTime() < of + margem && slotFim.getTime() > of
    return antes || depois
  })
}

/**
 * Classifica cada célula da grade. `agora` é injetado (testável).
 * Precedência dos estados: ocupado > margem > passado > sem_antecedencia > livre.
 */
export function montarGrade(
  diaReferencia: Date,
  numeroColunas: number,
  exibirFinsDeSemana: boolean,
  ocupacoes: PeriodoOcupado[],
  config: Config,
  agora: Date,
): Grade {
  const horarios = faixaHorarios(config)
  const colunas: Coluna[] = []
  const antecedenciaMs = config.antecedenciaMin * 60_000

  const dia = new Date(diaReferencia)
  dia.setHours(0, 0, 0, 0)

  while (colunas.length < numeroColunas) {
    const ehFimDeSemana = dia.getDay() === 0 || dia.getDay() === 6
    if (exibirFinsDeSemana || !ehFimDeSemana) {
      const celulas: Celula[] = horarios.map((hhmm) => {
        const [h, m] = hhmm.split(':').map(Number)
        const inicio = new Date(dia)
        inicio.setHours(h, m, 0, 0)
        const fim = new Date(inicio.getTime() + MIN_SLOT * 60_000)

        let estado: EstadoCelula
        if (dentroDeAlgumPeriodo(inicio, fim, ocupacoes)) {
          estado = 'ocupado'
        } else if (dentroDaMargem(inicio, fim, ocupacoes, config.margemMin)) {
          estado = 'margem'
        } else if (fim.getTime() <= agora.getTime()) {
          estado = 'passado'
        } else if (inicio.getTime() < agora.getTime() + antecedenciaMs) {
          estado = 'sem_antecedencia'
        } else {
          estado = 'livre'
        }
        return { inicio, estado }
      })
      colunas.push({ dia: new Date(dia), celulas })
    }
    dia.setDate(dia.getDate() + 1)
  }

  return { horarios, colunas }
}

/** Texto exibido na célula para cada estado (texto + ícone, nunca só cor — 5.11.1). */
export function textoEstado(estado: EstadoCelula, inicio: Date): string {
  switch (estado) {
    case 'livre':
      return `Reservar às ${rotuloHora(inicio)}`
    case 'ocupado':
      return 'Ocupado'
    case 'margem':
      return 'Margem de tolerância'
    case 'passado':
      return 'Horário ultrapassado'
    case 'sem_antecedencia':
      return 'Sem antecedência mínima'
    case 'fora_faixa':
      return 'Fora do horário'
  }
}
