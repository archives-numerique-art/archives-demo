"""Démarre le FRONTEND (l'interface) sur son propre port (5000 par défaut).
Ce serveur ne fait que livrer les pages ; il n'accède jamais à la base de données.
Toutes les données passent par le backend (port 5001)."""
import os, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit

RACINE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("IMF_PORT_FRONTEND", "5000"))
HOTE = os.environ.get("IMF_HOTE", "127.0.0.1")


class Gestionnaire(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=RACINE, **k)
    def do_GET(self):
        if urlsplit(self.path).path == "/": self.path = "/index.html"
        super().do_GET()
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache"); self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin"); self.send_header("X-Frame-Options", "DENY")
        super().end_headers()
    def log_message(self, *a): pass


if __name__ == "__main__":
    print("\nIMF Archive - FRONTEND")
    print("  Racine du site : %s" % os.path.join(RACINE, "index.html"))
    print("  Ouvrez : http://localhost:%d/" % PORT)
    print("  API backend attendue sur le port %s." % os.environ.get("IMF_PORT_BACKEND", "5001"))
    print("  Pour arrêter : fermez cette fenêtre.\n")
    try: ThreadingHTTPServer((HOTE, PORT), Gestionnaire).serve_forever()
    except OSError as e: sys.exit("Impossible de démarrer sur le port %d : %s" % (PORT, e))
