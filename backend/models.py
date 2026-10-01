"""Pydantic models for Compass Planning (v1)."""
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List, Literal, Dict
from datetime import datetime, timezone
import uuid


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


Tier = Literal["enterprise", "advisor", "solo"]

# ---------------- Auth ----------------

class Scope(BaseModel):
    corp_id: Optional[str] = None
    org_id: Optional[str] = None
    advisor_id: Optional[str] = None
    client_id: Optional[str] = None


class ConsentRecord(BaseModel):
    marketing: bool = False
    data_processing: bool = True
    crm_sharing: bool = False
    updated_at: str = Field(default_factory=_now)


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    email: str
    password_hash: str
    name: str
    tier: Tier
    role: str
    scope: Scope = Field(default_factory=Scope)
    mfa_enabled: bool = False
    consent: ConsentRecord = Field(default_factory=ConsentRecord)
    created_at: str = Field(default_factory=_now)


class PublicUser(BaseModel):
    id: str
    email: str
    name: str
    tier: Tier
    role: str
    scope: Scope
    mfa_enabled: bool
    consent: ConsentRecord


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    consent_data_processing: bool = True


class LoginInput(BaseModel):
    email: EmailStr
    password: str


# ---------------- Domain ----------------

class PensionOwner(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=_id)
    store: str = "shared"
    scope: Scope = Field(default_factory=Scope)
    full_name: str
    relationship: str = "self"  # self, spouse, dependent
    date_of_birth: Optional[str] = None
    province: str = "ON"
    source: str = "compass"  # compass | crm
    crm_record_id: Optional[str] = None
    created_at: str = Field(default_factory=_now)


class OwnerInput(BaseModel):
    model_config = ConfigDict(extra="allow")
    full_name: str = Field(min_length=1)
    relationship: str = "self"
    date_of_birth: Optional[str] = None
    province: str = "ON"


class PensionAccount(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    store: str = "shared"
    scope: Scope = Field(default_factory=Scope)
    owner_id: str
    account_type: str  # RRSP, TFSA, CPP, OAS, DB Pension, DC Pension
    institution: str = ""
    balance: float = 0.0
    annual_contribution: float = 0.0
    created_at: str = Field(default_factory=_now)


class AccountInput(BaseModel):
    owner_id: str
    account_type: str
    institution: str = ""
    balance: float = 0.0
    annual_contribution: float = 0.0


class Goal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    store: str = "shared"
    scope: Scope = Field(default_factory=Scope)
    owner_id: Optional[str] = None
    title: str
    category: str = "retirement"  # retirement, income, legacy, purchase
    target_amount: float
    current_amount: float = 0.0
    target_year: int
    status: str = "on_track"  # on_track, at_risk, behind, achieved
    created_at: str = Field(default_factory=_now)


class GoalInput(BaseModel):
    title: str = Field(min_length=1)
    category: str = "retirement"
    target_amount: float
    current_amount: float = 0.0
    target_year: int
    owner_id: Optional[str] = None


class GoalProgressInput(BaseModel):
    current_amount: float


# ---------------- Governance ----------------

class AuditEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_id)
    store: str = "shared"
    scope: Scope = Field(default_factory=Scope)
    actor_email: str
    action: str
    resource: str
    detail: str = ""
    timestamp: str = Field(default_factory=_now)


class ConsentToggleInput(BaseModel):
    marketing: Optional[bool] = None
    data_processing: Optional[bool] = None
    crm_sharing: Optional[bool] = None


class ErasureInput(BaseModel):
    reason: str = ""


class PromotionInput(BaseModel):
    target_tier: Literal["advisor"] = "advisor"
    advisor_email: str
    consent_data_sharing: bool
    consent_reconfirmed: bool


class MFAVerifyInput(BaseModel):
    challenge: str
    code: str


class SecurityQuestionInput(BaseModel):
    setup_token: str
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class ForgotInput(BaseModel):
    email: EmailStr


class ResetInput(BaseModel):
    email: EmailStr
    answer: str = Field(min_length=1)
    code: str = ""
    new_password: str = Field(min_length=6)


class PlanningItemInput(BaseModel):
    model_config = ConfigDict(extra="allow")


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra="allow")
