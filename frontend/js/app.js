import { API, S, q, qa, enc, esc, droit, api, post, sur, contenu, appliquerTheme, changerTheme, majTheme, configurerExpirationSession } from "./core.js";
import { vueConnexion } from "./modules/auth.js";
import { configurerDocuments, vueAccueil, vueDossiers, vueMois, vueListe, vueDoc, vueImport, vueNouveau } from "./modules/documents.js";
import { configurerAcces, vueDemandes, vueNouvelleDemande, vueAcces } from "./modules/access.js";
import { configurerUtilisateurs, vueUtilisateurs } from "./modules/users.js";
import { configurerAdministration, vueJournal, vueSauvegarde, vueDonnees, vueMdp } from "./modules/admin.js";

async function demarrer() {
  appliquerTheme();
  let e;
  try { e = await api("/etat"); } catch (x) { q("#racine").innerHTML = `<div class="solo"><div class="card"><img src="assets/logo.png" alt=""><h3>Backend injoignable</h3><p>${esc(x.message)}</p><p class="muted">Adresse essayée : <code>${esc(API)}</code></p><button onclick="location.reload()">Réessayer</button></div></div>`; return; }
  if (e.setup_requis) return vueConnexion(true, entrer);
  if (!e.connecte) return vueConnexion(false, entrer);
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
  q("#racine").innerHTML = `<header class="top"><button type="button" class="menu-toggle" id="menu-toggle" aria-label="Ouvrir le menu" aria-controls="sidebar" aria-expanded="false"><span aria-hidden="true">☰</span></button>
    <a href="#/accueil"><img src="assets/logo.png" alt="Microfinance Bisou Bisou"></a><span class="app">Archives</span><span class="who">👤 ${esc(m.nom)}</span></header>
  <div class="wrap"><aside id="sidebar" aria-label="Navigation principale">
    <form class="search menu-search" id="recherche-menu"><label class="sr-only" for="menu-q">Trouver un menu</label><input id="menu-q" name="q" type="search" placeholder="Trouver un menu…" autocomplete="off"></form>
    <form class="search document-search" id="recherche"><label class="sr-only" for="document-q">Rechercher un document</label><input id="document-q" name="q" type="search" placeholder="Nom ou numéro de document"></form>
    <p class="muted menu-empty" id="menu-empty" hidden>Aucun menu trouvé.</p>
    <details class="nav-group" open><summary>Mon espace</summary><nav class="menu nav-principal" aria-label="Mon espace">
      ${lien("/accueil", "🏠 Accueil")}${lien("/dossiers", "📁 Documents")}
    </nav></details>
    <details class="nav-group" open><summary>Suivi</summary><nav class="menu nav-principal" aria-label="Suivi">
      <a href="#/demandes">📨 Demandes <span class="pill" id="pastille" hidden></span></a>${!d.admin ? lien("/demandes/nouvelle", "✉ Nouvelle demande") : ""}
    </nav></details>
    ${d.importer || d.gerer_comptes || d.admin || d.voir_journal ? `<details class="nav-group" open><summary>Gestion</summary><nav class="menu nav-principal" aria-label="Gestion">
      ${d.importer ? lien("/import", "📥 Importer") + lien("/nouveau", "➕ Nouveau document") : ""}${d.gerer_comptes ? lien("/utilisateurs", "👥 Utilisateurs") : ""}${d.admin ? lien("/acces", "🔑 Accès") : ""}${d.voir_journal ? lien("/journal", "📜 Journal") : ""}${d.admin ? lien("/sauvegarde", "💾 Sauvegarde") + lien("/donnees", "🗄 Mes données") : ""}
    </nav></details>` : ""}
    <h5>Classement des documents</h5><div class="tree" id="arbre"></div><h5>Rubriques</h5><div class="tree" id="rubriques"></div>
    <details class="nav-group nav-options" open><summary>Options</summary><nav class="menu">
      <a href="#" id="theme"></a>${lien("/mot-de-passe", "🔒 Mot de passe")}<a href="#" id="quitter">⏻ Quitter</a>
    </nav></details>
    <p class="n version">Archives IMF - version ${esc(S.meta.version)}</p></aside><main><div id="messages"></div><div id="contenu"></div></main></div>`;
  try { q("#racine").classList.toggle("menu-reduit", localStorage.getItem("imf_menu_reduit") === "1"); } catch (e) {}
  const menuToggle = q("#menu-toggle"), sidebar = q("#sidebar");
  function majMenuToggle() {
    const mobile = window.matchMedia("(max-width: 860px)").matches;
    const ouvert = mobile ? sidebar.classList.contains("menu-ouvert") : !q("#racine").classList.contains("menu-reduit");
    menuToggle.setAttribute("aria-expanded", String(ouvert));
    menuToggle.setAttribute("aria-label", ouvert ? "Fermer le menu" : "Ouvrir le menu");
    menuToggle.querySelector("span").textContent = ouvert ? "×" : "☰";
  }
  menuToggle.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 860px)").matches) sidebar.classList.toggle("menu-ouvert");
    else {
      const reduit = q("#racine").classList.toggle("menu-reduit");
      try { localStorage.setItem("imf_menu_reduit", reduit ? "1" : "0"); } catch (e) {}
    }
    majMenuToggle();
  });
  window.addEventListener("resize", majMenuToggle);
  sidebar.addEventListener("click", (e) => {
    if (e.target.closest('a[href^="#/"]') && window.matchMedia("(max-width: 860px)").matches) {
      sidebar.classList.remove("menu-ouvert"); majMenuToggle(); menuToggle.focus();
    }
  });
  q("#recherche-menu").addEventListener("submit", (e) => e.preventDefault());
  q("#menu-q").addEventListener("input", (e) => {
    const recherche = e.target.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    let visibles = 0;
    qa(".nav-group:not(.nav-options)").forEach((g) => {
      const liens = qa(".menu a[href^='#/']", g);
      let dansGroupe = 0;
      liens.forEach((a) => { const ok = a.textContent.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(recherche); a.hidden = !ok; if (ok) dansGroupe++; });
      g.hidden = !!recherche && dansGroupe === 0;
      if (!recherche || dansGroupe) visibles++;
    });
    q("#menu-empty").hidden = !recherche || visibles > 0;
    if (recherche) qa(".nav-group:not(.nav-options)").forEach((g) => { if (!g.hidden) g.open = true; });
  });
  q("#recherche").addEventListener("submit", (e) => { e.preventDefault(); location.hash = "#/liste?q=" + enc(new FormData(e.target).get("q")); });
  q("#theme").addEventListener("click", (e) => { e.preventDefault(); changerTheme(); }); majTheme();
  q("#quitter").addEventListener("click", async (e) => { e.preventDefault(); try { await post("/deconnexion"); } catch (x) {} S.moi = null; S.csrf = ""; location.hash = ""; demarrer(); });
  majMenuToggle();
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
  majLienActif();
}

function majLienActif() {
  const route = (location.hash.replace(/^#/, "").split("?")[0] || "/accueil");
  const cible = route.startsWith("/doc/") || route === "/mois" || route === "/liste" ? "/dossiers"
    : route === "/demandes/nouvelle" ? "/demandes/nouvelle" : route;
  qa(".nav-principal a").forEach((a) => {
    const actif = a.getAttribute("href") === "#" + cible;
    if (actif) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

// ------------------------------------------------------------------ routage
const ROUTES = [[/^\/accueil$/, vueAccueil], [/^\/dossiers$/, vueDossiers], [/^\/mois$/, vueMois], [/^\/liste$/, vueListe], [/^\/doc\/(\d+)$/, vueDoc],
  [/^\/import$/, vueImport, "importer"], [/^\/nouveau$/, vueNouveau, "importer"], [/^\/demandes$/, vueDemandes], [/^\/demandes\/nouvelle$/, vueNouvelleDemande], [/^\/utilisateurs$/, vueUtilisateurs, "gerer_comptes"],
  [/^\/acces$/, vueAcces, "admin"], [/^\/journal$/, vueJournal, "voir_journal"], [/^\/sauvegarde$/, vueSauvegarde, "admin"], [/^\/donnees$/, vueDonnees, "admin"], [/^\/mot-de-passe$/, vueMdp]];

async function route() {
  if (!S.moi || !q("#contenu")) return;
  majLienActif();
  const h = location.hash.replace(/^#/, "") || "/accueil", [chemin, qs] = h.split("?"), p = Object.fromEntries(new URLSearchParams(qs || ""));
  for (const [re, f, dr] of ROUTES) { const m = chemin.match(re); if (m) { if (dr && !droit(dr)) return contenu("<h2>Page non disponible</h2><p>Cette page n'est pas disponible pour votre compte.</p>"); return sur(() => f(p, ...m.slice(1))); } }
  contenu("<h2>Page introuvable</h2>");
}
window.addEventListener("hashchange", route);

// ------------------------------------------------------------------ accueil (tableau de bord)
const aller = (h) => { if (location.hash === h) route(); else location.hash = h; };
const contexteVues = { rafraichir, route, aller };
configurerDocuments(contexteVues);
configurerAcces(contexteVues);
configurerUtilisateurs(contexteVues);
configurerAdministration(contexteVues);
configurerExpirationSession(demarrer);

demarrer();
