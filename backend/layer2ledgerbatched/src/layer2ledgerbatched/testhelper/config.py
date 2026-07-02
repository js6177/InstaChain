from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field, model_validator


class TestMnemonicKeysFile(BaseModel):
    mnemonic: str = Field(min_length=1)


class TestSeedConfig(BaseModel):
    """Config for seeding wallet balance in the test environment."""

    balance_sats: int = Field(gt=0)
    mnemonic: str | None = None
    mnemonic_file: str | None = None
    include_deposit_transaction: bool = True

    @model_validator(mode="after")
    def require_mnemonic_source(self) -> TestSeedConfig:
        if not self.mnemonic and not self.mnemonic_file:
            raise ValueError("Either 'mnemonic' or 'mnemonic_file' must be provided")
        return self

    @classmethod
    def load_from_path(cls, path: Path) -> TestSeedConfig:
        return cls.model_validate_json(path.read_text(encoding="utf-8"))

    def resolve_mnemonic_words(self) -> list[str]:
        if self.mnemonic:
            return self.mnemonic.strip().split()

        assert self.mnemonic_file is not None
        payload = TestMnemonicKeysFile.model_validate_json(
            Path(self.mnemonic_file).read_text(encoding="utf-8")
        )
        return payload.mnemonic.strip().split()
