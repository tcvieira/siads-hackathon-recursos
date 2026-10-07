/**
 * /reservas/nova e /reservas/:id/editar (tarefa 3.4; R2, R3.3, R3.6, R4.3).
 *
 * Pré-preenchimento vindo da grade: `?ambienteId=<id>&inicio=<ISO −03:00 ou YYYY-MM-DDTHH:MM>`
 * (término sugerido: início + 1 h). Só vale em /reservas/nova.
 */
import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlertIcon, PlusIcon } from 'lucide-react'
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
import { TituloPagina } from '@/componentes/TituloPagina'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { deDatetimeLocal, paraDatetimeLocal, somarMinutos } from '@/lib/datas'

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
              inicio: z.string().min(1, 'Informe a data e a hora de início.'),
              termino: z.string().min(1, 'Informe a data e a hora de término.'),
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

type Valores = z.infer<ReturnType<typeof criarEsquema>>

interface ItemResumo {
  /** Id do controle; sem id o item aparece sem link (ex.: 403, falha de rede). */
  id?: string
  mensagem: string
}

/** RN9: recurso sem vínculo vale para todos; com vínculo, só nos ambientes vinculados. */
const oferecido = (r: Recurso, ambiente: string) =>
  r.ativo && (!r.ambientesVinculados.length || r.ambientesVinculados.includes(ambiente))

const idPeriodo = (n: number, parte: 'inicio' | 'termino') => `campo-periodo-${n}-${parte}`

/** `Erro.campo` (+ `periodoIndex`) do servidor → id do controle na tela. */
function idDoErro(e: Erro): string {
  if (e.campo === 'periodos') return e.periodoIndex != null ? idPeriodo(e.periodoIndex, 'inicio') : 'campo-periodos'
  if (e.campo === 'ambienteId') return 'campo-ambiente'
  if (e.campo === 'disposicaoId') return 'campo-disposicao'
  return `campo-${e.campo}`
}

const textoDoErro = (e: Erro) => (e.sugestao ? `${e.mensagem} Sugestão: ${e.sugestao}.` : e.mensagem)

/** Erros do zod/react-hook-form na ordem dos campos na tela. */
function itensDoCliente(erros: FieldErrors<Valores>, valores: Valores): ItemResumo[] {
  const itens: ItemResumo[] = []
  const somar = (id: string, mensagem?: string) => mensagem && itens.push({ id, mensagem })
  somar('campo-ambiente', erros.ambiente?.message)
  somar('campo-complemento', erros.complemento?.message)
  somar('campo-finalidade', erros.finalidade?.message)
  somar('campo-participantes', erros.participantes?.message)
  somar('campo-periodos', erros.periodos?.message ?? erros.periodos?.root?.message)
  valores.periodos.forEach((_, n) => {
    somar(idPeriodo(n, 'inicio'), erros.periodos?.[n]?.inicio?.message)
    somar(idPeriodo(n, 'termino'), erros.periodos?.[n]?.termino?.message)
  })
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
    periodos: v.periodos.map((p) => ({ inicio: deDatetimeLocal(p.inicio), termino: deDatetimeLocal(p.termino) })),
    recursos: v.recursos.map(({ recursoId, qtd }) => ({ recursoId, qtd })),
  }
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
      periodos: reserva.periodos.map((p) => ({ inicio: paraDatetimeLocal(p.inicio), termino: paraDatetimeLocal(p.termino) })),
      recursos: reserva.recursos.map(({ recursoId, qtd }) => ({ recursoId, qtd })),
    }
  }
  const ambienteId = query.get('ambienteId')
  const inicio = inicioDaQuery(query.get('inicio'))
  return {
    ambiente: catalogo.ambientes.some((a) => a.ativo && a.id === ambienteId) ? ambienteId! : '',
    complemento: '',
    disposicaoId: '',
    finalidade: '',
    participantes: '',
    periodos: [{ inicio, termino: inicio ? paraDatetimeLocal(somarMinutos(deDatetimeLocal(inicio), 60)) : '' }],
    recursos: [],
  }
}

/** Leva o foco ao controle (ou ao primeiro controle focável dentro do grupo). */
function focarCampo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const alvo = el.matches('input, button, textarea')
    ? el
    : (el.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ?? el.querySelector<HTMLElement>('input, button, textarea'))
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
  const titulo = id ? 'Alterar reserva' : 'Nova reserva'

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
      <Formulario key={id ?? 'nova'} id={id} catalogo={catalogo.data} inicial={valoresIniciais(catalogo.data, reserva.data, query)} />
    )
  }

  return (
    <section className="space-y-6">
      <TituloPagina>{id ? `${titulo} ${id}` : titulo}</TituloPagina>
      {conteudo}
    </section>
  )
}

type EstadoAoVivo =
  | { tipo: 'ocioso' }
  | { tipo: 'verificando' }
  | { tipo: 'pronto'; erros: Erro[] }
  | { tipo: 'falha'; mensagem: string }

function Formulario({ id, catalogo, inicial }: { id?: string; catalogo: Catalogo; inicial: Valores }) {
  const navigate = useNavigate()
  const esquema = useMemo(() => criarEsquema(catalogo), [catalogo])
  const { register, control, handleSubmit, watch, getValues, setValue, formState } = useForm<Valores>({
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

  const [resumo, setResumo] = useState<ItemResumo[]>([])
  const [errosServidor, setErrosServidor] = useState<Erro[]>([])
  const [aoVivo, setAoVivo] = useState<EstadoAoVivo>({ tipo: 'ocioso' })
  const [avisoRecursos, setAvisoRecursos] = useState('')
  const resumoRef = useRef<HTMLDivElement>(null)
  const adicionarRef = useRef<HTMLButtonElement>(null)
  const sequencia = useRef(0)

  const ambientes = useMemo(
    () => catalogo.ambientes.filter((a) => a.ativo).sort((a, b) => a.desc.localeCompare(b.desc, 'pt-BR')),
    [catalogo],
  )
  const recursoPorId = useMemo(() => new Map(catalogo.recursos.map((r) => [r.id, r])), [catalogo])
  const { config } = catalogo

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

  // Erros do servidor ficam velhos quando o usuário muda qualquer valor.
  useEffect(() => {
    const assinatura = watch(() => setErrosServidor((atual) => (atual.length ? [] : atual)))
    return () => assinatura.unsubscribe()
  }, [watch])

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
    const completos = v.periodos.length > 0 && v.periodos.every((p) => p.inicio && p.termino && p.termino > p.inicio)
    const vez = ++sequencia.current
    if (!v.ambiente || !completos) {
      setAoVivo({ tipo: 'ocioso' })
      return
    }
    const espera = setTimeout(() => {
      setAoVivo({ tipo: 'verificando' })
      validar({ entrada: paraEntrada(v), id }).then(
        (r) => vez === sequencia.current && setAoVivo({ tipo: 'pronto', erros: r.erros.filter((e) => CAMPOS_AO_VIVO.has(e.campo)) }),
        (e: Error) => vez === sequencia.current && setAoVivo({ tipo: 'falha', mensagem: e.message }),
      )
    }, 500)
    return () => clearTimeout(espera)
  }, [chaveAoVivo, getValues, validar, id])

  useEffect(() => {
    if (resumo.length) resumoRef.current?.focus()
  }, [resumo])

  const revalidar = { shouldDirty: true, shouldValidate: isSubmitted }

  const alternarRecurso = (r: Recurso, marcar: boolean) => {
    const atuais = getValues('recursos')
    setValue('recursos', marcar ? [...atuais, { recursoId: r.id, qtd: 1 }] : atuais.filter((i) => i.recursoId !== r.id), revalidar)
  }
  const mudarQtd = (recursoId: string, qtd: number) =>
    setValue('recursos', getValues('recursos').map((i) => (i.recursoId === recursoId ? { ...i, qtd } : i)), revalidar)

  const aoEnviar = handleSubmit(
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
        if (erro.erros.length) {
          setErrosServidor(erro.erros)
          setResumo(erro.erros.map((x) => ({ id: idDoErro(x), mensagem: textoDoErro(x) })))
        } else {
          setResumo([{ mensagem: erro.message }])
        }
      }
    },
    (falhas) => setResumo(itensDoCliente(falhas, getValues())),
  )

  const disposicoes = catalogo.disposicoes.filter((d) => d.ativo)
  const gruposComRecursos = catalogo.grupos
    .map((g) => ({ ...g, recursos: catalogo.recursos.filter((r) => r.grupoId === g.id && oferecido(r, valores.ambiente)) }))
    .filter((g) => g.recursos.length)
  const localProprio = valores.ambiente === LOCAL_PROPRIO
  const errosAoVivo = aoVivo.tipo === 'pronto' ? aoVivo.erros : []

  return (
    <form noValidate onSubmit={aoEnviar} className="max-w-3xl space-y-8">
      {resumo.length > 0 && (
        <div
          ref={resumoRef}
          role="alert"
          tabIndex={-1}
          aria-labelledby="titulo-resumo"
          className="space-y-2 rounded-lg border-2 border-destructive p-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <h2 id="titulo-resumo" className="flex items-center gap-2 font-semibold text-destructive">
            <CircleAlertIcon aria-hidden="true" className="size-5 shrink-0" />
            Não foi possível salvar: {resumo.length === 1 ? 'há 1 problema' : `há ${resumo.length} problemas`}
          </h2>
          <ul className="list-disc space-y-1 pl-6">
            {resumo.map((item, n) => (
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

      <p className="text-sm text-muted-foreground">Campos marcados com * são obrigatórios.</p>

      {/* Ambiente e complemento */}
      <div className="space-y-4">
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
            Sem ambiente, escolha "Não solicitado / local próprio" e informe o local no complemento.
          </p>
          {erros('campo-ambiente')}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="campo-complemento">Complemento{localProprio ? ' *' : ' (opcional)'}</Label>
          <Textarea
            id="campo-complemento"
            rows={2}
            aria-required={localProprio}
            aria-invalid={invalido('campo-complemento')}
            aria-describedby={descritoPor('campo-complemento', 'ajuda-complemento')}
            {...register('complemento')}
          />
          <p id="ajuda-complemento" className="text-sm text-muted-foreground">
            Detalhes do local. Obrigatório quando não há ambiente.
          </p>
          {erros('campo-complemento')}
        </div>
      </div>

      {/* Disposição */}
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
          className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {[{ id: SEM_DISPOSICAO, desc: 'Sem preferência', icone: '' }, ...disposicoes].map((d) => (
            <label
              key={d.id}
              htmlFor={`disp-${d.id}`}
              className="flex cursor-pointer flex-col gap-2 rounded-lg border-2 border-border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <span className="flex min-h-6 items-center gap-2">
                <RadioGroupItem id={`disp-${d.id}`} value={d.id} aria-labelledby={`disp-${d.id}-nome`} />
                <span id={`disp-${d.id}-nome`} className="text-sm font-medium">
                  {d.desc}
                </span>
              </span>
              {d.icone && (
                <img
                  src={`/icones/${d.icone}`}
                  alt={`Desenho da disposição ${d.desc}`}
                  loading="lazy"
                  className="h-24 w-full rounded object-contain"
                />
              )}
            </label>
          ))}
        </RadioGroup>
        {erros('campo-disposicao')}
      </div>

      {/* Finalidade e participantes */}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-1.5">
          <Label htmlFor="campo-finalidade">Finalidade *</Label>
          <Input
            id="campo-finalidade"
            autoComplete="off"
            maxLength={TAMANHO_FINALIDADE}
            aria-required="true"
            aria-invalid={invalido('campo-finalidade')}
            aria-describedby={descritoPor('campo-finalidade', 'ajuda-finalidade')}
            className="h-11 sm:h-9"
            {...register('finalidade')}
          />
          <p id="ajuda-finalidade" className="text-sm text-muted-foreground">
            Até {TAMANHO_FINALIDADE} caracteres ({valores.finalidade.length} usados).
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
            className="h-11 sm:h-9"
            {...register('participantes')}
          />
          {erros('campo-participantes')}
        </div>
      </div>

      {/* Períodos */}
      <fieldset id="campo-periodos" className="space-y-3" aria-describedby={descritoPor('campo-periodos', 'ajuda-periodos')}>
        <legend className="text-base font-semibold">Períodos *</legend>
        <p id="ajuda-periodos" className="text-sm text-muted-foreground">
          De 1 a {MAX_PERIODOS} períodos, entre {config.faixaInicio} e {config.faixaFim}, começando com pelo menos{' '}
          {config.antecedenciaMin} minutos de antecedência.
        </p>
        {erros('campo-periodos')}

        {fields.map((campo, n) => (
          <fieldset key={campo.id} className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">Período {n + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
              {(['inicio', 'termino'] as const).map((parte) => {
                const campoId = idPeriodo(n, parte)
                return (
                  <div key={parte} className="min-w-0 space-y-1.5">
                    <Label htmlFor={campoId}>{parte === 'inicio' ? 'Início' : 'Término'}</Label>
                    <Input
                      id={campoId}
                      type="datetime-local"
                      aria-required="true"
                      aria-invalid={invalido(campoId)}
                      aria-describedby={descritoPor(campoId)}
                      className="h-11 sm:h-9"
                      {...register(`periodos.${n}.${parte}`)}
                    />
                    {erros(campoId)}
                  </div>
                )
              })}
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:mt-6 sm:h-9"
                  onClick={() => {
                    remove(n)
                    requestAnimationFrame(() => adicionarRef.current?.focus())
                  }}
                >
                  Remover<span className="sr-only"> período {n + 1}</span>
                </Button>
              )}
            </div>
          </fieldset>
        ))}

        <Button
          ref={adicionarRef}
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          disabled={fields.length >= MAX_PERIODOS}
          onClick={() => append({ inicio: '', termino: '' })}
        >
          <PlusIcon aria-hidden="true" />
          Adicionar período
        </Button>
        {fields.length >= MAX_PERIODOS && <p className="text-sm text-muted-foreground">Limite de {MAX_PERIODOS} períodos atingido.</p>}

        <div aria-live="polite" className="text-sm">
          {aoVivo.tipo === 'verificando' && <p>Verificando disponibilidade…</p>}
          {aoVivo.tipo === 'falha' && <p>Não foi possível verificar a disponibilidade agora: {aoVivo.mensagem}</p>}
          {aoVivo.tipo === 'pronto' && errosAoVivo.length === 0 && <p>Disponível: nenhum conflito nos períodos informados.</p>}
          {errosAoVivo.length > 0 && (
            <div className="rounded-lg border-2 border-destructive p-3">
              <p className="flex items-center gap-1.5 font-medium text-destructive">
                <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
                Indisponível:
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-6">
                {errosAoVivo.map((e, n) => (
                  <li key={n}>{textoDoErro(e)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </fieldset>

      {/* Recursos */}
      <fieldset id="campo-recursos" className="space-y-4" aria-describedby={descritoPor('campo-recursos', 'ajuda-recursos')}>
        <legend className="text-base font-semibold">Recursos (opcional)</legend>
        <p id="ajuda-recursos" className="text-sm text-muted-foreground">
          Até {MAX_RECURSOS} recursos, sendo no máximo {MAX_LIMITADOS} com quantidade limitada. A lista mostra só o que está disponível
          {valores.ambiente && !localProprio ? ' no ambiente escolhido' : ' sem ambiente'}.
        </p>
        {erros('campo-recursos')}
        <output className="block text-sm">{avisoRecursos}</output>

        {gruposComRecursos.map((g) => (
          <fieldset key={g.id} className="space-y-1">
            <legend className="text-sm font-medium">{g.desc}</legend>
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

      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11 sm:h-9" aria-disabled={salvando || undefined}>
          {salvando ? 'Salvando…' : id ? 'Salvar alterações' : 'Salvar reserva'}
        </Button>
        <Button asChild variant="outline" className="h-11 sm:h-9">
          <Link to="/minhas-reservas">Voltar sem salvar</Link>
        </Button>
      </div>
    </form>
  )
}
