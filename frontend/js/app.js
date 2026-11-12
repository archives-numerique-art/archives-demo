"use strict";
/* IMF Archive - FRONTEND (port 5000).
   Cette page n'accède jamais à la base de données : tout passe par l'API du backend (port 5001).
   Les règles de sécurité et les calculs sont faits par le backend ; ici on ne fait qu'afficher. */

const PORT_BACK = window.IMF_PORT_BACKEND || 5001;
const BASE = (window.IMF_API || (location.protocol + "//" + location.hostname + ":" + PORT_BACK)).replace(/\/$/, "");
const API = BASE + "/api";
const S = { moi: null, meta: null, nav: null, csrf: "" };

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
const enc = encodeURIComponent;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fr = (d) => (d && d.length >= 10 ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : d || "");
const options = (liste, choisi, vide) => (vide !== undefined ? `<option value="">${esc(vide)}</option>` : "") + liste.map((x) => `<option ${x === choisi ? "selected" : ""}>${esc(x)}</option>`).join("");
const droit = (n) => !!(S.moi && S.moi.droits[n]);

// ------------------------------------------------------------------ appels au backend
async function api(chemin, o = {}) {
  const opt = { method: o.methode || "GET", credentials: "include", headers: {} };
  if (S.csrf && opt.method !== "GET") opt.headers["X-CSRF-Token"] = S.csrf;
  if (o.form) opt.body = o.form;
  else if (o.corps !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(o.corps); }
  let r;
  try { r = await fetch(API + chemin, opt); }
  catch (e) { throw new Error("Le backend ne répond pas (port " + PORT_BACK + "). Vérifiez que sa fenêtre noire est ouverte."); }
  const data = (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
  if (!r.ok) { const e = new Error((data && data.erreur) || "Erreur " + r.status); e.status = r.status; e.data = data; throw e; }
  return data;
}
const post = (c, corps) => api(c, { methode: "POST", corps: corps || {} });
const put = (c, corps) => api(c, { methode: "PUT", corps });
const del = (c) => api(c, { methode: "DELETE" });

function envoyer(chemin, form, progression) {   // envoi de fichiers avec barre de progression
  return new Promise((ok, ko) => {
    const x = new XMLHttpRequest(); x.open("POST", API + chemin); x.withCredentials = true; x.setRequestHeader("X-CSRF-Token", S.csrf);
    x.upload.onprogress = (e) => { if (e.lengthComputable && progression) progression(Math.round((100 * e.loaded) / e.total)); };
    x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch (e) {} x.status < 300 ? ok(d) : ko(Object.assign(new Error((d && d.erreur) || "Erreur " + x.status), { status: x.status })); };
    x.onerror = () => ko(new Error("Le backend ne répond pas (port " + PORT_BACK + ")."));
    x.send(form);
  });
}

function message(texte, type) {
  const z = q("#messages"); if (!z) return alert(texte);
  const p = document.createElement("p"); p.className = "msg" + (type === "erreur" ? " err" : ""); p.textContent = texte; z.appendChild(p); setTimeout(() => p.remove(), 7000);
}
async function sur(fn) {   // exécute une action et affiche l'erreur éventuelle
  try { return await fn(); }
  catch (e) { if (e.status === 401 && S.moi) { S.moi = null; return demarrer(); } if (e.data && e.data.changer_mdp) { location.hash = "#/mot-de-passe"; return; } message(e.message, "erreur"); }
}
function contenu(html) { q("#contenu").innerHTML = html; window.scrollTo(0, 0); }
const sur_envoi = (sel, fn) => { const f = q(sel); if (f) f.addEventListener("submit", (e) => { e.preventDefault(); sur(() => fn(f, new FormData(f))); }); };

// ------------------------------------------------------------------ thème clair / sombre (préférence d'affichage seulement)
function themeActuel() { try { return localStorage.getItem("imf_theme") === "sombre" ? "sombre" : "clair"; } catch (e) { return "clair"; } }
function appliquerTheme() { document.body.className = themeActuel() === "sombre" ? "sombre" : ""; }
function changerTheme() { try { localStorage.setItem("imf_theme", themeActuel() === "sombre" ? "clair" : "sombre"); } catch (e) {} appliquerTheme(); majTheme(); }
function majTheme() { const t = q("#theme"); if (t) t.textContent = themeActuel() === "sombre" ? "☀ Thème clair" : "🌙 Thème sombre"; }

// ------------------------------------------------------------------ connexion
function vueConnexion(setup) {
  q("#racine").innerHTML = `<div class="solo"><div class="card"><img src="assets/logo.png" alt="Microfinance Bisou Bisou"><h2 style="text-align:center">${setup ? "Première utilisation" : "Connexion"}</h2>
    ${setup ? "<p class='muted'>Créez le compte du super administrateur. Gardez bien son mot de passe.</p>" : ""}<div id="messages"></div>
    <form id="f"><label>Nom du compte<input name="nom" autocomplete="username" required autofocus></label><label>Mot de passe${setup ? " (8 caractères minimum)" : ""}<input name="mdp" type="password" autocomplete="${setup ? "new-password" : "current-password"}" required></label>
    <button>${setup ? "Créer le compte et entrer" : "Se connecter"}</button></form></div></div>`;
  sur_envoi("#f", async (f, d) => {
    const r = await post(setup ? "/setup" : "/connexion", { nom: d.get("nom"), mdp: d.get("mdp") });
    S.moi = r.moi; S.csrf = r.moi.csrf; await entrer();
  });
}

async function demarrer() {
  appliquerTheme();
  let e;
  try { e = await api("/etat"); } catch (x) { q("#racine").innerHTML = `<div class="solo"><div class="card"><img src="assets/logo.png" alt=""><h3>Backend injoignable</h3><p>${esc(x.message)}</p><p class="muted">Adresse essayée : <code>${esc(API)}</code></p><button onclick="location.reload()">Réessayer</button></div></div>`; return; }
  if (e.setup_requis) return vueConnexion(true);
  if (!e.connecte) return vueConnexion(false);
  S.moi = e.moi; S.csrf = e.moi.csrf; await entrer();
}

async function entrer() {
  S.meta = await api("/meta"); coque();
  if (S.moi.changer_mdp) { location.hash = "#/mot-de-passe"; return route(); }
  await rafraichir(); if (!location.hash || location.hash === "#/mot-de-passe") location.hash = "#/accueil"; route();
}

async function rafraichir() {
  S.nav = await api("/navigation"); const e = await api("/etat"); S.moi = e.moi; rendreNav();
}

// ------------------------------------------------------------------ cadre : menu de gauche, classement en arbre
function coque() {
  const m = S.moi, d = m.droits, lien = (h, t) => `<a href="#${h}">${t}</a>`;
  q("#racine").innerHTML = `<div class="top"><a href="#/accueil"><img src="assets/logo.png" alt="Microfinance Bisou Bisou"></a><span class="app">Archives</span><span class="who">👤 ${esc(m.nom)}</span></div>
  <div class="wrap"><aside><form class="search" id="recherche"><input name="q" placeholder="🔎 Rechercher un nom ou un numéro"></form>
    <div class="menu">${lien("/accueil", "🏠 Accueil")}${lien("/dossiers", "📁 Documents")}<a href="#/demandes">📨 Demandes <span class="pill" id="pastille" hidden></span></a>
      ${!d.admin ? lien("/demandes/nouvelle", "✉ Nouvelle demande") : ""}${d.importer ? lien("/import", "📥 Importer") + lien("/nouveau", "➕ Nouveau document") : ""}
      ${d.gerer_comptes ? lien("/utilisateurs", "👥 Utilisateurs") : ""}${d.admin ? lien("/acces", "🔑 Accès") : ""}${d.voir_journal ? lien("/journal", "📜 Journal") : ""}${d.admin ? lien("/sauvegarde", "💾 Sauvegarde") + lien("/donnees", "🗄 Mes données") : ""}</div>
    <h5>Classement des documents</h5><div class="tree" id="arbre"></div><h5>Rubriques</h5><div class="tree" id="rubriques"></div>
    <h5>Options</h5><div class="menu"><a href="#" id="theme"></a>${lien("/mot-de-passe", "🔒 Mot de passe")}<a href="#" id="quitter">⏻ Quitter</a></div>
    <p class="n" style="padding:10px 16px">Archives IMF - version ${esc(S.meta.version)}</p></aside><main><div id="messages"></div><div id="contenu"></div></main></div>`;
  q("#recherche").addEventListener("submit", (e) => { e.preventDefault(); location.hash = "#/liste?q=" + enc(new FormData(e.target).get("q")); });
  q("#theme").addEventListener("click", (e) => { e.preventDefault(); changerTheme(); }); majTheme();
  q("#quitter").addEventListener("click", async (e) => { e.preventDefault(); try { await post("/deconnexion"); } catch (x) {} S.moi = null; S.csrf = ""; location.hash = ""; demarrer(); });
}

function rendreNav() {
  const n = S.nav, a = q("#arbre"), r = q("#rubriques"), p = q("#pastille"); if (!a) return;
  p.hidden = !S.moi.nb_attente; p.textContent = S.moi.nb_attente;
  a.innerHTML = n.arbre.map((y, i) => `<details ${i === 0 ? "open" : ""}><summary>📁 ${esc(y.annee)} <span class="n">(${y.total})</span></summary>${y.mois.map((m, j) =>
    `<details ${i === 0 && j === 0 ? "open" : ""}><summary>📂 ${esc(m.libelle)} <span class="n">(${m.total})</span></summary>${m.departements.map((d) =>
      `<a href="#/liste?mois=${enc(m.mois)}&dept=${enc(d.valeur)}">📄 ${esc(d.nom)} <span class="n">(${d.total})</span></a>`).join("")}</details>`).join("")}</details>`).join("") || `<p class="muted" style="padding:0 14px">Aucun document pour le moment.</p>`;
  r.innerHTML = `<details><summary>🏢 Départements <span class="n">(${n.departements.length})</span></summary>${n.departements.map((d) => `<a href="#/liste?dept=${enc(d.valeur)}">📄 ${esc(d.nom)} <span class="n">(${d.total})</span></a>`).join("")}</details>
    <details><summary>🛡 Niveaux d'accès</summary>${n.niveaux.map((x) => `<a href="#/liste?niveau=${enc(x.niveau)}">📄 ${esc(x.niveau)} <span class="n">(${x.total})</span></a>`).join("")}</details>
    <details><summary>🆕 Derniers documents enregistrés</summary>${n.derniers.map((d) => `<a href="#/doc/${d.id}">📄 ${esc(d.num + " " + (d.titre || "").slice(0, 26))}</a>`).join("") || `<span class="muted" style="padding:0 24px">Aucun</span>`}</details>`;
}

// ------------------------------------------------------------------ routage
const ROUTES = [[/^\/accueil$/, vueAccueil], [/^\/dossiers$/, vueDossiers], [/^\/mois$/, vueMois], [/^\/liste$/, vueListe], [/^\/doc\/(\d+)$/, vueDoc],
  [/^\/import$/, vueImport, "importer"], [/^\/nouveau$/, vueNouveau, "importer"], [/^\/demandes$/, vueDemandes], [/^\/demandes\/nouvelle$/, vueNouvelleDemande], [/^\/utilisateurs$/, vueUtilisateurs, "gerer_comptes"],
  [/^\/acces$/, vueAcces, "admin"], [/^\/journal$/, vueJournal, "voir_journal"], [/^\/sauvegarde$/, vueSauvegarde, "admin"], [/^\/donnees$/, vueDonnees, "admin"], [/^\/mot-de-passe$/, vueMdp]];

async function route() {
  if (!S.moi || !q("#contenu")) return;
  const h = location.hash.replace(/^#/, "") || "/accueil", [chemin, qs] = h.split("?"), p = Object.fromEntries(new URLSearchParams(qs || ""));
  for (const [re, f, dr] of ROUTES) { const m = chemin.match(re); if (m) { if (dr && !droit(dr)) return contenu("<h2>Page non disponible</h2><p>Cette page n'est pas disponible pour votre compte.</p>"); return sur(() => f(p, ...m.slice(1))); } }
  contenu("<h2>Page introuvable</h2>");
}
window.addEventListener("hashchange", route);

// ------------------------------------------------------------------ accueil (tableau de bord)
async function vueAccueil() {
  const a = await api("/accueil");
  const carte = (cl, ic, n, lb, lien) => `<div class="stat ${cl}"><div class="hd"><span class="ic">${ic}</span><div class="r"><div class="nb">${n}</div><div class="lb">${esc(lb)}</div></div></div><div class="ft"><a href="#${lien}">Voir le détail →</a></div></div>`;
  contenu(`<h2>Accueil</h2><div class="stats">${carte("c-bleu", "📚", a.total, "Documents consultables", "/dossiers")}${carte("c-vert", "🆕", a.ce_mois, "Enregistrés ce mois-ci", "/liste?tri=date")}
    ${carte("c-orange", "📨", a.demandes, a.demandes_libelle, "/demandes")}${carte("c-rouge", "📥", a.aujourdhui, "Enregistrés aujourd'hui", "/liste?tri=date")}</div>
    <details class="card guide" open><summary><b>Bienvenue sur Archives IMF : comment ça marche</b></summary><ol>
      <li><b>Chercher :</b> cliquez sur une année, un mois, puis un département pour voir ses documents, ou tapez un nom dans la recherche.</li>
      <li><b>Consulter :</b> cliquez sur un document pour l'ouvrir. Les documents Publics et Internes sont ouverts à tous.</li>
      ${droit("importer") ? "<li><b>Ajouter :</b> menu Importer : choisissez le mois, le type, le niveau et le département, puis sélectionnez tous vos fichiers à la fois (Ctrl+A).</li>" : ""}
      <li><b>Confidentiel :</b> certains documents et départements sont cachés. Pour les consulter, menu Demandes, puis Nouvelle demande : indiquez le motif et la durée.</li>
      <li><b>Affichage :</b> le bouton Sombre / Clair du menu change les couleurs.</li></ol></details>
    ${a.partages.length ? `<div class="card"><h4>Documents confidentiels partagés avec vous</h4>${a.partages.map((r) => `<p><a href="#/doc/${r.id}"><b>${esc(r.num)}</b> ${esc(r.titre)}</a> <span class="muted">(${esc(r.service)})</span></p>`).join("")}</div>` : ""}
    <div class="card"><h4>Résumé</h4><p>📚 Vous pouvez consulter <b>${a.total}</b> document(s) dans <b>${a.departements}</b> département(s).</p>
      <p>🆕 <b>${a.ce_mois}</b> document(s) enregistré(s) en ${esc(a.mois_libelle)}, dont <b>${a.aujourdhui}</b> aujourd'hui.</p>
      ${a.dernier ? `<p>🕒 Dernier enregistrement : <a href="#/doc/${a.dernier.id}">${esc(a.dernier.num)}</a> ${esc((a.dernier.titre || "").slice(0, 50))}, le ${fr(a.dernier.cree)}.</p>` : ""}
      <p class="muted">Les classements par département, par niveau d'accès et les derniers documents sont dans le panneau de gauche, rubrique « Rubriques ».</p></div>`);
}

// ------------------------------------------------------------------ dossiers : années > mois > départements
async function vueDossiers() {
  const arbre = S.nav.arbre;
  contenu(`<h2>Choisissez un mois</h2>${arbre.map((y) => `<h4><a href="#/mois?m=${y.annee}">Année ${esc(y.annee)}</a> <span class="muted">- ${y.total} document(s), tous les mois</span></h4>${y.mois.map((m) =>
    `<div class="card"><a href="#/mois?m=${m.mois}"><b>📁 ${esc(m.libelle)}</b></a> <span class="muted">- ${m.total} document(s)</span></div>`).join("")}`).join("") || "<p class='muted'>Aucun document pour le moment.</p>"}`);
}

async function vueMois(p) {
  const m = p.m || "", dep = {};
  S.nav.arbre.forEach((y) => y.mois.forEach((x) => { if (x.mois.startsWith(m)) x.departements.forEach((d) => { dep[d.valeur] = (dep[d.valeur] || { nom: d.nom, total: 0 }); dep[d.valeur].total += d.total; }); }));
  const lib = m.length === 4 ? "Année " + m : ((S.nav.arbre.flatMap((y) => y.mois).find((x) => x.mois === m) || {}).libelle || m);
  contenu(`<p><a href="#/dossiers">Retour aux mois</a></p><h3>${esc(lib)} : choisissez un département</h3>${Object.entries(dep).map(([v, d]) =>
    `<div class="card"><a href="#/liste?mois=${enc(m)}&dept=${enc(v)}"><b>📁 ${esc(d.nom)}</b></a> <span class="muted">- ${d.total} document(s)</span></div>`).join("") || "<p class='muted'>Aucun document.</p>"}`);
}

// ------------------------------------------------------------------ liste des documents
async function vueListe(p) {
  const d = await api("/documents?" + new URLSearchParams(p)), sup = droit("supprimer");
  const nomDept = p.dept ? (p.dept === "~" ? "(sans département)" : p.dept) : "";
  contenu(`<form class="card" id="filtre"><input name="q" placeholder="Rechercher un nom ou un numéro" value="${esc(p.q || "")}"> <select name="niveau">${options(S.meta.niveaux, p.niveau, "Tous niveaux")}</select>
      <select name="type">${options(S.meta.types, p.type, "Tous types")}</select> <select name="tri"><option value="">Liste alphabétique</option><option value="date" ${p.tri === "date" ? "selected" : ""}>Plus récents d'abord</option></select>
      <input type="hidden" name="mois" value="${esc(p.mois || "")}"><input type="hidden" name="dept" value="${esc(p.dept || "")}"><button>Filtrer</button></form>
    ${p.dept ? `<div class="card ligne"><img src="assets/logo.png" alt="" style="height:36px;background:#fff;border-radius:6px;padding:3px 8px"><b>Département : ${esc(nomDept)}</b></div>` : ""}
    ${p.mois ? `<p><a href="#/mois?m=${enc(p.mois)}">Retour aux départements</a></p>` : ""}<p class="muted">${d.total} document(s)${p.mois ? " - " + esc(p.mois) : ""}</p>
    ${sup && d.documents.length ? `<label><input type="checkbox" id="tout"> Tout cocher</label>` : ""}
    ${d.documents.map((r) => `<div class="card">${sup ? `<input type="checkbox" class="coche" value="${r.id}"> ` : ""}<a href="#/doc/${r.id}"><b>${esc(r.num)}</b> ${esc(r.titre)}</a>
      <div class="muted">${esc(r.type)} - ${esc(r.service)} - ${esc(r.date)}${r.cree ? " - enregistré le " + fr(r.cree) : ""}</div><span class="tag n-${esc(r.niveau)}">${esc(r.niveau)}</span> <span class="tag">${esc(r.etat)}</span> ${r.acces ? "" : "(accès restreint)"}</div>`).join("") || "<p class='muted'>Aucun document.</p>"}
    ${sup && d.documents.length ? `<button class="danger" id="suppr">Supprimer les documents cochés</button>` : ""}`);
  q("#filtre").addEventListener("submit", (e) => { e.preventDefault(); const f = new URLSearchParams(); new FormData(e.target).forEach((v, k) => { if (v) f.set(k, v); }); location.hash = "#/liste?" + f; });
  const tout = q("#tout"); if (tout) tout.addEventListener("change", () => qa(".coche").forEach((c) => (c.checked = tout.checked)));
  const b = q("#suppr"); if (b) b.addEventListener("click", () => sur(async () => {
    const ids = qa(".coche").filter((c) => c.checked).map((c) => +c.value); if (!ids.length) return message("Cochez au moins un document.", "erreur");
    if (!confirm("Supprimer définitivement " + ids.length + " document(s) ?")) return;
    const r = await post("/documents/supprimer", { ids }); message(r.supprimes + " document(s) supprimé(s)."); await rafraichir(); route();
  }));
}

// ------------------------------------------------------------------ fiche d'un document
async function vueDoc(p, id) {
  const d = await api("/documents/" + id);
  contenu(`<p><a href="#/liste">← Retour</a></p>${d.peut_supprimer ? `<button class="danger" id="suppr" style="float:right">Supprimer ce document</button>` : ""}
    <div class="card"><h3>${esc(d.num)} - ${esc(d.titre)}</h3><p>${esc(d.type)} | ${esc(d.service)} | ${esc(d.date)}${d.cree ? " | enregistré le " + fr(d.cree) : ""}<br><span class="tag n-${esc(d.niveau)}">${esc(d.niveau)}</span> <span class="tag">${esc(d.etat)}</span></p>
      ${d.acces ? `${d.emplacement ? `<p><b>Emplacement :</b> ${esc(d.emplacement)}</p>` : ""}${d.a_fichier ? `<p><a href="${API}/documents/${d.id}/fichier" target="_blank" rel="noopener"><button type="button">📄 Ouvrir le fichier</button></a></p>` : "<p class='muted'>Pas de fichier scanné pour ce document.</p>"}`
        : `<p>🔒 Vous n'avez pas accès à ce fichier.</p><p><a href="#/demandes/nouvelle">Faire une demande d'accès</a></p>`}</div>
    ${d.peut_partager ? `<div class="card"><h4>Partager ce document</h4><p class="muted">Choisissez la personne qui doit pouvoir consulter ce document confidentiel, et pour combien de temps.</p>
      <form id="partage" class="ligne"><select name="user">${d.utilisateurs.map((u) => `<option value="${u.id}">${esc(u.nom)}${u.departement ? " - " + esc(u.departement) : ""}</option>`).join("")}</select>
        <select name="jours"><option value="1">1 jour</option><option value="3">3 jours</option><option value="7" selected>7 jours</option><option value="14">14 jours</option><option value="30">30 jours</option></select>
        <input name="note" placeholder="Message (facultatif)"><button>Partager</button></form>
      ${d.partages.map((x) => `<p class="muted ligne">Partagé avec ${esc(x.nom)} jusqu'au ${fr(x.jusqu)} <button class="danger retirer" data-rid="${x.rid}" style="padding:3px 10px">Retirer</button></p>`).join("")}</div>` : ""}`);
  const s = q("#suppr"); if (s) s.addEventListener("click", () => sur(async () => { if (!confirm("Supprimer définitivement ce document ?")) return; await post("/documents/supprimer", { ids: [d.id] }); message("Document supprimé."); await rafraichir(); location.hash = "#/liste"; }));
  sur_envoi("#partage", async (f, fd) => { await post("/documents/" + d.id + "/partager", { user: +fd.get("user"), jours: +fd.get("jours"), note: fd.get("note") }); message("Document partagé."); route(); });
  qa(".retirer").forEach((b) => b.addEventListener("click", () => sur(async () => { await del("/documents/" + d.id + "/partages/" + b.dataset.rid); message("Partage retiré."); route(); })));
}

const aller = (h) => { if (location.hash === h) route(); else location.hash = h; };

// ------------------------------------------------------------------ importer / nouveau document
async function vueImport() {
  const dep = await api("/departements"), mois = new Date().toISOString().slice(0, 7);
  contenu(`<h2>Importer des documents</h2><p class="muted">Choisissez tous les fichiers d'un mois d'un coup (cliquez sur le premier, puis Ctrl+A), ou un dossier entier. Ils iront directement dans le département choisi.</p>
    <form class="card" id="imp"><p>Mois de traitement <input type="month" name="mois" value="${mois}" required> Département <select name="service" required><option value="">-- Choisir le département --</option>${options(dep.tous)}</select></p>
      <p>Type <select name="type">${options(S.meta.types)}</select> Niveau d'accès <select name="niveau">${options(S.meta.niveaux, "Interne")}</select> Emplacement <input name="emplacement" placeholder="A1 - E2 - B0"></p>
      <p>Fichiers (PDF, JPG, PNG) <input type="file" id="fichiers" multiple accept=".pdf,.jpg,.jpeg,.png"></p><p>Ou un dossier entier <input type="file" id="dossier" webkitdirectory multiple></p>
      <div class="progress" id="barre" hidden><i></i></div><button id="go">Importer</button></form>`);
  sur_envoi("#imp", async (f, fd) => {
    const fichiers = [...q("#fichiers").files, ...q("#dossier").files]; if (!fichiers.length) return message("Choisissez au moins un fichier.", "erreur");
    const form = new FormData(); ["mois", "service", "type", "niveau", "emplacement"].forEach((k) => form.append(k, fd.get(k))); fichiers.forEach((x) => form.append("fichiers", x, x.name));
    q("#go").disabled = true; q("#go").textContent = "Envoi en cours, patientez (ne fermez pas la page)..."; q("#barre").hidden = false;
    try { const r = await envoyer("/documents/import", form, (n) => (q("#barre i").style.width = n + "%")); message(r.importes + " fichier(s) importé(s)" + (r.ignores ? ", " + r.ignores + " ignoré(s) (type non accepté)" : "") + "."); await rafraichir(); aller("#/mois?m=" + r.mois); }
    finally { const b = q("#go"); if (b) { b.disabled = false; b.textContent = "Importer"; } }
  });
}

async function vueNouveau() {
  const dep = await api("/departements"), auj = new Date().toISOString().slice(0, 10);
  contenu(`<h2>Nouveau document</h2><form class="card" id="nv"><p>Titre <input name="titre" size="40" required placeholder="NOM Prénom - description"></p>
    <p>Département <select name="service" required><option value="">-- Choisir --</option>${options(dep.tous)}</select> Type <select name="type">${options(S.meta.types)}</select> Niveau <select name="niveau">${options(S.meta.niveaux, "Interne")}</select></p>
    <p>Date <input type="date" name="date" value="${auj}"> État <select name="etat">${options(S.meta.etats, "À scanner")}</select> Emplacement <input name="emplacement" placeholder="A1 - E2 - B0"></p>
    <p>Fichier scanné (PDF, JPG, PNG) <input type="file" name="fichier" accept=".pdf,.jpg,.jpeg,.png"></p><button>Enregistrer</button></form>`);
  sur_envoi("#nv", async (f, fd) => { if (!fd.get("fichier").name) fd.delete("fichier"); const r = await api("/documents", { methode: "POST", form: fd }); message("Document enregistré : " + r.num); await rafraichir(); aller("#/doc/" + r.id); });
}

// ------------------------------------------------------------------ demandes d'accès
async function vueDemandes() {
  const d = await api("/demandes"), quoi = (r) => r.portee === "dept" ? "Tout le département : " + esc(r.valeur) : r.portee === "dossier" ? "Dossier demandé : " + esc(r.valeur) : esc((r.doc_num || "") + " " + (r.doc_titre || ""));
  contenu(`<h2>${d.peut_traiter ? "Demandes d'accès" : "Mes demandes"}</h2>${d.peut_demander ? `<p><a href="#/demandes/nouvelle"><button type="button">✉ Nouvelle demande d'accès</button></a></p>` : ""}
    ${d.demandes.map((r) => `<div class="card"><b>${esc(r.demandeur)}</b> - ${quoi(r)} - ${r.jours} jour(s) - ${fr(r.cree)}<br><span class="muted">Motif : ${esc(r.motif)}</span><br>Statut : <b>${esc(r.statut)}</b>${r.reponse ? ` <span class="muted">(${esc(r.reponse)})</span>` : ""}
      ${r.peut && r.statut === "attente" ? `<form class="decision ligne" data-id="${r.id}">Durée <select name="jours">${[1, 3, 7, 14, 30, 60, 90].map((j) => `<option ${j === Math.min(r.jours, 90) ? "selected" : ""}>${j}</option>`).join("")}</select> jours
        ${r.portee === "dossier" ? `<input name="num" size="30" placeholder="Numéro du document à partager (ex. ARC-2026-0001)">` : ""}<input name="note" placeholder="Message (facultatif)">
        <button name="action" value="ok">Accorder</button> <button name="action" value="non" class="danger">Refuser</button></form>` : ""}</div>`).join("") || "<p class='muted'>Aucune demande.</p>"}`);
  qa(".decision").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const fd = new FormData(f); sur(async () => {
    await post("/demandes/" + f.dataset.id + "/decision", { action: e.submitter.value, jours: +fd.get("jours"), note: fd.get("note"), num: fd.get("num") }); message("Réponse enregistrée."); await rafraichir(); route(); }); }));
}

async function vueNouvelleDemande() {
  const dep = await api("/departements");
  contenu(`<h2>Demander l'accès à des documents confidentiels</h2><p class="muted">Les documents Publics et Internes sont ouverts à tous. Pour les documents confidentiels, expliquez pourquoi vous en avez besoin : l'archiviste ou le responsable du département répond.</p>
    <form class="card" id="dm"><p><label><input type="radio" name="portee" value="dept" checked> Tous les documents d'un département confidentiel</label><br>${dep.confidentiels.length ? `<select name="v_dept">${options(dep.confidentiels)}</select>` : "<span class='muted'>Aucun département confidentiel n'est défini.</span>"}</p>
      <p><label><input type="radio" name="portee" value="dossier"> Un dossier précis qui ne figure pas dans la liste</label><br><input name="v_texte" size="40" placeholder="Nom du client, numéro, mois..."></p>
      <p>Motif <br><textarea name="motif" rows="3" cols="50" required></textarea></p><p>Durée souhaitée <select name="jours">${[1, 3, 7, 14, 30, 60, 90].map((j) => `<option ${j === 7 ? "selected" : ""}>${j}</option>`).join("")}</select> jours</p><button>Envoyer la demande</button></form>`);
  sur_envoi("#dm", async (f, fd) => {
    const p = fd.get("portee"); await post("/demandes", { portee: p, valeur: p === "dept" ? fd.get("v_dept") : fd.get("v_texte"), motif: fd.get("motif"), jours: +fd.get("jours") });
    message("Demande envoyée. Elle sera traitée par l'archiviste ou par le responsable du département concerné."); await rafraichir(); aller("#/demandes");
  });
}

// ------------------------------------------------------------------ utilisateurs et départements
const DRAPEAUX = { comptes: "Peut créer des comptes", accorde: "Peut accorder les accès", archiviste: "Peut ajouter et supprimer des documents", confid: "Peut voir les documents confidentiels", journal: "Peut consulter le journal" };

async function vueUtilisateurs() {
  const u = await api("/utilisateurs"), dep = await api("/departements"), adm = droit("admin"), roles = Object.entries(u.roles);
  const optRole = (c) => roles.map(([k, v]) => `<option value="${k}" ${k === c ? "selected" : ""}>${esc(v)}</option>`).join("");
  const optDep = (c) => `<option value="">(aucun département)</option>` + dep.tous.map((x) => `<option ${x === c ? "selected" : ""}>${esc(x)}</option>`).join("");
  contenu(`<h2>Utilisateurs</h2>${u.utilisateurs.map((x) => !x.modifiable ? `<div class="card"><b>${esc(x.nom)}</b> - ${esc(x.role_libelle)}</div>` : `<div class="card"><b>${esc(x.nom)}</b> - ${esc(x.role_libelle)}${x.departement ? " - " + esc(x.departement) : ""}
      <form class="u-edit" data-id="${x.id}"><div class="ligne"><select name="role">${optRole(x.role)}</select><select name="departement">${optDep(x.departement)}</select><button>Enregistrer</button></div>
      ${adm ? `<div class="ligne">${Object.entries(DRAPEAUX).map(([k, t]) => `<label><input type="checkbox" name="${k}" ${x.drapeaux[k] ? "checked" : ""}> ${t}</label>`).join("")}</div>` : ""}</form>
      <form class="u-mdp ligne" data-id="${x.id}"><input name="mdp" type="password" placeholder="Nouveau mot de passe temporaire" autocomplete="new-password"><button>Réinitialiser le mot de passe</button></form></div>`).join("")}
    <form class="card" id="u-new"><h4>Ajouter un compte</h4><div class="ligne"><input name="nom" placeholder="Nom du compte" required><select name="role">${optRole("agent")}</select><select name="departement">${optDep("")}</select>
      <input name="mdp" type="password" placeholder="Mot de passe temporaire (8 car. min.)" required autocomplete="new-password"><button>Créer le compte</button></div><p class="muted">La personne devra changer ce mot de passe à sa première connexion.</p></form>
    ${adm ? `<form class="card" id="d-new"><h4>Départements</h4><p class="muted">${dep.tous.map(esc).join(", ") || "Aucun"}</p><div class="ligne"><input name="nom" placeholder="Nouveau département" required><button>Ajouter</button></div></form>
      <form class="card" id="d-conf"><h4>Départements confidentiels</h4><p class="muted">Les documents d'un département coché sont cachés à tous, sauf aux personnes autorisées. Les autres peuvent en faire la demande.</p>
        ${dep.details.map((d) => `<label><input type="checkbox" name="conf" value="${esc(d.nom)}" ${d.confidentiel ? "checked" : ""}> ${esc(d.nom)}</label><br>`).join("")}<button>Enregistrer</button></form>` : ""}`);
  qa(".u-edit").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const fd = new FormData(f); sur(async () => {
    await put("/utilisateurs/" + f.dataset.id, { role: fd.get("role"), departement: fd.get("departement"), drapeaux: Object.fromEntries(Object.keys(DRAPEAUX).map((k) => [k, fd.get(k) === "on"])) }); message("Compte enregistré."); route(); }); }));
  qa(".u-mdp").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); sur(async () => { await post("/utilisateurs/" + f.dataset.id + "/mot-de-passe", { mdp: new FormData(f).get("mdp") }); message("Mot de passe réinitialisé."); f.reset(); }); }));
  sur_envoi("#u-new", async (f, fd) => { await post("/utilisateurs", { nom: fd.get("nom"), role: fd.get("role"), departement: fd.get("departement"), mdp: fd.get("mdp") }); message("Compte créé."); route(); });
  sur_envoi("#d-new", async (f, fd) => { await post("/departements", { nom: fd.get("nom") }); message("Département ajouté."); route(); });
  sur_envoi("#d-conf", async (f, fd) => { await put("/departements/confidentiels", { noms: fd.getAll("conf") }); message("Départements confidentiels enregistrés."); await rafraichir(); route(); });
}

async function vueAcces() {
  const a = await api("/acces");
  contenu(`<h2>Accès temporaires en cours</h2>${a.acces.length ? `<table><tr><th>Personne</th><th>Document / portée</th><th>Jusqu'au</th><th></th></tr>${a.acces.map((x) => `<tr><td>${esc(x.nom)}</td><td>${esc(x.num || (x.portee + " " + (x.valeur || "")))}</td><td>${fr(x.jusqu)}</td><td><button class="danger retire" data-id="${x.id}" style="padding:3px 10px">Retirer</button></td></tr>`).join("")}</table>` : "<p class='muted'>Aucun accès temporaire.</p>"}`);
  qa(".retire").forEach((b) => b.addEventListener("click", () => sur(async () => { if (!confirm("Retirer cet accès ?")) return; await del("/acces/" + b.dataset.id); message("Accès retiré."); route(); })));
}

// ------------------------------------------------------------------ journal, sauvegardes, données
async function vueJournal(p) {
  const qs = new URLSearchParams(p).toString(), j = await api("/journal?" + qs);
  contenu(`<h2>Journal des activités</h2><form class="card" id="jf" class="ligne">Du <input type="date" name="du" value="${esc(p.du || "")}"> au <input type="date" name="au" value="${esc(p.au || "")}">
      <select name="qui">${options(j.personnes, p.qui, "Toutes les personnes")}</select><select name="action">${options(j.actions, p.action, "Toutes les actions")}</select><input name="texte" placeholder="Texte à chercher" value="${esc(p.texte || "")}"><button>Filtrer</button> <a href="#/journal">Effacer</a></form>
    <div class="card"><b>Actifs ces 30 dernières minutes :</b> ${j.actifs.length ? esc(j.actifs.join(", ")) : "<span class='muted'>personne</span>"}<br><span class="muted">(d'après les actions enregistrées : connexions, consultations, imports…)</span></div>
    <div class="card"><h4>Connexions par personne</h4>${j.resume.length ? `<table><tr><th>Compte</th><th>Connexions</th><th>Échecs</th><th>Dernière connexion</th></tr>${j.resume.map((r) => `<tr><td>${esc(r.u === "-" ? "(non connecté : échecs)" : r.u)}</td><td>${r.n || 0}</td><td>${r.e || 0}</td><td>${esc(r.der || "-")}</td></tr>`).join("")}</table>` : "<p class='muted'>Aucune connexion sur cette période.</p>"}</div>
    <p><a href="${API}/journal.csv?${qs}" target="_blank" rel="noopener"><button type="button">⬇ Télécharger pour Excel (CSV)</button></a> <button type="button" id="imprimer">🖨 Imprimer</button> <span class="muted">${j.total} ligne(s)${j.total > 1000 ? " - les 1000 plus récentes sont affichées, le fichier Excel contient tout" : ""}</span></p>
    <table><tr><th>Date</th><th>Qui</th><th>Action</th><th>Détail</th></tr>${j.lignes.map((l) => `<tr><td>${esc(l.t)}</td><td>${esc(l.u)}</td><td>${esc(l.a)}</td><td>${esc(l.d)}</td></tr>`).join("")}</table>`);
  q("#jf").addEventListener("submit", (e) => { e.preventDefault(); const f = new URLSearchParams(); new FormData(e.target).forEach((v, k) => { if (v) f.set(k, v); }); aller("#/journal" + (f.toString() ? "?" + f : "")); });
  q("#imprimer").addEventListener("click", () => window.print());
}

async function vueSauvegarde() {
  const s = await api("/sauvegardes");
  contenu(`<h2>Sauvegarde</h2><p class="muted">Une copie de la base et des fichiers est faite automatiquement chaque jour tant que le backend est ouvert (les 14 dernières sont gardées) dans : <code>${esc(s.dossier)}</code><br>Copiez régulièrement la plus récente sur une clé USB ou un disque externe : une copie qui reste sur le même ordinateur ne protège pas d'une panne.</p>
    <button id="sv">Sauvegarder maintenant</button><table><tr><th>Sauvegarde</th><th>Taille</th><th></th></tr>${s.sauvegardes.map((x) => `<tr><td>${esc(x.nom)}</td><td>${x.mo} Mo</td><td><a href="${API}/sauvegardes/${enc(x.nom)}" target="_blank" rel="noopener">Télécharger</a></td></tr>`).join("")}</table>`);
  q("#sv").addEventListener("click", () => sur(async () => { const r = await post("/sauvegardes"); message("Sauvegarde créée : " + r.nom); route(); }));
}

async function vueDonnees() {
  const d = await api("/donnees");
  contenu(`<h2>Mes données : où elles se trouvent</h2><p class="muted">Tout est sur cet ordinateur. Pour ouvrir un dossier : touches Windows + E, cliquez dans la barre d'adresse, collez le chemin (Ctrl+V) et appuyez sur Entrée.</p>
    <table><tr><th>Rubrique</th><th>Chemin sur l'ordinateur</th><th>Contenu</th></tr>${d.rubriques.map((r) => `<tr><td><b>${esc(r.titre)}</b></td><td><code>${esc(r.chemin.chemin)}</code><br><span class="muted">${r.chemin.existe ? r.chemin.fichiers + " fichier(s), " + r.chemin.mo + " Mo" : "pas encore créé : il le sera à la prochaine action"}</span></td><td>${esc(r.texte)}</td></tr>`).join("")}</table>
    <div class="card"><b>Fiches d'audit</b> <span class="muted">(Excel)</span><br><button id="audit">Créer les fiches d'audit maintenant</button>${d.fiches.length ? "<p>" + d.fiches.map((f) => `<a href="${API}/audit/${enc(f)}" target="_blank" rel="noopener">⬇ ${esc(f)}</a><br>`).join("") + "</p>" : ""}</div>
    <p class="muted">Les fiches d'audit contiennent des noms de clients et de personnes, jamais de mots de passe. Gardez ces dossiers protégés.</p>`);
  q("#audit").addEventListener("click", () => sur(async () => { const r = await post("/audit"); message(r.fichiers + " fiches d'audit créées dans le dossier indiqué."); route(); }));
}

// ------------------------------------------------------------------ mot de passe
async function vueMdp() {
  contenu(`<h2>Changer mon mot de passe</h2>${S.moi.changer_mdp ? "<p class='msg'>Pour continuer, choisissez votre propre mot de passe.</p>" : ""}<form class="card" id="mp" style="max-width:420px"><p>Mot de passe actuel<br><input type="password" name="ancien" required autocomplete="current-password"></p>
    <p>Nouveau mot de passe (8 caractères minimum)<br><input type="password" name="nouveau" required autocomplete="new-password"></p><p>Confirmer<br><input type="password" name="confirme" required autocomplete="new-password"></p><button>Changer le mot de passe</button></form>`);
  sur_envoi("#mp", async (f, fd) => { const r = await post("/mot-de-passe", { ancien: fd.get("ancien"), nouveau: fd.get("nouveau"), confirme: fd.get("confirme") }); S.moi = r.moi; message("Mot de passe changé."); await rafraichir(); aller("#/accueil"); });
}

demarrer();
