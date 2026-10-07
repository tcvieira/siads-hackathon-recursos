/**
 * Cards de atendimento mock. Substituídos por GET /painel/atendimento na 3.9.
 * O e-mail do solicitante já vem MASCARADO (a Lambda mascara por LGPD — R8.3);
 * o frontend nunca recebe o e-mail completo para o atendente.
 */
import type { CardAtendimento } from '../api/tipos'

function iso(d: Date): string {
  return d.toISOString()
}

export function cardsDemo(agora: Date): CardAtendimento[] {
  const emDias = (dias: number, horaIni: number, duracaoH: number) => {
    const ini = new Date(agora)
    ini.setDate(ini.getDate() + dias)
    ini.setHours(horaIni, 0, 0, 0)
    const fim = new Date(ini.getTime() + duracaoH * 3_600_000)
    return { inicio: iso(ini), termino: iso(fim) }
  }
  const comum = {
    solicitanteSub: 'u-sol',
    setoresIds: ['1'],
    versao: 1,
    criadoEm: iso(agora),
    complemento: null,
    disposicaoId: null,
  }
  return [
    {
      reserva: {
        ...comum,
        id: '17310',
        finalidade: 'Reunião de diretoria',
        participantes: 10,
        ambienteId: '1',
        periodos: [emDias(0, 9, 2)],
        recursos: [
          { recursoId: '3', qtd: 1 },
          { recursoId: '6', qtd: 1 },
        ],
        solicitanteEmail: 's***@e***.com',
        cancelada: false,
        status: 'prevista',
      },
      pedidosSnp: [
        { reservaId: '17310', setorId: '2', numero: 'SNP-2026-00042', codigoServico: 'TI-PROJ', situacao: 'ativo' },
      ],
    },
    {
      reserva: {
        ...comum,
        id: '17311',
        finalidade: 'Treinamento de equipe',
        participantes: 20,
        ambienteId: '5',
        periodos: [emDias(0, 14, 3)],
        recursos: [{ recursoId: '8', qtd: 4 }],
        solicitanteEmail: 'm***@e***.com',
        cancelada: false,
        status: 'prevista',
      },
      pedidosSnp: [],
    },
    {
      reserva: {
        ...comum,
        id: '17312',
        finalidade: 'Audiência pública',
        participantes: 50,
        ambienteId: '1',
        periodos: [emDias(2, 10, 4)],
        recursos: [{ recursoId: '3', qtd: 1 }],
        solicitanteEmail: 'a***@e***.com',
        cancelada: false,
        status: 'prevista',
      },
      pedidosSnp: [],
    },
  ]
}
