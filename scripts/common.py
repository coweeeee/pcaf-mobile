"""
Shared plumbing for the data pipeline: HTTP with rate limiting, a disk cache,
paths, and logging.

Three rules the whole pipeline is built on:

1. Never fabricate a figure. Every value written to universe.json traces to a
   named source with a dated vintage. Where a value is missing, the record says
   so and the downstream merge falls to the next tier — it does not interpolate.
2. Cache everything. SEC and Climate TRACE responses change at most quarterly
   (SEC) or monthly (Climate TRACE), and re-running the build should not re-hit
   the network. The cache is keyed on the full request URL.
3. Degrade, don't die. A source that goes away — the brief specifically calls
   out EPA GHGRP, whose reporting categories are proposed for elimination — must
   drop the pipeline to the next tier, not fail the build.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "assets" / "data"
CACHE = ROOT / ".cache"

# SEC requires a descriptive User-Agent identifying the requester. Requests
# without one are rejected outright.
USER_AGENT = "PCAF-Mobile-Demo/1.0 (sneakergoathead1@gmail.com)"


def log(msg: str = "") -> None:
    print(msg, file=sys.stderr, flush=True)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class RateLimiter:
    """
    Sliding-window limiter. SEC's published ceiling is 10 requests/second; we
    run under it deliberately, because being throttled by SEC means a 403 for
    the rest of the session, not a 429 you can retry cheaply.
    """

    def __init__(self, max_calls: int, period: float = 1.0):
        self.max_calls = max_calls
        self.period = period
        self._calls: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        with self._lock:
            while True:
                now = time.monotonic()
                while self._calls and now - self._calls[0] > self.period:
                    self._calls.popleft()
                if len(self._calls) < self.max_calls:
                    self._calls.append(now)
                    return
                time.sleep(self.period - (now - self._calls[0]) + 0.01)


class Fetcher:
    """
    A cached, rate-limited HTTP client.

    `optional=True` turns a hard failure into a None return, which is how the
    EPA tier degrades gracefully rather than taking the build down.
    """

    def __init__(self, name: str, rate: RateLimiter, timeout: int = 60):
        self.name = name
        self.rate = rate
        self.timeout = timeout
        self.dir = CACHE / name
        self.dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
        self.hits = 0
        self.misses = 0
        self.failures = 0

    def _path(self, url: str) -> Path:
        digest = hashlib.sha256(url.encode()).hexdigest()[:20]
        slug = re.sub(r"[^a-zA-Z0-9]+", "-", url.split("://")[-1])[:70].strip("-")
        return self.dir / f"{slug}-{digest}.json"

    def get_json(
        self,
        url: str,
        *,
        optional: bool = False,
        retries: int = 3,
        expect_json: bool = True,
    ) -> Any | None:
        path = self._path(url)
        if path.exists():
            try:
                self.hits += 1
                return json.loads(path.read_text())
            except json.JSONDecodeError:
                # A truncated cache entry is worse than none; drop and refetch.
                path.unlink(missing_ok=True)

        last_err: Exception | str | None = None
        for attempt in range(retries):
            self.rate.acquire()
            try:
                resp = self.session.get(url, timeout=self.timeout)
            except requests.RequestException as e:
                last_err = e
                time.sleep(1.5 * (attempt + 1))
                continue

            if resp.status_code == 404:
                # A genuine "no such record" — cache the negative so we do not
                # ask again on every run.
                path.write_text("null")
                return None
            if resp.status_code in (429, 503):
                time.sleep(2.0 * (attempt + 1))
                last_err = f"HTTP {resp.status_code}"
                continue
            if resp.status_code != 200:
                last_err = f"HTTP {resp.status_code}"
                break

            if not expect_json:
                path.write_text(json.dumps(resp.text))
                self.misses += 1
                return resp.text
            try:
                payload = resp.json()
            except ValueError as e:
                last_err = e
                break
            path.write_text(json.dumps(payload))
            self.misses += 1
            return payload

        self.failures += 1
        msg = f"{self.name}: failed {url} ({last_err})"
        if optional:
            log(f"  ! {msg} — continuing without it")
            return None
        raise RuntimeError(msg)

    def stats(self) -> str:
        return (
            f"{self.name}: {self.hits} cached, {self.misses} fetched, {self.failures} failed"
        )


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return default


def write_json(path: Path, payload: Any, *, indent: int = 1) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=indent, default=str))


# ---------------------------------------------------------------------------
# Company-name normalisation, used by the Climate TRACE entity resolver.
# ---------------------------------------------------------------------------

_SUFFIXES = [
    "incorporated", "corporation", "corp", "inc", "company", "co", "llc", "l l c",
    "lp", "l p", "plc", "ltd", "limited", "holdings", "holding", "group",
    "the", "sa", "nv", "ag", "se", "trust", "partners", "lc", "llp", "pbc",
    "class a", "class b", "class c", "cl a", "cl b",
]

_ALIAS_TOKENS = {
    "intl": "international",
    "natl": "national",
    "amer": "american",
    "pwr": "power",
    "elec": "electric",
    "svcs": "services",
    "svc": "service",
    "res": "resources",
    "mfg": "manufacturing",
    "tech": "technologies",
    "&": "and",
}


def normalize_company(name: str) -> str:
    """
    Reduce a company name to a comparable core.

    Climate TRACE owner names and S&P 500 security names disagree constantly:
    "Alabama Power Co" vs "Southern Company", "Exxon Mobil Corp" vs
    "ExxonMobil". This strips punctuation, legal suffixes and common
    abbreviations so the fuzzy matcher compares the parts that carry meaning.
    """
    s = (name or "").lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    tokens = [_ALIAS_TOKENS.get(t, t) for t in s.split()]
    # Drop legal-form suffixes wherever they appear, not just at the end.
    tokens = [t for t in tokens if t not in _SUFFIXES]
    return " ".join(tokens).strip()


def first_number(values: Iterable[Any]) -> float | None:
    for v in values:
        if isinstance(v, (int, float)) and v == v:  # not NaN
            return float(v)
    return None
