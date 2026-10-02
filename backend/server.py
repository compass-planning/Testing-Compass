"""Compass Planning — FastAPI composition root.

Tenant isolation is enforced server-side on every route via `scope_context`
(see deps.py), never in the UI. Cross-tenant reads are impossible by
construction. Domain routes live in routers/{auth,planning,advisor,tasks,compliance}.
"""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

import storage
import seed
from routers import auth, planning, advisor, tasks, compliance, retirement, protection, estate, insights, documents, education, crossborder, letters

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("compass")

app = FastAPI(title="Compass Planning API")


@app.on_event("startup")
async def _init_storage():
    try:
        storage.init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed (logo uploads disabled): {e}")


seed.seed()

api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"service": "Compass Planning", "version": "v1", "data_layer": "mock"}


api.include_router(auth.router)
api.include_router(retirement.router)
api.include_router(protection.router)
api.include_router(estate.router)
api.include_router(insights.router)
api.include_router(documents.router)
api.include_router(education.router)
api.include_router(crossborder.router)
api.include_router(letters.router)
api.include_router(planning.router)
api.include_router(advisor.router)
api.include_router(tasks.router)
api.include_router(compliance.router)

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
