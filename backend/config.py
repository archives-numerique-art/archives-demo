"""Configuration du backend IMF Archive : chemins, ports et listes de référence."""
import os

BACKEND = os.path.dirname(os.path.abspath(__file__))
VERSION = "10.0"

# --- Emplacement des données (tout reste dans le dossier backend) ---
DATA = os.environ.get("IMF_DONNEES") or os.path.join(BACKEND, "donnees")
FILES = os.path.join(DATA, "fichiers")                 # documents scannés
DB = os.environ.get("IMF_DB") or (
    os.path.join(DATA, "archives.db") if os.environ.get("IMF_DONNEES")
    else os.path.join(BACKEND, "imf_archive_pro")
)                                                       # base SQLite principale
KEYF = os.path.join(DATA, "cle.txt")                   # clé secrète des sessions
JOURNAUX = os.environ.get("IMF_JOURNAUX") or os.path.join(BACKEND, "journaux")      # journal en CSV (Excel), un fichier par mois
EXPORTS = os.environ.get("IMF_EXPORTS") or os.path.join(BACKEND, "exports")         # fiches d'audit en CSV (Excel)
SAUV = os.environ.get("IMF_SAUVEGARDE") or os.path.join(BACKEND, "sauvegardes")     # sauvegardes zip

# --- Réseau : le backend et le frontend tournent chacun sur leur port ---
PORT_BACKEND = int(os.environ.get("IMF_PORT_BACKEND", "5001"))
PORT_FRONTEND = int(os.environ.get("IMF_PORT_FRONTEND", "5000"))
HOTE = os.environ.get("IMF_HOTE", "127.0.0.1")         # 127.0.0.1 = cet ordinateur seulement ; 0.0.0.0 = tout le réseau
HTTPS = os.environ.get("IMF_HTTPS") == "1"             # à mettre à 1 derrière un proxy https
ORIGINES_SUPPLEMENTAIRES = [o.strip() for o in os.environ.get("IMF_ORIGINES", "").split(",") if o.strip()]

# --- Listes de référence ---
ROLES = {"admin": "Super administrateur", "gestionnaire": "Responsable de département", "agent": "Agent / assistant",
         "lecteur": "Lecteur", "controle": "Contrôle interne / Conformité / Direction générale / Auditeur (consultation)"}
LIMITED = ("gestionnaire", "agent", "lecteur")          # rôles que l'informatique / la direction peuvent créer
TYPES = ["Dossier crédit", "Contrat", "Correspondance", "Rapport", "Dépôt à terme (DAT)", "Pièce comptable",
         "Dossier du personnel", "Procès-verbal", "Autre"]
NIV = ["Public", "Interne", "Confidentiel"]
ETATS = ["À scanner", "Scanné", "Numérique d'origine"]
EXT = {".pdf", ".jpg", ".jpeg", ".png"}
MOIS_FR = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
ACTIONS_JOURNAL = ["Connexion", "Échec de connexion", "Connexion bloquée", "Déconnexion", "Consultation", "Accès refusé",
                   "Import", "Suppression", "Document partagé", "Accès accordé", "Demande", "Sauvegarde", "Journal exporté"]
