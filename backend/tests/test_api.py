"""Tests de l'API : lance  py tests/test_api.py  (utilise des dossiers temporaires, ne touche pas à vos données)."""
import os, sys, io, re, tempfile, subprocess, glob, zipfile, importlib, sqlite3
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tmp = tempfile.mkdtemp(prefix="imf_test_")
for k, v in {"IMF_DONNEES": "donnees", "IMF_DB": os.path.join("donnees", "archives.db"), "IMF_JOURNAUX": "journaux", "IMF_EXPORTS": "exports", "IMF_SAUVEGARDE": "sauvegardes"}.items():
    os.environ[k] = os.path.join(tmp, v)
sys.path.insert(0, RACINE); os.chdir(RACINE)
import config as C
os.makedirs(os.path.dirname(C.DB), exist_ok=True)
cible = sqlite3.connect(C.DB)
cible.executescript("""
create table users (
    id integer primary key, nom text unique, mdp text, role text,
    changer integer default 0, departement text, comptes integer default 0,
    accorde integer default 0, archiviste integer default 0,
    confid integer default 0, journal integer default 0
);
create table depts (nom text primary key, confidentiel integer default 0);
create table docs (
    id integer primary key, num text, titre text, service text, type text,
    date text, niveau text, emplacement text, etat text, fichier text, cree text
);
create table grants (
    doc integer, user integer, jusqu text, portee text default 'doc', valeur text
);
create table demandes (
    id integer primary key, doc integer, user integer, jours integer, motif text,
    statut text, cree text, reponse text, portee text default 'doc', valeur text
);
create table log (
    id integer primary key, t text, u text, a text, d text
);
create index i_docs_service on docs(service);
create index i_docs_date on docs(date);
create index i_grants_user on grants(user);
create index i_log_t on log(t);
""")
cible.commit(); cible.close()
ok = 0
def verif(cond, msg):
    global ok
    print(("  ok  " if cond else "  ECHEC ") + msg); ok += bool(cond)
    if not cond: sys.exit(1)

env_default = dict(os.environ)
env_default.pop("IMF_DONNEES", None); env_default.pop("IMF_DB", None)
cfg = subprocess.run([sys.executable, "-c", "import config; print(config.DB)"], cwd=RACINE, env=env_default,
                     text=True, capture_output=True, check=True)
verif(cfg.stdout.strip() == os.path.join(RACINE, "db", "imf_archive_pro"), "base SQLite principale : chemin par défaut")
verif(C.DB == os.path.join(tmp, "donnees", "archives.db"), "IMF_DONNEES : chemin temporaire isolé pour les tests")

import base
db_temporaire = C.DB
db_absente = os.path.join(tmp, "absente", "base.sqlite")
C.DB = db_absente
try:
    base.init_db()
except FileNotFoundError as e:
    verif("Base SQLite introuvable" in str(e) and not os.path.exists(db_absente), "base absente : erreur claire sans créer un fichier vide")
else:
    verif(False, "base absente : erreur claire sans créer un fichier vide")
finally:
    C.DB = db_temporaire

# Simule une ancienne vue sans identifiant de ligne : la migration doit la mettre à niveau.
ancien = sqlite3.connect(C.DB)
ancien.execute("create view v_documents as select num, titre, service as departement, type, date, niveau, etat, cree from docs")
ancien.commit(); ancien.close()

# ---- 1. première utilisation (base vide)
import api
A = api.app.test_client(); H = {"Origin": "http://localhost:%d" % C.PORT_FRONTEND}
view_conn = base.connecter()
view_cols = {r[1] for r in view_conn.execute("pragma table_info(v_documents)")}
view_conn.close()
verif({"id", "departement", "fichier_joint"}.issubset(view_cols), "vue des documents : identifiant et colonnes de registre disponibles")
r = A.get("/api/etat", headers=H); verif(r.get_json()["setup_requis"], "base vide : configuration initiale demandée")
verif(A.post("/api/setup", json={"nom": "boss", "mdp": "court"}, headers=H).status_code == 400, "setup : mot de passe trop court refusé")
r = A.post("/api/setup", json={"nom": "boss", "mdp": "MotDePasse1"}, headers=H); verif(r.status_code == 200 and r.get_json()["moi"]["role"] == "admin", "setup : super administrateur créé")
verif(A.post("/api/setup", json={"nom": "x", "mdp": "MotDePasse1"}, headers=H).status_code == 400, "setup : impossible une 2e fois")

# ---- 2. données de démonstration
subprocess.run([sys.executable, "donnees_demo.py"], check=True, capture_output=True, env=dict(os.environ))   # refuse si docs ; users déjà là -> insert or ignore
class Client:
    def __init__(s, nom, mdp="Demo2026!"):
        s.c = api.app.test_client(); r = s.c.post("/api/connexion", json={"nom": nom, "mdp": mdp}, headers=H); s.r = r
        s.csrf = r.get_json()["moi"]["csrf"] if r.status_code == 200 else None
    def h(s): return dict(H, **{"X-CSRF-Token": s.csrf or ""})
    def get(s, u, **k): return s.c.get(u, headers=H, **k)
    def post(s, u, **k): return s.c.post(u, headers=s.h(), **k)
    def put(s, u, **k): return s.c.put(u, headers=s.h(), **k)
    def delete(s, u, **k): return s.c.delete(u, headers=s.h(), **k)
ad = Client("demo.admin"); ag = Client("demo.agent"); gs = Client("demo.gestionnaire"); dg = Client("demo.direction"); it = Client("demo.informatique"); asst = Client("demo.assistant"); rc = Client("demo.recouvrement")
verif(ad.r.status_code == 200, "connexion admin")
verif(Client("demo.agent", "faux").r.status_code == 401, "mauvais mot de passe refusé")

# ---- 3. sécurité : CORS / CSRF / origine / session
r = A.options("/api/documents", headers=dict(H, **{"Access-Control-Request-Method": "GET"})); verif(r.status_code == 204 and r.headers.get("Access-Control-Allow-Origin") == H["Origin"] and r.headers.get("Access-Control-Allow-Credentials") == "true", "CORS : le frontend autorisé reçoit les en-têtes")
r = A.options("/api/etat", base_url="http://192.168.1.20:%d" % C.PORT_BACKEND,
              headers={"Origin": "http://192.168.1.20:%d" % C.PORT_FRONTEND, "Access-Control-Request-Method": "GET"})
verif(r.status_code == 204 and r.headers.get("Access-Control-Allow-Origin") == "http://192.168.1.20:%d" % C.PORT_FRONTEND,
      "CORS : frontend du réseau local autorisé sur la même adresse")
r = A.get("/api/etat", base_url="http://192.168.1.20:%d" % C.PORT_BACKEND,
          headers={"Origin": "http://192.168.1.20:5002"})
verif("Access-Control-Allow-Origin" not in r.headers, "CORS : port frontend réseau incorrect refusé")
r = A.get("/api/etat", headers={"Origin": "http://evil.example:5000"}); verif("Access-Control-Allow-Origin" not in r.headers, "CORS : une autre origine n'est pas autorisée")
r = ag.c.post("/api/documents/supprimer", json={"ids": [1]}, headers=H); verif(r.status_code == 400, "CSRF : requête sans jeton refusée")
r = ag.c.post("/api/demandes", json={}, headers=dict(ag.h(), Origin="http://evil.example:5000")); verif(r.status_code == 403, "origine étrangère refusée sur une écriture")
verif(api.app.test_client().get("/api/documents", headers=H).status_code == 401, "sans connexion : 401")

# ---- 4. règles de visibilité et de confidentialité
def docs(c, q=""): return c.get("/api/documents" + q).get_json()
verif(docs(ad)["total"] == 6, "admin voit les 6 documents")
verif(all(isinstance(d.get("a_fichier"), bool) for d in docs(ad)["documents"]) and all(d["a_fichier"] for d in docs(ad)["documents"]),
      "registre des documents indique si un scan est attaché")
verif(docs(ad, "?etat=Scanné")["total"] == 6 and docs(ad, "?etat=À%20scanner")["total"] == 0,
      "registre des documents : filtre par état")
verif(docs(ag)["total"] == 4 and all(d["niveau"] != "Confidentiel" and d["type"] != "Dossier du personnel" for d in docs(ag)["documents"]), "agent : voit les 4 documents non confidentiels")
d_bravo = next(d for d in docs(ad)["documents"] if "Bravo" in d["titre"])
verif(ag.get("/api/documents/%d" % d_bravo["id"]).status_code == 404 or d_bravo["niveau"] != "Confidentiel", "agent : confidentiel introuvable")
confs = [d for d in docs(ad)["documents"] if d["niveau"] == "Confidentiel" or d["titre"].startswith("Dossier du personnel")]
verif(all(ag.get("/api/documents/%d" % d["id"]).status_code == 404 for d in confs), "agent : fiches des confidentiels = 404")
verif(docs(ag, "?q=bravo")["total"] == 0, "agent : la recherche ne trouve pas le confidentiel")
verif(docs(ad, "?q=ALPHA")["total"] == 1 and docs(ad, "?q=credit")["total"] >= 2, "recherche sans accents ni majuscules")
d_int = next(d for d in docs(ad)["documents"] if d["niveau"] == "Interne" and d["service"] == "Crédit")
verif(ag.get("/api/documents/%d/fichier" % d_int["id"]).status_code == 200, "agent ouvre sans demande un document Interne")
verif(dg.get("/api/documents/%d" % confs[0]["id"]).status_code == 404, "direction sans droit : confidentiel invisible")
verif(Client("demo.lecteur").get("/api/documents/%d/fichier" % d_int["id"]).status_code == 200, "lecteur ouvre un document Interne")

# ---- 5. droits ajoutés par le super administrateur
uid = {u["nom"]: u["id"] for u in ad.get("/api/utilisateurs").get_json()["utilisateurs"]}
r = ad.put("/api/utilisateurs/%d" % uid["demo.direction"], json={"role": "controle", "departement": "", "drapeaux": {"confid": True, "journal": True}}); verif(r.status_code == 200, "admin donne les droits confidentiels + journal à la direction")
dg = Client("demo.direction"); verif(dg.get("/api/documents/%d/fichier" % confs[0]["id"]).status_code == 200, "direction avec droit : ouvre le confidentiel")
verif(dg.get("/api/journal").status_code == 200 and ag.get("/api/journal").status_code == 403, "journal : direction oui, agent non")
verif(it.get("/api/utilisateurs").status_code == 200 and ag.get("/api/utilisateurs").status_code == 403, "création de comptes : informatique oui, agent non")
r = it.post("/api/utilisateurs", json={"nom": "pirate", "role": "controle", "mdp": "MotDePasse1"}); verif(r.status_code == 400, "informatique ne peut pas créer un compte de contrôle")
r = it.post("/api/utilisateurs", json={"nom": "nouvel.agent", "role": "agent", "departement": "Crédit", "mdp": "MotDePasse1"}); verif(r.status_code == 200, "informatique crée un agent")
verif(it.put("/api/utilisateurs/%d" % uid["demo.direction"], json={"role": "agent"}).status_code in (403, 404), "informatique ne peut pas modifier la direction")
verif(it.post("/api/utilisateurs/%d/mot-de-passe" % uid["demo.admin"], json={"mdp": "MotDePasse1"}).status_code == 404, "informatique ne touche pas à l'admin")
na = Client("nouvel.agent", "MotDePasse1"); verif(na.r.status_code == 200 and na.r.get_json()["moi"]["changer_mdp"] is False, "nouvel agent se connecte")
r = ad.post("/api/utilisateurs/%d/mot-de-passe" % [u for u in ad.get("/api/utilisateurs").get_json()["utilisateurs"] if u["nom"] == "nouvel.agent"][0]["id"], json={"mdp": "Temporaire1"})
n2 = Client("nouvel.agent", "Temporaire1"); verif(n2.get("/api/documents").status_code == 403 and n2.get("/api/documents").get_json().get("changer_mdp"), "mot de passe temporaire : changement obligatoire")
r = n2.post("/api/mot-de-passe", json={"ancien": "Temporaire1", "nouveau": "NouveauMdp12", "confirme": "NouveauMdp12"}); verif(r.status_code == 200 and n2.get("/api/documents").status_code == 200, "changement du mot de passe")

# ---- 6. départements confidentiels + demandes + décisions
r = ad.put("/api/departements/confidentiels", json={"noms": ["Comptabilité", "Ressources humaines"]}); verif(r.status_code == 200, "départements Comptabilité et RH rendus confidentiels")
verif(docs(ag)["total"] == 3 and all(d["service"] == "Crédit" for d in docs(ag)["documents"]), "agent : ne voit plus que le Crédit (3 documents)")
nav = ag.get("/api/navigation").get_json(); verif(all(x["nom"] == "Crédit" for x in nav["departements"]), "le nom d'un département confidentiel reste caché")
verif(set(ag.get("/api/departements").get_json()["confidentiels"]) == {"Comptabilité", "Ressources humaines"}, "le formulaire de demande connaît les départements confidentiels")
verif(ag.post("/api/demandes", json={"portee": "dept", "valeur": "Crédit", "motif": "x", "jours": 3}).status_code == 400, "demande refusée pour un département non confidentiel")
verif(ag.post("/api/demandes", json={"portee": "dept", "valeur": "Comptabilité", "motif": "Vérifier un dépôt", "jours": 7}).status_code == 200, "agent demande l'accès à la Comptabilité")
dem = ag.get("/api/demandes").get_json()["demandes"][0]
verif(gs.post("/api/demandes/%d/decision" % dem["id"], json={"action": "ok", "jours": 7}).status_code == 403, "responsable du Crédit ne peut pas décider pour la Comptabilité")
ad.put("/api/utilisateurs/%d" % uid["demo.gestionnaire"], json={"role": "gestionnaire", "departement": "Comptabilité", "drapeaux": {}}); gs = Client("demo.gestionnaire")
verif(any(d["motif"] == "Vérifier un dépôt" for d in gs.get("/api/demandes").get_json()["demandes"]), "responsable de la Comptabilité voit la demande")
verif(gs.post("/api/demandes/%d/decision" % dem["id"], json={"action": "ok", "jours": 7}).status_code == 200, "responsable de la Comptabilité accorde")
ag = Client("demo.agent"); verif(docs(ag)["total"] == 5, "agent voit maintenant les documents de la Comptabilité (5 au total)")
verif(ag.get("/api/documents/%d/fichier" % d_bravo["id"]).status_code == 200, "agent ouvre le dépôt à terme après accord")
verif(dg.post("/api/demandes", json={"portee": "dossier", "valeur": "Dossier du client Bravo", "motif": "Audit", "jours": 3}).status_code == 200, "direction demande un dossier précis")
verif(any(x["valeur"] == "Dossier du client Bravo" for x in asst.get("/api/demandes").get_json()["demandes"]), "assistant (qui accorde) voit la demande")

# ---- 7. partage, retrait, suppression
verif(ag.post("/api/documents/%d/partager" % d_bravo["id"], json={"user": uid["demo.lecteur"], "jours": 3}).status_code == 403, "agent ne peut pas partager")
r = gs.post("/api/documents/%d/partager" % d_bravo["id"], json={"user": uid["demo.lecteur"], "jours": 3, "note": "pour contrôle"}); verif(r.status_code == 200, "responsable partage le dépôt avec le lecteur")
lec = Client("demo.lecteur"); verif(lec.get("/api/documents/%d/fichier" % d_bravo["id"]).status_code == 200, "lecteur ouvre le document partagé")
fiche = gs.get("/api/documents/%d" % d_bravo["id"]).get_json(); verif(fiche["peut_partager"] and len(fiche["partages"]) == 1, "la fiche liste les partages")
verif(gs.delete("/api/documents/%d/partages/%d" % (d_bravo["id"], fiche["partages"][0]["rid"])).status_code == 200 and lec.get("/api/documents/%d/fichier" % d_bravo["id"]).status_code in (403, 404), "partage retiré : accès coupé")
verif(ag.post("/api/documents/supprimer", json={"ids": [d_int["id"]]}).status_code == 403, "agent ne peut pas supprimer")
ad.put("/api/utilisateurs/%d" % uid["demo.informatique"], json={"role": "lecteur", "departement": "Informatique", "drapeaux": {"comptes": True, "archiviste": True}}); it = Client("demo.informatique")
verif(it.post("/api/documents/supprimer", json={"ids": [confs[1]["id"]]}).get_json()["supprimes"] == 0, "informatique (droit de supprimer) ne peut pas supprimer un confidentiel invisible")

# ---- 8. import (plusieurs fichiers, dossier du mois), création, suppression, numérotation
pdf = b"%PDF-1.4 x"
def imp(c, mois, service, noms, **o):
    d = {"mois": mois, "type": "Dossier crédit", "niveau": "Interne", "service": service, "emplacement": ""}; d.update(o)
    d["fichiers"] = [(io.BytesIO(pdf), n) for n in noms]
    return c.c.post("/api/documents/import", data=d, content_type="multipart/form-data", headers=c.h())
verif(imp(ag, "2025-08", "Crédit", ["a.pdf"]).status_code == 403, "agent ne peut pas importer")
verif(imp(it, "2025-08", "", ["a.pdf"]).status_code == 400, "import sans département refusé")
r = imp(it, "2025-08", "Crédit", ["Client A.pdf", "Client B.pdf", "virus.exe", "Dossier/Client C.pdf"]); verif(r.get_json() == {"importes": 3, "ignores": 1, "mois": "2025-08"}, "import de 3 fichiers (le .exe est refusé)")
nav = ad.get("/api/navigation").get_json(); verif({a["annee"] for a in nav["arbre"]} == {str(__import__("datetime").date.today().year), "2025"}, "l'arbre contient l'année 2025")
verif(docs(ad, "?mois=2025&dept=Crédit")["total"] == 3, "filtre année + département")
imp(it, "2026-11", "Crédit", ["N1.pdf", "N2.pdf"]); ids = [d["id"] for d in docs(ad, "?tri=date")["documents"]]
ad.post("/api/documents/supprimer", json={"ids": ids[:2]}); imp(it, "2026-11", "Crédit", ["N3.pdf"])
nums = [d["num"] for d in docs(ad)["documents"]]; verif(len(nums) == len(set(nums)), "numéros uniques après suppression et nouvel import")
r = it.c.post("/api/documents", data={"titre": "Contrat X", "service": "Crédit", "type": "Contrat", "niveau": "Interne", "etat": "À scanner", "date": "2026-11-05"}, content_type="multipart/form-data", headers=it.h())
sans_scan = next(d for d in docs(ad)["documents"] if d["titre"] == "Contrat X")
verif(r.status_code == 200 and sans_scan["a_fichier"] is False, "création sans scan : la liste indique correctement l'absence de fichier")

# ---- 9. tableau de bord, navigation (calculs SQL)
a = ad.get("/api/accueil").get_json(); verif(a["total"] == docs(ad)["total"] and a["aujourdhui"] >= 1, "accueil : totaux calculés en SQL")
verif(ag.get("/api/accueil").get_json()["total"] == docs(ag)["total"], "accueil : l'agent ne compte que ce qu'il voit")

# ---- 10. journal, exports, sauvegardes, fiches d'audit
j = ad.get("/api/journal").get_json(); verif(any(x["a"] == "Échec de connexion" for x in j["lignes"]) and any(x["n"] for x in j["resume"]), "journal : échecs et résumé des connexions")
verif(ad.get("/api/journal?qui=demo.agent").get_json()["total"] > 0 and ad.get("/api/journal?du=2099-01-01").get_json()["total"] == 0, "journal : filtres")
r = ad.get("/api/journal.csv"); verif(r.status_code == 200 and r.data.startswith("\ufeff".encode()) and b"Date;Heure;Personne" in r.data, "journal : export CSV Excel")
verif(len(glob.glob(os.path.join(C.JOURNAUX, "journal_*.csv"))) == 1, "journal : fichier mensuel écrit automatiquement")
n = ad.post("/api/sauvegardes").get_json()["nom"]; z = zipfile.ZipFile(os.path.join(C.SAUV, n)); verif("archives.db" in z.namelist(), "sauvegarde zip créée")
verif(ad.get("/api/sauvegardes/" + n).status_code == 200 and ad.get("/api/sauvegardes/..%2fapi.py").status_code == 404, "téléchargement de sauvegarde (chemin piégé refusé)")
verif(ad.post("/api/audit").get_json()["fichiers"] == 5, "5 fiches d'audit créées")
f = ad.get("/api/donnees").get_json()["fiches"]; verif(len(f) == 5 and ad.get("/api/audit/" + f[0]).status_code == 200, "fiches d'audit listées et téléchargeables")
verif(all(b"pbkdf2" not in open(p, "rb").read() and b"scrypt" not in open(p, "rb").read() for p in glob.glob(os.path.join(C.EXPORTS, "*.csv"))), "aucun mot de passe haché dans les fiches")
verif(ag.get("/api/donnees").status_code == 403 and ag.get("/api/sauvegardes").status_code == 403, "agent : pas d'accès aux données ni aux sauvegardes")
verif(ad.get("/api/acces").status_code == 200 and ag.get("/api/acces").status_code == 403, "page des accès : admin seulement")
ad.post("/api/deconnexion"); verif(ad.get("/api/documents").status_code == 401, "déconnexion")
print("\nTOUS LES TESTS PASSENT : %d vérifications" % ok)
