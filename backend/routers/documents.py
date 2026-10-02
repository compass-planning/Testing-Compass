"""Documents Hub (per-household file vault via object storage) + Meeting recorder
(Whisper transcription). Writes are tenant-scoped; enterprise is read-only."""
import os
import uuid
import tempfile
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from repository import repo
from models import _id
from deps import get_current_user, planner_scope, _block_enterprise_write, audit
import storage

logger = logging.getLogger("compass.documents")
router = APIRouter()

MAX_DOC = 10 * 1024 * 1024       # 10 MB (proxy-safe)
MAX_AUDIO = 24 * 1024 * 1024     # under Whisper's 25 MB
DOC_CATEGORIES = {"document", "statement", "will", "tax", "insurance", "other"}


def _safe(name: str) -> str:
    return "".join(c for c in (name or "file") if c.isalnum() or c in "._- ").strip()[:120] or "file"


@router.get("/plan/documents/files")
async def list_files(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rows = [r for r in repo.list(store, "plan_document_files", read) if (not hid or r.get("household_id") == hid)]
    rows.sort(key=lambda r: r.get("uploaded_at", ""), reverse=True)
    return rows


@router.post("/plan/documents/upload")
async def upload_file(file: UploadFile = File(...), category: str = Form("document"),
                      household_id: str = Form(None), user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, read, ws, hid = planner_scope(user, household_id)
    data = await file.read()
    if len(data) > MAX_DOC:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    cat = category if category in DOC_CATEGORIES else "document"
    name = _safe(file.filename)
    path = f"docs/{store}/{hid or 'self'}/{uuid.uuid4().hex}_{name}".replace(" ", "_")
    storage.put_object(path, data, file.content_type or "application/octet-stream")
    rec = {"id": _id(), "store": store, "scope": ws, "household_id": hid, "name": name,
           "category": cat, "size": len(data), "content_type": file.content_type or "application/octet-stream",
           "path": path, "uploaded_by": user["email"], "uploaded_at": datetime.now(timezone.utc).isoformat()}
    repo.create(store, "plan_document_files", rec)
    audit(user, "document.upload", "plan_document_files", name)
    return rec


@router.get("/plan/documents/files/{fid}/download")
async def download_file(fid: str, user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rec = next((r for r in repo.list(store, "plan_document_files", read) if r["id"] == fid), None)
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    content, ctype = storage.get_object(rec["path"])
    audit(user, "document.download", "plan_document_files", rec["name"])
    return StreamingResponse(iter([content]), media_type=ctype,
                             headers={"Content-Disposition": f'attachment; filename="{rec["name"]}"'})


@router.delete("/plan/documents/files/{fid}")
async def delete_file(fid: str, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, read, _, hid = planner_scope(user, household_id)
    rec = next((r for r in repo.list(store, "plan_document_files", read) if r["id"] == fid), None)
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        storage.delete_object(rec["path"])
    except Exception as e:
        logger.warning(f"object delete failed: {e}")
    repo.delete(store, "plan_document_files", fid, read)
    audit(user, "document.delete", "plan_document_files", rec["name"])
    return {"ok": True}


# ── Meeting recorder (Whisper) ───────────────────────────────────────────────
@router.get("/plan/meetings")
async def list_meetings(user: dict = Depends(get_current_user), household_id: str = None):
    store, read, _, hid = planner_scope(user, household_id)
    rows = [r for r in repo.list(store, "plan_meetings", read) if (not hid or r.get("household_id") == hid)]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return rows


@router.post("/plan/meetings/transcribe")
async def transcribe_meeting(file: UploadFile = File(...), title: str = Form("Client meeting"),
                             household_id: str = Form(None), user: dict = Depends(get_current_user)):
    _block_enterprise_write(user)
    store, read, ws, hid = planner_scope(user, household_id)
    data = await file.read()
    if len(data) > MAX_AUDIO:
        raise HTTPException(status_code=413, detail="Recording too long (max ~24MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty recording")
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Transcription unavailable")
    suffix = ".webm"
    ct = (file.content_type or "")
    if "wav" in ct:
        suffix = ".wav"
    elif "mp4" in ct or "m4a" in ct:
        suffix = ".mp4"
    elif "mpeg" in ct or "mp3" in ct:
        suffix = ".mp3"
    transcript = ""
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        stt = OpenAISpeechToText(api_key=key)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(data)
            tmp.flush()
            tmp.seek(0)
            with open(tmp.name, "rb") as f:
                resp = await stt.transcribe(file=f, model="whisper-1", response_format="json")
        transcript = resp.text if hasattr(resp, "text") else (resp if isinstance(resp, str) else str(resp))
    except Exception as e:
        logger.warning(f"transcription failed: {e}")
        raise HTTPException(status_code=502, detail="Could not transcribe audio")
    rec = {"id": _id(), "store": store, "scope": ws, "household_id": hid, "title": _safe(title),
           "transcript": transcript.strip(), "created_by": user["email"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    repo.create(store, "plan_meetings", rec)
    audit(user, "meeting.transcribe", "plan_meetings", rec["title"])
    return rec


@router.delete("/plan/meetings/{mid}")
async def delete_meeting(mid: str, user: dict = Depends(get_current_user), household_id: str = None):
    _block_enterprise_write(user)
    store, read, _, hid = planner_scope(user, household_id)
    if not repo.delete(store, "plan_meetings", mid, read):
        raise HTTPException(status_code=404, detail="Meeting not found")
    audit(user, "meeting.delete", "plan_meetings", mid)
    return {"ok": True}
