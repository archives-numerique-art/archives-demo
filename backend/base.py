"""Base de données SQLite, journal et petits outils communs."""
import os, csv, sqlite3, secrets, unicodedata, datetime as dt
from flask import g
import config as C


def sk(s):
    """Texte sans accents ni majuscules : pour comparer et chercher."""
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()


def sure(x):
    """Neutralise les formules Excel (=, +, @, -) dans les exports."""
    x = "" if x is None else str(x)
    return "'" + x if (x[:1] in ("=", "+", "@") or (x[:1] == "-" and len(x) > 1)) else x


MIGRATIONS = (  # pour compléter les anciennes bases (versions 4 à 9)
    "alter table users add column changer integer default 0", "alter table users add column departement text",
    "alter table users add column comptes integer default 0", "alter table users add column accorde integer default 0",
    "alter table users add column archiviste integer default 0", "alter table users add column confid integer default 0",
    "alter table users add column journal integer default 0", "alter table depts add column confidentiel integer default 0",
    "alter table grants add column portee text default 'doc'", "alter table grants add column valeur text",
    "alter table demandes add column portee text default 'doc'", "alter table demandes add column valeur text")

INDEXES = (
    "create index if not exists idx_docs_date on docs(date collate nocase)",
    "create index if not exists idx_docs_service on docs(service)",
    "create index if not exists idx_docs_service_filter on docs(coalesce(nullif(service,''),'~'))",
    "create index if not exists idx_docs_cree on docs(cree collate nocase)",
    "create index if not exists idx_docs_num_upper on docs(upper(num))",
    "create index if not exists idx_grants_user_jusqu on grants(user, jusqu)",
    "create index if not exists idx_grants_doc_jusqu on grants(doc, jusqu)",
    "create index if not exists idx_grants_jusqu on grants(jusqu)",
    "create index if not exists idx_demandes_user_id on demandes(user, id desc)",
    "create index if not exists idx_demandes_statut_user on demandes(statut, user)",
    "create index if not exists idx_demandes_statut_portee_valeur on demandes(statut, portee, lower(valeur))",
    "create index if not exists idx_log_t_id on log(t, id desc)",
    "create index if not exists idx_log_user_t on log(u, t)")

VUES_REGISTRES = {
    "v_acces_en_cours": """
        select users.nom as utilisateur, coalesce(grants.portee,'doc') as portee,
               case when coalesce(grants.portee,'doc')='doc' then docs.num else grants.valeur end as cible,
               grants.jusqu as jusqu_au
        from grants join users on users.id=grants.user
        left join docs on docs.id=grants.doc
        where grants.jusqu>=date('now')
    """,
    "v_demandes": """
        select demandes.id as no, demandes.cree as date_demande, users.nom as demandeur,
               coalesce(demandes.portee,'doc') as portee,
               case when coalesce(demandes.portee,'doc')='doc' then docs.num else demandes.valeur end as cible,
               demandes.jours as duree_jours, demandes.motif as motif, demandes.statut as statut,
               demandes.reponse as reponse
        from demandes join users on users.id=demandes.user
        left join docs on docs.id=demandes.doc
    """,
    "v_journal_audit": """
        select id as no, t as date_heure, u as utilisateur, a as action, d as cible
        from log
    """,
    "v_utilisateurs": """
        select nom, role, departement, comptes as peut_creer_comptes, accorde as peut_accorder,
               archiviste as peut_ajouter_supprimer, confid as voit_confidentiels
        from users
    """,
}


def assurer_vue_documents(c):
    vue = c.execute("select type from sqlite_master where name='v_documents'").fetchone()
    if vue and vue[0] != "view":
        raise RuntimeError("Impossible de créer v_documents : un objet de base de données porte déjà ce nom.")
    if vue:
        colonnes = {r[1] for r in c.execute("pragma table_info(v_documents)")}
        requises = {"id", "num", "titre", "service", "departement", "type", "date", "niveau", "etat", "cree"}
        if not requises.issubset(colonnes):
            c.execute("drop view v_documents")
    c.execute("""
        create view if not exists v_documents as
        select id, num, titre, service, service as departement, type, date, niveau,
               emplacement, etat,
               case when fichier is null or fichier='' then 'non' else 'oui' end as fichier_joint,
               cree
        from docs
    """)


def assurer_vues_registres(c):
    for nom, select in VUES_REGISTRES.items():
        objet = c.execute("select type from sqlite_master where name=?", (nom,)).fetchone()
        if objet and objet[0] != "view":
            raise RuntimeError("Impossible de créer %s : un objet de base de données porte déjà ce nom." % nom)
        c.execute("create view if not exists %s as %s" % (nom, select))


def init_db():
    if not os.path.isfile(C.DB):
        raise FileNotFoundError("Base SQLite introuvable : %s" % C.DB)
    c = sqlite3.connect(C.DB, timeout=15)
    try:
        tables = {r[0] for r in c.execute("select name from sqlite_master where type='table'")}
        required = {"users", "depts", "docs", "grants", "demandes", "log"}
        missing = required - tables
        if missing:
            raise RuntimeError("Base SQLite invalide (%s) : tables manquantes : %s" %
                               (C.DB, ", ".join(sorted(missing))))
        for q in MIGRATIONS:
            try: c.execute(q)
            except sqlite3.OperationalError as e:
                if "duplicate column name" not in str(e).lower(): raise
        assurer_vue_documents(c)
        assurer_vues_registres(c)
        for q in INDEXES: c.execute(q)
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()
    os.makedirs(C.FILES, exist_ok=True)
    if not os.path.exists(C.KEYF): open(C.KEYF, "w").write(secrets.token_hex(32))
    return open(C.KEYF).read().strip()


def connecter():
    c = sqlite3.connect(C.DB, timeout=15); c.row_factory = sqlite3.Row
    c.create_function("sk", 1, sk)
    return c


def db():
    if "db" not in g: g.db = connecter()
    return g.db


def fermer(e=None):
    d = g.pop("db", None)
    if d: d.close()


def ecrire_journal_fichier(t, u, a, d):
    try:
        os.makedirs(C.JOURNAUX, exist_ok=True); f = os.path.join(C.JOURNAUX, "journal_%s.csv" % t[:7]); neuf = not os.path.exists(f)
        with open(f, "a", encoding="utf-8-sig", newline="") as h:
            w = csv.writer(h, delimiter=";")
            if neuf: w.writerow(["Date", "Heure", "Personne", "Action", "Détail"])
            w.writerow([t[:10], t[11:], sure(u), sure(a), sure(d)])
    except Exception: pass


def lg(a, d="", qui=None):
    """Écrit une ligne dans le journal (base + fichier Excel du mois)."""
    u = qui if qui is not None else (g.get("u") or {}).get("nom", "-")
    t = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    db().execute("insert into log(t,u,a,d) values(?,?,?,?)", (t, u, a, d)); db().commit()
    ecrire_journal_fichier(t, u, a, d)


def depts_l():
    return [r["nom"] for r in db().execute("select nom from depts order by nom")]


def lib_mois(m):
    try: return ("Année " + m) if len(m) == 4 else "%s %s" % (C.MOIS_FR[int(m[5:7])].capitalize(), m[:4])
    except Exception: return m
