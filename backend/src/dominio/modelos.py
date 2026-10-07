"""Contratos congelados do domínio (Fase 0).

Python puro: só dataclasses, sem Pydantic e sem boto3 (R12.2). O shape é o mesmo de
`frontend/src/api/tipos.ts`, campo a campo; mudar um exige mudar o outro e avisar as frentes.

Fontes: design.md §3 (modelo de dados) e §4 (API e códigos de erro).
Datas: strings ISO 8601 com offset −03:00 (`YYYY-MM-DDTHH:MM:SS-03:00`).
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal


# --- Códigos de erro do domínio (design.md §4) ---------------------------------------------


class CodigoErro(StrEnum):
    PERIODO_INVALIDO = "PERIODO_INVALIDO"
    CAMPO_OBRIGATORIO = "CAMPO_OBRIGATORIO"
    FORA_FAIXA = "FORA_FAIXA"
    SEM_ANTECEDENCIA = "SEM_ANTECEDENCIA"
    RECURSO_INDISPONIVEL_AMBIENTE = "RECURSO_INDISPONIVEL_AMBIENTE"
    CONFLITO_AMBIENTE = "CONFLITO_AMBIENTE"
    RECURSO_ESGOTADO = "RECURSO_ESGOTADO"
    RESERVA_ENCERRADA = "RESERVA_ENCERRADA"
    CANCELAMENTO_SEM_ANTECEDENCIA = "CANCELAMENTO_SEM_ANTECEDENCIA"
    CONFLITO_CONCORRENTE = "CONFLITO_CONCORRENTE"


@dataclass
class Erro:
    """Item de `erros[]` nas respostas 400/409 e em POST /reservas/validar."""

    campo: str
    codigo: CodigoErro
    mensagem: str
    periodoIndex: int | None = None
    sugestao: str | None = None


@dataclass
class RespostaErro:
    """Corpo das respostas 400 e 409 de POST/PUT /reservas e DELETE /reservas/{id}."""

    erros: list[Erro]


@dataclass
class ResultadoValidacao:
    """Resposta de POST /reservas/validar."""

    ok: bool
    erros: list[Erro] = field(default_factory=list)


# --- Catálogo (CAT#…) -------------------------------------------------------------------


@dataclass
class Ambiente:
    """CAT#AMBI. `paiId` define a hierarquia (RN6); `setores` são os ids de CAT#ENVO."""

    id: str
    desc: str
    ativo: bool
    paiId: str | None = None
    setores: list[str] = field(default_factory=list)


@dataclass
class Disposicao:
    """CAT#DISP. `icone` é o nome do arquivo em frontend/public/icones/."""

    id: str
    desc: str
    ativo: bool
    icone: str


@dataclass
class GrupoRecurso:
    """Grupo usado para agrupar recursos no formulário (`Recurso.grupoId`)."""

    id: str
    desc: str


@dataclass
class Recurso:
    """CAT#RECU. Sem `ambientesVinculados` vale para todos os ambientes (RN9)."""

    id: str
    desc: str
    grupoId: str
    limitado: bool
    disponibilidade: int
    ativo: bool
    icone: str
    ambientesVinculados: list[str] = field(default_factory=list)
    setores: list[str] = field(default_factory=list)


@dataclass
class Setor:
    """CAT#ENVO. O `email` nunca sai em GET /catalogo."""

    id: str
    desc: str
    email: str
    ativo: bool


@dataclass
class VinculoSetor:
    """CAT#VINC: SK `AMBI#<alvoId>#ENVO#<setorId>` ou `RECU#<alvoId>#ENVO#<setorId>`."""

    tipo: Literal["AMBI", "RECU"]
    alvoId: str
    setorId: str
    codigoServicoSnp: str | None = None


@dataclass
class Config:
    """CAT#CONF / GLOBAL. Faixa em "HH:MM"; antecedência e margem em minutos."""

    faixaInicio: str
    faixaFim: str
    antecedenciaMin: int
    margemMin: int


@dataclass
class Catalogo:
    """Resposta de GET /catalogo (sem e-mail de setor)."""

    ambientes: list[Ambiente]
    disposicoes: list[Disposicao]
    grupos: list[GrupoRecurso]
    recursos: list[Recurso]
    config: Config


# --- Reserva (RESE#<id>) ------------------------------------------------------------------

StatusReserva = Literal["prevista", "em_andamento", "transcorrida", "cancelada"]


@dataclass
class Periodo:
    """Intervalo [inicio, termino) de uma reserva."""

    inicio: str
    termino: str


@dataclass
class ItemRecurso:
    """Recurso pedido. `qtd` é 1 para recursos não limitados."""

    recursoId: str
    qtd: int


@dataclass
class ReservaEntrada:
    """Corpo de POST /reservas, PUT /reservas/{id} e POST /reservas/validar.

    `ambienteId = None` é "Não solicitado / local próprio" e exige `complemento` (RN2).
    """

    finalidade: str
    participantes: int
    ambienteId: str | None
    periodos: list[Periodo]
    recursos: list[ItemRecurso] = field(default_factory=list)
    complemento: str | None = None
    disposicaoId: str | None = None


@dataclass
class Reserva:
    """RESE#<id> / META. `status` é calculado (RN13), não gravado."""

    id: str
    finalidade: str
    participantes: int
    ambienteId: str | None
    periodos: list[Periodo]
    recursos: list[ItemRecurso]
    solicitanteSub: str
    solicitanteEmail: str
    setoresIds: list[str]
    cancelada: bool
    versao: int
    criadoEm: str
    complemento: str | None = None
    disposicaoId: str | None = None
    status: StatusReserva | None = None


# --- Ocupações (OCUP#…) -------------------------------------------------------------------


@dataclass
class Ocupacao:
    """OCUP#AMBI#<a> ou OCUP#RECU#<r>. `qtd` só importa para recurso limitado (RN8)."""

    inicio: str
    termino: str
    reservaId: str
    qtd: int = 1


@dataclass
class PeriodoOcupado:
    """Item de GET /ambientes/{id}/ocupacao: sem dados da reserva."""

    ambienteId: str
    inicio: str
    termino: str


# --- Notificações (RESE#<id> / EMAIL#… e SNP#…) -------------------------------------------

TipoEmail = Literal["criada", "alterada", "cancelada"]
SituacaoSnp = Literal["ativo", "cancelado"]


@dataclass
class Alteracao:
    campo: str
    antes: str
    depois: str


@dataclass
class EmailSimulado:
    """RESE#<id> / EMAIL#<ts>#<setor>#<eventID>. O frontend mostra os campos, nunca o `html`."""

    reservaId: str
    ts: str
    setorId: str
    para: str
    assunto: str
    tipo: TipoEmail
    html: str
    alteracoes: list[Alteracao] = field(default_factory=list)


@dataclass
class PedidoSnp:
    """RESE#<id> / SNP#<setor>. `numero` no formato SNP-2026-NNNNN (RN11)."""

    reservaId: str
    setorId: str
    numero: str
    codigoServico: str
    situacao: SituacaoSnp


# --- Painéis ------------------------------------------------------------------------------


@dataclass
class CardAtendimento:
    """Item de GET /painel/atendimento. Para o atendente, `solicitanteEmail` vem mascarado."""

    reserva: Reserva
    pedidosSnp: list[PedidoSnp] = field(default_factory=list)


@dataclass
class CaixaNotificacoes:
    """Resposta de GET /notificacoes."""

    emails: list[EmailSimulado] = field(default_factory=list)
    pedidosSnp: list[PedidoSnp] = field(default_factory=list)
