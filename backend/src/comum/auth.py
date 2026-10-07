"""Usuário das claims do Cognito, autorização e mascaramento (design.md §5; R1.3, R8.3, R9).

A política fica em código no MVP; a assinatura de `autorizar` já serve para trocar por
`IsAuthorizedWithToken` (Amazon Verified Permissions) depois. O log de decisão leva só o `sub`,
nunca e-mail ou outro dado pessoal.
"""

import dataclasses
from dataclasses import dataclass
from typing import Any, Literal, Mapping

from aws_lambda_powertools import Logger

from dominio.modelos import Reserva

logger = Logger()

Acao = Literal["criar", "ler", "alterar", "cancelar", "listar_atendimento", "listar_notificacoes",
               "listar_minhas"]

ADMIN, ATENDENTE, SOLICITANTE = "admin", "atendente", "solicitante"


def _grupos(valor: Any) -> list[str]:
    """`cognito:groups` chega como lista ou, no HTTP API, como string "[a b]" / "[a, b]" / ""."""
    if valor is None:
        return []
    if isinstance(valor, (list, tuple)):
        return [str(g).strip() for g in valor if str(g).strip()]
    texto = str(valor).strip().removeprefix("[").removesuffix("]")
    return [g for g in texto.replace(",", " ").split() if g]


@dataclass
class Usuario:
    sub: str
    email: str
    grupos: list[str]
    setorId: str | None = None

    @classmethod
    def from_claims(cls, claims: Mapping[str, Any]) -> "Usuario":
        setor = str(claims.get("custom:setorId") or "").strip()
        return cls(sub=str(claims.get("sub", "")), email=str(claims.get("email", "")),
                   grupos=_grupos(claims.get("cognito:groups")), setorId=setor or None)

    @property
    def is_admin(self) -> bool:
        return ADMIN in self.grupos

    @property
    def is_atendente(self) -> bool:
        return ATENDENTE in self.grupos

    @property
    def is_solicitante(self) -> bool:
        return SOLICITANTE in self.grupos

    @property
    def grupo(self) -> str | None:
        """Papel de maior privilégio (admin > atendente > solicitante), para o log."""
        for papel in (ADMIN, ATENDENTE, SOLICITANTE):
            if papel in self.grupos:
                return papel
        return None


def _dono(usuario: Usuario, reserva: Reserva | None) -> bool:
    return reserva is not None and bool(usuario.sub) and usuario.sub == reserva.solicitanteSub


def _atendente_do_setor(usuario: Usuario, reserva: Reserva | None) -> bool:
    return (usuario.is_atendente and usuario.setorId is not None and reserva is not None
            and usuario.setorId in reserva.setoresIds)


def _permitido(usuario: Usuario, acao: Acao, reserva: Reserva | None) -> bool:
    if usuario.is_admin:
        return True
    if acao in ("criar", "listar_minhas"):
        return usuario.is_solicitante
    if acao == "ler":
        return _dono(usuario, reserva) or _atendente_do_setor(usuario, reserva)
    if acao in ("alterar", "cancelar"):
        return usuario.is_solicitante and _dono(usuario, reserva)
    if acao in ("listar_atendimento", "listar_notificacoes"):
        return usuario.is_atendente and usuario.setorId is not None
    return False


def autorizar(usuario: Usuario, acao: Acao, reserva: Reserva | None = None) -> bool:
    """Decide e registra a decisão (`allow`/`deny`) no log JSON do Powertools."""
    permitido = _permitido(usuario, acao, reserva)
    logger.info("autorizacao", extra={
        "usuario": usuario.sub, "grupo": usuario.grupo, "acao": acao,
        "reservaId": reserva.id if reserva is not None else None,
        "decisao": "allow" if permitido else "deny",
    })
    return permitido


def mascarar_email(email: str) -> str:
    """'solicitante@example.com' → 's***@e***.com'."""
    local, arroba, dominio = email.partition("@")
    if not arroba:
        return f"{local[:1]}***"
    nome, ponto, tld = dominio.rpartition(".")
    if not ponto:
        nome, tld = dominio, ""
    return f"{local[:1]}***@{nome[:1]}***" + (f".{tld}" if tld else "")


def mascarar_para(usuario: Usuario, reserva: Reserva) -> Reserva:
    """Admin e dono veem tudo; os demais recebem uma cópia com o e-mail do solicitante mascarado."""
    if usuario.is_admin or _dono(usuario, reserva):
        return reserva
    return dataclasses.replace(reserva, solicitanteEmail=mascarar_email(reserva.solicitanteEmail))
