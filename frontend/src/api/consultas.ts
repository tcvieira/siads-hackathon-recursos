/** Hooks do react-query para cada rota da API (design.md §4). Erros chegam como `ErroApi`. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requisitar } from '@/api/cliente'
import type {
  CaixaNotificacoes,
  CardAtendimento,
  Catalogo,
  PeriodoOcupado,
  Reserva,
  ReservaEntrada,
  ResultadoValidacao,
} from '@/api/tipos'

const comPeriodo = (de?: string, ate?: string) => {
  const qs = new URLSearchParams()
  if (de) qs.set('de', de)
  if (ate) qs.set('ate', ate)
  const texto = qs.toString()
  return texto ? `?${texto}` : ''
}

const json = (corpo: unknown): RequestInit => ({ body: JSON.stringify(corpo) })

/** GET /catalogo — não muda durante a sessão. */
export function useCatalogo() {
  return useQuery({
    queryKey: ['catalogo'],
    queryFn: () => requisitar<Catalogo>('/catalogo'),
    staleTime: Infinity,
  })
}

/** GET /ambientes/{id}/ocupacao?de&ate — inclui ancestrais e descendentes (RN6). `de`/`ate` em ISO −03:00. */
export function useOcupacao(ambienteId: string | null | undefined, de: string, ate: string) {
  return useQuery({
    queryKey: ['ocupacao', ambienteId, de, ate],
    queryFn: () =>
      requisitar<PeriodoOcupado[]>(`/ambientes/${encodeURIComponent(ambienteId!)}/ocupacao${comPeriodo(de, ate)}`),
    enabled: !!ambienteId,
  })
}

/** GET /reservas?minhas=1 — reservas do usuário logado, com status. */
export function useMinhasReservas() {
  return useQuery({
    queryKey: ['reservas', 'minhas'],
    queryFn: () => requisitar<Reserva[]>('/reservas?minhas=1'),
  })
}

/** GET /reservas/{id} — só busca com `id` definido. */
export function useReserva(id: string | undefined) {
  return useQuery({
    queryKey: ['reservas', id],
    queryFn: () => requisitar<Reserva>(`/reservas/${encodeURIComponent(id!)}`),
    enabled: !!id,
  })
}

/** GET /painel/atendimento?de&ate — cards do atendente/admin (R8). */
export function usePainelAtendimento(de: string, ate: string) {
  return useQuery({
    queryKey: ['painel', de, ate],
    queryFn: () => requisitar<CardAtendimento[]>(`/painel/atendimento${comPeriodo(de, ate)}`),
  })
}

/** GET /notificacoes?de&ate — e-mails simulados e pedidos SNP (R6.4). */
export function useNotificacoes(de?: string, ate?: string) {
  return useQuery({
    queryKey: ['notificacoes', de ?? null, ate ?? null],
    queryFn: () => requisitar<CaixaNotificacoes>(`/notificacoes${comPeriodo(de, ate)}`),
  })
}

/**
 * POST /reservas/validar — dry-run (R2–R4). `id` informa a reserva em alteração
 * (o mock e a API recebem `?reservaId=`).
 */
export function useValidarReserva() {
  return useMutation({
    mutationFn: ({ entrada, id }: { entrada: ReservaEntrada; id?: string }) =>
      requisitar<ResultadoValidacao>(`/reservas/validar${id ? `?reservaId=${encodeURIComponent(id)}` : ''}`, {
        method: 'POST',
        ...json(entrada),
      }),
  })
}

/** Depois de gravar, tudo que depende de reservas fica velho. */
function useInvalidarReservas() {
  const cliente = useQueryClient()
  return () =>
    Promise.all(
      ['reservas', 'ocupacao', 'painel', 'notificacoes'].map((chave) =>
        cliente.invalidateQueries({ queryKey: [chave] }),
      ),
    )
}

/** POST /reservas — 201 com a reserva, ou `ErroApi` 400/409 com `erros`. */
export function useCriarReserva() {
  const invalidar = useInvalidarReservas()
  return useMutation({
    mutationFn: (entrada: ReservaEntrada) => requisitar<Reserva>('/reservas', { method: 'POST', ...json(entrada) }),
    onSuccess: invalidar,
  })
}

/** PUT /reservas/{id} (R5.1). */
export function useAlterarReserva() {
  const invalidar = useInvalidarReservas()
  return useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: ReservaEntrada }) =>
      requisitar<Reserva>(`/reservas/${encodeURIComponent(id)}`, { method: 'PUT', ...json(entrada) }),
    onSuccess: invalidar,
  })
}

/** DELETE /reservas/{id} (R5.2). */
export function useCancelarReserva() {
  const invalidar = useInvalidarReservas()
  return useMutation({
    mutationFn: (id: string) => requisitar<Reserva | null>(`/reservas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: invalidar,
  })
}
