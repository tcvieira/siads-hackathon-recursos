/**
 * Datas no fuso da PR/CE (America/Fortaleza, UTC−3 fixo, sem horário de verão).
 *
 * Como o offset é fixo, basta deslocar o instante 3 h e ler os campos em UTC: o resultado não
 * depende do fuso do navegador. "Dia" aqui é sempre a string `YYYY-MM-DD` local de Fortaleza.
 */

export const OFFSET = '-03:00'
const DESLOCAMENTO_MS = -3 * 60 * 60 * 1000
const MINUTO_MS = 60 * 1000

/** Instante (ISO com qualquer offset, Date ou ms) → Date "deslocado": os getters UTC dão a hora local. */
function local(instante: string | Date | number): Date {
  return new Date(new Date(instante).getTime() + DESLOCAMENTO_MS)
}

/** `YYYY-MM-DDTHH:MM` local de Fortaleza. */
export function paraDatetimeLocal(instante: string | Date | number): string {
  return local(instante).toISOString().slice(0, 16)
}

/** Valor de `<input type="datetime-local">` (`YYYY-MM-DDTHH:MM`) → ISO `…:00-03:00`. */
export function deDatetimeLocal(valor: string): string {
  return `${valor.slice(0, 16)}:00${OFFSET}`
}

/** Dia + `HH:MM` → ISO `YYYY-MM-DDTHH:MM:00-03:00`. */
export function isoDe(dia: string, hhmm: string): string {
  return `${dia}T${hhmm}:00${OFFSET}`
}

/** Início do dia (00:00) em ISO −03:00, útil para `de`/`ate` das consultas. */
export function inicioDoDia(dia: string): string {
  return isoDe(dia, '00:00')
}

/** Dia local (`YYYY-MM-DD`) do instante. */
export function diaDe(instante: string | Date | number): string {
  return paraDatetimeLocal(instante).slice(0, 10)
}

/** Hoje em Fortaleza (`YYYY-MM-DD`). */
export function hoje(): string {
  return diaDe(Date.now())
}

/** `dd/mm`. Aceita instante ISO ou dia `YYYY-MM-DD`. */
export function formatarData(valor: string | Date | number): string {
  const dia = typeof valor === 'string' && valor.length === 10 ? valor : diaDe(valor)
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
}

/** `HH:MM`. */
export function formatarHora(instante: string | Date | number): string {
  return paraDatetimeLocal(instante).slice(11, 16)
}

/** `dd/mm HH:MM`. */
export function formatarDataHora(instante: string | Date | number): string {
  return `${formatarData(instante)} ${formatarHora(instante)}`
}

/** Período legível: `dd/mm das HH:MM às HH:MM` (ou `dd/mm HH:MM a dd/mm HH:MM` se atravessa dias). */
export function formatarPeriodo(inicio: string, termino: string): string {
  if (diaDe(inicio) === diaDe(termino)) {
    return `${formatarData(inicio)} das ${formatarHora(inicio)} às ${formatarHora(termino)}`
  }
  return `${formatarDataHora(inicio)} a ${formatarDataHora(termino)}`
}

const formatoDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' })

/** `segunda-feira, 12/10` para um dia `YYYY-MM-DD`. */
export function formatarDiaSemana(dia: string): string {
  return `${formatoDiaSemana.format(new Date(`${dia}T12:00:00Z`))}, ${formatarData(dia)}`
}

/** Dia `YYYY-MM-DD` somado de `n` dias (negativo volta). */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Segunda-feira da semana do dia. */
export function inicioDaSemana(dia: string): string {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay() // 0 = domingo
  return somarDias(dia, semana === 0 ? -6 : 1 - semana)
}

/** `quantos` dias consecutivos a partir de `inicio` (padrão: a semana inteira). */
export function diasDaSemana(inicio: string, quantos = 7): string[] {
  return Array.from({ length: quantos }, (_, i) => somarDias(inicio, i))
}

/** Dia útil (segunda a sexta)? */
export function ehDiaUtil(dia: string): boolean {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay()
  return semana !== 0 && semana !== 6
}

export interface Slot {
  inicio: string
  termino: string
  /** `HH:MM` do início. */
  rotulo: string
}

/** Slots de 30 min do dia dentro da faixa `HH:MM`–`HH:MM` (config do catálogo). */
export function slotsDoDia(dia: string, faixaInicio = '07:00', faixaFim = '20:00', minutos = 30): Slot[] {
  const fim = Date.parse(isoDe(dia, faixaFim))
  const slots: Slot[] = []
  for (let t = Date.parse(isoDe(dia, faixaInicio)); t + minutos * MINUTO_MS <= fim; t += minutos * MINUTO_MS) {
    const termino = t + minutos * MINUTO_MS
    slots.push({ inicio: paraIso(t), termino: paraIso(termino), rotulo: formatarHora(t) })
  }
  return slots
}

/** Instante → ISO `YYYY-MM-DDTHH:MM:SS-03:00`. */
export function paraIso(instante: string | Date | number): string {
  return `${local(instante).toISOString().slice(0, 19)}${OFFSET}`
}

/** Instante somado de `minutos` (ISO −03:00). */
export function somarMinutos(instante: string, minutos: number): string {
  return paraIso(Date.parse(instante) + minutos * MINUTO_MS)
}

/** `[aIni, aFim)` e `[bIni, bFim)` se sobrepõem, com margem opcional em minutos (RN5). */
export function sobrepoe(aIni: string, aFim: string, bIni: string, bFim: string, margemMin = 0): boolean {
  const margem = margemMin * MINUTO_MS
  return Date.parse(aIni) < Date.parse(bFim) + margem && Date.parse(bIni) < Date.parse(aFim) + margem
}
