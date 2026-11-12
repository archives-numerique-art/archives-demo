"""Règles métier : qui voit quoi, qui peut ouvrir, partager, décider.
Elles vivent côté backend : le frontend ne fait qu'afficher le résultat."""
import datetime as dt
from base import sk


class Droits:
    def __init__(self, conn, u):
        self.conn, self.u = conn, u
        self.admin = u["role"] == "admin"
        aujourdhui = dt.date.today().isoformat()
        self.grants = [dict(r) for r in conn.execute("select rowid as rid, doc, user, jusqu, portee, valeur from grants where user=? and jusqu>=?", (u["id"], aujourdhui))]
        self.dc = {sk(r["nom"]) for r in conn.execute("select nom from depts where coalesce(confidentiel,0)=1")}
        # fonctions utilisables directement dans les requêtes SQL (le calcul reste côté base)
        conn.create_function("visible", 4, lambda i, n, t, s: int(self.peut_voir(i, n, t, s)))
        conn.create_function("ouvrable", 4, lambda i, n, t, s: int(self.peut_ouvrir(i, n, t, s)))
        conn.create_function("confidentiel", 3, lambda n, t, s: int(self.est_conf(n, t, s)))
        conn.create_function("privilegie", 1, lambda s: int(self.peut_partager(s)))

    def f(self, nom): return bool(self.u.get(nom))
    @property
    def importer(self): return self.admin or self.f("archiviste")          # ajouter, importer, supprimer
    @property
    def gerer_comptes(self): return self.admin or self.f("comptes")
    @property
    def voir_journal(self): return self.admin or self.f("journal")
    @property
    def accorder(self): return self.admin or self.f("accorde")
    @property
    def voir_confidentiel(self): return self.admin or self.f("confid")

    def est_conf(self, niveau, type_, service):
        return niveau == "Confidentiel" or type_ == "Dossier du personnel" or sk(service) in self.dc

    def peut_ouvrir(self, id_, niveau, type_, service):
        if not self.est_conf(niveau, type_, service) or self.voir_confidentiel: return True
        u = self.u
        if u["role"] == "gestionnaire" and u.get("departement") and sk(u["departement"]) == sk(service): return True
        dept_conf = sk(service) in self.dc
        for x in self.grants:
            p = x["portee"] or "doc"
            if (p == "doc" and x["doc"] == id_) or (p == "dept" and dept_conf and sk(x["valeur"]) == sk(service)): return True
        return False

    def peut_voir(self, id_, niveau, type_, service):
        return (not self.est_conf(niveau, type_, service)) or self.peut_ouvrir(id_, niveau, type_, service)

    def peut_partager(self, service):
        u = self.u
        return self.admin or self.f("confid") or (u["role"] == "gestionnaire" and bool(u.get("departement")) and sk(u["departement"]) == sk(service))

    def peut_decider(self, r, service=None):
        """r : demande (dict avec user, portee, valeur)."""
        u = self.u
        if r["user"] == u["id"]: return False
        if self.accorder: return True
        p = r.get("portee") or "doc"
        if p == "dossier": return self.f("confid")
        if u["role"] != "gestionnaire" or not u.get("departement"): return False
        return sk(r.get("valeur") if p == "dept" else service) == sk(u["departement"])

    def nb_attente(self):
        c, u = self.conn, self.u
        if self.accorder: return c.execute("select count(*) from demandes where statut='attente' and user!=?", (u["id"],)).fetchone()[0]
        n = 0
        if self.f("confid"): n += c.execute("select count(*) from demandes where statut='attente' and portee='dossier' and user!=?", (u["id"],)).fetchone()[0]
        if u["role"] == "gestionnaire" and u.get("departement"):
            n += c.execute("select count(*) from demandes d left join docs on docs.id=d.doc where d.statut='attente' and d.user!=? and ((d.portee='dept' and lower(d.valeur)=lower(?)) or (d.portee='doc' and lower(docs.service)=lower(?)))", (u["id"], u["departement"], u["departement"])).fetchone()[0]
        return n

    def resume(self):
        return {"admin": self.admin, "importer": self.importer, "supprimer": self.importer, "gerer_comptes": self.gerer_comptes,
                "voir_journal": self.voir_journal, "accorder": self.accorder, "voir_confidentiel": self.voir_confidentiel}
