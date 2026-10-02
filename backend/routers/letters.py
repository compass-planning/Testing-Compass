"""Letters & Policies Importer — parse uploaded policy/letter PDFs with Claude
into structured insurance-policy suggestions (review-then-accept on the client).
Writes nothing itself; the client confirms, then POSTs to /plan/insurance."""
import os
import uuid
import json
import base64
import logging
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request

from deps import get_current_user, planner_scope, _block_enterprise_write, audit

logger = logging.getLogger("compass.letters")
router = APIRouter()

MAX_PDF = 10 * 1024 * 1024
POLICY_TYPES = ["Term Life", "Whole Life", "Disability", "Critical Illness", "Long-Term Care", "Health"]

PARSE_SYSTEM_PROMPT = (
    "You are an assistant for a Canadian financial advisor. From the text of an insurance "
    "policy document or coverage letter, extract every distinct insurance policy you find. "
    "For each policy return an object with keys: "
    "policy_type (one of exactly: Term Life, Whole Life, Disability, Critical Illness, Long-Term Care, Health), "
    "carrier (the insurer's name), coverage (benefit/face amount as a plain number, no symbols or commas), "
    "premium (periodic premium as a plain number if stated, else null), "
    "insured (the insured person's full name), policy_number, "
    "renewal_date (ISO YYYY-MM-DD if a renewal/expiry date is present, else null), "
    "low_confidence (an array of the field names above whose values you are NOT confident about — e.g. blurry, ambiguous or guessed from a scan; use [] when you are confident). "
    "Return ONLY a JSON array of such objects. If a field is unknown use null. No prose outside the JSON array."
)

_FIELDS = ["policy_type", "carrier", "coverage", "premium", "insured", "policy_number", "renewal_date"]


def _num(v):
    try:
        if v is None:
            return None
        return float(str(v).replace(",", "").replace("$", "").strip())
    except Exception:
        return None


def _extract_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(BytesIO(data))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception as e:
        logger.warning(f"pdf text extract failed: {e}")
        return ""


def _render_images(data: bytes, max_pages: int = 5):
    """Render PDF pages to base64 PNGs for vision OCR of scanned/photo documents."""
    try:
        import pymupdf
        doc = pymupdf.open(stream=data, filetype="pdf")
        out = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(dpi=150)
            out.append(base64.b64encode(pix.tobytes("png")).decode())
        return out
    except Exception as e:
        logger.warning(f"pdf render failed: {e}")
        return []


def _normalize(parsed) -> list:
    policies = []
    if isinstance(parsed, list):
        for p in parsed[:12]:
            if not isinstance(p, dict):
                continue
            pt = str(p.get("policy_type") or "").strip()
            policies.append({
                "policy_type": pt if pt in POLICY_TYPES else (pt or "Term Life"),
                "carrier": str(p.get("carrier") or "").strip()[:120],
                "coverage": _num(p.get("coverage")),
                "premium": _num(p.get("premium")),
                "insured": str(p.get("insured") or "").strip()[:120],
                "policy_number": str(p.get("policy_number") or "").strip()[:60],
                "renewal_date": (str(p.get("renewal_date")).strip()[:10] if p.get("renewal_date") else None),
                "low_confidence": [f for f in (p.get("low_confidence") or []) if isinstance(f, str) and f in _FIELDS][:7],
            })
    return policies


@router.post("/plan/letters/parse")
async def parse_letter(request: Request, file: UploadFile = File(...),
                       household_id: str = Form(None), user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    hid_in = request.query_params.get("household_id") or household_id
    planner_scope(user, hid_in)  # enforces scope / household for advisor
    data = await file.read()
    if len(data) > MAX_PDF:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    text = _extract_text(data)
    use_vision = len(text.strip()) < 40  # no real text layer => scanned/photo PDF
    policies = []
    mode = "text"
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
            chat = LlmChat(api_key=key, session_id=str(uuid.uuid4()),
                           system_message=PARSE_SYSTEM_PROMPT).with_model("anthropic", "claude-sonnet-5-5")
            if use_vision:
                images = _render_images(data)
                if not images:
                    raise HTTPException(status_code=422, detail="Could not read this PDF — no text layer and no renderable pages.")
                mode = "vision"
                msg = UserMessage(
                    text="These are scanned image(s) of an insurance policy or coverage letter. Read them and extract the policies.",
                    file_contents=[ImageContent(b) for b in images])
            else:
                msg = UserMessage(text="Policy document text:\n" + text[:8000])
            resp = await chat.send_message(msg)
            raw = (resp if isinstance(resp, str) else getattr(resp, "content", str(resp))).strip()
            s, e = raw.find("["), raw.rfind("]")
            if s != -1 and e != -1 and e > s:
                raw = raw[s:e + 1]
            policies = _normalize(json.loads(raw))
        except HTTPException:
            raise
        except Exception as ex:
            logger.warning(f"letter parse failed: {ex}")
    elif use_vision:
        raise HTTPException(status_code=422, detail="This looks like a scanned PDF and AI OCR is unavailable in this environment.")

    audit(user, "letters.parse", "plan_insurance", (file.filename or "policy.pdf"))
    return {"policies": policies, "chars": len(text), "mode": mode}
