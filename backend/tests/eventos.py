"""Eventos HTTP API v2 (payload 2.0) para chamar os handlers nos testes."""

import json
from typing import Any


def claims_de(grupo: str, sub: str, email: str, setorId: str | None = None) -> dict[str, str]:
    """Claims como o HTTP API entrega: `cognito:groups` vira a string "[grupo]"."""
    claims = {"sub": sub, "email": email, "cognito:groups": f"[{grupo}]"}
    if setorId is not None:
        claims["custom:setorId"] = setorId
    return claims


def evento_http(metodo: str, caminho: str, corpo: Any = None, claims: dict | None = None,
                query: dict[str, str] | None = None) -> dict:
    """`corpo` pode ser objeto (vira JSON) ou string (enviada como está, para JSON inválido)."""
    if corpo is not None and not isinstance(corpo, str):
        corpo = json.dumps(corpo)
    query_string = "&".join(f"{k}={v}" for k, v in (query or {}).items())
    return {
        "version": "2.0",
        "routeKey": "$default",
        "rawPath": caminho,
        "rawQueryString": query_string,
        "headers": {"content-type": "application/json"},
        "queryStringParameters": query or None,
        "requestContext": {
            "accountId": "123456789012",
            "apiId": "api",
            "domainName": "api.example.com",
            "http": {"method": metodo, "path": caminho, "protocol": "HTTP/1.1",
                     "sourceIp": "127.0.0.1", "userAgent": "pytest"},
            "requestId": "req",
            "routeKey": "$default",
            "stage": "$default",
            "authorizer": {"jwt": {"claims": claims, "scopes": None}} if claims else {},
        },
        "body": corpo,
        "isBase64Encoded": False,
    }


def corpo_json(resposta: dict) -> Any:
    return json.loads(resposta["body"])
