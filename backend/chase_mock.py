"""Chase Payment Solutions — MOCK gateway.

Stands in for the real Chase/Orbital API until merchant credentials are provided.
Deterministic, no network. Swap this module for the real integration later
(route through integration_expert when live keys are available).
"""
import uuid
from datetime import datetime, timezone

MODE = "mock"


def charge(amount: float, currency: str = "CAD", description: str = "") -> dict:
    """Simulate an approved card charge."""
    return {
        "provider": "chase",
        "mode": MODE,
        "transaction_id": "ch_mock_" + uuid.uuid4().hex[:16],
        "status": "approved",
        "amount": amount,
        "currency": currency,
        "description": description,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }
