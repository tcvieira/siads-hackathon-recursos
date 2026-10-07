import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Ban, CalendarPlus, Check, ChevronLeft, ChevronRight, ChevronsUpDown, History, Hourglass, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCatalogo, useOcupacao } from '@/api/consultas'
import type { Config, PeriodoOcupado } from '@/api/tipos'
import { PainelOcupacao } from '@/componentes/PainelOcupacao'
import { TituloPagina } from '@/componentes/TituloPagina'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  diaDe,
  diasDaSemana,
  formatarData,
  formatarDiaSemana,
  formatarHora,
  hoje,
  inicioDaSemana,
  inicioDoDia,
  slotsDoDia,
  sobrepoe,
  somarDias,
} from '@/lib/datas'
import type { Slot } from '@/lib/datas'
import { cn } from '@/lib/utils'

type Estado = 'livre' | 'ocupado' | 'margem' | 'ultrapassado' | 'antecedencia'
/** Trecho contínuo de slots do mesmo dia no mesmo estado (vira uma célula com rowSpan). */
type Segmento = { estado: Estado; ini: number; tam: number }

const ESTADOS: Record<Exclude<Estado, 'livre'>, { texto: ReactNode; Icone: LucideIcon; classe: string }> = {
  // primary-foreground sobre primary: 11,1:1.
  ocupado: { texto: 'Ocupado', Icone: Lock, classe: 'bg-primary text-primary-foreground' },
  margem: {
    texto: (
      <>
        Margem<span className="sr-only"> de tolerância</span>
      </>
    ),
    Icone: Hourglass,
    classe: 'bg-[repeating-linear-gradient(135deg,var(--aviso-fundo)_0_6px,var(--card)_6px_12px)] text-aviso',
  },
  ultrapassado: { texto: 'Horário encerrado', Icone: History, classe: 'bg-muted text-muted-foreground' },
  antecedencia: { texto: 'Sem antecedência mínima', Icone: Ban, classe: 'bg-card text-muted-foreground' },
}

/** Estado do slot (R7.2). Ocupação já inclui ancestrais e descendentes (RN6). */
function estadoDoSlot(slot: Slot, ocupados: PeriodoOcupado[], config: Config, agora: number): Estado {
  const inicio = Date.parse(slot.inicio)
  if (inicio <= agora) return 'ultrapassado'
  if (ocupados.some((o) => sobrepoe(slot.inicio, slot.termino, o.inicio, o.termino))) return 'ocupado'
  if (ocupados.some((o) => sobrepoe(slot.inicio, slot.termino, o.inicio, o.termino, config.margemMin))) return 'margem'
  if (inicio < agora + config.antecedenciaMin * 60_000) return 'antecedencia'
  return 'livre'
}

/** Junta slots consecutivos no mesmo estado; cada slot livre segue sozinho (um botão por horário). */
function segmentar(estados: Estado[]): Segmento[] {
  const segs: Segmento[] = []
  estados.forEach((estado, ini) => {
    const ultimo = segs.at(-1)
    if (ultimo && estado !== 'livre' && ultimo.estado === estado) ultimo.tam++
    else segs.push({ estado, ini, tam: 1 })
  })
  return segs
}

/**
 * Classe e conteúdo da célula (td da tabela ou item da lista). Livre: botão discreto "Livre" que, em
 * hover/foco (e sempre no mobile), mostra "Reservar HH:MM"; o nome acessível é "Reservar às HH:MM de dd/mm".
 */
function celula(seg: Segmento, slots: Slot[], dia: string, aoReservar: (slot: Slot) => void) {
  if (seg.estado === 'livre') {
    const slot = slots[seg.ini]
    const mostrar = 'sm:group-hover/button:not-sr-only sm:group-focus-visible/button:not-sr-only'
    return {
      classe: 'rounded-sm border border-border bg-card p-0.5',
      conteudo: (
        <Button
          variant="ghost"
          className="h-11 w-full justify-start px-2 font-normal text-link hover:bg-accent hover:text-link sm:h-7"
          onClick={() => aoReservar(slot)}
        >
          <CalendarPlus aria-hidden="true" className="sm:hidden sm:group-hover/button:block sm:group-focus-visible/button:block" />
          <span className={cn('sm:sr-only', mostrar)}>
            Reservar<span className="sr-only"> às</span> {slot.rotulo}
            <span className="sr-only"> de {formatarData(dia)}</span>
          </span>
          <span className="hidden sm:inline sm:group-hover/button:sr-only sm:group-focus-visible/button:sr-only">
            <span className="sr-only">, </span>Livre
          </span>
        </Button>
      ),
    }
  }
  const { texto, Icone, classe } = ESTADOS[seg.estado]
  const diaTodo = seg.estado === 'ultrapassado' && seg.tam === slots.length
  const faixa = `${slots[seg.ini].rotulo}–${formatarHora(slots[seg.ini + seg.tam - 1].termino)}`
  return {
    classe: cn('px-2 py-1 align-top text-sm', classe),
    conteudo: (
      <>
        <span className="flex items-center gap-1.5 font-medium">
          <Icone aria-hidden="true" className="size-4 shrink-0" />
          {diaTodo ? 'Dia encerrado' : texto}
        </span>
        {!diaTodo && (seg.estado === 'ocupado' || seg.tam > 1) && <span className="block text-xs tabular-nums">{faixa}</span>}
      </>
    ),
  }
}

export default function Grade() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const [params, setParams] = useSearchParams()
  const [agora, setAgora] = useState(Date.now)
  // Reavalia "Horário encerrado" e "Sem antecedência mínima" com a tela aberta.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const [aberto, setAberto] = useState(false)
  const idBase = useId()
  const tituloGrade = useRef<HTMLHeadingElement>(null)

  const dia = params.get('dia') ?? hoje()
  const fds = params.get('fds') === '1'
  const semana = inicioDaSemana(dia)
  const dias = diasDaSemana(semana, fds ? 7 : 5)
  // Sem fim de semana, um ?dia= de sábado/domingo cai na segunda da lista diária.
  const diaLista = dias.includes(dia) ? dia : dias[0]
  const hojeLocal = diaDe(agora)

  const catalogo = useCatalogo()
  const ambientes = (catalogo.data?.ambientes ?? []).filter((a) => a.ativo)
  // Sem ambiente na URL, abre no primeiro ativo para a tela não começar vazia.
  const ambienteId = params.get('ambiente') ?? ambientes[0]?.id ?? null
  const ocupacao = useOcupacao(ambienteId, inicioDoDia(semana), inicioDoDia(somarDias(semana, 7)))

  const ambiente = ambientes.find((a) => a.id === ambienteId)
  const config = catalogo.data?.config

  const mudar = (chave: string, valor: string | null) =>
    setParams(
      (p) => {
        const novo = new URLSearchParams(p)
        if (valor === null) novo.delete(chave)
        else novo.set(chave, valor)
        return novo
      },
      { replace: true },
    )

  const reservar = (slot: Slot) =>
    navigate(`/reservas/nova?${new URLSearchParams({ ambienteId: ambienteId!, inicio: slot.inicio })}`)

  const faixa = (d: string) => slotsDoDia(d, config?.faixaInicio, config?.faixaFim)
  const pronto = config && ocupacao.data ? { config, ocupados: ocupacao.data } : null
  const segmentos = (d: string) => {
    const slots = faixa(d)
    return { slots, segs: pronto ? segmentar(slots.map((s) => estadoDoSlot(s, pronto.ocupados, pronto.config, agora))) : [] }
  }
  // Tabela: uma célula só no início de cada segmento (com rowSpan); as linhas cobertas pulam o dia.
  const colunas = dias.map((d) => {
    const { slots, segs } = segmentos(d)
    return { d, slots, porInicio: new Map(segs.map((s) => [s.ini, s])) }
  })
  const lista = segmentos(diaLista)
  const rotuloSemana = `Semana de ${formatarData(dias[0])} a ${formatarData(dias[dias.length - 1])}`
  const ids = {
    rotulo: `${idBase}-rotulo`,
    combo: `${idBase}-ambiente`,
    lista: `${idBase}-lista`,
    dia: `${idBase}-dia`,
    fds: `${idBase}-fds`,
    titulo: `${idBase}-titulo`,
  }

  // Link `?dia=<semana>&ambiente=<id>` do painel (preserva outros params; sem replace, o Voltar volta ao ambiente anterior).
  const hrefAmbiente = (id: string) => {
    const novo = new URLSearchParams(params)
    novo.set('dia', semana)
    novo.set('ambiente', id)
    return `?${novo}`
  }

  // Ambiente escolhido no painel: foco no título da grade (o Layout só foca o h1 ao mudar de rota).
  useEffect(() => {
    if ((state as { focarGrade?: boolean } | null)?.focarGrade) tituloGrade.current?.focus()
  }, [state, ambienteId])

  return (
    <section className="space-y-6">
      <TituloPagina>Reservar ambiente</TituloPagina>

      {catalogo.isError && <p role="alert">Não foi possível carregar o catálogo: {catalogo.error.message}</p>}
      {config && (
        <PainelOcupacao
          ambientes={ambientes}
          config={config}
          semana={semana}
          agora={agora}
          atual={ambienteId}
          hrefAmbiente={hrefAmbiente}
        />
      )}

      <div className="flex flex-col gap-4 rounded-md bg-card p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:p-4">
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-80">
          <Label id={ids.rotulo} htmlFor={ids.combo}>
            Ambiente
          </Label>
          <Popover open={aberto} onOpenChange={setAberto}>
            <PopoverTrigger asChild>
              <Button
                id={ids.combo}
                variant="outline"
                // Padrão combobox ARIA (popover + busca); um <select> nativo não filtra.
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                role="combobox"
                aria-expanded={aberto}
                aria-controls={ids.lista}
                aria-labelledby={`${ids.rotulo} ${ids.combo}`}
                disabled={!catalogo.data}
                className="h-11 w-full justify-between border-input font-normal sm:h-9"
              >
                <span className="truncate">{ambiente?.desc ?? 'Escolha um ambiente'}</span>
                <ChevronsUpDown aria-hidden="true" className="opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar ambiente" aria-label="Buscar ambiente" />
                <CommandList id={ids.lista}>
                  <CommandEmpty>Nenhum ambiente encontrado.</CommandEmpty>
                  {ambientes.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={`${a.desc} ${a.id}`}
                      onSelect={() => {
                        mudar('ambiente', a.id)
                        setAberto(false)
                      }}
                      className="min-h-11 sm:min-h-8"
                    >
                      <Check aria-hidden="true" className={cn('size-4', a.id === ambienteId ? 'opacity-100' : 'opacity-0')} />
                      {a.desc}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-1.5">
          <p aria-live="polite" className="text-sm font-medium">
            {rotuloSemana}
          </p>
          <nav aria-label="Semana" className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => mudar('dia', somarDias(semana, -7))}>
              <ChevronLeft aria-hidden="true" />
              Semana anterior
            </Button>
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => mudar('dia', hoje())}>
              Hoje
            </Button>
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => mudar('dia', somarDias(semana, 7))}>
              Próxima semana
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        </div>

        <div className="flex min-h-11 items-center gap-2 sm:min-h-9">
          <Checkbox id={ids.fds} checked={fds} onCheckedChange={(c) => mudar('fds', c === true ? '1' : null)} />
          <Label htmlFor={ids.fds} className="font-normal">
            Mostrar fim de semana
          </Label>
        </div>
      </div>

      {ambiente && (
        <section aria-labelledby={ids.titulo} className="space-y-3">
          <h2 id={ids.titulo} ref={tituloGrade} tabIndex={-1} className="scroll-mt-4 text-lg font-semibold break-words">
            Horários de {ambiente.desc}
          </h2>
          {ocupacao.isPending && <output className="block">Carregando ocupação…</output>}
          {ocupacao.isError && <p role="alert">Não foi possível carregar a ocupação: {ocupacao.error.message}</p>}

          {pronto && (
            <>
              {/* Tabela a partir de 640px (rolagem horizontal própria se faltar espaço). */}
              <div className="hidden overflow-x-auto rounded-md bg-card p-2 shadow-sm sm:block">
                <table className="w-full border-separate border-spacing-0.5 text-sm">
                  <caption className="mb-2 px-1 text-left text-sm text-muted-foreground">
                    Ocupação de {ambiente.desc}, {rotuloSemana.toLowerCase()}, em intervalos de 30 minutos
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="sticky left-0 bg-card p-2 text-left">
                        Horário
                      </th>
                      {dias.map((d) => (
                        <th
                          key={d}
                          scope="col"
                          className={cn('min-w-32 p-2 text-left font-semibold capitalize', d < hojeLocal && 'text-muted-foreground')}
                        >
                          {formatarDiaSemana(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {colunas[0].slots.map((linha, i) => (
                      <tr key={linha.rotulo}>
                        <th scope="row" className="sticky left-0 bg-card px-2 py-1 text-left align-top font-medium tabular-nums">
                          {linha.rotulo}
                        </th>
                        {colunas.map(({ d, slots, porInicio }) => {
                          const seg = porInicio.get(i)
                          if (!seg) return null
                          const { classe, conteudo } = celula(seg, slots, d, reservar)
                          return (
                            <td key={d} rowSpan={seg.tam} className={cn('rounded-sm', classe)}>
                              {conteudo}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Abaixo de 640px: lista de horários de um dia (reflow em 320px). */}
              <div className="space-y-4 sm:hidden">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={ids.dia}>Dia</Label>
                  <select
                    id={ids.dia}
                    value={diaLista}
                    onChange={(e) => mudar('dia', e.target.value)}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-base capitalize outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {dias.map((d) => (
                      <option key={d} value={d}>
                        {formatarDiaSemana(d)}
                      </option>
                    ))}
                  </select>
                </div>
                <h3 className="font-semibold capitalize">{formatarDiaSemana(diaLista)}</h3>
                <ul className="space-y-1">
                  {lista.segs.map((seg) => {
                    const { classe, conteudo } = celula(seg, lista.slots, diaLista, reservar)
                    return (
                      <li key={seg.ini} className="flex items-stretch gap-3">
                        <span className="w-12 shrink-0 pt-2.5 font-medium tabular-nums">{lista.slots[seg.ini].rotulo}</span>
                        <div className={cn('min-w-0 flex-1 rounded-md', classe, seg.estado !== 'livre' && 'py-2')}>{conteudo}</div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          )}
        </section>
      )}
    </section>
  )
}
