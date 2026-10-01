"""Repository interface + implementations (in-memory mock and MongoDB).

Two logical stores are modelled from day one:
  - "enterprise": isolated store, scoped by corp_id (blast-radius containment)
  - "shared":     Advisor + Solo store, scoped org_id -> advisor_id -> client_id

The public interface is DB-agnostic. v1 shipped on the in-memory implementation;
the MongoDB-backed implementation is now the default so users, TOTP enrolments
and all planning data survive backend restarts.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional
import os
import copy


def _scope_matches(record_scope: dict, scope_filter: dict) -> bool:
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
    @abstractmethod
    def all_users(self) -> list: ...


class InMemoryRepository(Repository):
    def __init__(self):
        self.data: dict[str, dict[str, list]] = {"enterprise": {}, "shared": {}}

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

    def all_users(self):
        return copy.deepcopy(self._users())


class MongoRepository(Repository):
    """pymongo-backed store. One collection per (store, logical collection):
    e.g. shared__owners, enterprise__accounts, shared__plan_networth, shared__users.
    Scope isolation is enforced by translating the scope filter into a Mongo query
    on the nested `scope.*` fields — cross-tenant reads remain impossible.
    """
    def __init__(self):
        from pymongo import MongoClient
        self.client = MongoClient(os.environ["MONGO_URL"])
        self.db = self.client[os.environ["DB_NAME"]]

    def _col(self, store: str, collection: str):
        return self.db[f"{store}__{collection}"]

    @staticmethod
    def _query(scope_filter: dict) -> dict:
        return {f"scope.{k}": v for k, v in (scope_filter or {}).items() if v is not None}

    def list(self, store, collection, scope_filter):
        return list(self._col(store, collection).find(self._query(scope_filter), {"_id": 0}))

    def get(self, store, collection, rid, scope_filter):
        return self._col(store, collection).find_one({"id": rid, **self._query(scope_filter)}, {"_id": 0})

    def create(self, store, collection, record):
        doc = dict(record)
        self._col(store, collection).insert_one(doc)
        doc.pop("_id", None)
        return doc

    def update(self, store, collection, rid, patch, scope_filter):
        from pymongo import ReturnDocument
        return self._col(store, collection).find_one_and_update(
            {"id": rid, **self._query(scope_filter)}, {"$set": patch},
            return_document=ReturnDocument.AFTER, projection={"_id": 0})

    def delete(self, store, collection, rid, scope_filter):
        return self._col(store, collection).delete_one({"id": rid, **self._query(scope_filter)}).deleted_count > 0

    def _users(self):
        return self._col("shared", "users")

    def find_user_by_email(self, email):
        return self._users().find_one({"email": email.lower()}, {"_id": 0})

    def find_user_by_id(self, uid):
        return self._users().find_one({"id": uid}, {"_id": 0})

    def insert_user(self, user):
        doc = dict(user)
        self._users().insert_one(doc)
        doc.pop("_id", None)
        return doc

    def update_user(self, uid, patch):
        from pymongo import ReturnDocument
        return self._users().find_one_and_update(
            {"id": uid}, {"$set": patch}, return_document=ReturnDocument.AFTER, projection={"_id": 0})

    def all_users(self):
        return list(self._users().find({}, {"_id": 0}))


# Persistent MongoDB store is the default data layer.
repo: Repository = MongoRepository()
