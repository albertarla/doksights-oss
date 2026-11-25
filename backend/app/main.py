"""
Manual Hub - FastAPI Backend
Entry point for the Python backend server.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import chat, manuals, discovery, analytics, superadmin, portal

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start APScheduler on startup, shut it down on teardown."""
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from app.services.classification_service import classification_service

    scheduler = AsyncIOScheduler()
    interval_minutes = settings.classification_interval_minutes
    if settings.classification_enabled:
        scheduler.add_job(
            classification_service.classify_pending_sessions,
            "interval",
            minutes=interval_minutes,
            id="classify_sessions",
            replace_existing=True,
        )
        logger.info(
            f"[Scheduler] Classification job scheduled every {interval_minutes} minute(s)."
        )
    else:
        logger.info("[Scheduler] Classification disabled (CLASSIFICATION_ENABLED=false).")
    scheduler.start()

    # Synchronize 'manuals' storage bucket file size limit with settings
    try:
        from app.services.supabase_service import supabase_service
        await supabase_service.sync_manuals_bucket_size()
    except Exception as e:
        logger.error(f"Failed to synchronize manuals bucket size limit: {e}")

    msg1 = f"Starting DokSights API in {settings.environment} mode."
    msg2 = f"Active CORS Origins: {settings.cors_origins}"
    logger.info(msg1)
    logger.info(msg2)
    print(f"--- STARTUP --- {msg1} | {msg2}")

    yield  # Application runs here

    scheduler.shutdown(wait=False)
    logger.info("[Scheduler] Scheduler shut down gracefully.")


app = FastAPI(
    title="Manual Hub API",
    description="Python backend for advanced AI chat capabilities",
    version="0.1.0",
    lifespan=lifespan,
    # Documentation is only available in development mode for security
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    debug=settings.is_development,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "0.1.0"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Manual Hub API", "docs": "/docs"}


# Include routers
app.include_router(chat.router, prefix="/api/v1")
app.include_router(manuals.router, prefix="/api/v1")
app.include_router(discovery.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(superadmin.router, prefix="/api/v1")
app.include_router(portal.router, prefix="/api/v1")