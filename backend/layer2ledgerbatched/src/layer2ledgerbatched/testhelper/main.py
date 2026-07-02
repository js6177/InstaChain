from __future__ import annotations

import argparse
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from config_loader.loader import Environment, get_layer2ledgerbatched_testhelper_config, resolve_environment
from config_models.models import Layer2LedgerTestHelperSettings
from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from layer2ledgerbatched.common.db.models import Base
from layer2ledgerbatched.testhelper.errors import (
    build_error_response,
    exception_detail,
    parse_error_detail,
)
from layer2ledgerbatched.testhelper.routes import router
from layer2ledgerbatched.testhelper.sessions import create_db_engine


def _ensure_test_environment() -> None:
    if resolve_environment() != Environment.TEST.value:
        print(
            "testhelper refuses to start outside the test environment "
            f"(ENVIRONMENT={resolve_environment()!r})",
            file=sys.stderr,
        )
        raise SystemExit(1)


def load_testhelper_settings(config_path: Path | None = None) -> Layer2LedgerTestHelperSettings:
    if config_path is not None:
        return Layer2LedgerTestHelperSettings.model_validate_json(
            config_path.read_text(encoding="utf-8")
        )
    return get_layer2ledgerbatched_testhelper_config()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    engine = create_db_engine()
    session_maker = async_sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    app.state.db_session_maker = session_maker

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    await engine.dispose()


def create_app() -> FastAPI:
    _ensure_test_environment()

    app = FastAPI(lifespan=lifespan, redirect_slashes=False)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def testhelper_http_exception_handler(
        request: Request, exc: HTTPException
    ) -> JSONResponse:
        structured_detail = parse_error_detail(exc.detail)
        if exc.status_code >= 500 and structured_detail is not None:
            return build_error_response(exc.status_code, structured_detail)
        return await http_exception_handler(request, exc)

    @app.exception_handler(Exception)
    async def testhelper_unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        return build_error_response(500, exception_detail(exc))

    app.include_router(router)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Layer2ledger testhelper HTTP service")
    parser.add_argument(
        "--config",
        type=Path,
        help="Path to testhelper service config JSON (host/port). "
        "Defaults to OPENL2_CONFIG_PATH layer2ledgerbatched-testhelper-config.json",
    )
    args = parser.parse_args()

    settings = load_testhelper_settings(args.config)
    uvicorn.run(
        "layer2ledgerbatched.testhelper.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
