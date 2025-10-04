import pytest
import httpx
from sqlalchemy import select
import random

from layer2ledgerbatched.layer2ledgerapihandler.main import app
from layer2ledgerbatched.common.db.models import KeyValueStore
import layer2ledgerbatched.layer2ledgerapihandler.utils.error_message as error_codes
from layer2ledgerbatched.layer2ledgerapihandler.api.models.requests.sample_request import SampleRequest
from layer2ledgerbatched.layer2ledgerapihandler.api.models.responses.common_response import CommonResponse

@pytest.mark.asyncio
async def test_lifespan_events(postgresql_session, redis_client) -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_write_to_db_and_redis(postgresql_session, redis_client) -> None:
    test_key = "test_key_" + str(random.randint(1, 10000))
    test_value = "test_value_" + str(random.randint(1, 10000))

    # Call the API
    request = SampleRequest(key=test_key, value=test_value)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/test_db", json=request.model_dump())
        assert response.status_code == 200

        response_model = CommonResponse.model_validate(response.json())
        assert response_model.error_code == error_codes.ERROR_SUCCESS

    # Verify in PostgreSQL

    result = await postgresql_session.execute(select(KeyValueStore).where(KeyValueStore.key == test_key))
    item = result.scalar_one_or_none()
    assert item is not None
    assert item.value == test_value

    # Verify in Redis
    value = await redis_client.get(test_key)
    assert value.decode('utf-8') == test_value
