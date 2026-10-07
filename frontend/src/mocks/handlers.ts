/**
 * Handlers MSW para todas as rotas do design.md §4, sob o prefixo `/api` (config.ts).
 * O usuário vem do token simulado `Bearer mock:<papel>` (cliente.ts). Mesma autorização do §5:
 * 400/409 com `RespostaErro`; 401/403/404 com `{mensagem}` genérica.
 */
import { delay, http, HttpResponse } from 'msw'
import type {
  CaixaNotificacoes,
  CardAtendimento,
  Erro,
  PeriodoOcupado,
  Reserva,
  ReservaEntrada,
  RespostaErro,
  ResultadoValidacao,
} from '@/api/tipos'
import { PAPEIS, USUARIOS_MOCK, type Papel, type Usuario } from '@/auth/usuario'
import { sobrepoe } from '@/lib/datas'
import { catalogo } from '@/mocks/catalogo'
import {
  conflitosAmbiente,
  excessoRecursos,
  familia,
  periodosAlterados,
  podeAlterar,
  podeCancelar,
  status,
  validarBasico,
} from '@/mocks/dominio'
import { alterar, cancelar, criar, emails, pedidosSnp, reservas } from '@/mocks/estado'

const API = '*/api'

const mensagem = (status: number, texto: string) => HttpResponse.json({ mensagem: texto }, { status })
const erros = (status: 400 | 409, lista: Erro[]) => HttpResponse.json<RespostaErro>({ erros: lista }, { status })

function usuarioDe(request: Request): Usuario | null {
  const papel = request.headers.get('Authorization')?.match(/^Bearer mock:(\w+)$/)?.[1]
  return PAPEIS.includes(papel as Papel) ? USUARIOS_MOCK[papel as Papel] : null
}

const tem = (u: Usuario, ...papeis: Papel[]) => u.grupos.some((g) => papeis.includes(g))

/** E-mail mascarado para o atendente (LGPD, design §10). */
const mascarar = (email: string) => email.replace(/^(.{2})[^@]*/, '$1***')

function paraUsuario(reserva: Reserva, usuario: Usuario): Reserva {
  const comStatus = { ...reserva, status: status(reserva, Date.now()) }
  return tem(usuario, 'admin') || reserva.solicitanteSub === usuario.sub
    ? comStatus
    : { ...comStatus, solicitanteEmail: mascarar(reserva.solicitanteEmail) }
}

/** `de`/`ate` em ISO; um dia `YYYY-MM-DD` vira 00:00 −03:00. Sem valor = sem limite. */
function intervalo(url: URL): [string, string] {
  const ler = (nome: string, padrao: string) => {
    const valor = url.searchParams.get(nome)
    if (!valor) return padrao
    return valor.length === 10 ? `${valor}T00:00:00-03:00` : valor
  }
  return [ler('de', '0000-01-01T00:00:00-03:00'), ler('ate', '9999-12-31T23:59:59-03:00')]
}

/** Erros de domínio de uma entrada: básicos (400) e conflitos RN5/RN6/RN8 (409). */
function validar(entrada: ReservaEntrada, antiga?: Reserva) {
  const agora = Date.now()
  const basicos = [
    ...(antiga ? podeAlterar(antiga, agora) : []),
    ...validarBasico(entrada, agora, antiga ? periodosAlterados(antiga, entrada) : null),
  ]
  const conflitos = [...conflitosAmbiente(entrada, reservas.values(), antiga?.id), ...excessoRecursos(entrada, reservas.values(), antiga?.id)]
  return { basicos, conflitos }
}

/** Autentica e confere o papel; devolve o usuário ou a resposta de erro. */
function exigir(request: Request, ...papeis: Papel[]): Usuario | Response {
  const usuario = usuarioDe(request)
  if (!usuario) return mensagem(401, 'Não autenticado.')
  if (papeis.length && !tem(usuario, ...papeis)) return mensagem(403, 'Acesso negado.')
  return usuario
}

export const handlers = [
  http.get(`${API}/catalogo`, async ({ request }) => {
    const u = exigir(request)
    if (u instanceof Response) return u
    await delay(150)
    return HttpResponse.json(catalogo)
  }),

  http.get(`${API}/ambientes/:id/ocupacao`, async ({ request, params }) => {
    const u = exigir(request)
    if (u instanceof Response) return u
    const id = String(params.id)
    if (!catalogo.ambientes.some((a) => a.id === id)) return mensagem(404, 'Não encontrado.')
    const [de, ate] = intervalo(new URL(request.url))
    const afetados = familia(id)
    const ocupados: PeriodoOcupado[] = [...reservas.values()]
      .filter((r) => !r.cancelada && r.ambienteId && afetados.has(r.ambienteId))
      .flatMap((r) => r.periodos.map((p) => ({ ambienteId: r.ambienteId!, inicio: p.inicio, termino: p.termino })))
      .filter((p) => sobrepoe(p.inicio, p.termino, de, ate))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
    await delay(150)
    return HttpResponse.json(ocupados)
  }),

  http.post(`${API}/reservas/validar`, async ({ request }) => {
    const u = exigir(request, 'solicitante', 'admin')
    if (u instanceof Response) return u
    const entrada = (await request.json()) as ReservaEntrada
    const id = new URL(request.url).searchParams.get('id')
    const antiga = id ? reservas.get(id) : undefined
    const { basicos, conflitos } = validar(entrada, antiga)
    const lista = [...basicos, ...conflitos]
    await delay(200)
    return HttpResponse.json<ResultadoValidacao>({ ok: !lista.length, erros: lista })
  }),

  http.post(`${API}/reservas`, async ({ request }) => {
    const u = exigir(request, 'solicitante', 'admin')
    if (u instanceof Response) return u
    const entrada = (await request.json()) as ReservaEntrada
    const { basicos, conflitos } = validar(entrada)
    await delay(300)
    if (basicos.length) return erros(400, basicos)
    if (conflitos.length) return erros(409, conflitos)
    return HttpResponse.json(paraUsuario(criar(entrada, u), u), { status: 201 })
  }),

  http.get(`${API}/reservas`, async ({ request }) => {
    const u = exigir(request, 'solicitante', 'admin')
    if (u instanceof Response) return u
    const minhas = [...reservas.values()]
      .filter((r) => r.solicitanteSub === u.sub)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .map((r) => paraUsuario(r, u))
    await delay(150)
    return HttpResponse.json(minhas)
  }),

  http.get(`${API}/reservas/:id`, async ({ request, params }) => {
    const u = exigir(request)
    if (u instanceof Response) return u
    const reserva = reservas.get(String(params.id))
    const permitido =
      reserva &&
      (tem(u, 'admin') ||
        reserva.solicitanteSub === u.sub ||
        (tem(u, 'atendente') && !!u.setorId && reserva.setoresIds.includes(u.setorId)))
    await delay(150)
    // 404 também quando não pode ver: não revela que a reserva existe (R9.3).
    if (!reserva || !permitido) return mensagem(404, 'Não encontrado.')
    return HttpResponse.json(paraUsuario(reserva, u))
  }),

  http.put(`${API}/reservas/:id`, async ({ request, params }) => {
    const u = exigir(request, 'solicitante', 'admin')
    if (u instanceof Response) return u
    const antiga = reservas.get(String(params.id))
    if (!antiga || (!tem(u, 'admin') && antiga.solicitanteSub !== u.sub)) return mensagem(404, 'Não encontrado.')
    const entrada = (await request.json()) as ReservaEntrada
    const { basicos, conflitos } = validar(entrada, antiga)
    await delay(300)
    const encerrada = basicos.filter((e) => e.codigo === 'RESERVA_ENCERRADA')
    if (encerrada.length) return erros(409, encerrada)
    if (basicos.length) return erros(400, basicos)
    if (conflitos.length) return erros(409, conflitos)
    return HttpResponse.json(paraUsuario(alterar(antiga, entrada), u))
  }),

  http.delete(`${API}/reservas/:id`, async ({ request, params }) => {
    const u = exigir(request, 'solicitante', 'admin')
    if (u instanceof Response) return u
    const reserva = reservas.get(String(params.id))
    if (!reserva || (!tem(u, 'admin') && reserva.solicitanteSub !== u.sub)) return mensagem(404, 'Não encontrado.')
    const impedimentos = podeCancelar(reserva, Date.now())
    await delay(300)
    if (impedimentos.length) return erros(409, impedimentos)
    return HttpResponse.json(paraUsuario(cancelar(reserva), u))
  }),

  http.get(`${API}/painel/atendimento`, async ({ request }) => {
    const u = exigir(request, 'atendente', 'admin')
    if (u instanceof Response) return u
    const [de, ate] = intervalo(new URL(request.url))
    const cards: CardAtendimento[] = [...reservas.values()]
      .filter((r) => tem(u, 'admin') || (!!u.setorId && r.setoresIds.includes(u.setorId)))
      .filter((r) => r.periodos.some((p) => p.inicio >= de && p.inicio < ate))
      .sort((a, b) => a.periodos[0].inicio.localeCompare(b.periodos[0].inicio))
      .map((r) => ({
        reserva: paraUsuario(r, u),
        pedidosSnp: pedidosSnp.filter((p) => p.reservaId === r.id && (tem(u, 'admin') || p.setorId === u.setorId)),
      }))
    await delay(150)
    return HttpResponse.json(cards)
  }),

  http.get(`${API}/notificacoes`, async ({ request }) => {
    const u = exigir(request, 'atendente', 'admin')
    if (u instanceof Response) return u
    const [de, ate] = intervalo(new URL(request.url))
    const doSetor = (setorId: string) => tem(u, 'admin') || setorId === u.setorId
    const caixa: CaixaNotificacoes = {
      emails: emails.filter((e) => doSetor(e.setorId) && e.ts >= de && e.ts < ate).sort((a, b) => b.ts.localeCompare(a.ts)),
      pedidosSnp: pedidosSnp.filter((p) => doSetor(p.setorId)),
    }
    await delay(150)
    return HttpResponse.json(caixa)
  }),
]
