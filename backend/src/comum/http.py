"""Camada HTTP comum às Lambdas da API (design.md §4; R9.3).

Erros 400/409 saem sempre como `RespostaErro` (`{erros: Erro[]}`); 403 e 404 levam só uma
`{mensagem}` genérica; qualquer outra exceção vira 500 sem detalhe (o log registra só o tipo).
O corpo da reserva é validado aqui com Pydantic v2, sem o `enable_validation` do Powertools
(que responderia 422 em outro formato). Pydantic fica fora de `dominio/` (R12.2).
"""

import json
from dataclasses import asdict, is_dataclass
from decimal import Decimal
from enum import Enum
from typing import Annotated, Any

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, Response, content_types
from aws_lambda_powertools.event_handler.exceptions import NotFoundError
from pydantic import BaseModel, Field, StringConstraints, ValidationError, field_validator

from comum.auth import Usuario
from dominio.modelos import CodigoErro, Erro, ItemRecurso, Periodo, RespostaErro, ReservaEntrada
from dominio.tempo import para_datetime, para_iso

logger = Logger()

MENSAGEM_PROIBIDO = "Acesso negado."
MENSAGEM_NAO_ENCONTRADO = "Não encontrado."
MENSAGEM_ERRO_INTERNO = "Erro interno."

MAX_PERIODOS = 5
MAX_RECURSOS = 10


# --- Erros ---------------------------------------------------------------------------------


class ErroApi(Exception):
    """Erro de negócio ou de acesso já traduzido para status HTTP.

    400/409 carregam `erros`; 403/404 carregam só a `mensagem` genérica.
    """

    def __init__(self, status: int, erros: list[Erro] | None = None, mensagem: str | None = None):
        super().__init__(mensagem or f"HTTP {status}")
        self.status = status
        self.erros = list(erros or [])
        self.mensagem = mensagem


def requisicao_invalida(erros: list[Erro]) -> ErroApi:
    return ErroApi(400, erros=erros)


def conflito(erros: list[Erro]) -> ErroApi:
    return ErroApi(409, erros=erros)


def proibido() -> ErroApi:
    return ErroApi(403, mensagem=MENSAGEM_PROIBIDO)


def nao_encontrado() -> ErroApi:
    return ErroApi(404, mensagem=MENSAGEM_NAO_ENCONTRADO)


# --- Respostas -----------------------------------------------------------------------------


def _jsonavel(obj: Any) -> Any:
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if isinstance(obj, Enum):
        return obj.value
    raise TypeError(f"Tipo não serializável: {type(obj).__name__}")


def resposta(obj: Any, status: int = 200) -> Response:
    """Dataclasses (inclusive aninhadas e em listas), StrEnum e Decimal → JSON."""
    return Response(status_code=status, content_type=content_types.APPLICATION_JSON,
                    body=json.dumps(obj, default=_jsonavel, ensure_ascii=False))


def registrar_erros(app: APIGatewayHttpResolver) -> None:
    """Traduz `ErroApi`, rota inexistente e exceções inesperadas para o formato da API."""

    @app.exception_handler(ErroApi)
    def _erro_api(erro: ErroApi) -> Response:
        if erro.status in (400, 409):
            return resposta(RespostaErro(erros=erro.erros), erro.status)
        return resposta({"mensagem": erro.mensagem}, erro.status)

    @app.not_found
    def _nao_encontrado(_: NotFoundError) -> Response:
        return resposta({"mensagem": MENSAGEM_NAO_ENCONTRADO}, 404)

    @app.exception_handler(Exception)
    def _inesperado(erro: Exception) -> Response:
        # Só o tipo: a mensagem pode conter dados da requisição ou pessoais.
        logger.error("erro_interno", extra={"tipo": type(erro).__name__})
        return resposta({"mensagem": MENSAGEM_ERRO_INTERNO}, 500)


def usuario_do_evento(app: APIGatewayHttpResolver) -> Usuario:
    """Usuário das claims do JWT (`requestContext.authorizer.jwt.claims`); sem claims → 403."""
    claims = app.current_event.request_context.authorizer.jwt_claim
    if not claims or not claims.get("sub"):
        raise proibido()
    return Usuario.from_claims(claims)


# --- Corpo da reserva ----------------------------------------------------------------------

Id = Annotated[str, StringConstraints(max_length=20)]
Texto = Annotated[str, StringConstraints(max_length=200)]


class PeriodoModelo(BaseModel):
    inicio: str
    termino: str

    @field_validator("inicio", "termino")
    @classmethod
    def _no_fuso(cls, valor: str) -> str:
        """ISO com qualquer offset (ou sem offset = −03:00) → `YYYY-MM-DDTHH:MM:SS-03:00`."""
        return para_iso(para_datetime(valor))


class ItemRecursoModelo(BaseModel):
    recursoId: Id
    qtd: int = Field(ge=1)


class ReservaEntradaModelo(BaseModel):
    finalidade: Texto
    participantes: int = Field(gt=0)
    ambienteId: Id | None
    complemento: Texto | None = None
    disposicaoId: Id | None = None
    periodos: list[PeriodoModelo] = Field(max_length=MAX_PERIODOS)
    recursos: list[ItemRecursoModelo] = Field(default_factory=list, max_length=MAX_RECURSOS)

    def para_dominio(self) -> ReservaEntrada:
        return ReservaEntrada(
            finalidade=self.finalidade, participantes=self.participantes,
            ambienteId=self.ambienteId, complemento=self.complemento,
            disposicaoId=self.disposicaoId,
            periodos=[Periodo(p.inicio, p.termino) for p in self.periodos],
            recursos=[ItemRecurso(r.recursoId, r.qtd) for r in self.recursos])


_MENSAGENS = {
    "finalidade": "Informe a finalidade, com 1 a 200 caracteres.",
    "participantes": "Informe o número de participantes (inteiro, 1 ou mais).",
    "ambienteId": "Informe o ambiente (id com até 20 caracteres) ou null para local próprio.",
    "complemento": "O complemento deve ser um texto com até 200 caracteres.",
    "disposicaoId": "Informe a disposição (id com até 20 caracteres).",
}

_EXEMPLO_DATA = "2026-11-10T14:00:00-03:00"


def _erro_periodo(loc: tuple, tipo: str) -> Erro:
    indice = loc[1] if len(loc) > 1 and isinstance(loc[1], int) else None
    if indice is None:
        if tipo == "too_long":
            mensagem = f"Informe no máximo {MAX_PERIODOS} períodos."
        else:
            mensagem = "Informe os períodos como lista de {inicio, termino}."
        return Erro("periodos", CodigoErro.PERIODO_INVALIDO, mensagem)
    parte = {"inicio": "o início", "termino": "o término"}.get(loc[2] if len(loc) > 2 else "")
    if parte:
        mensagem = (f"No período {indice + 1}, {parte} deve ser data e hora ISO 8601 "
                    f"(ex.: {_EXEMPLO_DATA}).")
    else:
        mensagem = f"O período {indice + 1} deve ter início e término."
    return Erro("periodos", CodigoErro.PERIODO_INVALIDO, mensagem, periodoIndex=indice)


def _erro_recurso(loc: tuple, tipo: str) -> Erro:
    indice = loc[1] if len(loc) > 1 and isinstance(loc[1], int) else None
    if indice is None:
        mensagem = (f"Peça no máximo {MAX_RECURSOS} recursos." if tipo == "too_long"
                    else "Informe os recursos como lista de {recursoId, qtd}.")
    elif len(loc) > 2 and loc[2] == "qtd":
        mensagem = f"No recurso {indice + 1}, a quantidade deve ser um inteiro, 1 ou mais."
    elif len(loc) > 2 and loc[2] == "recursoId":
        mensagem = f"No recurso {indice + 1}, informe o id do recurso (até 20 caracteres)."
    else:
        mensagem = f"O recurso {indice + 1} deve ter recursoId e qtd."
    return Erro("recursos", CodigoErro.CAMPO_OBRIGATORIO, mensagem)


def _erro_pydantic(detalhe: dict) -> Erro:
    loc, tipo = tuple(detalhe.get("loc") or ()), detalhe.get("type", "")
    if not loc:
        return Erro("corpo", CodigoErro.CAMPO_OBRIGATORIO,
                    "O corpo deve ser um objeto JSON com os dados da reserva.")
    campo = str(loc[0])
    if campo == "periodos":
        return _erro_periodo(loc, tipo)
    if campo == "recursos":
        return _erro_recurso(loc, tipo)
    return Erro(campo, CodigoErro.CAMPO_OBRIGATORIO,
                _MENSAGENS.get(campo, f"Valor inválido no campo {campo}."))


def ler_reserva_entrada(body: str | None) -> ReservaEntrada:
    """Corpo JSON → `ReservaEntrada` com datas em −03:00; qualquer problema → 400."""
    if not body:
        raise requisicao_invalida([Erro("corpo", CodigoErro.CAMPO_OBRIGATORIO,
                                        "Envie os dados da reserva no corpo da requisição.")])
    try:
        dados = json.loads(body)
    except ValueError:
        raise requisicao_invalida([Erro("corpo", CodigoErro.CAMPO_OBRIGATORIO,
                                        "O corpo da requisição não é um JSON válido.")]) from None
    try:
        return ReservaEntradaModelo.model_validate(dados).para_dominio()
    except ValidationError as erro:
        erros: list[Erro] = []
        for detalhe in erro.errors():
            convertido = _erro_pydantic(detalhe)
            if convertido not in erros:
                erros.append(convertido)
        raise requisicao_invalida(erros) from None
