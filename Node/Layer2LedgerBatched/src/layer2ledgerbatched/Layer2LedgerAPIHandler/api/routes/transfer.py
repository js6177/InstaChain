from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, Table
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert


from layer2ledgerbatched.common.db.session import get_db_session
from layer2ledgerbatched.common.db.models import Transaction
from layer2ledgerbatched.Layer2LedgerAPIHandler.api.models.requests.PushTransactionRequest import PushTransactionRequest
from layer2ledgerbatched.Layer2LedgerAPIHandler.api.models.responses.CommonResponse import CommonResponse
import layer2ledgerbatched.Layer2LedgerAPIHandler.utils.error_message as error_codes

router = APIRouter()

@router.post("/transfer", response_model=CommonResponse)
async def create_transfer(request: PushTransactionRequest, db: AsyncSession = Depends(get_db_session)) -> CommonResponse:
    response = CommonResponse(error_code=error_codes.ERROR_SUCCESS, error_message="")
    return response