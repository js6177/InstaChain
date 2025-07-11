from pydantic import BaseModel

class GetLayer1AuditReportRequest(BaseModel):
    block_height: int = 0