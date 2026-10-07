import { useId } from 'react'
import { Link } from 'react-router'
import { CalendarClock, CalendarDays, DoorOpen, Trophy } from 'lucide-react'
import { useOcupacaoDeVarios } from '@/api/consultas'
import type { Ambiente, Config, PeriodoOcupado } from '@/api/tipos'
import { Button } from '@/components/ui/button'
import { diaDe, diasDaSemana, ehDiaUtil, formatarData, inicioDaSemana, inicioDoDia, isoDe, somarDias } from '@/lib/datas'
import { cn } from '@/lib/utils'

const HORA = 3_600_000
const MINUTO = 60_000
const SIGLAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * Escala sequencial de um só matiz (azul do cabeçalho) como reforço do texto da célula.
 * Contraste texto/fundo: #f5f7fa 18,5:1 · #dbe4f3 15,5:1 · #b3c6e6 11,4:1 · #7f9fd4 7,4:1 (texto escuro)
 * · #4a72b8 4,8:1 · #1e3a6e 11,1:1 (texto branco).
 */
const ESCALA = [
  'bg-[#f5f7fa] text-foreground',
  'bg-[#dbe4f3] text-foreground',
  'bg-[#b3c6e6] text-foreground',
  'bg-[#7f9fd4] text-foreground',
  'bg-[#4a72b8] text-white',
  'bg-[#1e3a6e] text-white',
]
const LEGENDA = ['0 h', 'menos de 20%', '20 a 40%', '40 a 60%', '60 a 80%', '80% ou mais']
const faixaDaEscala = (taxa: number) => (taxa <= 0 ? 0 : Math.min(5, 1 + Math.floor(taxa * 5)))

/** Horas de uso do próprio ambiente na faixa de um dia, sem contar sobreposições duas vezes. */
function horasNoDia(periodos: PeriodoOcupado[], dia: string, config: Config): number {
  const ini = Date.parse(isoDe(dia, config.faixaInicio))
  const fim = Date.parse(isoDe(dia, config.faixaFim))
  const trechos = periodos
    .map((p) => [Math.max(ini, Date.parse(p.inicio)), Math.min(fim, Date.parse(p.termino))])
    .filter(([a, b]) => a < b)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let fimAtual = ini
  for (const [a, b] of trechos) {
    total += Math.max(0, b - Math.max(a, fimAtual))
    fimAtual = Math.max(fimAtual, b)
  }
  return total / HORA
}

const formatoPct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
const formatoHoras = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const pct = (v: number) => formatoPct.format(v)
/** Espaço inseparável entre número e unidade. */
const horas = (h: number) => `${formatoHoras.format(h)} h`
const sigla = (dia: string) => SIGLAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]

const cartao = 'rounded-md bg-card p-3 shadow-sm sm:p-4'

/** Visão geral da semana enquanto nenhum ambiente foi escolhido na grade (/grade2). */
export function PainelOcupacao({
  ambientes,
  config,
  semana,
  agora,
  hrefAmbiente,
}: {
  ambientes: Ambiente[]
  config: Config
  semana: string
  agora: number
  hrefAmbiente: (id: string) => string
}) {
  const id = useId()
  const consultas = useOcupacaoDeVarios(
    ambientes.map((a) => a.id),
    inicioDoDia(semana),
    inicioDoDia(somarDias(semana, 7)),
  )

  if (ambientes.length === 0) return <p>Nenhum ambiente ativo para exibir a ocupação.</p>

  // Placeholder (semana anterior mantida pelo keepPreviousData) mostraria horas de outra semana: trata como carregando.
  if (consultas.some((c) => c.isPending || c.isPlaceholderData)) {
    return (
      <output
        className="block rounded-md bg-card p-4 text-muted-foreground shadow-sm"
        style={{ minHeight: `${9 + ambientes.length * 2.75}rem` }}
      >
        Carregando ocupação da semana…
      </output>
    )
  }

  const diasUteis = diasDaSemana(semana).filter(ehDiaUtil)
  const horasPorDia = (Date.parse(isoDe(semana, config.faixaFim)) - Date.parse(isoDe(semana, config.faixaInicio))) / HORA
  const capacidade = diasUteis.length * horasPorDia
  const margem = config.margemMin * MINUTO

  // "Livre agora" só faz sentido na semana atual, em dia útil, dentro da faixa de funcionamento.
  const hojeLocal = diaDe(agora)
  const agoraValido =
    semana === inicioDaSemana(hojeLocal) &&
    ehDiaUtil(hojeLocal) &&
    agora >= Date.parse(isoDe(hojeLocal, config.faixaInicio)) &&
    agora < Date.parse(isoDe(hojeLocal, config.faixaFim))

  const linhas = ambientes
    .map((a, i) => {
      const periodos = consultas[i].data
      const proprios = (periodos ?? []).filter((p) => p.ambienteId === a.id)
      const porDia = diasUteis.map((dia) => horasNoDia(proprios, dia, config))
      const usadas = porDia.reduce((s, h) => s + h, 0)
      // "Livre agora" considera a hierarquia (RN6: a consulta já traz ancestrais e descendentes) e a margem após o término.
      const ocupadoAgora = (periodos ?? []).some((p) => Date.parse(p.inicio) <= agora && agora < Date.parse(p.termino) + margem)
      return { ambiente: a, indisponivel: !periodos, usadas, porDia, taxa: capacidade ? usadas / capacidade : 0, ocupadoAgora }
    })
    .sort(
      (x, y) =>
        Number(x.indisponivel) - Number(y.indisponivel) || y.taxa - x.taxa || x.ambiente.desc.localeCompare(y.ambiente.desc, 'pt-BR'),
    )

  const falhas = linhas.filter((l) => l.indisponivel).length
  const disponiveis = linhas.length - falhas
  const totalUsadas = linhas.reduce((s, l) => s + l.usadas, 0)
  const totalCapacidade = capacidade * disponiveis
  const media = totalCapacidade ? totalUsadas / totalCapacidade : 0
  const topo = linhas[0].usadas > 0 ? linhas[0] : undefined
  const livres = linhas.filter((l) => !l.indisponivel && !l.ocupadoAgora).length
  const status = (l: (typeof linhas)[number]) => (l.ocupadoAgora ? 'Ocupado agora' : 'Livre agora')

  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-4">
      <div>
        <h2 id={`${id}-titulo`} className="text-lg font-semibold">
          Ocupação da semana
        </h2>
        <p className="text-sm text-muted-foreground">
          Horas reservadas diretamente em cada ambiente, nos dias úteis, {config.faixaInicio}–{config.faixaFim}. Escolha um ambiente
          para abrir a grade.
        </p>
      </div>

      {falhas > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-aviso-fundo p-3 text-sm text-aviso">
          <p role="alert">
            {falhas === linhas.length
              ? 'Não foi possível carregar a ocupação da semana.'
              : `Não foi possível carregar a ocupação de ${falhas} ${falhas === 1 ? 'ambiente' : 'ambientes'}; ${falhas === 1 ? 'ele aparece' : 'eles aparecem'} como indisponível.`}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-8"
            onClick={() => consultas.forEach((c) => c.isError && c.refetch())}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {disponiveis > 0 && (
        <dl className="grid gap-2 sm:grid-cols-3 sm:gap-3">
          <div className={cartao}>
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
              Taxa média de ocupação
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{pct(media)}</dd>
            <dd className="text-sm text-muted-foreground tabular-nums">
              {horas(totalUsadas)} de {horas(totalCapacidade)}
            </dd>
          </div>
          <div className={cartao}>
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy aria-hidden="true" className="size-4 shrink-0" />
              Ambiente mais usado
            </dt>
            <dd className="mt-1 text-lg font-semibold break-words">{topo ? topo.ambiente.desc : 'Nenhuma reserva na semana'}</dd>
            {topo && (
              <dd className="text-sm text-muted-foreground tabular-nums">
                {pct(topo.taxa)} · {horas(topo.usadas)}
              </dd>
            )}
          </div>
          <div className={cartao}>
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <DoorOpen aria-hidden="true" className="size-4 shrink-0" />
              Livres agora
            </dt>
            {agoraValido ? (
              <>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {livres} de {disponiveis}
                </dd>
                <dd className="text-sm text-muted-foreground">Considera reservas de ambientes relacionados</dd>
              </>
            ) : (
              <dd className="mt-1 text-sm text-muted-foreground">Disponível só na semana atual, no horário de funcionamento</dd>
            )}
          </div>
        </dl>
      )}

      <div className="rounded-md bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
          <h3 id={`${id}-lista`} className="text-base font-semibold">
            Ocupação por ambiente
          </h3>
          <div aria-hidden="true" className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:flex">
            Cor pela parte do dia ocupada:
            {LEGENDA.map((texto, i) => (
              <span key={texto} className="inline-flex items-center gap-1">
                <span className={cn('size-3 rounded-sm border border-black/10', ESCALA[i])} />
                {texto}
              </span>
            ))}
          </div>
        </div>

        {/* A partir de 640px: tabela semanal (rolagem horizontal própria se faltar espaço). */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Horas ocupadas por ambiente em cada dia útil, de {formatarData(diasUteis[0])} a {formatarData(diasUteis[diasUteis.length - 1])}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">
                  Ambiente
                </th>
                {diasUteis.map((d) => (
                  <th key={d} scope="col" className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                    <span className="capitalize">{sigla(d)}</span> {formatarData(d)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.ambiente.id} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <Link
                      to={hrefAmbiente(l.ambiente.id)}
                      className="inline-flex items-start gap-1.5 font-medium break-words text-link underline-offset-2 hover:underline"
                    >
                      <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      {l.ambiente.desc}
                    </Link>
                    {agoraValido && !l.indisponivel && <span className="block text-xs text-muted-foreground">{status(l)}</span>}
                  </th>
                  {l.indisponivel ? (
                    <td colSpan={diasUteis.length + 1} className="px-3 py-2 text-muted-foreground">
                      Indisponível no momento
                    </td>
                  ) : (
                    <>
                      {l.porDia.map((h, i) => (
                        <td
                          key={diasUteis[i]}
                          className={cn('border border-card px-2 py-2 text-center tabular-nums', ESCALA[faixaDaEscala(h / horasPorDia)])}
                        >
                          {h > 0 ? (
                            horas(h)
                          ) : (
                            <>
                              <span aria-hidden="true">—</span>
                              <span className="sr-only">0 h</span>
                            </>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {pct(l.taxa)} · {horas(l.usadas)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Abaixo de 640px: lista de links, sem mapa de calor (reflow em 320px). */}
        <ol aria-labelledby={`${id}-lista`} className="divide-y sm:hidden">
          {linhas.map((l) => (
            <li key={l.ambiente.id}>
              <Link
                to={hrefAmbiente(l.ambiente.id)}
                className="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2.5 hover:bg-accent"
              >
                <span className="inline-flex items-start gap-1.5 font-medium break-words text-link">
                  <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {l.ambiente.desc}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {l.indisponivel
                    ? 'Indisponível no momento'
                    : [agoraValido && status(l), pct(l.taxa), horas(l.usadas)].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
