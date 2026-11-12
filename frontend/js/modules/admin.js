import { API, S, q, enc, esc, fr, options, api, post, message, sur, contenu, sur_envoi } from "../core.js";

const actions = { rafraichir: () => {}, route: () => {}, aller: () => {} };
export function configurerAdministration(context) { Object.assign(actions, context); }

export async function vueJournal(p) {
  const qs = new URLSearchParams(p).toString(), j = await api("/journal?" + qs);
  contenu(`<h2>Journal des activités</h2><form class="card" id="jf" class="ligne">Du <input type="date" name="du" value="${esc(p.du || "")}"> au <input type="date" name="au" value="${esc(p.au || "")}">
      <select name="qui">${options(j.personnes, p.qui, "Toutes les personnes")}</select><select name="action">${options(j.actions, p.action, "Toutes les actions")}</select><input name="texte" placeholder="Texte à chercher" value="${esc(p.texte || "")}"><button>Filtrer</button> <a href="#/journal">Effacer</a></form>
    <div class="card"><b>Actifs ces 30 dernières minutes :</b> ${j.actifs.length ? esc(j.actifs.join(", ")) : "<span class='muted'>personne</span>"}<br><span class="muted">(d'après les actions enregistrées : connexions, consultations, imports…)</span></div>
    <div class="card"><h4>Connexions par personne</h4>${j.resume.length ? `<table><tr><th>Compte</th><th>Connexions</th><th>Échecs</th><th>Dernière connexion</th></tr>${j.resume.map((r) => `<tr><td>${esc(r.u === "-" ? "(non connecté : échecs)" : r.u)}</td><td>${r.n || 0}</td><td>${r.e || 0}</td><td>${esc(r.der || "-")}</td></tr>`).join("")}</table>` : "<p class='muted'>Aucune connexion sur cette période.</p>"}</div>
    <p><a href="${API}/journal.csv?${qs}" target="_blank" rel="noopener"><button type="button">⬇ Télécharger pour Excel (CSV)</button></a> <button type="button" id="imprimer">🖨 Imprimer</button> <span class="muted">${j.total} ligne(s)${j.total > 1000 ? " - les 1000 plus récentes sont affichées, le fichier Excel contient tout" : ""}</span></p>
    <table><tr><th>Date</th><th>Qui</th><th>Action</th><th>Détail</th></tr>${j.lignes.map((l) => `<tr><td>${esc(l.t)}</td><td>${esc(l.u)}</td><td>${esc(l.a)}</td><td>${esc(l.d)}</td></tr>`).join("")}</table>`);
  q("#jf").addEventListener("submit", (e) => { e.preventDefault(); const f = new URLSearchParams(); new FormData(e.target).forEach((v, k) => { if (v) f.set(k, v); }); actions.aller("#/journal" + (f.toString() ? "?" + f : "")); });
  q("#imprimer").addEventListener("click", () => window.print());
}

export async function vueSauvegarde() {
  const s = await api("/sauvegardes");
  contenu(`<h2>Sauvegarde</h2><p class="muted">Une copie de la base et des fichiers est faite automatiquement chaque jour tant que le backend est ouvert (les 14 dernières sont gardées) dans : <code>${esc(s.dossier)}</code><br>Copiez régulièrement la plus récente sur une clé USB ou un disque externe : une copie qui reste sur le même ordinateur ne protège pas d'une panne.</p>
    <button id="sv">Sauvegarder maintenant</button><table><tr><th>Sauvegarde</th><th>Taille</th><th></th></tr>${s.sauvegardes.map((x) => `<tr><td>${esc(x.nom)}</td><td>${x.mo} Mo</td><td><a href="${API}/sauvegardes/${enc(x.nom)}" target="_blank" rel="noopener">Télécharger</a></td></tr>`).join("")}</table>`);
  q("#sv").addEventListener("click", () => sur(async () => { const r = await post("/sauvegardes"); message("Sauvegarde créée : " + r.nom); actions.route(); }));
}

export async function vueDonnees() {
  const d = await api("/donnees");
  contenu(`<h2>Mes données : où elles se trouvent</h2><p class="muted">Tout est sur cet ordinateur. Pour ouvrir un dossier : touches Windows + E, cliquez dans la barre d'adresse, collez le chemin (Ctrl+V) et appuyez sur Entrée.</p>
    <table><tr><th>Rubrique</th><th>Chemin sur l'ordinateur</th><th>Contenu</th></tr>${d.rubriques.map((r) => `<tr><td><b>${esc(r.titre)}</b></td><td><code>${esc(r.chemin.chemin)}</code><br><span class="muted">${r.chemin.existe ? r.chemin.fichiers + " fichier(s), " + r.chemin.mo + " Mo" : "pas encore créé : il le sera à la prochaine action"}</span></td><td>${esc(r.texte)}</td></tr>`).join("")}</table>
    <div class="card"><b>Fiches d'audit</b> <span class="muted">(Excel)</span><br><button id="audit">Créer les fiches d'audit maintenant</button>${d.fiches.length ? "<p>" + d.fiches.map((f) => `<a href="${API}/audit/${enc(f)}" target="_blank" rel="noopener">⬇ ${esc(f)}</a><br>`).join("") + "</p>" : ""}</div>
    <p class="muted">Les fiches d'audit contiennent des noms de clients et de personnes, jamais de mots de passe. Gardez ces dossiers protégés.</p>`);
  q("#audit").addEventListener("click", () => sur(async () => { const r = await post("/audit"); message(r.fichiers + " fiches d'audit créées dans le dossier indiqué."); actions.route(); }));
}

// ------------------------------------------------------------------ mot de passe
export async function vueMdp() {
  contenu(`<h2>Changer mon mot de passe</h2>${S.moi.changer_mdp ? "<p class='msg'>Pour continuer, choisissez votre propre mot de passe.</p>" : ""}<form class="card" id="mp"><p>Mot de passe actuel<br><input type="password" name="ancien" required autocomplete="current-password"></p>
    <p>Nouveau mot de passe (8 caractères minimum)<br><input type="password" name="nouveau" required autocomplete="new-password"></p><p>Confirmer<br><input type="password" name="confirme" required autocomplete="new-password"></p><button>Changer le mot de passe</button></form>`);
  sur_envoi("#mp", async (f, fd) => { const r = await post("/mot-de-passe", { ancien: fd.get("ancien"), nouveau: fd.get("nouveau"), confirme: fd.get("confirme") }); S.moi = r.moi; message("Mot de passe changé."); await actions.rafraichir(); actions.aller("#/accueil"); });
}
