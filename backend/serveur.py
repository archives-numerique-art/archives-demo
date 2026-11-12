"""Démarre le BACKEND (API) sur son propre port (5001 par défaut)."""
import config as C
from api import app
import services

if __name__ == "__main__":
    services.demarrer_taches()
    print("\nIMF Archive - BACKEND version %s" % C.VERSION)
    print("  API : http://%s:%d/api/etat" % ("localhost" if C.HOTE == "127.0.0.1" else C.HOTE, C.PORT_BACKEND))
    print("  Base de données : %s" % C.DB)
    print("  Pour arrêter : fermez cette fenêtre.\n")
    try:
        from waitress import serve
        serve(app, host=C.HOTE, port=C.PORT_BACKEND, threads=8, max_request_body_size=3 * 1024 ** 3)
    except ImportError:
        app.run(host=C.HOTE, port=C.PORT_BACKEND, threaded=True)
