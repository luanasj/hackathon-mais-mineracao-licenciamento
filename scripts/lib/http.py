"""Sessão HTTP compartilhada pelos coletores: retry, timeout e user-agent identificável."""

from __future__ import annotations

import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENT = (
    "hackathon-mais-mineracao-licenciamento/0.1 "
    "(coleta de dados publicos para MVP de enquadramento licenciatorio; "
    "contato: ver README do repositorio)"
)


def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    retry = Retry(
        total=3,
        backoff_factor=1.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def polite_get(session: requests.Session, url: str, *, params: dict | None = None, delay: float = 0.5, **kwargs):
    """GET com pausa fixa depois da resposta, para não martelar APIs públicas."""
    response = session.get(url, params=params, timeout=20, **kwargs)
    time.sleep(delay)
    return response
