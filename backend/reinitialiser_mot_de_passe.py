"""Réinitialise le mot de passe d'un compte (par exemple celui du super administrateur)."""
import sqlite3, getpass
from werkzeug.security import generate_password_hash
import config as C

c = sqlite3.connect(C.DB)
print("Comptes :", ", ".join(r[0] for r in c.execute("select nom from users order by nom")))
nom = input("Nom du compte : ").strip()
if not c.execute("select 1 from users where nom=?", (nom,)).fetchone(): raise SystemExit("Compte introuvable.")
p = getpass.getpass("Nouveau mot de passe (8 caractères minimum) : ")
if len(p) < 8: raise SystemExit("Mot de passe trop court.")
c.execute("update users set mdp=?, changer=1 where nom=?", (generate_password_hash(p), nom)); c.commit()
print("Mot de passe changé. La personne devra le modifier à sa prochaine connexion.")
