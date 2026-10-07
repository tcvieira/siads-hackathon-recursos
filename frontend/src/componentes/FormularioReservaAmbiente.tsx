import { ChevronsUpDownIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { Ambiente } from '@/api/tipos'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Valor do combobox para "Não solicitado / local próprio" (`ambienteId = null`, RN2). */
export const LOCAL_PROPRIO = 'local-proprio'
export const NOME_LOCAL_PROPRIO = 'Não solicitado / local próprio'

interface Props {
  id: string
  rotuloId: string
  ambientes: Ambiente[]
  valor: string
  aoMudar: (valor: string) => void
  invalido: boolean
  descritoPor?: string
}

/** Combobox de ambiente (popover + command), com a opção de local próprio no topo. */
export function ComboboxAmbiente({ id, rotuloId, ambientes, valor, aoMudar, invalido, descritoPor }: Props) {
  const [aberto, setAberto] = useState(false)
  const listaId = useId()
  const nome = valor === LOCAL_PROPRIO ? NOME_LOCAL_PROPRIO : ambientes.find((a) => a.id === valor)?.desc
  const opcoes = [{ id: LOCAL_PROPRIO, desc: NOME_LOCAL_PROPRIO }, ...ambientes]

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-labelledby={`${rotuloId} ${id}`}
          aria-invalid={invalido || undefined}
          aria-describedby={descritoPor}
          className="h-11 w-full justify-between font-normal whitespace-normal sm:h-9"
        >
          <span className="truncate text-left">{nome ?? 'Escolha o ambiente'}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent id={listaId} align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar ambiente" aria-label="Buscar ambiente" />
          <CommandList>
            <CommandEmpty>Nenhum ambiente encontrado.</CommandEmpty>
            <CommandGroup>
              {opcoes.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.desc} #${a.id}`}
                  data-checked={a.id === valor}
                  className="min-h-11 sm:min-h-8"
                  onSelect={() => {
                    aoMudar(a.id)
                    setAberto(false)
                  }}
                >
                  {a.desc}
                  {a.id === valor && <span className="sr-only">, selecionado</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
