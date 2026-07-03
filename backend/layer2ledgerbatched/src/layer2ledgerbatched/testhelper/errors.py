"""Test-only error responses with full diagnostic detail."""

from __future__ import annotations

import traceback

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from layer2ledgerbatched.testhelper.schemas import (
    TestHelperErrorDetail,
    TestHelperErrorResponse,
)


def exception_detail(exc: BaseException) -> TestHelperErrorDetail:
    return TestHelperErrorDetail(
        error=type(exc).__name__,
        message=str(exc),
        traceback="".join(
            traceback.format_exception(type(exc), exc, exc.__traceback__)
        ),
    )


def parse_error_detail(detail: object) -> TestHelperErrorDetail | None:
    if isinstance(detail, TestHelperErrorDetail):
        return detail

    try:
        return TestHelperErrorDetail.model_validate(detail)
    except ValidationError:
        return None


def build_error_response(status_code: int, detail: TestHelperErrorDetail) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=TestHelperErrorResponse(detail=detail).model_dump(mode="json"),
    )


def http_error_from_exception(exc: BaseException, *, status_code: int = 500) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail=exception_detail(exc),
    )
