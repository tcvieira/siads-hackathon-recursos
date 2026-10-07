/**
 * Catálogo dos mocks, gerado a partir de docs/requisitos/dados/*.csv (mesmas regras do
 * scripts/seed.py: ativo "S", vínculos e setores ordenados por id, config fixa do seed).
 */
import type { Catalogo, Setor } from '@/api/tipos'

export const catalogo: Catalogo = {
  "ambientes": [
    {
      "id": "1",
      "desc": "Auditório (Completo)",
      "ativo": true,
      "paiId": null,
      "setores": [
        "1",
        "23"
      ]
    },
    {
      "id": "2",
      "desc": "Sala de Reuniões - 5º andar",
      "ativo": false,
      "paiId": null,
      "setores": [
        "1"
      ]
    },
    {
      "id": "3",
      "desc": "Sala de Reuniões - 9º andar",
      "ativo": true,
      "paiId": null,
      "setores": [
        "1",
        "23"
      ]
    },
    {
      "id": "4",
      "desc": "Sala VIP",
      "ativo": false,
      "paiId": null,
      "setores": [
        "1"
      ]
    },
    {
      "id": "5",
      "desc": "Auditório (Parte A)",
      "ativo": true,
      "paiId": "1",
      "setores": [
        "1",
        "23"
      ]
    },
    {
      "id": "6",
      "desc": "Auditório (Parte B)",
      "ativo": true,
      "paiId": "1",
      "setores": [
        "1",
        "23"
      ]
    },
    {
      "id": "7",
      "desc": "Sala Videoconferências/Audiências-10º andar",
      "ativo": true,
      "paiId": null,
      "setores": [
        "1",
        "23"
      ]
    },
    {
      "id": "8",
      "desc": "Sala de Audiências-Mezanino 01",
      "ativo": false,
      "paiId": null,
      "setores": [
        "1",
        "2"
      ]
    },
    {
      "id": "28",
      "desc": "Antessala do Memorial da PR/CE",
      "ativo": true,
      "paiId": null,
      "setores": [
        "1",
        "3",
        "23"
      ]
    },
    {
      "id": "48",
      "desc": "Sala Videoconferências-2º andar",
      "ativo": false,
      "paiId": null,
      "setores": [
        "1"
      ]
    },
    {
      "id": "68",
      "desc": "Gabinete - Salas 701, 702 e 703",
      "ativo": false,
      "paiId": null,
      "setores": [
        "1",
        "2",
        "3"
      ]
    },
    {
      "id": "88",
      "desc": "Gabinete de Apoio - Salas 504 e 505",
      "ativo": false,
      "paiId": null,
      "setores": [
        "1"
      ]
    }
  ],
  "disposicoes": [
    {
      "id": "1",
      "desc": "Auditório",
      "ativo": true,
      "icone": "disp_001.jpg"
    },
    {
      "id": "2",
      "desc": "Auditório com mesas",
      "ativo": true,
      "icone": "disp_002.jpg"
    },
    {
      "id": "3",
      "desc": "Espinha de peixe",
      "ativo": true,
      "icone": "disp_003.jpg"
    },
    {
      "id": "4",
      "desc": "Espinha de peixe com mesas",
      "ativo": true,
      "icone": "disp_004.jpg"
    },
    {
      "id": "5",
      "desc": "Mesa única",
      "ativo": true,
      "icone": "disp_005.jpg"
    },
    {
      "id": "6",
      "desc": "Mesas em retângulo",
      "ativo": true,
      "icone": "disp_006.jpg"
    },
    {
      "id": "7",
      "desc": "Mesas em \"U\"",
      "ativo": true,
      "icone": "disp_007.jpg"
    }
  ],
  "grupos": [
    {
      "id": "1",
      "desc": "Serviço"
    },
    {
      "id": "3",
      "desc": "Estrutura"
    },
    {
      "id": "2",
      "desc": "Equipamento"
    }
  ],
  "recursos": [
    {
      "id": "1",
      "desc": "Serviço de Copa - Água",
      "grupoId": "1",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "serv_003.png",
      "ambientesVinculados": [],
      "setores": [
        "1"
      ]
    },
    {
      "id": "2",
      "desc": "Serviço de Copa - Café",
      "grupoId": "1",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "serv_002.png",
      "ambientesVinculados": [],
      "setores": [
        "1"
      ]
    },
    {
      "id": "3",
      "desc": "Serviço de Copa - Água e Café",
      "grupoId": "1",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "serv_001.png",
      "ambientesVinculados": [],
      "setores": [
        "1"
      ]
    },
    {
      "id": "4",
      "desc": "Som Ambiente",
      "grupoId": "3",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "estrut_001.png",
      "ambientesVinculados": [
        "1",
        "5",
        "6"
      ],
      "setores": [
        "3"
      ]
    },
    {
      "id": "5",
      "desc": "Som Ambiente c/ Microfone",
      "grupoId": "3",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "estrut_002.png",
      "ambientesVinculados": [
        "1",
        "5",
        "6"
      ],
      "setores": [
        "3"
      ]
    },
    {
      "id": "6",
      "desc": "Projetor Multimídia Portátil",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 2,
      "ativo": true,
      "icone": "equip_005.png",
      "ambientesVinculados": [],
      "setores": [
        "2",
        "3"
      ]
    },
    {
      "id": "7",
      "desc": "Microcomputador",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 20,
      "ativo": false,
      "icone": "equip_001.png",
      "ambientesVinculados": [],
      "setores": [
        "2"
      ]
    },
    {
      "id": "8",
      "desc": "Notebook ( c/ leitor DVD )",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 4,
      "ativo": true,
      "icone": "equip_002.png",
      "ambientesVinculados": [],
      "setores": [
        "2"
      ]
    },
    {
      "id": "9",
      "desc": "Netbook ( s/ leitor DVD )",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 2,
      "ativo": true,
      "icone": "equip_003.png",
      "ambientesVinculados": [],
      "setores": [
        "2"
      ]
    },
    {
      "id": "10",
      "desc": "Impressora",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 3,
      "ativo": true,
      "icone": "equip_004.png",
      "ambientesVinculados": [],
      "setores": [
        "2"
      ]
    },
    {
      "id": "11",
      "desc": "Videoconferência (CODEC 01)",
      "grupoId": "2",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "equip_006.png",
      "ambientesVinculados": [
        "3"
      ],
      "setores": [
        "2"
      ]
    },
    {
      "id": "12",
      "desc": "Quadro / Flip chart",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 1,
      "ativo": true,
      "icone": "equip_007.png",
      "ambientesVinculados": [],
      "setores": [
        "3"
      ]
    },
    {
      "id": "13",
      "desc": "Projetor Multimídia Fixo",
      "grupoId": "2",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "equip_005.png",
      "ambientesVinculados": [
        "1",
        "5",
        "6"
      ],
      "setores": [
        "3"
      ]
    },
    {
      "id": "14",
      "desc": "Scanner",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 2,
      "ativo": true,
      "icone": "equip_008.png",
      "ambientesVinculados": [],
      "setores": [
        "2"
      ]
    },
    {
      "id": "15",
      "desc": "Material de Escritório",
      "grupoId": "2",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "equip_009.png",
      "ambientesVinculados": [],
      "setores": [
        "3"
      ]
    },
    {
      "id": "16",
      "desc": "Webcam",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 3,
      "ativo": true,
      "icone": "equip_010.png",
      "ambientesVinculados": [],
      "setores": [
        "2"
      ]
    },
    {
      "id": "36",
      "desc": "Apresentador Multimídia",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 2,
      "ativo": true,
      "icone": "equip_011.png",
      "ambientesVinculados": [],
      "setores": [
        "3"
      ]
    },
    {
      "id": "56",
      "desc": "Computador Desktop",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 6,
      "ativo": true,
      "icone": "equip_001.png",
      "ambientesVinculados": [],
      "setores": [
        "2"
      ]
    },
    {
      "id": "76",
      "desc": "Videoconferência (CODEC 02)",
      "grupoId": "2",
      "limitado": false,
      "disponibilidade": 0,
      "ativo": true,
      "icone": "equip_006.png",
      "ambientesVinculados": [
        "7",
        "48"
      ],
      "setores": [
        "2"
      ]
    },
    {
      "id": "96",
      "desc": "Videoconferência",
      "grupoId": "2",
      "limitado": true,
      "disponibilidade": 1,
      "ativo": true,
      "icone": "equip_006.png",
      "ambientesVinculados": [
        "1",
        "5",
        "6"
      ],
      "setores": [
        "2"
      ]
    }
  ],
  "config": {
    "faixaInicio": "07:00",
    "faixaFim": "20:00",
    "antecedenciaMin": 120,
    "margemMin": 30
  }
}

/** CAT#ENVO: fica só no mock (o e-mail nunca sai em GET /catalogo). */
export const setores: Setor[] = [
  {
    "id": "1",
    "desc": "SMSG - Seção de Manutenção e Serviços Gerais",
    "email": "PRCE-SMSG@mpf.mp.br",
    "ativo": true
  },
  {
    "id": "2",
    "desc": "SEART - Seção de Atendimento, Relacionamento e Telecomunicações",
    "email": "PRCE-ListaSEART@mpf.mp.br",
    "ativo": true
  },
  {
    "id": "3",
    "desc": "SELOG - Seção de Logística",
    "email": "PRCE-SELOG@mpf.mp.br",
    "ativo": true
  },
  {
    "id": "23",
    "desc": "SESOT - Seção de Segurança Orgânica e Transporte da PR/CE",
    "email": "prce-sesot@mpf.mp.br",
    "ativo": true
  }
]

/** R11.4: vínculos (setor, recurso) com código de serviço do SNP. Copa (SMSG) fica sem. */
export const CODIGOS_SNP: Record<string, string> = {
  '2#6': 'SNP-TI-0006',
  '2#8': 'SNP-TI-0008',
  '2#96': 'SNP-TI-0096',
  '3#5': 'SNP-LOG-0005',
}
