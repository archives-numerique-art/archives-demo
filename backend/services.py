"""Sauvegardes, fiches d'audit (Excel/CSV) et tâches automatiques."""
import os, csv, sqlite3, time, threading, zipfile, datetime as dt
import config as C
from base import sure


# ---------- Sauvegardes ----------
def faire_sauvegarde():
    os.makedirs(C.SAUV, exist_ok=True)
    nom = "archives_sauvegarde_%s.zip" % dt.datetime.now().strftime("%Y-%m-%d_%Hh%M%S")
    chemin = os.path.join(C.SAUV, nom); tmp = chemin + ".tmp"
    src = sqlite3.connect(C.DB); dst = sqlite3.connect(tmp); src.backup(dst); dst.close(); src.close()
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(tmp, "archives.db")
        for r, _, fs in os.walk(C.DATA):
            for f in fs:
                if f.startswith("archives.db"): continue
                p = os.path.join(r, f); z.write(p, os.path.relpath(p, C.DATA))
    os.remove(tmp)
    for x in sorted(x for x in os.listdir(C.SAUV) if x.startswith("archives_sauvegarde_") and x.endswith(".zip"))[:-14]:
        os.remove(os.path.join(C.SAUV, x))                       # on garde les 14 dernières
    return nom


def liste_sauvegardes():
    if not os.path.isdir(C.SAUV): return []
    noms = sorted((x for x in os.listdir(C.SAUV) if x.startswith("archives_sauvegarde_") and x.endswith(".zip")), reverse=True)
    return [{"nom": x, "mo": round(os.path.getsize(os.path.join(C.SAUV, x)) / 1048576, 2)} for x in noms]


# ---------- Fiches d'audit ----------
def _csv(chemin, entetes, lignes):
    with open(chemin, "w", encoding="utf-8-sig", newline="") as h:
        w = csv.writer(h, delimiter=";"); w.writerow(entetes)
        for l in lignes: w.writerow([sure(x) for x in l])


def ecrire_audit():
    os.makedirs(C.EXPORTS, exist_ok=True); j = dt.date.today().isoformat(); c = sqlite3.connect(C.DB); c.row_factory = sqlite3.Row; sortie = []
    oui = lambda v: "Oui" if v else ""

    def f(nom, entetes, sql, fn):
        chemin = os.path.join(C.EXPORTS, "audit_%s_%s.csv" % (j, nom)); _csv(chemin, entetes, [fn(r) for r in c.execute(sql)]); sortie.append(os.path.basename(chemin))

    f("utilisateurs", ["Compte", "Rôle", "Département", "Peut créer des comptes", "Peut accorder les accès", "Peut ajouter et supprimer des documents", "Peut voir les confidentiels", "Peut consulter le journal"],
      "select * from users order by nom", lambda r: [r["nom"], C.ROLES.get(r["role"], r["role"]), r["departement"] or "", oui(r["comptes"]), oui(r["accorde"]), oui(r["archiviste"]), oui(r["confid"]), oui(r["journal"])])
    f("documents", ["Numéro", "Titre", "Département", "Type", "Mois", "Niveau", "Emplacement", "État", "Enregistré le"],
      "select * from docs order by id", lambda r: [r["num"], r["titre"], r["service"], r["type"], r["date"], r["niveau"], r["emplacement"], r["etat"], r["cree"]])
    f("demandes", ["Demandeur", "Ce qui est demandé", "Document", "Jours", "Motif", "Statut", "Date", "Réponse"],
      "select d.*, docs.num as dnum, users.nom as unom from demandes d left join docs on docs.id=d.doc left join users on users.id=d.user order by d.id",
      lambda r: [r["unom"], "%s %s" % (r["portee"] or "doc", r["valeur"] or ""), r["dnum"] or "", r["jours"], r["motif"], r["statut"], r["cree"], r["reponse"]])
    f("acces", ["Personne", "Document", "Portée", "Valeur", "Jusqu'au"],
      "select grants.*, docs.num as dnum, users.nom as unom from grants left join docs on docs.id=grants.doc left join users on users.id=grants.user order by jusqu desc",
      lambda r: [r["unom"], r["dnum"] or "", r["portee"] or "doc", r["valeur"] or "", r["jusqu"]])
    f("journal_complet", ["Date", "Heure", "Personne", "Action", "Détail"], "select * from log order by id", lambda r: [r["t"][:10], r["t"][11:], r["u"], r["a"], r["d"]])
    c.close(); return sortie


def liste_audits():
    import re
    if not os.path.isdir(C.EXPORTS): return []
    return sorted((x for x in os.listdir(C.EXPORTS) if re.fullmatch(r"audit_\d{4}-\d{2}-\d{2}_[a-z_]+\.csv", x)), reverse=True)[:25]


def info_chemin(chemin):
    if not os.path.exists(chemin): return {"chemin": chemin, "existe": False, "fichiers": 0, "mo": 0.0}
    if os.path.isfile(chemin): return {"chemin": chemin, "existe": True, "fichiers": 1, "mo": round(os.path.getsize(chemin) / 1048576, 2)}
    nb, tot = 0, 0
    for r, _, fs in os.walk(chemin):
        for x in fs: nb += 1; tot += os.path.getsize(os.path.join(r, x))
    return {"chemin": chemin, "existe": True, "fichiers": nb, "mo": round(tot / 1048576, 2)}


# ---------- Tâches automatiques (une sauvegarde et une fiche d'audit par jour) ----------
def _boucle():
    time.sleep(30)
    while True:
        try:
            ts = [os.path.getmtime(os.path.join(C.SAUV, x["nom"])) for x in liste_sauvegardes()]
            if time.time() - max(ts, default=0) > 20 * 3600: faire_sauvegarde()
        except Exception as e: print("Sauvegarde automatique impossible :", e)
        try:
            if not os.path.exists(os.path.join(C.EXPORTS, "audit_%s_utilisateurs.csv" % dt.date.today().isoformat())): ecrire_audit()
        except Exception as e: print("Fiches d'audit impossibles :", e)
        time.sleep(3600)


def demarrer_taches():
    threading.Thread(target=_boucle, daemon=True).start()
