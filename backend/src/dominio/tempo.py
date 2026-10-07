"""Datas no fuso da PR/CE.

Offset fixo −03:00: Fortaleza não tem horário de verão e o runtime da Lambda pode não ter
tzdata (o `ZoneInfo` falharia). Todo instante gravado fica em `YYYY-MM-DDTHH:MM:SS-03:00`,
porque as chaves `<inicio>#…` são comparadas como texto.
"""

from datetime import datetime, timedelta, timezone

FUSO = timezone(timedelta(hours=-3), "America/Fortaleza")


def para_datetime(iso: str) -> datetime:
    """ISO 8601 com qualquer offset (inclusive `Z`) → datetime em −03:00. Sem offset = −03:00."""
    dt = datetime.fromisoformat(iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=FUSO)
    return dt.astimezone(FUSO)


def no_fuso(dt: datetime) -> datetime:
    """Datetime em −03:00; um datetime sem fuso é tratado como −03:00."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=FUSO)
    return dt.astimezone(FUSO)


def para_iso(dt: datetime) -> str:
    """Datetime → `YYYY-MM-DDTHH:MM:SS-03:00`, sem microssegundos."""
    return no_fuso(dt).replace(microsecond=0).isoformat()


def hhmm(dt: datetime) -> str:
    """Hora local `HH:MM`."""
    return no_fuso(dt).strftime("%H:%M")


def data_curta(dt: datetime) -> str:
    """Data local `dd/mm`."""
    return no_fuso(dt).strftime("%d/%m")
