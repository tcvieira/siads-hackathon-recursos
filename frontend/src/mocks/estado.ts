/**
 * Estado em memória dos mocks: reservas do cenário de demo (espelho de scripts/seed.py,
 * `cenario_demo`), e-mails simulados e pedidos SNP (design.md §6). Some ao recarregar a página.
 */
import type { Alteracao, EmailSimulado, PedidoSnp, Reserva, ReservaEntrada, TipoEmail } from '@/api/tipos'
import type { Usuario } from '@/auth/usuario'
import { USUARIOS_MOCK } from '@/auth/usuario'
import { ehDiaUtil, formatarPeriodo, hoje, isoDe, paraIso, somarDias } from '@/lib/datas'
import { catalogo, CODIGOS_SNP, setores } from '@/mocks/catalogo'
import { ambientePorId, recursoPorId } from '@/mocks/dominio'

export const reservas = new Map<string, Reserva>()
export const emails: EmailSimulado[] = []
export const pedidosSnp: PedidoSnp[] = []
let ultimoId = 20000
let ultimoSnp = 0

/** União dos setores do ambiente e dos recursos pedidos, ordenada por id. */
function setoresDe(ambienteId: string | null, recursos: { recursoId: string }[]): string[] {
  const ids = new Set(ambienteId ? (ambientePorId.get(ambienteId)?.setores ?? []) : [])
  for (const item of recursos) for (const s of recursoPorId.get(item.recursoId)?.setores ?? []) ids.add(s)
  return [...ids].sort((a, b) => Number(a) - Number(b))
}

/** Código de serviço SNP do setor para os recursos pedidos (R11.4), se houver. */
const codigoSnp = (setorId: string, reserva: Reserva) =>
  reserva.recursos.map((i) => CODIGOS_SNP[`${setorId}#${i.recursoId}`]).find(Boolean)

const nomeAmbiente = (r: Reserva) => (r.ambienteId ? (ambientePorId.get(r.ambienteId)?.desc ?? r.ambienteId) : `Local próprio: ${r.complemento ?? ''}`)
const nomeDisposicao = (r: Reserva) => catalogo.disposicoes.find((d) => d.id === r.disposicaoId)?.desc ?? '—'
const textoPeriodos = (r: Reserva) => r.periodos.map((p) => formatarPeriodo(p.inicio, p.termino)).join('; ')
const textoRecursos = (r: Reserva) =>
  r.recursos.map((i) => `${recursoPorId.get(i.recursoId)?.desc ?? i.recursoId} (${i.qtd})`).join('; ') || '—'

/** `diff_reservas` do design §6: período, ambiente, disposição, finalidade, participantes, recursos. */
function diferencas(antes: Reserva, depois: Reserva): Alteracao[] {
  const campos: [string, (r: Reserva) => string][] = [
    ['período', textoPeriodos],
    ['ambiente', nomeAmbiente],
    ['disposição', nomeDisposicao],
    ['finalidade', (r) => r.finalidade],
    ['participantes', (r) => String(r.participantes)],
    ['recursos', textoRecursos],
  ]
  return campos.flatMap(([campo, f]) => (f(antes) === f(depois) ? [] : [{ campo, antes: f(antes), depois: f(depois) }]))
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Lambda `notificacoes` simulada: e-mail por setor + upsert do pedido SNP (RN10–RN12). */
function notificar(tipo: TipoEmail, reserva: Reserva, antes?: Reserva): void {
  const alteracoes = antes ? diferencas(antes, reserva) : []
  if (tipo === 'alterada' && !alteracoes.length) return
  const ts = paraIso(Date.now())
  const envolvidos = new Set([...(antes?.setoresIds ?? []), ...reserva.setoresIds])
  for (const setorId of envolvidos) {
    const setor = setores.find((s) => s.id === setorId)
    const assunto = `[SISGARES] Reserva ${reserva.id} ${tipo}: ${reserva.finalidade}`
    emails.push({
      reservaId: reserva.id,
      ts,
      setorId,
      para: setor?.email ?? '',
      assunto,
      tipo,
      html: `<p>${escapar(assunto)}</p>`,
      alteracoes,
    })
    const pedido = pedidosSnp.find((p) => p.reservaId === reserva.id && p.setorId === setorId)
    const codigo = reserva.setoresIds.includes(setorId) ? codigoSnp(setorId, reserva) : undefined
    if (tipo === 'cancelada' || !codigo) {
      if (pedido) pedido.situacao = 'cancelado'
    } else if (pedido) {
      Object.assign(pedido, { codigoServico: codigo, situacao: 'ativo' })
    } else {
      ultimoSnp += 1
      pedidosSnp.push({
        reservaId: reserva.id,
        setorId,
        numero: `SNP-${new Date().getFullYear()}-${String(ultimoSnp).padStart(5, '0')}`,
        codigoServico: codigo,
        situacao: 'ativo',
      })
    }
  }
}

export function criar(entrada: ReservaEntrada, usuario: Pick<Usuario, 'sub' | 'email'>, criadoEm = paraIso(Date.now())): Reserva {
  ultimoId += 1
  const reserva: Reserva = {
    id: String(ultimoId),
    finalidade: entrada.finalidade.trim(),
    participantes: entrada.participantes,
    ambienteId: entrada.ambienteId,
    complemento: entrada.complemento ?? null,
    disposicaoId: entrada.disposicaoId ?? null,
    periodos: entrada.periodos.map((p) => ({ inicio: paraIso(p.inicio), termino: paraIso(p.termino) })),
    recursos: entrada.recursos,
    solicitanteSub: usuario.sub,
    solicitanteEmail: usuario.email,
    setoresIds: setoresDe(entrada.ambienteId, entrada.recursos),
    cancelada: false,
    versao: 1,
    criadoEm,
  }
  reservas.set(reserva.id, reserva)
  notificar('criada', reserva)
  return reserva
}

export function alterar(antiga: Reserva, entrada: ReservaEntrada): Reserva {
  const nova: Reserva = {
    ...antiga,
    finalidade: entrada.finalidade.trim(),
    participantes: entrada.participantes,
    ambienteId: entrada.ambienteId,
    complemento: entrada.complemento ?? null,
    disposicaoId: entrada.disposicaoId ?? null,
    periodos: entrada.periodos.map((p) => ({ inicio: paraIso(p.inicio), termino: paraIso(p.termino) })),
    recursos: entrada.recursos,
    setoresIds: setoresDe(entrada.ambienteId, entrada.recursos),
    versao: antiga.versao + 1,
  }
  reservas.set(nova.id, nova)
  notificar('alterada', nova, antiga)
  return nova
}

export function cancelar(reserva: Reserva): Reserva {
  const cancelada = { ...reserva, cancelada: true, versao: reserva.versao + 1 }
  reservas.set(cancelada.id, cancelada)
  notificar('cancelada', cancelada)
  return cancelada
}

// --- Cenário de demo (scripts/seed.py, cenario_demo) -------------------------------------

function diasUteis(apos: string, quantos: number): string[] {
  const dias: string[] = []
  for (let d = somarDias(apos, 1); dias.length < quantos; d = somarDias(d, 1)) if (ehDiaUtil(d)) dias.push(d)
  return dias
}

function carregarCenario(): void {
  const [d1, d2, d3, d4, d5] = diasUteis(hoje(), 5)
  const em = (dia: string, ini: string, fim: string) => ({ inicio: isoDe(dia, ini), termino: isoDe(dia, fim) })
  const coord = { sub: 'ficticio-coord', email: 'coordenacao.eventos@example.com' }
  const ficticio = (i: number) => ({ sub: `ficticio-0${i}`, email: `pessoa0${i}@example.com` })
  const solicitante = USUARIOS_MOCK.solicitante
  const especificacao: [{ sub: string; email: string }, string, string, ReturnType<typeof em>, [string, number][]][] = [
    // F-RN5, F-RN6 e F-RN8 (R11.6)
    [coord, '1', 'Seminário institucional (F-RN5)', em(d1, '09:00', '11:00'), [['3', 1]]],
    [coord, '5', 'Treinamento de servidores (F-RN6)', em(d1, '14:00', '16:00'), [['2', 1]]],
    [coord, '3', 'Oficina de planejamento (F-RN8)', em(d1, '14:00', '16:00'), [['6', 2]]],
    // Cards dos próximos dias para o SMSG (copa) e reservas do solicitante de demo.
    [ficticio(1), '7', 'Videoconferência com a PGR', em(d1, '10:00', '12:00'), [['3', 1], ['76', 1]]],
    [ficticio(2), '1', 'Audiência pública', em(d2, '14:00', '17:00'), [['2', 1], ['5', 1]]],
    [ficticio(3), '28', 'Palestra de integração', em(d3, '09:00', '11:00'), [['1', 1]]],
    [solicitante, '3', 'Reunião de alinhamento da equipe', em(d3, '15:00', '16:30'), [['3', 1]]],
    [ficticio(4), '6', 'Sessão de mediação', em(d4, '08:30', '10:00'), [['2', 1]]],
    [solicitante, '7', 'Reunião com órgãos parceiros', em(d5, '13:00', '15:00'), [['3', 1], ['8', 1]]],
  ]
  for (const [usuario, ambienteId, finalidade, periodo, itens] of especificacao) {
    criar(
      {
        finalidade,
        participantes: 20,
        ambienteId,
        disposicaoId: '5',
        periodos: [periodo],
        recursos: itens.map(([recursoId, qtd]) => ({ recursoId, qtd })),
      },
      usuario,
    )
  }
  // ≥ 3 reservas do solicitante: a terceira já transcorreu (no seed, a primeira histórica do CSV).
  const passado = somarDias(hoje(), -10)
  const transcorrida = criar(
    {
      finalidade: 'Reunião de alinhamento da PR/CE',
      participantes: 12,
      ambienteId: '3',
      disposicaoId: '6',
      periodos: [em(passado, '10:00', '12:00')],
      recursos: [{ recursoId: '1', qtd: 1 }],
    },
    solicitante,
    isoDe(somarDias(passado, -7), '09:00'),
  )
  // As reservas carregadas pelo seed não geram e-mail; aqui o histórico fica só com as do cenário.
  for (let i = emails.length - 1; i >= 0; i--) if (emails[i].reservaId === transcorrida.id) emails.splice(i, 1)
  for (let i = pedidosSnp.length - 1; i >= 0; i--) if (pedidosSnp[i].reservaId === transcorrida.id) pedidosSnp.splice(i, 1)
}

carregarCenario()
