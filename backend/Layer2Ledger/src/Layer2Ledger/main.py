from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
import Layer2Ledger.API.NodeInfoAPI as NodeInfoAPI
import Layer2Ledger.API.TransactionAPI as TransactionAPI
import Layer2Ledger.API.OnboardingAPI as OnboardingAPI
import Layer2Ledger.API.AuditAPI as AuditAPI
import Layer2Ledger.API.ExplorerAPI as ExplorerAPI
from Layer2Ledger.database.database import Base, engine, get_db, AsyncSession

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic: Create database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown logic (if any)

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.get("/getNodeInfo")
async def get_node_info(request: Request, db: AsyncSession = Depends(get_db)):
    return await NodeInfoAPI.getNodeInfo.initializeRequest(request, db)

@app.post("/pushTransaction")
async def push_transaction(request: Request, db: AsyncSession = Depends(get_db)):
    return await TransactionAPI.pushTransaction.initializeRequest(request, db)

@app.post("/getBalance")
async def get_balance(request: Request, db: AsyncSession = Depends(get_db)):
    return await TransactionAPI.getBalance.initializeRequest(request, db)

@app.post("/getTransaction")
async def get_transaction(request: Request, db: AsyncSession = Depends(get_db)):
    return await TransactionAPI.getTransaction.initializeRequest(request, db)

@app.post("/getAllTransactionsOfPublicKey")
async def get_all_transactions_of_public_key(request: Request, db: AsyncSession = Depends(get_db)):
    return await TransactionAPI.getAllTransactionsOfPublicKey.initializeRequest(request, db)

@app.post("/getFee")
async def get_fee(request: Request, db: AsyncSession = Depends(get_db)):
    return await TransactionAPI.getFee.initializeRequest(request, db)

@app.post("/withdrawalRequest")
async def withdrawal_request(request: Request, db: AsyncSession = Depends(get_db)):
    return await OnboardingAPI.withdrawalRequest.initializeRequest(request, db)

@app.post("/withdrawalCanceled")
async def withdrawal_canceled(request: Request, db: AsyncSession = Depends(get_db)):
    return await OnboardingAPI.withdrawalCanceled.initializeRequest(request, db)

@app.post("/withdrawalBroadcasted")
async def withdrawal_broadcasted(request: Request, db: AsyncSession = Depends(get_db)):
    return await OnboardingAPI.withdrawalBroadcasted.initializeRequest(request, db)

@app.post("/withdrawalConfirmed")
async def withdrawal_confirmed(request: Request, db: AsyncSession = Depends(get_db)):
    return await OnboardingAPI.withdrawalConfirmed.initializeRequest(request, db)

@app.post("/getWithdrawalRequests")
async def get_withdrawal_requests(request: Request, db: AsyncSession = Depends(get_db)):
    return await OnboardingAPI.getWithdrawalRequests.initializeRequest(request, db)

@app.post("/ackWithdrawalRequests")
async def ack_withdrawal_requests(request: Request, db: AsyncSession = Depends(get_db)):
    return await OnboardingAPI.ackWithdrawalRequests.initializeRequest(request, db)

@app.post("/getNewDepositAddress")
async def get_new_deposit_address(request: Request, db: AsyncSession = Depends(get_db)):
    return await OnboardingAPI.getNewDepositAddress.initializeRequest(request, db)

@app.post("/depositFunds")
async def deposit_funds(request: Request, db: AsyncSession = Depends(get_db)):
    return await OnboardingAPI.depositConfirmed.initializeRequest(request, db)

@app.post("/postLayer1AuditReport")
async def post_layer1_audit_report(request: Request, db: AsyncSession = Depends(get_db)):
    return await AuditAPI.postLayer1AuditReport.initializeRequest(request, db)

@app.get("/getLayer1AuditReport")
async def get_layer1_audit_report(request: Request, db: AsyncSession = Depends(get_db)):
    return await AuditAPI.getLayer1AuditReport.initializeRequest(request, db)

@app.post("/search")
async def search(request: Request, db: AsyncSession = Depends(get_db)):
    return await ExplorerAPI.search.initializeRequest(request, db)
