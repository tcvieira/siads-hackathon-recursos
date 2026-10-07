"""Percorre o roteiro da demo (design.md §11) contra a API real, com as 3 contas de demo.

Precisa dos ID tokens do `scripts/obter_tokens.py` (valem 1 hora) e do `API_URL` no .env. Cria
uma reserva de teste no Auditório (Completo) em D2, altera e cancela no fim, então o cenário do
seed (F-RN5, F-RN6, F-RN8 em D1) continua igual. D1 e D2 seguem o seed: os dois primeiros dias
úteis depois de `--data-demo` (padrão: hoje).

Uso, na raiz do repositório:  .venv/bin/python scripts/e2e_api.py [--data-demo AAAA-MM-DD]
"""

import argparse
import json
import os
import time as relogio
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parent.parent
TOKENS = Path.home() / ".cache" / "sisgares" / "tokens.json"
FUSO = timezone(timedelta(hours=-3))
SEART, SMSG = "2", "1"
falhas: list[str] = []


def dias_uteis(apos: date, quantos: int) -> list[date]:
    dias, d = [], apos
    while len(dias) < quantos:
        d += timedelta(days=1)
        if d.weekday() < 5:
            dias.append(d)
    return dias


def iso(dia: date, hhmm: str) -> str:
    return f"{dia.isoformat()}T{hhmm}:00-03:00"


def chamar(metodo: str, caminho: str, token: str, corpo=None) -> tuple[int, object]:
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(os.environ["API_URL"].rstrip("/") + caminho, data=dados,
                                 method=metodo, headers={"Authorization": f"Bearer {token}",
                                                         "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            texto = resp.read().decode()
            return resp.status, json.loads(texto) if texto else None
    except urllib.error.HTTPError as erro:
        texto = erro.read().decode()
        return erro.code, json.loads(texto) if texto else None


def conferir(nome: str, condicao: bool, detalhe: object = "") -> None:
    print(f"{'ok  ' if condicao else 'FALHA'} {nome}" + ("" if condicao else f" -> {detalhe}"))
    if not condicao:
        falhas.append(nome)


def codigos(resposta: object) -> list[str]:
    return [e["codigo"] for e in (resposta or {}).get("erros", [])] if isinstance(resposta, dict) else []


def reserva(ambiente: str, dia: date, ini: str, fim: str, recursos=()) -> dict:
    return {"finalidade": "Teste E2E do roteiro", "participantes": 20, "ambienteId": ambiente,
            "periodos": [{"inicio": iso(dia, ini), "termino": iso(dia, fim)}],
            "recursos": [{"recursoId": r, "qtd": q} for r, q in recursos]}


def emails_da(token: str, reserva_id: str, tipo: str, de: str, esperar: int = 20) -> list[dict]:
    """Espera o stream gerar os e-mails do `tipo` para a reserva (assíncrono)."""
    ate = (datetime.now(FUSO) + timedelta(hours=1)).isoformat(timespec="seconds")
    for _ in range(esperar):
        _, caixa = chamar("GET", f"/notificacoes?de={_q(de)}&ate={_q(ate)}", token)
        achados = [e for e in caixa.get("emails", []) if e["reservaId"] == reserva_id
                   and e["tipo"] == tipo]
        if achados:
            return achados
        relogio.sleep(1)
    return []


def _q(texto: str) -> str:
    return urllib.request.quote(texto, safe="")


def snp_da(token: str, reserva_id: str, setor: str, de: str) -> dict | None:
    ate = (datetime.now(FUSO) + timedelta(hours=1)).isoformat(timespec="seconds")
    _, caixa = chamar("GET", f"/notificacoes?de={_q(de)}&ate={_q(ate)}", token)
    return next((p for p in caixa.get("pedidosSnp", []) if p["reservaId"] == reserva_id
                 and p["setorId"] == setor), None)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-demo", type=date.fromisoformat, default=datetime.now(FUSO).date())
    args = parser.parse_args()
    load_dotenv(RAIZ / ".env")
    tk = json.loads(TOKENS.read_text())
    sol, ate_, adm = tk["solicitante"], tk["atendente"], tk["admin"]
    d1, d2 = dias_uteis(args.data_demo, 2)
    inicio_teste = (datetime.now(FUSO) - timedelta(minutes=1)).isoformat(timespec="seconds")
    print(f"API {os.environ['API_URL']} | D1 = {d1} | D2 = {d2}")

    status, cat = chamar("GET", "/catalogo", sol)
    conferir("catálogo com ambientes e recursos", status == 200 and len(cat["ambientes"]) > 0, status)

    janela = f"?de={_q(iso(d1, '00:00'))}&ate={_q(iso(d1 + timedelta(days=1), '00:00'))}"
    status, ocup = chamar("GET", f"/ambientes/1/ocupacao{janela}", sol)
    conferir("1. grade: Auditório ocupado 09:00–11:00 em D1 (F-RN5)", status == 200 and any(
        o["ambienteId"] == "1" and o["inicio"] == iso(d1, "09:00") for o in ocup), ocup)

    status, criada = chamar("POST", "/reservas", sol,
                            reserva("1", d2, "09:00", "10:00", [("3", 1), ("6", 1)]))
    conferir("1. cria reserva no Auditório em D2 09:00 com água/café e projetor", status == 201,
             criada)
    if status != 201:
        raise SystemExit(1)
    rid = criada["id"]

    status, r = chamar("POST", "/reservas/validar", sol, reserva("1", d1, "11:20", "12:00"))
    erro = (r.get("erros") or [{}])[0]
    conferir("2. RN5: 11:20 bloqueado com sugestão 11:30", codigos(r) == ["CONFLITO_AMBIENTE"]
             and "11:30" in (erro.get("sugestao") or ""), r)
    status, r = chamar("POST", "/reservas/validar", sol, reserva("1", d1, "11:30", "12:00"))
    conferir("2. RN5: 11:30 aceito (fora da margem)", status == 200 and r["ok"], r)
    status, r = chamar("POST", "/reservas", sol, reserva("1", d1, "15:00", "17:00"))
    conferir("2. RN6: Auditório 15:00–17:00 bloqueado pela Parte A (409)",
             status == 409 and codigos(r) == ["CONFLITO_AMBIENTE"], (status, r))
    status, r = chamar("POST", "/reservas", sol, reserva("7", d1, "15:00", "17:00", [("6", 1)]))
    conferir("3. RN8: projetor esgotado na Sala do 10º andar (409)",
             status == 409 and codigos(r) == ["RECURSO_ESGOTADO"], (status, r))

    status, minhas = chamar("GET", "/reservas?minhas=1", sol)
    conferir("minhas reservas lista a criada", status == 200 and any(x["id"] == rid for x in minhas))
    conferir("e-mails 'criada' gerados pelo stream", bool(emails_da(adm, rid, "criada",
                                                                     inicio_teste)))
    snp = snp_da(adm, rid, SEART, inicio_teste)
    conferir("pedido SNP da SEART criado", snp is not None and snp["situacao"] == "ativo", snp)

    status, alterada = chamar("PUT", f"/reservas/{rid}", sol,
                              reserva("1", d2, "10:00", "11:00", [("3", 1), ("6", 1)]))
    conferir("4. altera de 09:00 para 10:00", status == 200 and alterada["versao"] == 2,
             (status, alterada))
    emails = emails_da(adm, rid, "alterada", inicio_teste)
    conferir("4. e-mail 'alterada' com o horário antigo e o novo",
             any(a["campo"].lower().startswith("per") for e in emails for a in e["alteracoes"]),
             emails)
    snp2 = snp_da(adm, rid, SEART, inicio_teste)
    conferir("4. SNP mantém o número", snp2 is not None and snp is not None
             and snp2["numero"] == snp["numero"], snp2)

    jan2 = f"?de={_q(iso(d2, '00:00'))}&ate={_q(iso(d2 + timedelta(days=1), '00:00'))}"
    status, cards = chamar("GET", f"/painel/atendimento{jan2}", ate_)
    card = next((c for c in cards if c["reserva"]["id"] == rid), None) if status == 200 else None
    conferir("5. atendente SMSG vê o card com e-mail mascarado", card is not None and
             card["reserva"]["solicitanteEmail"] != "solicitante@example.com", (status, card))
    status, _ = chamar("POST", "/reservas", ate_, reserva("28", d2, "09:00", "10:00"))
    conferir("atendente não cria reserva (403)", status == 403, status)

    status, cancelada = chamar("DELETE", f"/reservas/{rid}", sol)
    conferir("6. cancela a reserva", status == 200 and cancelada["cancelada"], (status, cancelada))
    conferir("6. e-mail 'cancelada'", bool(emails_da(adm, rid, "cancelada", inicio_teste)))
    relogio.sleep(2)
    snp3 = snp_da(adm, rid, SEART, inicio_teste)
    conferir("6. SNP cancelado", snp3 is not None and snp3["situacao"] == "cancelado", snp3)

    print(f"\n{len(falhas)} falha(s)." if falhas else "\nRoteiro completo sem falhas.")
    raise SystemExit(1 if falhas else 0)


if __name__ == "__main__":
    main()
