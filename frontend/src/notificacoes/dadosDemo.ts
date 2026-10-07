/**
 * Caixa de notificações mock (e-mails simulados + pedidos SNP).
 * Substituída por GET /notificacoes na integração (3.9).
 *
 * O campo `html` existe no contrato, mas o frontend NUNCA o renderiza (evita XSS):
 * a tela mostra os campos estruturados (`alteracoes[]`), conforme design.md §6.
 */
import type { CaixaNotificacoes } from '../api/tipos'

export function caixaDemo(): CaixaNotificacoes {
  return {
    emails: [
      {
        reservaId: '17310',
        ts: '2026-10-07T09:00:00-03:00',
        setorId: '2',
        para: 'PRCE-ListaSEART@mpf.mp.br',
        assunto: 'Nova reserva nº 17310 — Reunião de diretoria',
        tipo: 'criada',
        html: '<h1>Nova reserva</h1>', // não renderizado
        alteracoes: [],
      },
      {
        reservaId: '17310',
        ts: '2026-10-07T11:30:00-03:00',
        setorId: '2',
        para: 'PRCE-ListaSEART@mpf.mp.br',
        assunto: 'Reserva alterada nº 17310 — Reunião de diretoria',
        tipo: 'alterada',
        html: '<h1>Reserva alterada</h1>', // não renderizado
        alteracoes: [
          { campo: 'participantes', antes: '10', depois: '14' },
          { campo: 'períodos', antes: '07/10 09:00–11:00', depois: '07/10 09:00–12:00' },
        ],
      },
      {
        reservaId: '17299',
        ts: '2026-10-06T16:10:00-03:00',
        setorId: '1',
        para: 'PRCE-SMSG@mpf.mp.br',
        assunto: 'Reserva cancelada nº 17299 — Palestra',
        tipo: 'cancelada',
        html: '<h1>Reserva cancelada</h1>', // não renderizado
        alteracoes: [],
      },
    ],
    pedidosSnp: [
      { reservaId: '17310', setorId: '2', numero: 'SNP-2026-00042', codigoServico: 'TI-PROJ', situacao: 'ativo' },
      { reservaId: '17299', setorId: '1', numero: 'SNP-2026-00037', codigoServico: 'COPA', situacao: 'cancelado' },
    ],
  }
}
