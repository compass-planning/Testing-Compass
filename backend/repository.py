"""Repository interface + in-memory implementation (v1 mock data layer).

Two logical stores are modelled from day one:
  - "enterprise": isolated store, scoped by corp_id (blast-radius containment)
  - "shared":     Advisor + Solo store, scoped org_id -> advisor_id -> client_id

The public interface is DB-agnostic. A MongoDB-backed implementation can be
dropped in later without changing any call site.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional
import copy


def _scope_matches(record_scope: dict, scope_filter: dict) -> bool:
    """Record matches only if every key in the filter equals the record's value.

    This is the construction that makes cross-tenant reads impossible: callers
    never receive rows whose scope keys differ from their enforced filter.
    """
    for key, val in scope_filter.items():
        if val is None:
            continue
        if (record_scope or {}).get(key) != val:
            return False
    return True


class Repository(ABC):
    @abstractmethod
    def list(self, store: str, collection: str, scope_filter: dict) -> list: ...
    @abstractmethod
    def get(self, store: str, collection: str, rid: str, scope_filter: dict) -> Optional[dict]: ...
    @abstractmethod
    def create(self, store: str, collection: str, record: dict) -> dict: ...
    @abstractmethod
    def update(self, store: str, collection: str, rid: str, patch: dict, scope_filter: dict) -> Optional[dict]: ...
    @abstractmethod
    def delete(self, store: str, collection: str, rid: str, scope_filter: dict) -> bool: ...
    # user helpers (global, unscoped — used only by auth)
    @abstractmethod
    def find_user_by_email(self, email: str) -> Optional[dict]: ...
    @abstractmethod
    def find_user_by_id(self, uid: str) -> Optional[dict]: ...
    @abstractmethod
    def insert_user(self, user: dict) -> dict: ...
    @abstractmethod
    def update_user(self, uid: str, patch: dict) -> Optional[dict]: ...


class InMemoryRepository(Repository):
    def __init__(self):
        # store -> collection -> list[dict]
        self.data: dict[str, dict[str, list]] = {
            "enterprise": {},
            "shared": {},
        }

    def _bucket(self, store: str, collection: str) -> list:
        return self.data.setdefault(store, {}).setdefault(collection, [])

    def list(self, store, collection, scope_filter):
        rows = [r for r in self._bucket(store, collection)
                if _scope_matches(r.get("scope", {}), scope_filter)]
        return copy.deepcopy(rows)

    def get(self, store, collection, rid, scope_filter):
        for r in self._bucket(store, collection):
            if r["id"] == rid and _scope_matches(r.get("scope", {}), scope_filter):
                return copy.deepcopy(r)
        return None

    def create(self, store, collection, record):
        self._bucket(store, collection).append(record)
        return copy.deepcopy(record)

    def update(self, store, collection, rid, patch, scope_filter):
        for r in self._bucket(store, collection):
            if r["id"] == rid and _scope_matches(r.get("scope", {}), scope_filter):
                r.update(patch)
                return copy.deepcopy(r)
        return None

    def delete(self, store, collection, rid, scope_filter):
        bucket = self._bucket(store, collection)
        for i, r in enumerate(bucket):
            if r["id"] == rid and _scope_matches(r.get("scope", {}), scope_filter):
                bucket.pop(i)
                return True
        return False

    # ---- users ----
    def _users(self) -> list:
        return self._bucket("shared", "users")

    def find_user_by_email(self, email):
        for u in self._users():
            if u["email"] == email.lower():
                return copy.deepcopy(u)
        return None

    def find_user_by_id(self, uid):
        for u in self._users():
            if u["id"] == uid:
                return copy.deepcopy(u)
        return None

    def insert_user(self, user):
        self._users().append(user)
        return copy.deepcopy(user)

    def update_user(self, uid, patch):
        for u in self._users():
            if u["id"] == uid:
                u.update(patch)
                return copy.deepcopy(u)
        return None


# Single shared instance for v1
repo = InMemoryRepository()
