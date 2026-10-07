/**
 * Dados de catálogo mock para desenvolver o formulário sem backend.
 * Substituídos por GET /catalogo na integração (tarefa 3.9). Fiéis aos CSVs.
 */
import type { Ambiente, Config, Disposicao, GrupoRecurso, Recurso } from '../api/tipos'

export const CONFIG_DEMO: Config = {
  faixaInicio: '07:00',
  faixaFim: '20:00',
  antecedenciaMin: 120,
  margemMin: 30,
}

export const AMBIENTES_DEMO: Ambiente[] = [
  { id: '1', desc: 'Auditório (Completo)', ativo: true, paiId: null, setores: ['1'] },
  { id: '5', desc: 'Auditório (Parte A)', ativo: true, paiId: '1', setores: ['1'] },
  { id: '6', desc: 'Auditório (Parte B)', ativo: true, paiId: '1', setores: ['1'] },
  { id: '3', desc: 'Sala de Reuniões - 9º andar', ativo: true, paiId: null, setores: ['1'] },
]

export const DISPOSICOES_DEMO: Disposicao[] = [
  { id: '1', desc: 'Auditório', ativo: true, icone: 'disp_001.jpg' },
  { id: '2', desc: 'Auditório com mesas', ativo: true, icone: 'disp_002.jpg' },
  { id: '5', desc: 'Mesa única', ativo: true, icone: 'disp_005.jpg' },
  { id: '7', desc: 'Mesas em "U"', ativo: true, icone: 'disp_007.jpg' },
]

export const GRUPOS_DEMO: GrupoRecurso[] = [
  { id: '1', desc: 'Serviço' },
  { id: '3', desc: 'Estrutura' },
  { id: '2', desc: 'Equipamento' },
]

export const RECURSOS_DEMO: Recurso[] = [
  { id: '3', desc: 'Serviço de Copa - Água e Café', grupoId: '1', limitado: false, disponibilidade: 0, ativo: true, icone: 'serv_001.png', ambientesVinculados: [], setores: ['1'] },
  { id: '4', desc: 'Som Ambiente', grupoId: '3', limitado: false, disponibilidade: 0, ativo: true, icone: 'estrut_001.png', ambientesVinculados: [], setores: ['3'] },
  { id: '6', desc: 'Projetor Multimídia Portátil', grupoId: '2', limitado: true, disponibilidade: 2, ativo: true, icone: 'equip_005.png', ambientesVinculados: [], setores: ['2'] },
  { id: '8', desc: 'Notebook (c/ leitor DVD)', grupoId: '2', limitado: true, disponibilidade: 4, ativo: true, icone: 'equip_002.png', ambientesVinculados: [], setores: ['2'] },
  { id: '13', desc: 'Projetor Multimídia Fixo', grupoId: '2', limitado: false, disponibilidade: 0, ativo: true, icone: 'equip_005.png', ambientesVinculados: ['1', '5', '6'], setores: ['3'] },
]
