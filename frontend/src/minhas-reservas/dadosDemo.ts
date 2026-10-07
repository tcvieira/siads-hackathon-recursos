/**
 * Reservas mock do solicitante para desenvolver a tela sem backend.
 * Substituídas por GET /reservas?minhas=1 na integração (tarefa 3.9).
 * Datas relativas a "agora" para exercitar os quatro status (RN13).
 */
import type { Reserva } from '../api/tipos'

function iso(d: Date): string {
  return d.toISOString()
}

export function reservasDemo(agora: Date): Reserva[] {
  const base = (horasDeAgora: number, duracaoH: number) => {
    const ini = new Date(agora.getTime() + horasDeAgora * 3_600_000)
    const fim = new Date(ini.getTime() + duracaoH * 3_600_000)
    return { inicio: iso(ini), termino: iso(fim) }
  }
  const comum = {
    solicitanteSub: 'u-solicitante',
    solicitanteEmail: 'solicitante@example.com',
    setoresIds: ['1'],
    versao: 1,
    criadoEm: iso(agora),
    recursos: [],
  }
  return [
    {
      ...comum,
      id: '17301',
      finalidade: 'Reunião de planejamento trimestral',
      participantes: 12,
      ambienteId: '1',
      periodos: [base(72, 2)], // daqui a 3 dias → prevista, cancelável
      cancelada: false,
    },
    {
      ...comum,
      id: '17302',
      finalidade: 'Treinamento em andamento',
      participantes: 8,
      ambienteId: '5',
      periodos: [base(-1, 2)], // começou há 1h → em andamento
      cancelada: false,
    },
    {
      ...comum,
      id: '17303',
      finalidade: 'Palestra já realizada',
      participantes: 30,
      ambienteId: '1',
      periodos: [base(-72, 2)], // 3 dias atrás → transcorrida
      cancelada: false,
    },
    {
      ...comum,
      id: '17304',
      finalidade: 'Workshop cancelado',
      participantes: 15,
      ambienteId: '3',
      periodos: [base(96, 3)],
      cancelada: true, // → cancelada
    },
  ]
}
