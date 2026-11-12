"""Remplit la base avec des données FICTIVES pour la démonstration.
À lancer une seule fois, sur une base vide :  py donnees_demo.py"""
import os, sqlite3, uuid, datetime as dt
from werkzeug.security import generate_password_hash
import config as C, base

PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
       b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
       b"4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 20 60 Td (DOCUMENT FICTIF - DEMONSTRATION) Tj ET\nendstream endobj\n"
       b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF")

base.init_db()
c = sqlite3.connect(C.DB)
if c.execute("select count(*) from docs").fetchone()[0]: raise SystemExit("La base contient déjà des documents : abandon.")
for d in ("Crédit", "Comptabilité", "Ressources humaines", "Informatique", "Recouvrement"): c.execute("insert or ignore into depts(nom) values(?)", (d,))
mdp = generate_password_hash("Demo2026!")
comptes = [("demo.admin", "admin", None, ""), ("demo.gestionnaire", "gestionnaire", "Crédit", ""), ("demo.agent", "agent", "Crédit", ""), ("demo.lecteur", "lecteur", "Comptabilité", ""),
           ("demo.direction", "controle", None, ""), ("demo.recouvrement", "agent", "Recouvrement", ""), ("demo.informatique", "lecteur", "Informatique", "comptes"), ("demo.assistant", "agent", None, "accorde")]
for nom, role, dep, drapeau in comptes:
    c.execute("insert or ignore into users(nom,mdp,role,departement,changer) values(?,?,?,?,0)", (nom, mdp, role, dep))
    if drapeau: c.execute("update users set %s=1 where nom=?" % drapeau, (nom,))
exemples = [("Client Fictif Alpha - dossier crédit", "Crédit", "Dossier crédit", "Interne"), ("Client Fictif Bravo - dépôt à terme", "Comptabilité", "Dépôt à terme (DAT)", "Confidentiel"),
            ("Client Fictif Charlie - contrat", "Crédit", "Contrat", "Interne"), ("Rapport mensuel d'activité (exemple)", "Comptabilité", "Rapport", "Public"),
            ("Dossier du personnel fictif - Dupont", "Ressources humaines", "Dossier du personnel", "Confidentiel"), ("Procès-verbal de réunion (exemple)", "Crédit", "Procès-verbal", "Public")]
mois = [dt.date.today().strftime("%Y-%m"), (dt.date.today().replace(day=1) - dt.timedelta(days=1)).strftime("%Y-%m")]
for i, (t, sv, ty, nv) in enumerate(exemples):
    nom = uuid.uuid4().hex + ".pdf"; open(os.path.join(C.FILES, nom), "wb").write(PDF)
    c.execute("insert into docs(num,titre,service,type,date,niveau,emplacement,etat,fichier,cree) values(?,?,?,?,?,?,?,?,?,?)",
              ("ARC-%s-%04d" % (dt.date.today().year, i + 1), t, sv, ty, mois[i % 2] + "-01", nv, "Armoire %d" % (i % 3 + 1), "Scanné", nom, dt.date.today().isoformat()))
c.commit(); c.close()
print("Données de démonstration créées. Comptes : %s - mot de passe : Demo2026!" % ", ".join(x[0] for x in comptes))
