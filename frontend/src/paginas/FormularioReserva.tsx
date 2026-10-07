/**
 * /reservas/nova e /reservas/:id/editar (tarefa 3.4; R2, R3.3, R3.6, R4.3): assistente em 4 etapas
 * (onde e quando → detalhes → recursos → revisar e enviar).
 *
 * Pré-preenchimento vindo da grade: `?ambienteId=<id>&inicio=<ISO −03:00 ou YYYY-MM-DDTHH:MM>`
 * (término sugerido: início + 1 h). Só vale em /reservas/nova.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  CheckIcon,
  CircleAlertIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  LoaderCircleIcon,
  MapPinIcon,
  PackageIcon,
  PlusIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import type { FieldErrors } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { ErroApi } from '@/api/cliente'
import { useAlterarReserva, useCatalogo, useCriarReserva, useReserva, useValidarReserva } from '@/api/consultas'
import type { Catalogo, Erro, Recurso, Reserva, ReservaEntrada } from '@/api/tipos'
import { ComboboxAmbiente, LOCAL_PROPRIO } from '@/componentes/FormularioReservaAmbiente'
import { IndicadorEtapas } from '@/componentes/FormularioReservaEtapas'
import { ResumoReserva, StatusDisponibilidade } from '@/componentes/FormularioReservaResumo'
import type { EstadoAoVivo } from '@/componentes/FormularioReservaResumo'
import { TituloPagina } from '@/componentes/TituloPagina'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { deDatetimeLocal, ehDiaUtil, formatarHora, hoje, isoDe, paraDatetimeLocal, slotsDoDia, somarDias, somarMinutos } from '@/lib/datas'

const MAX_PERIODOS = 5
const MAX_RECURSOS = 10
const MAX_LIMITADOS = 5
const TAMANHO_FINALIDADE = 200
const SEM_DISPOSICAO = 'sem-disposicao'
/** Erros do /validar que fazem sentido ao vivo (os demais aparecem no envio). */
const CAMPOS_AO_VIVO = new Set(['periodos', 'ambienteId', 'recursos'])

function criarEsquema(catalogo: Catalogo) {
  const recursoPorId = new Map(catalogo.recursos.map((r) => [r.id, r]))
  return z
    .object({
      ambiente: z.string().min(1, 'Escolha um ambiente ou "Não solicitado / local próprio".'),
      complemento: z.string(),
      disposicaoId: z.string(),
      finalidade: z
        .string()
        .refine((v) => v.trim().length > 0, 'Informe a finalidade.')
        .refine((v) => v.trim().length <= TAMANHO_FINALIDADE, `A finalidade pode ter no máximo ${TAMANHO_FINALIDADE} caracteres.`),
      participantes: z.string().regex(/^\s*[1-9]\d*\s*$/, 'Informe o número de participantes: um número inteiro, 1 ou mais.'),
      periodos: z
        .array(
          z
            .object({
              data: z.string().min(1, 'Informe a data.'),
              inicio: z.string().min(1, 'Escolha o horário de início.'),
              termino: z.string().min(1, 'Escolha o horário de término.'),
            })
            .refine((p) => !p.inicio || !p.termino || p.termino > p.inicio, {
              message: 'O término deve ser depois do início.',
              path: ['termino'],
            }),
        )
        .min(1, 'Informe ao menos um período.')
        .max(MAX_PERIODOS, `Informe no máximo ${MAX_PERIODOS} períodos.`),
      recursos: z.array(z.object({ recursoId: z.string(), qtd: z.number() })),
    })
    .superRefine((v, ctx) => {
      if (v.ambiente === LOCAL_PROPRIO && !v.complemento.trim()) {
        ctx.addIssue({ code: 'custom', path: ['complemento'], message: 'Sem ambiente (local próprio), informe o local no complemento.' })
      }
      if (v.recursos.length > MAX_RECURSOS) {
        ctx.addIssue({ code: 'custom', path: ['recursos'], message: `Escolha no máximo ${MAX_RECURSOS} recursos.` })
      }
      if (v.recursos.filter((i) => recursoPorId.get(i.recursoId)?.limitado).length > MAX_LIMITADOS) {
        ctx.addIssue({ code: 'custom', path: ['recursos'], message: `Escolha no máximo ${MAX_LIMITADOS} recursos com quantidade limitada.` })
      }
      v.recursos.forEach((i, n) => {
        const r = recursoPorId.get(i.recursoId)
        if (r?.limitado && (!Number.isInteger(i.qtd) || i.qtd < 1 || i.qtd > r.disponibilidade)) {
          ctx.addIssue({ code: 'custom', path: ['recursos', n, 'qtd'], message: `Informe a quantidade de ${r.desc}: de 1 a ${r.disponibilidade}.` })
        }
      })
    })
}

export type Valores = z.infer<ReturnType<typeof criarEsquema>>
type PeriodoCampos = Valores['periodos'][number]

/** Etapas do assistente e os campos validados ao "Continuar" de cada uma. */
const ETAPAS = [
  { nome: 'Onde e quando', icone: MapPinIcon, campos: ['ambiente', 'complemento', 'periodos'] },
  { nome: 'Detalhes', icone: FileTextIcon, campos: ['finalidade', 'participantes', 'disposicaoId'] },
  { nome: 'Recursos', icone: PackageIcon, campos: ['recursos'] },
  { nome: 'Revisar e enviar', icone: ClipboardCheckIcon, campos: [] },
] as const
const NOMES_ETAPAS = ETAPAS.map((e) => e.nome)
const REVISAR = ETAPAS.length - 1

interface ItemResumo {
  /** Id do controle; sem id o item aparece sem link (ex.: 403, falha de rede). */
  id?: string
  mensagem: string
}

/** RN9: recurso sem vínculo vale para todos; com vínculo, só nos ambientes vinculados. */
const oferecido = (r: Recurso, ambiente: string) =>
  r.ativo && (!r.ambientesVinculados.length || r.ambientesVinculados.includes(ambiente))

const idPeriodo = (n: number, parte: keyof PeriodoCampos) => `campo-periodo-${n}-${parte}`

const periodoCompleto = (p: PeriodoCampos) => !!(p.data && p.inicio && p.termino && p.termino > p.inicio)

/** `Erro.campo` (+ `periodoIndex`) do servidor → id do controle (ou grupo) na tela. */
function idDoErro(e: Erro): string {
  if (e.campo === 'periodos') return e.periodoIndex != null ? `campo-periodo-${e.periodoIndex}` : 'campo-periodos'
  if (e.campo === 'ambienteId') return 'campo-ambiente'
  if (e.campo === 'disposicaoId') return 'campo-disposicao'
  return `campo-${e.campo}`
}

/** Etapa onde está o controle; sem controle conhecido, fica na revisão. */
function etapaDoCampo(id?: string): number {
  if (!id) return REVISAR
  if (/^campo-(periodo|ambiente|complemento)/.test(id)) return 0
  if (/^campo-(finalidade|participantes|disposicao)/.test(id)) return 1
  if (/^campo-(recursos|qtd-)/.test(id)) return 2
  return REVISAR
}

const textoDoErro = (e: Erro) => (e.sugestao ? `${e.mensagem} Sugestão: ${e.sugestao}.` : e.mensagem)

/** Erros do zod/react-hook-form na ordem dos campos na tela. */
function itensDoCliente(erros: FieldErrors<Valores>, valores: Valores): ItemResumo[] {
  const itens: ItemResumo[] = []
  const somar = (id: string, mensagem?: string) => mensagem && itens.push({ id, mensagem })
  somar('campo-ambiente', erros.ambiente?.message)
  somar('campo-complemento', erros.complemento?.message)
  somar('campo-periodos', erros.periodos?.message ?? erros.periodos?.root?.message)
  valores.periodos.forEach((_, n) => {
    somar(idPeriodo(n, 'data'), erros.periodos?.[n]?.data?.message)
    somar(idPeriodo(n, 'inicio'), erros.periodos?.[n]?.inicio?.message)
    somar(idPeriodo(n, 'termino'), erros.periodos?.[n]?.termino?.message)
  })
  somar('campo-finalidade', erros.finalidade?.message)
  somar('campo-participantes', erros.participantes?.message)
  somar('campo-recursos', erros.recursos?.message ?? erros.recursos?.root?.message)
  valores.recursos.forEach((i, n) => somar(`campo-qtd-${i.recursoId}`, erros.recursos?.[n]?.qtd?.message))
  return itens
}

function paraEntrada(v: Valores): ReservaEntrada {
  return {
    finalidade: v.finalidade.trim(),
    participantes: Number(v.participantes),
    ambienteId: v.ambiente === LOCAL_PROPRIO ? null : v.ambiente,
    complemento: v.complemento.trim() || null,
    disposicaoId: v.disposicaoId || null,
    periodos: v.periodos.map((p) => ({ inicio: isoDe(p.data, p.inicio), termino: isoDe(p.data, p.termino) })),
    recursos: v.recursos.map(({ recursoId, qtd }) => ({ recursoId, qtd })),
  }
}

/** Instantes ISO → data + `HH:MM` de início e término (hora de Fortaleza). */
function paraCampos(inicio: string, termino: string): PeriodoCampos {
  const local = paraDatetimeLocal(inicio)
  return { data: local.slice(0, 10), inicio: local.slice(11, 16), termino: formatarHora(termino) }
}

/** `inicio` da query: `YYYY-MM-DDTHH:MM` (hora de Fortaleza) ou qualquer ISO válido. */
function inicioDaQuery(valor: string | null): string {
  if (!valor) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return valor
  return Number.isNaN(Date.parse(valor)) ? '' : paraDatetimeLocal(valor)
}

function valoresIniciais(catalogo: Catalogo, reserva: Reserva | undefined, query: URLSearchParams): Valores {
  if (reserva) {
    return {
      ambiente: reserva.ambienteId ?? LOCAL_PROPRIO,
      complemento: reserva.complemento ?? '',
      disposicaoId: reserva.disposicaoId ?? '',
      finalidade: reserva.finalidade,
      participantes: String(reserva.participantes),
      periodos: reserva.periodos.map((p) => paraCampos(p.inicio, p.termino)),
      recursos: reserva.recursos.map(({ recursoId, qtd }) => ({ recursoId, qtd })),
    }
  }
  const ambienteId = query.get('ambienteId')
  const inicio = inicioDaQuery(query.get('inicio'))
  const iso = deDatetimeLocal(inicio)
  return {
    ambiente: catalogo.ambientes.some((a) => a.ativo && a.id === ambienteId) ? ambienteId! : '',
    complemento: '',
    disposicaoId: '',
    finalidade: '',
    participantes: '',
    periodos: [inicio ? paraCampos(iso, somarMinutos(iso, 60)) : { data: '', inicio: '', termino: '' }],
    recursos: [],
  }
}

/** Próximo dia útil depois de `dia`. */
function proximoDiaUtil(dia: string): string {
  let d = somarDias(dia, 1)
  while (!ehDiaUtil(d)) d = somarDias(d, 1)
  return d
}

/** Leva o foco ao controle (ou ao primeiro controle focável dentro do grupo). */
function focarCampo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const alvo = el.matches('input, button, textarea, select')
    ? el
    : (el.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ?? el.querySelector<HTMLElement>('input, button, textarea, select'))
  ;(alvo ?? el).focus()
}

function MensagensErro({ id, mensagens }: { id: string; mensagens?: string[] }) {
  if (!mensagens?.length) return null
  return (
    <ul id={id} className="space-y-1 text-sm text-destructive">
      {mensagens.map((m) => (
        <li key={m} className="flex gap-1.5">
          <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="sr-only">Erro: </span>
            {m}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function FormularioReserva() {
  const { id } = useParams()
  const [query] = useSearchParams()
  const catalogo = useCatalogo()
  const reserva = useReserva(id)
  const titulo = id ? `Alterar reserva ${id}` : 'Nova reserva'

  let conteudo
  if (catalogo.isPending || (id && reserva.isPending)) {
    conteudo = <output className="block">Carregando…</output>
  } else if (catalogo.isError || reserva.isError) {
    conteudo = (
      <p role="alert">
        {(catalogo.error ?? reserva.error)?.message} <Link to="/minhas-reservas" className="underline">Voltar para Minhas reservas</Link>
      </p>
    )
  } else if (reserva.data && (reserva.data.cancelada || reserva.data.status === 'transcorrida' || reserva.data.status === 'cancelada')) {
    conteudo = (
      <p role="alert">
        A reserva {reserva.data.id} está {reserva.data.cancelada ? 'cancelada' : 'transcorrida'} e não pode ser alterada.{' '}
        <Link to="/minhas-reservas" className="underline">Voltar para Minhas reservas</Link>
      </p>
    )
  } else {
    conteudo = (
      <Formulario
        key={id ?? 'nova'}
        id={id}
        titulo={titulo}
        catalogo={catalogo.data}
        inicial={valoresIniciais(catalogo.data, reserva.data, query)}
      />
    )
  }

  return (
    <section className="space-y-6">
      <TituloPagina>{titulo}</TituloPagina>
      {conteudo}
    </section>
  )
}

const estiloSelect =
  'h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 sm:h-9 md:text-sm'

function Formulario({ id, titulo, catalogo, inicial }: { id?: string; titulo: string; catalogo: Catalogo; inicial: Valores }) {
  const navigate = useNavigate()
  const esquema = useMemo(() => criarEsquema(catalogo), [catalogo])
  const { register, control, handleSubmit, watch, getValues, setValue, trigger, getFieldState, formState } = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: inicial,
    shouldFocusError: false,
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'periodos' })
  const valores = watch()
  const { errors, isSubmitted } = formState

  const criar = useCriarReserva()
  const alterar = useAlterarReserva()
  const { mutateAsync: validar } = useValidarReserva()
  const salvando = criar.isPending || alterar.isPending

  const [etapa, setEtapa] = useState(0)
  /** Maior etapa já alcançada: o indicador deixa voltar (ou avançar) até ela. */
  const [visitada, setVisitada] = useState(0)
  const [resumo, setResumo] = useState<{ titulo: string; itens: ItemResumo[] } | null>(null)
  const [errosServidor, setErrosServidor] = useState<Erro[]>([])
  const [aoVivo, setAoVivo] = useState<EstadoAoVivo>({ tipo: 'ocioso' })
  const [avisoRecursos, setAvisoRecursos] = useState('')
  const resumoRef = useRef<HTMLDivElement>(null)
  const tituloEtapaRef = useRef<HTMLHeadingElement>(null)
  const adicionarRef = useRef<HTMLButtonElement>(null)
  const etapaAnterior = useRef(etapa)
  const sequencia = useRef(0)

  const ambientes = useMemo(
    () => catalogo.ambientes.filter((a) => a.ativo).sort((a, b) => a.desc.localeCompare(b.desc, 'pt-BR')),
    [catalogo],
  )
  const recursoPorId = useMemo(() => new Map(catalogo.recursos.map((r) => [r.id, r])), [catalogo])
  const { config } = catalogo
  /** Horários de 30 em 30 min dentro da faixa: inícios até faixaFim − 30, términos até faixaFim. */
  const inicios = useMemo(() => slotsDoDia(hoje(), config.faixaInicio, config.faixaFim).map((s) => s.rotulo), [config])
  const terminos = useMemo(() => [...inicios.slice(1), config.faixaFim], [inicios, config])

  // Mensagens por controle: zod (sempre atual) + último retorno 400/409 do servidor.
  const porCampo = new Map<string, string[]>()
  for (const { id: campo, mensagem } of [
    ...itensDoCliente(errors, valores),
    ...errosServidor.map((e) => ({ id: idDoErro(e), mensagem: textoDoErro(e) })),
  ]) {
    if (campo) porCampo.set(campo, [...(porCampo.get(campo) ?? []), mensagem])
  }
  const invalido = (campo: string) => porCampo.has(campo) || undefined
  const descritoPor = (campo: string, ...outros: string[]) =>
    [...outros, porCampo.has(campo) ? `${campo}-erro` : ''].filter(Boolean).join(' ') || undefined
  const erros = (campo: string) => <MensagensErro id={`${campo}-erro`} mensagens={porCampo.get(campo)} />

  // A cada mudança: erros do servidor ficam velhos; e, se a etapa já mostrou erros, revalida a etapa
  // (antes do primeiro envio o react-hook-form não revalida sozinho).
  useEffect(() => {
    const campos = ETAPAS[etapa].campos
    const assinatura = watch((_, { name }) => {
      setErrosServidor((atual) => (atual.length ? [] : atual))
      if (name && campos.some((c) => getFieldState(c).invalid)) void trigger(campos)
    })
    return () => assinatura.unsubscribe()
  }, [watch, trigger, getFieldState, etapa])

  // RN9: ao trocar de ambiente, tira os recursos que ele não oferece.
  useEffect(() => {
    const selecionados = getValues('recursos')
    const mantidos = selecionados.filter((i) => {
      const r = recursoPorId.get(i.recursoId)
      return r && oferecido(r, valores.ambiente)
    })
    if (mantidos.length === selecionados.length) return
    const removidos = selecionados.filter((i) => !mantidos.includes(i)).map((i) => recursoPorId.get(i.recursoId)?.desc ?? i.recursoId)
    setValue('recursos', mantidos, { shouldDirty: true })
    setAvisoRecursos(`Removido(s) por não estar(em) disponível(is) no ambiente escolhido: ${removidos.join(', ')}.`)
  }, [valores.ambiente, getValues, setValue, recursoPorId])

  // Validação no servidor (dry-run) 500 ms depois da última mudança em período, ambiente ou recursos.
  const chaveAoVivo = JSON.stringify([valores.ambiente, valores.periodos, valores.recursos])
  useEffect(() => {
    const v = getValues()
    const vez = ++sequencia.current
    if (!v.ambiente || !v.periodos.length || !v.periodos.every(periodoCompleto)) {
      setAoVivo({ tipo: 'ocioso' })
      return
    }
    setAoVivo({ tipo: 'verificando' })
    const espera = setTimeout(() => {
      validar({ entrada: paraEntrada(v), id }).then(
        (r) => vez === sequencia.current && setAoVivo({ tipo: 'pronto', erros: r.erros.filter((e) => CAMPOS_AO_VIVO.has(e.campo)) }),
        (e: Error) => vez === sequencia.current && setAoVivo({ tipo: 'falha', mensagem: e.message }),
      )
    }, 500)
    return () => clearTimeout(espera)
  }, [chaveAoVivo, getValues, validar, id])

  // Troca de etapa: título da aba com a etapa e foco no <h2> (não na primeira renderização: lá o foco é do <h1>).
  useEffect(() => {
    document.title = `${ETAPAS[etapa].nome} (etapa ${etapa + 1} de ${ETAPAS.length}) — ${titulo} — SISGARES`
    if (etapaAnterior.current === etapa) return
    etapaAnterior.current = etapa
    tituloEtapaRef.current?.focus()
  }, [etapa, titulo])

  // Depois do foco da etapa, para vencer quando os dois mudam juntos (erro no envio).
  useEffect(() => {
    if (resumo?.itens.length) resumoRef.current?.focus()
  }, [resumo])

  const revalidar = { shouldDirty: true, shouldValidate: isSubmitted }

  /** Valida só os campos da etapa `n`; com erro, mostra-a com o resumo de erros. */
  async function validarEtapa(n: number) {
    const campos = ETAPAS[n].campos
    if (!campos.length || (await trigger(campos))) return true
    const atuais = Object.fromEntries(campos.map((c) => [c, getFieldState(c).error])) as FieldErrors<Valores>
    const itens = itensDoCliente(atuais, getValues())
    setEtapa(n)
    setResumo({ titulo: 'Corrija para continuar', itens: itens.length ? itens : [{ mensagem: 'Revise os campos desta etapa.' }] })
    return false
  }

  /** Vai para a etapa `alvo`; para frente, valida cada etapa do caminho. */
  async function irPara(alvo: number) {
    for (let n = etapa; n < alvo; n++) if (!(await validarEtapa(n))) return
    setResumo(null)
    setEtapa(alvo)
    setVisitada((v) => Math.max(v, alvo))
  }

  /** Erros no envio: abre a etapa do primeiro campo com erro e lista os daquela etapa. */
  function mostrarFalhas(titulo: string, itens: ItemResumo[]) {
    const alvo = Math.min(REVISAR, ...itens.map((i) => etapaDoCampo(i.id)))
    setEtapa(alvo)
    setResumo({
      titulo,
      itens: itens.filter((i) => etapaDoCampo(i.id) === alvo).map((i) => (alvo === REVISAR ? { mensagem: i.mensagem } : i)),
    })
  }

  const enviar = handleSubmit(
    async (v) => {
      if (salvando) return
      setErrosServidor([])
      try {
        const salva = id
          ? await alterar.mutateAsync({ id, entrada: paraEntrada(v) })
          : await criar.mutateAsync(paraEntrada(v))
        toast.success(id ? `Reserva ${salva.id} alterada.` : `Reserva ${salva.id} criada.`)
        navigate('/minhas-reservas')
      } catch (e) {
        const erro = e instanceof ErroApi ? e : new ErroApi(0, 'Erro inesperado ao salvar.')
        setErrosServidor(erro.erros)
        mostrarFalhas(
          'Não foi possível enviar',
          erro.erros.length ? erro.erros.map((x) => ({ id: idDoErro(x), mensagem: textoDoErro(x) })) : [{ mensagem: erro.message }],
        )
      }
    },
    (falhas) => mostrarFalhas('Corrija para enviar', itensDoCliente(falhas, getValues())),
  )

  const alternarRecurso = (r: Recurso, marcar: boolean) => {
    const atuais = getValues('recursos')
    setValue('recursos', marcar ? [...atuais, { recursoId: r.id, qtd: 1 }] : atuais.filter((i) => i.recursoId !== r.id), revalidar)
  }
  const mudarQtd = (recursoId: string, qtd: number) =>
    setValue('recursos', getValues('recursos').map((i) => (i.recursoId === recursoId ? { ...i, qtd } : i)), revalidar)

  /** Ao escolher o início, sugere término 1 h depois (se ainda não há um término válido). */
  const sugerirTermino = (n: number, inicio: string) => {
    const termino = getValues(`periodos.${n}.termino`)
    const i = inicios.indexOf(inicio)
    if (i < 0 || (termino && termino > inicio)) return
    setValue(`periodos.${n}.termino`, terminos[Math.min(i + 1, terminos.length - 1)], revalidar)
  }
  /** Opções do select, incluindo o valor atual se ele estiver fora da grade de 30 min (reserva antiga). */
  const opcoes = (lista: string[], atual: string) => (!atual || lista.includes(atual) ? lista : [...lista, atual].sort())

  const disposicoes = catalogo.disposicoes.filter((d) => d.ativo)
  const gruposComRecursos = catalogo.grupos
    .map((g) => ({ ...g, recursos: catalogo.recursos.filter((r) => r.grupoId === g.id && oferecido(r, valores.ambiente)) }))
    .filter((g) => g.recursos.length)
  const localProprio = valores.ambiente === LOCAL_PROPRIO
  const mostrarComplemento = localProprio || !!inicial.complemento
  const errosAoVivo = aoVivo.tipo === 'pronto' ? aoVivo.erros : []
  const doPeriodo = (e: Erro) => e.campo === 'periodos' && e.periodoIndex != null
  const ultimo = valores.periodos.at(-1)
  const nLimitados = valores.recursos.filter((i) => recursoPorId.get(i.recursoId)?.limitado).length
  const Icone = ETAPAS[etapa].icone
  // O resumo encolhe à medida que os campos são corrigidos (itens sem campo ficam até a próxima tentativa).
  const pendentes = resumo?.itens.filter((i) => !i.id || porCampo.has(i.id)) ?? []
  const botao = 'h-11 sm:h-9'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,42rem)_minmax(16rem,22rem)] lg:items-start">
      <form
        noValidate
        className="min-w-0 space-y-4"
        onSubmit={(e) => {
          if (etapa < REVISAR) {
            e.preventDefault()
            void irPara(etapa + 1)
          } else {
            void enviar(e)
          }
        }}
      >
        <IndicadorEtapas nomes={NOMES_ETAPAS} atual={etapa} visitada={visitada} aoIr={(n) => void irPara(n)} />

        {pendentes.length > 0 && (
          <div
            ref={resumoRef}
            role="alert"
            tabIndex={-1}
            aria-labelledby="titulo-resumo"
            className="space-y-2 rounded-md border-2 border-destructive bg-card p-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <h2 id="titulo-resumo" className="flex items-center gap-2 font-semibold text-destructive">
              <CircleAlertIcon aria-hidden="true" className="size-5 shrink-0" />
              {resumo?.titulo}: {pendentes.length === 1 ? 'há 1 problema' : `há ${pendentes.length} problemas`}
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              {pendentes.map((item, n) => (
                <li key={n}>
                  {item.id ? (
                    <a
                      href={`#${item.id}`}
                      className="underline underline-offset-2"
                      onClick={(e) => {
                        e.preventDefault()
                        focarCampo(item.id!)
                      }}
                    >
                      {item.mensagem}
                    </a>
                  ) : (
                    item.mensagem
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-6 rounded-md bg-card p-4 shadow-sm sm:p-6">
          <h2 ref={tituloEtapaRef} tabIndex={-1} className="flex scroll-mt-4 items-center gap-2 text-lg font-semibold">
            <Icone aria-hidden="true" className="size-5 shrink-0 text-titulo-card" />
            {ETAPAS[etapa].nome}
          </h2>
          {etapa < 2 && <p className="text-sm text-muted-foreground">Campos marcados com * são obrigatórios.</p>}

          {etapa === 0 && (
            <>
              {/* Onde */}
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 font-semibold text-titulo-card">
                  <MapPinIcon aria-hidden="true" className="size-4 shrink-0" />
                  Onde
                </h3>
                <div className="space-y-1.5">
                  <Label id="rotulo-ambiente" htmlFor="campo-ambiente">
                    Ambiente *
                  </Label>
                  <ComboboxAmbiente
                    id="campo-ambiente"
                    rotuloId="rotulo-ambiente"
                    ambientes={ambientes}
                    valor={valores.ambiente}
                    aoMudar={(v) => setValue('ambiente', v, revalidar)}
                    invalido={!!invalido('campo-ambiente')}
                    descritoPor={descritoPor('campo-ambiente', 'ajuda-ambiente')}
                  />
                  <p id="ajuda-ambiente" className="text-sm text-muted-foreground">
                    Sem ambiente, escolha "Não solicitado / local próprio" e informe o local.
                  </p>
                  {erros('campo-ambiente')}
                </div>

                {mostrarComplemento && (
                  <div className="space-y-1.5">
                    <Label htmlFor="campo-complemento">{localProprio ? 'Local (complemento) *' : 'Complemento (opcional)'}</Label>
                    <Textarea
                      id="campo-complemento"
                      rows={2}
                      aria-required={localProprio}
                      aria-invalid={invalido('campo-complemento')}
                      aria-describedby={descritoPor('campo-complemento', 'ajuda-complemento')}
                      {...register('complemento')}
                    />
                    <p id="ajuda-complemento" className="text-sm text-muted-foreground">
                      Onde será a reunião, por exemplo: sala 304 do 3º andar.
                    </p>
                    {erros('campo-complemento')}
                  </div>
                )}
              </div>

              {/* Quando */}
              <fieldset id="campo-periodos" className="space-y-3" aria-describedby={descritoPor('campo-periodos', 'ajuda-periodos')}>
                <legend className="mb-3 flex items-center gap-2 font-semibold text-titulo-card">
                  <CalendarClockIcon aria-hidden="true" className="size-4 shrink-0" />
                  Quando *
                </legend>
                <p id="ajuda-periodos" className="text-sm text-muted-foreground">
                  De 1 a {MAX_PERIODOS} períodos, entre {config.faixaInicio} e {config.faixaFim}, começando com pelo menos{' '}
                  {config.antecedenciaMin} minutos de antecedência. A disponibilidade é conferida enquanto você preenche.
                </p>
                {erros('campo-periodos')}

                {fields.map((campo, n) => {
                  const p = valores.periodos[n] ?? { data: '', inicio: '', termino: '' }
                  const grupoId = `campo-periodo-${n}`
                  const problemas = errosAoVivo.filter((e) => doPeriodo(e) && e.periodoIndex === n)
                  // Registrar a data primeiro: ao adicionar período, o foco vai para ela.
                  const dataReg = register(`periodos.${n}.data`)
                  const inicioReg = register(`periodos.${n}.inicio`)
                  return (
                    <fieldset
                      key={campo.id}
                      id={grupoId}
                      aria-describedby={descritoPor(grupoId)}
                      className="space-y-3 rounded-md border border-border p-3"
                    >
                      <legend className="px-1 text-sm font-medium">Período {n + 1}</legend>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem]">
                        <div className="col-span-2 min-w-0 space-y-1.5 sm:col-span-1">
                          <Label htmlFor={idPeriodo(n, 'data')}>Data</Label>
                          <Input
                            id={idPeriodo(n, 'data')}
                            type="date"
                            min={hoje()}
                            aria-required="true"
                            aria-invalid={invalido(idPeriodo(n, 'data'))}
                            aria-describedby={descritoPor(idPeriodo(n, 'data'))}
                            className={botao}
                            {...dataReg}
                          />
                          {erros(idPeriodo(n, 'data'))}
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label htmlFor={idPeriodo(n, 'inicio')}>Início</Label>
                          <select
                            id={idPeriodo(n, 'inicio')}
                            aria-required="true"
                            aria-invalid={invalido(idPeriodo(n, 'inicio'))}
                            aria-describedby={descritoPor(idPeriodo(n, 'inicio'))}
                            className={estiloSelect}
                            {...inicioReg}
                            onChange={(e) => {
                              void inicioReg.onChange(e)
                              sugerirTermino(n, e.target.value)
                            }}
                          >
                            <option value="">Escolha</option>
                            {opcoes(inicios, p.inicio).map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                          {erros(idPeriodo(n, 'inicio'))}
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label htmlFor={idPeriodo(n, 'termino')}>Término</Label>
                          <select
                            id={idPeriodo(n, 'termino')}
                            aria-required="true"
                            aria-invalid={invalido(idPeriodo(n, 'termino'))}
                            aria-describedby={descritoPor(idPeriodo(n, 'termino'))}
                            className={estiloSelect}
                            {...register(`periodos.${n}.termino`)}
                          >
                            <option value="">Escolha</option>
                            {opcoes(terminos, p.termino).map((h) => (
                              <option key={h} value={h} disabled={!!p.inicio && h <= p.inicio}>
                                {h}
                              </option>
                            ))}
                          </select>
                          {erros(idPeriodo(n, 'termino'))}
                        </div>
                      </div>
                      {erros(grupoId)}

                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div aria-live="polite" className="min-w-0 flex-1 text-sm">
                          {aoVivo.tipo === 'verificando' && periodoCompleto(p) && (
                            <p className="flex items-center gap-1.5 text-muted-foreground">
                              <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 animate-spin" />
                              Verificando disponibilidade…
                            </p>
                          )}
                          {aoVivo.tipo === 'pronto' && problemas.length === 0 && (
                            <p className="flex items-center gap-1.5 font-medium text-sucesso">
                              <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
                              {localProprio ? 'Período válido' : 'Disponível'}
                              <span className="sr-only">: período {n + 1}</span>
                            </p>
                          )}
                          {problemas.map((e, i) => (
                            <p key={i} className="flex items-start gap-1.5 text-destructive">
                              <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                              <span>
                                <strong>{e.codigo.startsWith('CONFLITO') ? 'Conflito:' : 'Indisponível:'}</strong> {e.mensagem}
                                {e.sugestao && (
                                  <>
                                    {' '}
                                    <strong>Sugestão:</strong> {e.sugestao}.
                                  </>
                                )}
                              </span>
                            </p>
                          ))}
                        </div>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            className={botao}
                            onClick={() => {
                              remove(n)
                              requestAnimationFrame(() => adicionarRef.current?.focus())
                            }}
                          >
                            <Trash2Icon aria-hidden="true" />
                            Remover<span className="sr-only"> período {n + 1}</span>
                          </Button>
                        )}
                      </div>
                    </fieldset>
                  )
                })}

                <div className="flex flex-wrap gap-3">
                  <Button
                    ref={adicionarRef}
                    type="button"
                    variant="outline"
                    className={botao}
                    disabled={fields.length >= MAX_PERIODOS}
                    onClick={() => append({ data: '', inicio: '', termino: '' })}
                  >
                    <PlusIcon aria-hidden="true" />
                    Adicionar período
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={botao}
                    disabled={fields.length >= MAX_PERIODOS || !ultimo || !periodoCompleto(ultimo)}
                    onClick={() => ultimo && append({ ...ultimo, data: proximoDiaUtil(ultimo.data) })}
                  >
                    <CalendarPlusIcon aria-hidden="true" />
                    Mesmo horário no dia útil seguinte
                  </Button>
                </div>
                {fields.length >= MAX_PERIODOS && <p className="text-sm text-muted-foreground">Limite de {MAX_PERIODOS} períodos atingido.</p>}

                <div aria-live="polite" className="text-sm">
                  {aoVivo.tipo === 'falha' && <p>Não foi possível verificar a disponibilidade agora: {aoVivo.mensagem}</p>}
                  {errosAoVivo.some((e) => !doPeriodo(e)) && (
                    <div className="rounded-md border-2 border-destructive p-3">
                      <p className="flex items-center gap-1.5 font-medium text-destructive">
                        <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
                        Indisponível:
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-6">
                        {errosAoVivo
                          .filter((e) => !doPeriodo(e))
                          .map((e, n) => (
                            <li key={n}>{textoDoErro(e)}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              </fieldset>
            </>
          )}

          {etapa === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="campo-finalidade">Finalidade *</Label>
                  <Input
                    id="campo-finalidade"
                    autoComplete="off"
                    maxLength={TAMANHO_FINALIDADE}
                    aria-required="true"
                    aria-invalid={invalido('campo-finalidade')}
                    aria-describedby={descritoPor('campo-finalidade', 'ajuda-finalidade')}
                    className={botao}
                    {...register('finalidade')}
                  />
                  <p id="ajuda-finalidade" className="text-sm text-muted-foreground">
                    {valores.finalidade.length} de {TAMANHO_FINALIDADE} caracteres.
                  </p>
                  {erros('campo-finalidade')}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campo-participantes">Participantes *</Label>
                  <Input
                    id="campo-participantes"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    aria-required="true"
                    aria-invalid={invalido('campo-participantes')}
                    aria-describedby={descritoPor('campo-participantes')}
                    className={botao}
                    {...register('participantes')}
                  />
                  {erros('campo-participantes')}
                </div>
              </div>

              <div className="space-y-2">
                <p id="rotulo-disposicao" className="text-sm font-medium">
                  Disposição (opcional)
                </p>
                <RadioGroup
                  id="campo-disposicao"
                  aria-labelledby="rotulo-disposicao"
                  aria-describedby={descritoPor('campo-disposicao')}
                  value={valores.disposicaoId || SEM_DISPOSICAO}
                  onValueChange={(v) => setValue('disposicaoId', v === SEM_DISPOSICAO ? '' : v, revalidar)}
                  className="grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
                >
                  {[{ id: SEM_DISPOSICAO, desc: 'Sem preferência', icone: '' }, ...disposicoes].map((d) => (
                    <label
                      key={d.id}
                      htmlFor={`disp-${d.id}`}
                      className="flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-md border-2 border-border p-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                    >
                      {d.icone ? (
                        <img src={`/icones/${d.icone}`} alt="" loading="lazy" className="h-16 w-full rounded object-contain" />
                      ) : (
                        <span aria-hidden="true" className="flex h-16 items-center justify-center text-2xl text-muted-foreground">
                          —
                        </span>
                      )}
                      <span className="flex min-h-6 items-center gap-2">
                        <RadioGroupItem id={`disp-${d.id}`} value={d.id} aria-labelledby={`disp-${d.id}-nome`} />
                        <span id={`disp-${d.id}-nome`} className="text-sm leading-tight font-medium break-words">
                          {d.desc}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
                {erros('campo-disposicao')}
              </div>
            </>
          )}

          {etapa === 2 && (
            <fieldset id="campo-recursos" className="space-y-4" aria-describedby={descritoPor('campo-recursos', 'ajuda-recursos')}>
              <legend className="sr-only">Recursos (opcional)</legend>
              <p id="ajuda-recursos" className="text-sm text-muted-foreground">
                Opcional. Até {MAX_RECURSOS} recursos, sendo no máximo {MAX_LIMITADOS} com quantidade limitada. A lista mostra só o que
                está disponível {localProprio ? 'sem ambiente' : 'no ambiente escolhido'}.
              </p>
              <p className="text-sm font-medium">
                {valores.recursos.length} de {MAX_RECURSOS} selecionados ({nLimitados} de {MAX_LIMITADOS} com quantidade limitada).
              </p>
              {erros('campo-recursos')}
              <output className="block text-sm">{avisoRecursos}</output>

              {errosAoVivo.some((e) => e.campo === 'recursos') && (
                <div className="rounded-md border-2 border-destructive p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-destructive">
                    <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
                    Indisponível:
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-6">
                    {errosAoVivo
                      .filter((e) => e.campo === 'recursos')
                      .map((e, n) => (
                        <li key={n}>{textoDoErro(e)}</li>
                      ))}
                  </ul>
                </div>
              )}

              {gruposComRecursos.length === 0 && (
                <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                  Nenhum recurso pode ser pedido {localProprio ? 'sem ambiente' : 'para o ambiente escolhido'}. Continue para revisar a
                  reserva.
                </p>
              )}

              {gruposComRecursos.map((g) => (
                <fieldset key={g.id} className="space-y-1">
                  <legend className="text-sm font-semibold text-titulo-card">{g.desc}</legend>
                  <ul className="grid gap-x-6 sm:grid-cols-2">
                    {g.recursos.map((r) => {
                      const item = valores.recursos.find((i) => i.recursoId === r.id)
                      const qtdId = `campo-qtd-${r.id}`
                      return (
                        <li key={r.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1 sm:min-h-8">
                          <Checkbox
                            id={`recurso-${r.id}`}
                            checked={!!item}
                            onCheckedChange={(c) => alternarRecurso(r, c === true)}
                            aria-describedby={r.limitado ? `recurso-${r.id}-total` : undefined}
                          />
                          <Label htmlFor={`recurso-${r.id}`} className="font-normal">
                            <img src={`/icones/${r.icone}`} alt="" className="size-5" />
                            {r.desc}
                          </Label>
                          {r.limitado && (
                            <span id={`recurso-${r.id}-total`} className="text-sm text-muted-foreground">
                              ({r.disponibilidade} no total)
                            </span>
                          )}
                          {item && r.limitado && (
                            <div className="flex basis-full flex-wrap items-center gap-2 pl-6">
                              <Label htmlFor={qtdId}>
                                Quantidade<span className="sr-only"> de {r.desc}</span>
                              </Label>
                              <Input
                                id={qtdId}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={r.disponibilidade}
                                step={1}
                                value={Number.isNaN(item.qtd) ? '' : item.qtd}
                                onChange={(e) => mudarQtd(r.id, e.target.valueAsNumber)}
                                aria-invalid={invalido(qtdId)}
                                aria-describedby={descritoPor(qtdId)}
                                className="h-11 w-24 sm:h-9"
                              />
                              <div className="basis-full">{erros(qtdId)}</div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </fieldset>
              ))}
            </fieldset>
          )}

          {etapa === REVISAR && (
            <>
              <ResumoReserva catalogo={catalogo} valores={valores} aoEditar={(n) => void irPara(n)} />
              <section aria-labelledby="titulo-validacao" className="space-y-2 rounded-md bg-muted p-3 text-sm">
                <h3 id="titulo-validacao" className="font-semibold text-titulo-card">
                  Disponibilidade
                </h3>
                <div aria-live="polite">
                  <StatusDisponibilidade aoVivo={aoVivo} detalhado />
                </div>
                {errosAoVivo.length > 0 && (
                  <Button type="button" variant="link" className="h-11 px-0 text-link sm:h-8" onClick={() => void irPara(0)}>
                    Ajustar ambiente e períodos
                  </Button>
                )}
              </section>
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            {etapa > 0 ? (
              <Button type="button" variant="outline" className={botao} onClick={() => void irPara(etapa - 1)}>
                <ArrowLeftIcon aria-hidden="true" />
                Voltar
              </Button>
            ) : (
              <Button asChild variant="outline" className={botao}>
                <Link to="/minhas-reservas">
                  <ArrowLeftIcon aria-hidden="true" />
                  Cancelar
                </Link>
              </Button>
            )}
            {etapa < REVISAR ? (
              <Button type="submit" className={botao}>
                {etapa === 2 && !valores.recursos.length ? 'Continuar sem recursos' : 'Continuar'}
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            ) : (
              <Button type="submit" className={botao} aria-disabled={salvando || undefined}>
                {id ? <SaveIcon aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
                {salvando ? 'Enviando…' : id ? 'Salvar alterações' : 'Enviar reserva'}
              </Button>
            )}
          </div>
        </div>
      </form>

      <aside aria-labelledby="titulo-resumo-lateral" className="hidden space-y-4 rounded-md bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:block">
        <h2 id="titulo-resumo-lateral" className="text-lg font-semibold">
          Resumo da reserva
        </h2>
        <ResumoReserva catalogo={catalogo} valores={valores} />
        <div className="space-y-1 border-t border-border pt-3 text-sm">
          <h3 className="font-semibold text-titulo-card">Disponibilidade</h3>
          <StatusDisponibilidade aoVivo={aoVivo} />
        </div>
      </aside>
    </div>
  )
}
