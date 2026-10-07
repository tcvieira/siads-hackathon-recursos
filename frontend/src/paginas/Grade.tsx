import { useEffect, useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Ban, CalendarPlus, Check, ChevronLeft, ChevronRight, ChevronsUpDown, History, Hourglass, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCatalogo, useOcupacao } from '@/api/consultas'
import type { Config, PeriodoOcupado } from '@/api/tipos'
import { TituloPagina } from '@/componentes/TituloPagina'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  diasDaSemana,
  formatarData,
  formatarDiaSemana,
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

const ESTADOS: Record<Exclude<Estado, 'livre'>, { texto: string; Icone: LucideIcon; classe: string }> = {
  ocupado: { texto: 'Ocupado', Icone: Lock, classe: 'bg-muted text-foreground' },
  margem: { texto: 'Margem de tolerância', Icone: Hourglass, classe: 'bg-aviso-fundo text-aviso' },
  ultrapassado: { texto: 'Horário ultrapassado', Icone: History, classe: 'text-muted-foreground' },
  antecedencia: { texto: 'Sem antecedência mínima', Icone: Ban, classe: 'text-muted-foreground' },
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

/** Conteúdo da célula/item: texto + ícone, ou botão "Reservar às HH:MM de dd/mm" (nome acessível completo). */
function Celula({ estado, slot, dia, aoReservar }: { estado: Estado; slot: Slot; dia: string; aoReservar: () => void }) {
  if (estado === 'livre') {
    return (
      <Button
        variant="outline"
        className="h-11 w-full justify-start border-sucesso text-sucesso sm:h-8"
        onClick={aoReservar}
      >
        <CalendarPlus aria-hidden="true" />
        Reservar<span className="sr-only"> às {slot.rotulo} de {formatarData(dia)}</span>
      </Button>
    )
  }
  const { texto, Icone, classe } = ESTADOS[estado]
  return (
    <span className={cn('flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm', classe)}>
      <Icone aria-hidden="true" className="size-4 shrink-0" />
      {texto}
    </span>
  )
}

export default function Grade() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [agora, setAgora] = useState(Date.now)
  // Reavalia "Horário ultrapassado" e "Sem antecedência mínima" com a tela aberta.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const [aberto, setAberto] = useState(false)
  const idBase = useId()

  const ambienteId = params.get('ambiente')
  const dia = params.get('dia') ?? hoje()
  const semana = inicioDaSemana(dia)
  const dias = diasDaSemana(semana)

  const catalogo = useCatalogo()
  const ocupacao = useOcupacao(ambienteId, inicioDoDia(semana), inicioDoDia(somarDias(semana, 7)))

  const ambientes = (catalogo.data?.ambientes ?? []).filter((a) => a.ativo)
  const ambiente = ambientes.find((a) => a.id === ambienteId)
  const config = catalogo.data?.config

  const mudar = (chave: string, valor: string) =>
    setParams(
      (p) => {
        const novo = new URLSearchParams(p)
        novo.set(chave, valor)
        return novo
      },
      { replace: true },
    )

  const reservar = (slot: Slot) =>
    navigate(`/reservas/nova?${new URLSearchParams({ ambienteId: ambienteId!, inicio: slot.inicio })}`)

  const faixa = (d: string) => slotsDoDia(d, config?.faixaInicio, config?.faixaFim)
  const rotuloSemana = `Semana de ${formatarData(dias[0])} a ${formatarData(dias[6])}`
  const ids = { rotulo: `${idBase}-rotulo`, combo: `${idBase}-ambiente`, lista: `${idBase}-lista`, dia: `${idBase}-dia` }

  return (
    <section className="space-y-6">
      <TituloPagina>Grade de horários</TituloPagina>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
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

      <p aria-live="polite" className="text-sm font-medium">
        {rotuloSemana}
      </p>

      {catalogo.isError && <p role="alert">Não foi possível carregar o catálogo: {catalogo.error.message}</p>}
      {!ambienteId && catalogo.data && <p>Escolha um ambiente para ver os horários livres e ocupados.</p>}
      {ambienteId && ocupacao.isPending && <output className="block">Carregando ocupação…</output>}
      {ocupacao.isError && <p role="alert">Não foi possível carregar a ocupação: {ocupacao.error.message}</p>}

      {ambiente && config && ocupacao.data && (
        <>
          {/* Tabela a partir de 640px (rolagem horizontal própria se faltar espaço). */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-sm">
              <caption className="mb-2 text-left font-medium">
                Ocupação de {ambiente.desc}, {rotuloSemana.toLowerCase()}, em intervalos de 30 minutos
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 bg-background p-2 text-left">
                    Horário
                  </th>
                  {dias.map((d) => (
                    <th key={d} scope="col" className="min-w-36 p-2 text-left font-semibold capitalize">
                      {formatarDiaSemana(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {faixa(dias[0]).map((linha, i) => (
                  <tr key={linha.rotulo} className="border-t border-border">
                    <th scope="row" className="sticky left-0 bg-background p-2 text-left font-medium tabular-nums">
                      {linha.rotulo}
                    </th>
                    {dias.map((d) => {
                      const slot = faixa(d)[i]
                      return (
                        <td key={d} className="p-1">
                          <Celula
                            estado={estadoDoSlot(slot, ocupacao.data, config, agora)}
                            slot={slot}
                            dia={d}
                            aoReservar={() => reservar(slot)}
                          />
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
                value={dia}
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
            <h2 className="text-lg font-semibold capitalize">
              {ambiente.desc}: {formatarDiaSemana(dia)}
            </h2>
            <ul className="divide-y divide-border">
              {faixa(dia).map((slot) => (
                <li key={slot.inicio} className="flex items-center gap-3 py-1.5">
                  <span className="w-12 shrink-0 font-medium tabular-nums">{slot.rotulo}</span>
                  <div className="min-w-0 flex-1">
                    <Celula
                      estado={estadoDoSlot(slot, ocupacao.data, config, agora)}
                      slot={slot}
                      dia={dia}
                      aoReservar={() => reservar(slot)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
