"""API JSON d'IMF Archive (backend, port 5001). Le frontend (port 5000) l'appelle avec fetch.
Toutes les règles de sécurité et de calcul sont ici ; le navigateur ne fait qu'afficher."""
import os, re, io, csv, uuid, secrets, sqlite3, datetime as dt
from functools import wraps
from urllib.parse import urlparse
from flask import Flask, request, session, jsonify, send_from_directory, Response, g
from werkzeug.security import generate_password_hash, check_password_hash
import config as C, base, services
from base import db, lg, sk, sure, depts_l, lib_mois
from regles import Droits

app = Flask(__name__)
app.secret_key = base.init_db()
app.config.update(MAX_CONTENT_LENGTH=3 * 1024 ** 3, SESSION_COOKIE_NAME="imf_archive_session", SESSION_COOKIE_HTTPONLY=True,
                  SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=C.HTTPS, PERMANENT_SESSION_LIFETIME=dt.timedelta(hours=8))
app.teardown_appcontext(base.fermer)
FAILS = {}
V = "visible(id,niveau,type,service)"          # fonction SQL : le document est-il visible pour la personne connectée ?
today = lambda: dt.date.today().isoformat()


# ---------------------------------------------------------------- sécurité : CORS, CSRF, session
def erreur(code, msg, **extra):
    r = jsonify(dict(erreur=msg, **extra)); r.status_code = code; return r


def origine_ok(o):
    """Le frontend est sur la même machine (même nom d'hôte) mais sur son port."""
    if not o: return False
    if o in C.ORIGINES_SUPPLEMENTAIRES: return True
    try: p = urlparse(o)
    except Exception: return False
    hote = request.host.rsplit(":", 1)[0].strip("[]") if ":" in request.host else request.host
    return p.hostname == hote and p.port == C.PORT_FRONTEND


@app.before_request
def avant():
    if request.method == "OPTIONS": return ("", 204)
    g.u = None; g.droits = None
    if session.get("uid"):
        r = db().execute("select * from users where id=?", (session["uid"],)).fetchone()
        if r: g.u = dict(r)
        else: session.clear()
    if request.method not in ("GET", "HEAD"):
        o = request.headers.get("Origin")
        if o and not origine_ok(o): return erreur(403, "Origine non autorisée.")
        if g.u and request.endpoint not in ("connexion", "setup") and request.headers.get("X-CSRF-Token") != session.get("_t"):
            return erreur(400, "Jeton de sécurité invalide : rechargez la page.")


@app.after_request
def apres(r):
    o = request.headers.get("Origin")
    if o and origine_ok(o):
        r.headers.update({"Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true", "Vary": "Origin",
                          "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"})
    r.headers["X-Content-Type-Options"] = "nosniff"; r.headers["Cache-Control"] = "no-store"
    if C.HTTPS: r.headers["Strict-Transport-Security"] = "max-age=31536000"
    return r


def requis(droit=None, changer_ok=False):
    def deco(f):
        @wraps(f)
        def w(*a, **k):
            if not g.u: return erreur(401, "Connexion requise.")
            if g.u.get("changer") and not changer_ok: return erreur(403, "Vous devez d'abord changer votre mot de passe.", changer_mdp=True)
            g.droits = Droits(db(), g.u)
            if droit and not getattr(g.droits, droit): return erreur(403, "Action non autorisée pour votre compte.")
            return f(*a, **k)
        return w
    return deco


def corps(): return request.get_json(silent=True) or {}
def nb(x, defaut, mini, maxi):
    try: return max(mini, min(maxi, int(x)))
    except (TypeError, ValueError): return defaut


@app.errorhandler(404)
def e404(e): return erreur(404, "Introuvable.")
@app.errorhandler(405)
def e405(e): return erreur(405, "Méthode non autorisée.")
@app.errorhandler(413)
def e413(e): return erreur(413, "Fichiers trop volumineux.")
@app.errorhandler(500)
def e500(e): return erreur(500, "Erreur interne du serveur.")


# ---------------------------------------------------------------- connexion
def moi_json():
    u = g.u; d = g.droits or Droits(db(), u)
    return {"id": u["id"], "nom": u["nom"], "role": u["role"], "role_libelle": C.ROLES.get(u["role"], u["role"]), "departement": u.get("departement") or "",
            "changer_mdp": bool(u.get("changer")), "droits": d.resume(), "nb_attente": 0 if u.get("changer") else d.nb_attente(),
            "drapeaux": {k: bool(u.get(k)) for k in ("comptes", "accorde", "archiviste", "confid", "journal")}, "csrf": session.get("_t")}


@app.get("/api/etat")
def etat():
    out = {"version": C.VERSION, "setup_requis": db().execute("select count(*) from users").fetchone()[0] == 0, "connecte": bool(g.u)}
    if g.u: out["moi"] = moi_json()
    return jsonify(out)


def ouvrir_session(u):
    session.clear(); session.permanent = True; session["uid"] = u["id"]; session["_t"] = secrets.token_hex(16); g.u = dict(u)


@app.post("/api/setup")
def setup():
    if db().execute("select count(*) from users").fetchone()[0]: return erreur(400, "L'application est déjà configurée.")
    d = corps(); n, p = (d.get("nom") or "").strip(), d.get("mdp") or ""
    if not n or len(p) < 8: return erreur(400, "Nom obligatoire et mot de passe de 8 caractères minimum.")
    db().execute("insert into users(nom,mdp,role) values(?,?,'admin')", (n, generate_password_hash(p))); db().commit()
    ouvrir_session(db().execute("select * from users where nom=?", (n,)).fetchone()); lg("Création du super administrateur")
    return jsonify({"moi": moi_json()})


@app.post("/api/connexion")
def connexion():
    ip = request.remote_addr; f = FAILS.get(ip, (0, dt.datetime.min)); d = corps(); n = (d.get("nom") or "").strip()
    if f[0] >= 5 and (dt.datetime.now() - f[1]).total_seconds() < 300:
        lg("Connexion bloquée", "trop d'essais depuis %s" % ip, qui="-"); return erreur(429, "Trop d'essais. Réessayez dans 5 minutes.")
    u = db().execute("select * from users where nom=?", (n,)).fetchone()
    if u and check_password_hash(u["mdp"], d.get("mdp") or ""):
        FAILS.pop(ip, None); ouvrir_session(u); lg("Connexion", "depuis %s" % ip); return jsonify({"moi": moi_json()})
    FAILS[ip] = (f[0] + 1, dt.datetime.now()); lg("Échec de connexion", "nom essayé : %s, depuis %s" % (n[:60], ip), qui="-")
    return erreur(401, "Nom ou mot de passe incorrect.")


@app.post("/api/deconnexion")
def deconnexion():
    if g.u: lg("Déconnexion")
    session.clear(); return jsonify({"ok": True})


@app.post("/api/mot-de-passe")
@requis(changer_ok=True)
def changer_mdp():
    d = corps(); nv = d.get("nouveau") or ""
    if not check_password_hash(g.u["mdp"], d.get("ancien") or ""): return erreur(400, "Le mot de passe actuel est incorrect.")
    if len(nv) < 8 or nv != d.get("confirme"): return erreur(400, "Le nouveau mot de passe doit avoir 8 caractères minimum et être identique dans les deux cases.")
    db().execute("update users set mdp=?, changer=0 where id=?", (generate_password_hash(nv), g.u["id"])); db().commit(); g.u["changer"] = 0; lg("Mot de passe changé")
    return jsonify({"moi": moi_json()})


@app.get("/api/meta")
@requis(changer_ok=True)
def meta():
    return jsonify({"types": C.TYPES, "niveaux": C.NIV, "etats": C.ETATS, "roles": C.ROLES, "roles_limites": list(C.LIMITED), "actions_journal": C.ACTIONS_JOURNAL, "version": C.VERSION})


# ---------------------------------------------------------------- navigation et tableau de bord (calculs en SQL)
@app.get("/api/navigation")
@requis()
def navigation():
    c = db(); par = {}
    for r in c.execute("select substr(date,1,7) m, coalesce(nullif(service,''),'~') d, count(*) n from docs where %s group by m, d" % V): par.setdefault(r["m"], {})[r["d"]] = r["n"]
    annees = {}
    for m in sorted(par, reverse=True): annees.setdefault(m[:4], []).append(m)
    nom = lambda d: "(sans département)" if d == "~" else d
    arbre = [{"annee": y, "total": sum(sum(par[m].values()) for m in ms), "mois": [
        {"mois": m, "libelle": lib_mois(m), "total": sum(par[m].values()), "departements": [{"nom": nom(d), "valeur": d, "total": n} for d, n in sorted(par[m].items(), key=lambda x: sk(x[0]))]} for m in ms]}
        for y, ms in sorted(annees.items(), reverse=True)]
    depts = sorted(({"nom": nom(r["d"]), "valeur": r["d"], "total": r["n"]} for r in c.execute("select coalesce(nullif(service,''),'~') d, count(*) n from docs where %s group by d" % V)), key=lambda x: sk(x["nom"]))
    n = {r["niveau"]: r["n"] for r in c.execute("select niveau, count(*) n from docs where %s group by niveau" % V)}
    return jsonify({"arbre": arbre, "departements": depts, "niveaux": [{"niveau": k, "total": n.get(k, 0)} for k in C.NIV if k != "Confidentiel"],
                    "derniers": [dict(r) for r in c.execute("select id, num, titre from docs where %s order by id desc limit 8" % V)]})


@app.get("/api/accueil")
@requis()
def accueil():
    c, d = db(), g.droits; auj = today(); un = lambda sql, *p: c.execute(sql, p).fetchone()[0]
    dernier = c.execute("select id,num,titre,cree from docs where %s order by id desc limit 1" % V).fetchone(); att = d.nb_attente()
    return jsonify({"total": un("select count(*) from docs where %s" % V), "ce_mois": un("select count(*) from docs where %s and cree like ?" % V, auj[:7] + "%"),
                    "aujourdhui": un("select count(*) from docs where %s and cree=?" % V, auj), "departements": un("select count(distinct service) from docs where %s and coalesce(service,'')<>''" % V),
                    "mois_libelle": lib_mois(auj[:7]), "dernier": dict(dernier) if dernier else None,
                    "partages": [dict(r) for r in c.execute("select id,num,titre,service from docs where %s and confidentiel(niveau,type,service) and not privilegie(service) order by id desc" % V)],
                    "demandes": att or un("select count(*) from demandes where user=? and statut='attente'", g.u["id"]), "demandes_libelle": "Demandes à traiter" if att else "Mes demandes en attente"})


# ---------------------------------------------------------------- documents
def doc_ligne(i): return db().execute("select * from docs where id=?", (i,)).fetchone()
def voit(r): return bool(r) and g.droits.peut_voir(r["id"], r["niveau"], r["type"], r["service"])
def ouvre(r): return g.droits.peut_ouvrir(r["id"], r["niveau"], r["type"], r["service"])


@app.get("/api/documents")
@requis()
def documents():
    a = request.args; w = [V]; p = []
    if a.get("mois"): w.append("date like ?"); p.append(re.sub(r"[^0-9-]", "", a["mois"])[:7] + "%")
    if a.get("dept"): w.append("coalesce(nullif(service,''),'~') = ?"); p.append(a["dept"])
    if a.get("niveau"): w.append("niveau = ?"); p.append(a["niveau"])
    if a.get("type"): w.append("type = ?"); p.append(a["type"])
    q = sk(a.get("q", "").strip())
    if q: w.append("sk(coalesce(num,'')||' '||coalesce(titre,'')||' '||coalesce(service,'')||' '||coalesce(type,'')) like ?"); p.append("%" + q + "%")
    cond = " and ".join(w); ordre = "date desc, id desc" if a.get("tri") == "date" else "sk(titre), id"
    rows = db().execute("select id,num,titre,service,type,date,niveau,etat,cree, ouvrable(id,niveau,type,service) acces from docs where " + cond + " order by " + ordre + " limit 2000", p).fetchall()
    total = db().execute("select count(*) from docs where " + cond, p).fetchone()[0]
    return jsonify({"documents": [dict(r) for r in rows], "total": total})


@app.get("/api/documents/<int:i>")
@requis()
def document(i):
    r = doc_ligne(i)
    if not voit(r): return erreur(404, "Document introuvable.")
    d = g.droits; ok = ouvre(r); lg("Consultation" if ok else "Accès refusé", r["num"]); part = ok and d.est_conf(r["niveau"], r["type"], r["service"]) and d.peut_partager(r["service"])
    out = {k: r[k] for k in ("id", "num", "titre", "service", "type", "date", "niveau", "etat", "cree")}
    out.update(acces=ok, a_fichier=bool(r["fichier"]), emplacement=r["emplacement"] if ok else None, peut_supprimer=d.importer, peut_partager=part)
    if part:
        out["partages"] = [dict(x) for x in db().execute("select grants.rowid as rid, users.nom, jusqu from grants join users on users.id=grants.user where doc=? and jusqu>=?", (i, today()))]
        out["utilisateurs"] = [dict(x) for x in db().execute("select id, nom, departement from users where role!='admin' and id!=? order by nom", (g.u["id"],))]
    return jsonify(out)


@app.get("/api/documents/<int:i>/fichier")
@requis()
def fichier(i):
    r = doc_ligne(i)
    if not voit(r): return erreur(404, "Document introuvable.")
    if not ouvre(r) or not r["fichier"]: lg("Accès refusé", r["num"]); return erreur(403, "Vous n'avez pas accès à ce fichier.")
    lg("Ouverture du fichier", r["num"]); rep = send_from_directory(C.FILES, r["fichier"]); rep.headers["Content-Disposition"] = "inline"; return rep


def enregistrer_fichier(f):
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in C.EXT: return None
    nom = uuid.uuid4().hex + ext; f.save(os.path.join(C.FILES, nom)); return nom


def inserer_doc(titre, service, type_, mois_date, niveau, empl, etat, fichier):
    n = db().execute("select coalesce(max(id),0) from docs").fetchone()[0] + 1
    cur = db().execute("insert into docs(num,titre,service,type,date,niveau,emplacement,etat,fichier,cree) values(?,?,?,?,?,?,?,?,?,?)",
                       ("ARC-%s-%04d" % (dt.date.today().year, n), titre, service, type_, mois_date, niveau, empl, etat, fichier, today()))
    db().commit(); return cur.lastrowid, "ARC-%s-%04d" % (dt.date.today().year, n)


@app.post("/api/documents")
@requis("importer")
def creer_document():
    F = request.form; titre = F.get("titre", "").strip(); service = F.get("service", "").strip(); date = F.get("date") or today()
    if not titre or service not in depts_l() or F.get("type") not in C.TYPES or F.get("niveau") not in C.NIV or F.get("etat", "Scanné") not in C.ETATS or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return erreur(400, "Titre, département, type, niveau et date valides sont obligatoires.")
    nom = None; f = request.files.get("fichier")
    if f and f.filename:
        nom = enregistrer_fichier(f)
        if not nom: return erreur(400, "Type de fichier non accepté (PDF, JPG ou PNG).")
    i, num = inserer_doc(titre[:200], service, F["type"], date, F["niveau"], F.get("emplacement", "").strip()[:80], "Scanné" if nom else F.get("etat", "À scanner"), nom)
    lg("Nouveau document", num); return jsonify({"id": i, "num": num})


@app.post("/api/documents/import")
@requis("importer")
def importer():
    F = request.form; fs = [f for f in request.files.getlist("fichiers") if f and f.filename]; mois = F.get("mois") or today()[:7]
    if not fs: return erreur(400, "Choisissez au moins un fichier.")
    if F.get("type") not in C.TYPES or F.get("niveau") not in C.NIV or not re.fullmatch(r"\d{4}-\d{2}", mois): return erreur(400, "Type, niveau et mois valides sont obligatoires.")
    if F.get("service", "").strip() not in depts_l(): return erreur(400, "Choisissez le département : les documents iront directement dans ce département.")
    ok = skip = 0
    for f in fs:
        nom = enregistrer_fichier(f)
        if not nom: skip += 1; continue
        inserer_doc(os.path.splitext(os.path.basename(f.filename))[0].strip()[:200], F["service"].strip(), F["type"], mois + "-01", F["niveau"], F.get("emplacement", "").strip()[:80], "Scanné", nom); ok += 1
    lg("Import de %d fichier(s) - %s - %s" % (ok, F["type"], mois)); return jsonify({"importes": ok, "ignores": skip, "mois": mois})


@app.post("/api/documents/supprimer")
@requis("importer")
def supprimer():
    n = 0
    for i in [int(x) for x in corps().get("ids", []) if str(x).isdigit()]:
        r = doc_ligne(i)
        if not r or not voit(r): continue
        if r["fichier"]:
            try: os.remove(os.path.join(C.FILES, r["fichier"]))
            except OSError: pass
        db().execute("delete from grants where doc=?", (i,)); db().execute("delete from docs where id=?", (i,)); lg("Suppression", "%s - %s" % (r["num"], r["titre"])); n += 1
    db().commit(); return jsonify({"supprimes": n})


@app.post("/api/documents/<int:i>/partager")
@requis()
def partager(i):
    r = doc_ligne(i)
    if not voit(r): return erreur(404, "Document introuvable.")
    if not (ouvre(r) and g.droits.peut_partager(r["service"])): return erreur(403, "Vous ne pouvez pas partager ce document.")
    c = corps(); dest = db().execute("select * from users where id=? and role!='admin'", (nb(c.get("user"), 0, 0, 10 ** 9),)).fetchone()
    if not dest: return erreur(404, "Personne introuvable.")
    j = (dt.date.today() + dt.timedelta(days=nb(c.get("jours"), 7, 1, 30))).isoformat(); note = (c.get("note") or "").strip()[:200]
    db().execute("insert into grants(doc,user,jusqu,portee) values(?,?,?,?)", (i, dest["id"], j, "doc")); db().commit()
    lg("Document partagé avec %s jusqu'au %s" % (dest["nom"], j), r["num"] + (" - " + note if note else "")); return jsonify({"ok": True, "jusqu": j})


@app.delete("/api/documents/<int:i>/partages/<int:rid>")
@requis()
def retirer_partage(i, rid):
    r = doc_ligne(i)
    if not voit(r): return erreur(404, "Document introuvable.")
    if not (ouvre(r) and g.droits.peut_partager(r["service"])): return erreur(403, "Vous ne pouvez pas retirer ce partage.")
    db().execute("delete from grants where rowid=? and doc=?", (rid, i)); db().commit(); lg("Partage retiré", r["num"]); return jsonify({"ok": True})


# ---------------------------------------------------------------- demandes d'accès
@app.get("/api/demandes")
@requis()
def demandes():
    u, d = g.u, g.droits; resp = u["role"] == "gestionnaire" and bool(u.get("departement"))
    sel = "select d.*, docs.num as doc_num, docs.titre as doc_titre, docs.service as doc_service, users.nom as demandeur from demandes d left join docs on docs.id=d.doc join users on users.id=d.user "
    fin = "order by (d.statut='attente') desc, d.id desc limit 200"; conds = ["d.user=%d" % u["id"]]; a = []
    if resp: conds += ["(d.portee='dept' and lower(d.valeur)=lower(?))", "(d.portee='doc' and lower(docs.service)=lower(?))"]; a += [u["departement"], u["departement"]]
    if d.f("confid"): conds.append("d.portee='dossier'")
    q = sel + ("" if d.accorder else "where (" + " or ".join(conds) + ") ") + fin
    rows = []
    for r in db().execute(q, a):
        x = dict(r); x["peut"] = d.peut_decider(x, x["doc_service"]); rows.append(x)
    return jsonify({"demandes": rows, "peut_traiter": d.accorder or resp or d.f("confid"), "peut_demander": not d.admin})


@app.post("/api/demandes")
@requis()
def nouvelle_demande():
    if g.droits.admin: return erreur(400, "Vous avez déjà accès à tous les documents.")
    c = corps(); p = c.get("portee"); v = (c.get("valeur") or "").strip()[:200]; m = (c.get("motif") or "").strip()[:500]; j = nb(c.get("jours"), 7, 1, 90)
    cdl = [n for n in depts_l() if sk(n) in g.droits.dc]
    if p not in ("dept", "dossier") or not v or not m or (p == "dept" and v not in cdl): return erreur(400, "Choisissez ce que vous demandez et indiquez le motif.")
    db().execute("insert into demandes(doc,user,jours,motif,statut,cree,portee,valeur) values(0,?,?,?,'attente',?,?,?)", (g.u["id"], j, m, today(), p, v)); db().commit()
    lg("Demande d'accès (%d j) - %s" % (j, p), v); return jsonify({"ok": True})


@app.post("/api/demandes/<int:i>/decision")
@requis()
def decision(i):
    r = db().execute("select * from demandes where id=? and statut='attente'", (i,)).fetchone()
    if not r: return erreur(404, "Demande introuvable ou déjà traitée.")
    r = dict(r); p = r["portee"] or "doc"; d0 = doc_ligne(r["doc"]) if r["doc"] else None
    if not g.droits.peut_decider(r, d0["service"] if d0 else None): return erreur(403, "Vous ne pouvez pas traiter cette demande.")
    c = corps(); note = (c.get("note") or "").strip()[:300]; cible = "%s : %s" % (p, r["valeur"])
    if c.get("action") == "ok":
        d2 = None
        if p == "dossier":
            d2 = db().execute("select * from docs where upper(num)=upper(?)", ((c.get("num") or "").strip(),)).fetchone()
            if not d2 or not ouvre(d2): return erreur(400, "Indiquez le numéro d'un document que vous pouvez consulter (ex. ARC-2026-0001).")
            cible = d2["num"]
        j = nb(c.get("jours"), r["jours"], 1, 90); jusqu = (dt.date.today() + dt.timedelta(days=j)).isoformat()
        db().execute("insert into grants(doc,user,jusqu,portee,valeur) values(?,?,?,?,?)", (d2["id"], r["user"], jusqu, "doc", None) if p == "dossier" else (r["doc"] if p == "doc" else 0, r["user"], jusqu, p, r["valeur"]))
        db().execute("update demandes set statut=?, reponse=? where id=?", ("accordée jusqu'au " + jusqu, note, i)); lg("Demande accordée (%d j)" % j, cible)
    else:
        db().execute("update demandes set statut='refusée', reponse=? where id=?", (note, i)); lg("Demande refusée", cible)
    db().commit(); return jsonify({"ok": True})


# ---------------------------------------------------------------- départements, utilisateurs, accès
@app.get("/api/departements")
@requis()
def departements():
    d = g.droits; tous = [{"nom": r["nom"], "confidentiel": bool(r["c"])} for r in db().execute("select nom, coalesce(confidentiel,0) c from depts order by nom")]
    voit = d.admin or d.gerer_comptes or d.importer
    return jsonify({"tous": [x["nom"] for x in tous] if voit else [], "details": tous if d.admin else [], "confidentiels": [x["nom"] for x in tous if x["confidentiel"]]})


@app.post("/api/departements")
@requis("admin")
def ajouter_departement():
    n = (corps().get("nom") or "").strip()[:80]
    if not n: return erreur(400, "Nom obligatoire.")
    try: db().execute("insert into depts(nom) values(?)", (n,)); db().commit(); lg("Département ajouté", n)
    except sqlite3.IntegrityError: return erreur(400, "Ce département existe déjà.")
    return jsonify({"ok": True})


@app.put("/api/departements/confidentiels")
@requis("admin")
def departements_confidentiels():
    coches = set(corps().get("noms") or [])
    for n in depts_l(): db().execute("update depts set confidentiel=? where nom=?", (1 if n in coches else 0, n))
    db().commit(); lg("Départements confidentiels", ", ".join(sorted(coches)) or "aucun"); return jsonify({"ok": True})


FLAGS = ("comptes", "accorde", "archiviste", "confid", "journal")
def user_json(x): return {"id": x["id"], "nom": x["nom"], "role": x["role"], "role_libelle": C.ROLES.get(x["role"], x["role"]), "departement": x["departement"] or "", "modifiable": x["role"] != "admin", "drapeaux": {k: bool(x[k]) for k in FLAGS}}
def protege(x): return x["role"] not in C.LIMITED or any(x[k] for k in FLAGS)     # compte que l'informatique ne peut pas toucher


@app.get("/api/utilisateurs")
@requis("gerer_comptes")
def utilisateurs():
    adm = g.droits.admin
    rows = db().execute("select * from users order by nom").fetchall() if adm else [x for x in db().execute("select * from users order by nom") if not protege(x)]
    return jsonify({"utilisateurs": [user_json(x) for x in rows], "roles": {k: v for k, v in C.ROLES.items() if k != "admin" and (adm or k in C.LIMITED)}})


@app.post("/api/utilisateurs")
@requis("gerer_comptes")
def creer_utilisateur():
    F = corps(); adm = g.droits.admin; dep = F.get("departement") or ""; nom = (F.get("nom") or "").strip(); role = F.get("role")
    if role not in C.ROLES or role == "admin" or (not adm and role not in C.LIMITED) or not nom or len(F.get("mdp") or "") < 8 or (dep and dep not in depts_l()):
        return erreur(400, "Nom obligatoire, rôle et département valides, mot de passe de 8 caractères minimum.")
    try: db().execute("insert into users(nom,mdp,role,departement) values(?,?,?,?)", (nom, generate_password_hash(F["mdp"]), role, dep)); db().commit(); lg("Compte créé", nom)
    except sqlite3.IntegrityError: return erreur(400, "Ce nom existe déjà.")
    return jsonify({"ok": True})


def cible_utilisateur(i):
    x = db().execute("select * from users where id=? and role!='admin'", (i,)).fetchone()
    if not x: return None, erreur(404, "Compte introuvable.")
    if not g.droits.admin and protege(x): return None, erreur(403, "Seul le super administrateur peut modifier ce compte.")
    return x, None


@app.put("/api/utilisateurs/<int:i>")
@requis("gerer_comptes")
def modifier_utilisateur(i):
    x, e = cible_utilisateur(i)
    if e: return e
    F = corps(); adm = g.droits.admin; role = F.get("role"); dep = F.get("departement") or ""
    if role not in C.ROLES or role == "admin" or (not adm and role not in C.LIMITED) or (dep and dep not in depts_l()): return erreur(400, "Rôle ou département invalide.")
    fl = {k: (1 if (F.get("drapeaux") or {}).get(k) else 0) if adm else (x[k] or 0) for k in FLAGS}
    db().execute("update users set role=?, departement=?, comptes=?, accorde=?, archiviste=?, confid=?, journal=? where id=?", (role, dep, fl["comptes"], fl["accorde"], fl["archiviste"], fl["confid"], fl["journal"], i)); db().commit()
    lg("Profil modifié : %s / %s" % (C.ROLES[role], dep or "-"), x["nom"]); return jsonify({"ok": True})


@app.post("/api/utilisateurs/<int:i>/mot-de-passe")
@requis("gerer_comptes")
def reinitialiser_mdp(i):
    x, e = cible_utilisateur(i)
    if e: return e
    p = corps().get("mdp") or ""
    if len(p) < 8: return erreur(400, "8 caractères minimum.")
    db().execute("update users set mdp=?, changer=1 where id=?", (generate_password_hash(p), i)); db().commit(); lg("Mot de passe réinitialisé", x["nom"]); return jsonify({"ok": True})


@app.get("/api/acces")
@requis("admin")
def acces():
    rows = db().execute("select grants.rowid as id, grants.portee, grants.valeur, grants.jusqu, users.nom, docs.num from grants join users on users.id=grants.user left join docs on docs.id=grants.doc where jusqu>=? order by jusqu", (today(),))
    return jsonify({"acces": [dict(r) for r in rows]})


@app.delete("/api/acces/<int:i>")
@requis("admin")
def retirer_acces(i):
    db().execute("delete from grants where rowid=?", (i,)); db().commit(); lg("Accès retiré"); return jsonify({"ok": True})


# ---------------------------------------------------------------- journal
def filtre_journal(dates_seules=False):
    a = request.args; d1, d2, qu, ac, tx = (a.get(k, "").strip() for k in ("du", "au", "qui", "action", "texte")); w, p = [], []
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d1): w.append("t >= ?"); p.append(d1 + " 00:00")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d2): w.append("t <= ?"); p.append(d2 + " 23:59")
    if not dates_seules:
        if qu: w.append("u = ?"); p.append(qu)
        if ac: w.append("a like ?"); p.append(ac + "%")
        if tx: w.append("(a like ? or d like ? or u like ?)"); p += ["%" + tx + "%"] * 3
    return ("select * from log" + (" where " + " and ".join(w) if w else "")), p


@app.get("/api/journal")
@requis("voir_journal")
def journal():
    q, p = filtre_journal(); qd, pd_ = filtre_journal(True); c = db()
    total = c.execute("select count(*) from (" + q + ")", p).fetchone()[0]; lignes = c.execute(q + " order by id desc limit 1000", p).fetchall()
    resume = c.execute("select u, sum(a='Connexion') n, sum(a='Échec de connexion') e, max(case when a='Connexion' then t end) der from (" + qd + ") group by u having n>0 or e>0 order by der desc", pd_).fetchall()
    actifs = [r[0] for r in c.execute("select distinct u from log where t >= ? and u != '-' order by u", ((dt.datetime.now() - dt.timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M"),))]
    return jsonify({"lignes": [dict(r) for r in lignes], "total": total, "resume": [dict(r) for r in resume], "actifs": actifs,
                    "personnes": [r[0] for r in c.execute("select distinct u from log order by u")], "actions": C.ACTIONS_JOURNAL})


@app.get("/api/journal.csv")
@requis("voir_journal")
def journal_csv():
    q, p = filtre_journal(); rows = db().execute(q + " order by id desc", p).fetchall(); buf = io.StringIO(); w = csv.writer(buf, delimiter=";")
    w.writerow(["Date", "Heure", "Personne", "Action", "Détail"])
    for r in rows: w.writerow([r["t"][:10], r["t"][11:], sure(r["u"]), sure(r["a"]), sure(r["d"])])
    lg("Journal exporté", "%d lignes" % len(rows))
    return Response("\ufeff" + buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=journal_%s.csv" % today()})


# ---------------------------------------------------------------- sauvegardes, données, fiches d'audit
@app.get("/api/sauvegardes")
@requis("admin")
def sauvegardes(): return jsonify({"dossier": C.SAUV, "sauvegardes": services.liste_sauvegardes()})


@app.post("/api/sauvegardes")
@requis("admin")
def creer_sauvegarde():
    nom = services.faire_sauvegarde(); lg("Sauvegarde manuelle", nom); return jsonify({"nom": nom})


@app.get("/api/sauvegardes/<nom>")
@requis("admin")
def telecharger_sauvegarde(nom):
    if not re.fullmatch(r"archives_sauvegarde_[0-9_h-]+\.zip", nom) or not os.path.exists(os.path.join(C.SAUV, nom)): return erreur(404, "Introuvable.")
    lg("Téléchargement d'une sauvegarde", nom); return send_from_directory(C.SAUV, nom, as_attachment=True)


@app.get("/api/donnees")
@requis("admin")
def donnees():
    I = services.info_chemin
    return jsonify({"rubriques": [
        {"titre": "Base de données", "chemin": I(C.DB), "texte": "Comptes, documents, demandes, accès et journal. Fichier SQLite : à ouvrir avec DBeaver (connexion SQLite)."},
        {"titre": "Documents scannés", "chemin": I(C.FILES), "texte": "Les fichiers PDF, JPG, PNG importés, sous des noms internes."},
        {"titre": "Journaux", "chemin": I(C.JOURNAUX), "texte": "Un fichier Excel (CSV) par mois, écrit à chaque action."},
        {"titre": "Fiches d'audit", "chemin": I(C.EXPORTS), "texte": "Utilisateurs, documents, demandes, accès et journal complet en Excel (CSV), une fois par jour."},
        {"titre": "Sauvegardes", "chemin": I(C.SAUV), "texte": "Copies zip de la base et des documents."}], "fiches": services.liste_audits()})


@app.post("/api/audit")
@requis("admin")
def creer_audit():
    n = len(services.ecrire_audit()); lg("Fiches d'audit générées", "%d fichiers" % n); return jsonify({"fichiers": n})


@app.get("/api/audit/<nom>")
@requis("admin")
def telecharger_audit(nom):
    if not re.fullmatch(r"audit_\d{4}-\d{2}-\d{2}_[a-z_]+\.csv", nom) or not os.path.exists(os.path.join(C.EXPORTS, nom)): return erreur(404, "Introuvable.")
    lg("Fiche d'audit téléchargée", nom); return send_from_directory(C.EXPORTS, nom, as_attachment=True)
