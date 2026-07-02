from pydantic import BaseModel, Field


class SeedBalanceRequest(BaseModel):
    address: str = Field(min_length=1)
    balance: int = Field(gt=0)
    include_deposit_transaction: bool = True


class SeedMnemonicRequest(BaseModel):
    mnemonic: str = Field(min_length=1)
    balance: int = Field(gt=0)
    include_deposit_transaction: bool = True


class SeedResponse(BaseModel):
    address: str
    balance: int
    include_deposit_transaction: bool


class TestHelperErrorDetail(BaseModel):
    error: str
    message: str
    traceback: str

    def format_message(self) -> str:
        return f"{self.error}: {self.message}\n{self.traceback}"


class TestHelperErrorResponse(BaseModel):
    detail: TestHelperErrorDetail | str


class HealthResponse(BaseModel):
    status: str = "ok"


class SeedCliResult(BaseModel):
    address: str
    balance_sats: int = Field(gt=0)
    include_deposit_transaction: bool
