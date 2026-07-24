"""Thin Anthropic Messages API client — all network I/O is isolated here.

Same architectural role as web/core/oracle.py: a single thin wrapper around an
external service call, keeping the rest of the domain free of network I/O.

Unit tests for tl_evaluation_engine.py mock this module at its boundary so the
engine stays testable without a live network call.
"""

import json
import os
import ssl
import urllib.error
import urllib.request

import certifi

_API_URL = "https://api.anthropic.com/v1/messages"
_API_VERSION = "2023-06-01"
_SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


def complete(request: dict) -> dict:
    """Send *request* to the Anthropic Messages API and return the raw response.

    Raises:
        RuntimeError: if ANTHROPIC_API_KEY is not set.
        urllib.error.HTTPError: on non-2xx HTTP responses (caller handles).
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY environment variable is not set. "
            "Configure it in web/.env before using TL evaluation features."
        )
    data = json.dumps(request).encode()
    req = urllib.request.Request(
        _API_URL,
        data=data,
        headers={
            "x-api-key": api_key,
            "anthropic-version": _API_VERSION,
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=_SSL_CONTEXT) as resp:
        return json.loads(resp.read())
