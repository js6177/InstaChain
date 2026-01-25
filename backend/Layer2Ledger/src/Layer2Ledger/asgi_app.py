from asgiref.wsgi import WsgiToAsgi
from Layer2Ledger.main import app as flask_app # Import your Flask app instance

asgi_app = WsgiToAsgi(flask_app)