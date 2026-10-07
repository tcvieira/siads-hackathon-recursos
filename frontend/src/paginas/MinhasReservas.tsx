import { useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ErroApi } from '@/api/cliente'
import { useCancelarReserva, useCatalogo, useMinhasReservas } from '@/api/consultas'
import type { Catalogo, Reserva, StatusReserva } from '@/api/tipos'
import { TituloPagina } from '@/componentes/TituloPagina'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarData, formatarPeriodo } from '@/lib/datas'

/** Texto do status (RN13); o badge repete o texto, a cor é só reforço. */
const STATUS: Record<StatusReserva, { rotulo: string; variante: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  prevista: { rotulo: 'Prevista', variante: 'default' },
  em_andamento: { rotulo: 'Em andamento', variante: 'secondary' },
  transcorrida: { rotulo: 'Transcorrida', variante: 'outline' },
  cancelada: { rotulo: 'Cancelada', variante: 'destructive' },
}

const ALVO = 'max-sm:h-11 max-sm:px-4'

function statusDe(r: Reserva): StatusReserva {
  return r.status ?? (r.cancelada ? 'cancelada' : 'prevista')
}

function local(r: Reserva, catalogo?: Catalogo): string {
  if (!r.ambienteId) return `Local próprio${r.complemento ? `: ${r.complemento}` : ''}`
  return catalogo?.ambientes.find((a) => a.id === r.ambienteId)?.desc ?? `Ambiente ${r.ambienteId}`
}

const inicioDe = (r: Reserva) => r.periodos.reduce((m, p) => (p.inicio < m ? p.inicio : m), r.periodos[0]?.inicio ?? '')

function ItemReserva({ reserva, catalogo }: { reserva: Reserva; catalogo?: Catalogo }) {
  const cancelar = useCancelarReserva()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const cancelou = useRef(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const idErro = useId()

  const status = statusDe(reserva)
  const encerrada = status === 'transcorrida' || status === 'cancelada'
  const dia = formatarData(inicioDe(reserva))
  const recursos = reserva.recursos.map((i) => {
    const desc = catalogo?.recursos.find((r) => r.id === i.recursoId)?.desc ?? `Recurso ${i.recursoId}`
    return i.qtd > 1 ? `${desc} (${i.qtd})` : desc
  })

  function confirmar() {
    setErro(null)
    cancelar.mutate(reserva.id, {
      onSuccess: () => {
        cancelou.current = true
        setAberto(false)
        toast.success(`Reserva "${reserva.finalidade}" de ${dia} cancelada.`)
      },
      onError: (e) => {
        setAberto(false)
        setErro(e instanceof ErroApi ? e.message : 'Não foi possível cancelar a reserva.')
      },
    })
  }

  return (
    <li className="space-y-3 rounded-md bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 ref={titulo} tabIndex={-1} className="min-w-0 text-lg font-semibold break-words">
          {reserva.finalidade}
        </h2>
        <Badge variant={STATUS[status].variante}>
          <span className="sr-only">Status: </span>
          {STATUS[status].rotulo}
        </Badge>
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="font-medium">Local</dt>
        <dd className="break-words">{local(reserva, catalogo)}</dd>
        <dt className="font-medium">{reserva.periodos.length > 1 ? 'Períodos' : 'Período'}</dt>
        <dd>
          <ul>
            {reserva.periodos.map((p) => (
              <li key={p.inicio}>{formatarPeriodo(p.inicio, p.termino)}</li>
            ))}
          </ul>
        </dd>
        <dt className="font-medium">Participantes</dt>
        <dd>{reserva.participantes}</dd>
        {recursos.length > 0 && (
          <>
            <dt className="font-medium">Recursos</dt>
            <dd className="break-words">{recursos.join(', ')}</dd>
          </>
        )}
      </dl>

      {erro && (
        <p id={idErro} role="alert" className="rounded-md border border-destructive p-2 text-sm text-destructive">
          <strong>Não foi possível cancelar:</strong> {erro}
        </p>
      )}

      {!encerrada && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className={ALVO}>
            <Link to={`/reservas/${encodeURIComponent(reserva.id)}/editar`}>
              Editar<span className="sr-only"> reserva {reserva.finalidade} de {dia}</span>
            </Link>
          </Button>
          {/* Em andamento já passou do menor início: a antecedência (RN12) nunca seria atendida. */}
          {status === 'prevista' && (
          <AlertDialog open={aberto} onOpenChange={(v) => !cancelar.isPending && setAberto(v)}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className={ALVO} aria-describedby={erro ? idErro : undefined}>
                Cancelar<span className="sr-only"> reserva {reserva.finalidade} de {dia}</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent
              onCloseAutoFocus={(e) => {
                // O botão some quando a reserva passa a "cancelada": foco vai para o título do item.
                if (cancelou.current) {
                  e.preventDefault()
                  titulo.current?.focus()
                }
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar a reserva?</AlertDialogTitle>
                <AlertDialogDescription>
                  A reserva &quot;{reserva.finalidade}&quot; de {dia} será cancelada e o ambiente e os recursos ficarão
                  livres. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={cancelar.isPending} className={ALVO}>
                  Manter reserva
                </AlertDialogCancel>
                <Button variant="destructive" onClick={confirmar} disabled={cancelar.isPending} className={ALVO}>
                  {cancelar.isPending ? 'Cancelando…' : 'Cancelar reserva'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          )}
        </div>
      )}
    </li>
  )
}

export default function MinhasReservas() {
  const { data, isPending, error, refetch } = useMinhasReservas()
  const { data: catalogo } = useCatalogo()
  const reservas = [...(data ?? [])].sort((a, b) => inicioDe(a).localeCompare(inicioDe(b)))

  return (
    <section className="space-y-4">
      <TituloPagina>Minhas reservas</TituloPagina>
      <Button asChild className={ALVO}>
        <Link to="/reservas/nova">Nova reserva</Link>
      </Button>

      {isPending ? (
        <output className="block">Carregando reservas…</output>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p>Não foi possível carregar suas reservas: {error.message}</p>
          <Button variant="outline" className={ALVO} onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : reservas.length === 0 ? (
        <p>Você ainda não tem reservas.</p>
      ) : (
        <ul aria-label="Reservas" className="space-y-3">
          {reservas.map((r) => (
            <ItemReserva key={r.id} reserva={r} catalogo={catalogo} />
          ))}
        </ul>
      )}
    </section>
  )
}
