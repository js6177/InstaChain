import json
from pathlib import Path
import sys

# Add project root's 'src' to the Python path to allow for absolute imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from fastapi.openapi.utils import get_openapi
from layer2ledgerbatched.layer2ledgerapihandler.main import app

schema = get_openapi(
    title=app.title,
    version=app.version,
    openapi_version=app.openapi_version,
    description=app.description,
    routes=app.routes,
)

output_path = Path(__file__).parent.parent / "docs" / "layer2ledgerapihandler_openapi.json"
with open(output_path, "w") as f:
    json.dump(schema, f, indent=2)
print(f"OpenAPI schema dumped to {output_path}")

# To run this script, use the command:
# python tools/dump_fastapi_openapi.py

