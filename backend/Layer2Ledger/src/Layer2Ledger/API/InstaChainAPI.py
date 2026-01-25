from fastapi import Request, Depends
from fastapi.responses import JSONResponse
import Layer2Ledger.core.ErrorMessage as ErrorMessage
import logging
import json
import datetime
import Layer2Ledger.core.GlobalLogging as GlobalLogging
from pydantic.main import BaseModel as PydanticBaseModel  # Import the base class
from Layer2Ledger.database.database import get_db, AsyncSession

class InstachainRequestHandler:
    def __init__(self):
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.parameters = []

    async def getPostJsonParams(self, request: Request):
        return await request.json()

    def getRequestParams(self, request: Request, param_name: str):
        return request.query_params.get(param_name)

    async def getParameters(self, request: Request):
        pass

    async def processRequest(self, db: AsyncSession):
        pass

    async def handleRequest(self, request: Request, db: AsyncSession):
        self.preProcessRequest() #to do anything before processing the request, such as logging time
        # GlobalLogging.log_text(await request.body())
        await self.getParameters(request)

        await self.processRequest(db)
        self.postProcessRequest() #to do anything after processing the request, such as logging error codes

    async def post(self, request: Request, db: AsyncSession = Depends(get_db)):
        await self.handleRequest(request, db)
        logging.info("InstachainRequestHandler POST called")
        return self.build_response()

    async def get(self, request: Request, db: AsyncSession = Depends(get_db)):
        logging.info("InstachainRequestHandler GET called")
        await self.handleRequest(request, db)
        return self.build_response()

    def preProcessRequest(self):
        pass

    def postProcessRequest(self):
        pass

    def build_response(self):
        if isinstance(self.result, PydanticBaseModel):
            return JSONResponse(content=self.result.model_dump())
        else:
            return JSONResponse(content=self.result)

    @classmethod
    async def initializeRequest(cls, request: Request, db: AsyncSession = Depends(get_db)):
        handler = cls()
        await handler.handleRequest(request, db)
        return handler.build_response()
