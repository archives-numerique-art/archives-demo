import { API, S, q, qa, enc, esc, fr, options, droit, api, post, del, envoyer, message, sur, contenu, sur_envoi } from "../core.js";

const actions = { rafraichir: () => {}, route: () => {}, aller: () => {} };
export function configurerDocuments(context) { Object.assign(actions, context); }

export async function vueAccueil() {
  const a = await api("/accueil");
  const date = new Date(), jour = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const carte = (cl, ic, n, lb, detail, lien) => `<a class="dashboard-metric ${cl}" href="#${lien}" aria-label="${esc(lb)} : ${n}. ${esc(detail)}">
    <span class="dashboard-metric-icon" aria-hidden="true">${ic}</span>
    <span class="dashboard-metric-content"><span class="dashboard-metric-label">${esc(lb)}</span><strong class="dashboard-metric-value">${n}</strong><span class="dashboard-metric-detail">${esc(detail)}</span></span>
    <span class="dashboard-metric-arrow" aria-hidden="true">→</span></a>`;
  const documents = a.dernier
    ? `<a class="dashboard-latest-link" href="#/doc/${a.dernier.id}">
        <span class="dashboard-latest-icon" aria-hidden="true">📄</span>
        <span class="dashboard-latest-copy"><span class="dashboard-latest-number">${esc(a.dernier.num)}</span><strong>${esc(a.dernier.titre || "Document sans titre")}</strong><span class="dashboard-latest-date">Enregistré le ${fr(a.dernier.cree)}</span></span>
        <span class="dashboard-latest-arrow" aria-hidden="true">→</span>
      </a>`
    : `<div class="dashboard-empty"><span aria-hidden="true">📂</span><p>Aucun document enregistré pour le moment.</p></div>`;
  contenu(`<header class="dashboard-heading">
      <div><p class="eyebrow">Archives IMF</p><h2>Tableau de bord</h2><p class="muted">Suivez l’activité des archives et accédez rapidement à vos priorités.</p></div>
      <div class="dashboard-period"><span>Période en cours</span><strong>${esc(a.mois_libelle)}</strong></div>
    </header>
    <section class="dashboard-metrics" aria-label="Indicateurs des archives">
      ${carte("metric-blue", "📚", a.total, "Documents consultables", a.departements + (a.departements === 1 ? " département couvert" : " départements couverts"), "/dossiers")}
      ${carte("metric-green", "🆕", a.ce_mois, "Enregistrés ce mois-ci", a.mois_libelle, "/liste?cree=" + jour.slice(0, 7))}
      ${carte("metric-orange", "📨", a.demandes, a.demandes_libelle, "Accéder au suivi des demandes", "/demandes")}
      ${carte("metric-red", "📥", a.aujourdhui, "Enregistrés aujourd’hui", "Ajouts du jour", "/liste?cree=" + jour)}
    </section>
    <section class="dashboard-panels">
      <article class="card dashboard-panel">
        <header class="dashboard-panel-heading"><div><p class="eyebrow">Activité récente</p><h3>Dernier enregistrement</h3></div></header>
        ${documents}
      </article>
      <article class="card dashboard-panel">
        <header class="dashboard-panel-heading"><div><p class="eyebrow">Raccourcis</p><h3>Actions rapides</h3></div></header>
        <nav class="dashboard-actions" aria-label="Actions rapides">
          <a href="#/dossiers"><span class="dashboard-action-icon" aria-hidden="true">⌕</span><span><strong>Parcourir les archives</strong><small>Rechercher un document</small></span><span class="dashboard-action-arrow" aria-hidden="true">→</span></a>
          ${droit("importer") ? `<a href="#/import"><span class="dashboard-action-icon" aria-hidden="true">↑</span><span><strong>Importer des documents</strong><small>Ajouter des scans aux archives</small></span><span class="dashboard-action-arrow" aria-hidden="true">→</span></a>` : ""}
          <a href="#/demandes/nouvelle"><span class="dashboard-action-icon" aria-hidden="true">＋</span><span><strong>Demander un accès</strong><small>Accéder à un document protégé</small></span><span class="dashboard-action-arrow" aria-hidden="true">→</span></a>
        </nav>
      </article>
    </section>
    ${a.partages.length ? `<section class="card dashboard-panel dashboard-shares">
      <header class="dashboard-panel-heading"><div><p class="eyebrow">Accès temporaire</p><h3>Documents partagés avec vous</h3></div><span class="dashboard-count">${a.partages.length}</span></header>
      <div class="dashboard-share-list">${a.partages.map((r) => `<a href="#/doc/${r.id}"><span class="dashboard-share-number">${esc(r.num)}</span><span class="dashboard-share-title">${esc(r.titre)}</span><span class="dashboard-share-department">${esc(r.service || "—")}</span><span class="dashboard-action-arrow" aria-hidden="true">→</span></a>`).join("")}</div>
    </section>` : ""}
    <details class="card dashboard-guide"><summary>Repères d’utilisation</summary><ul>
      <li>Parcourez les archives ou utilisez la recherche pour retrouver un document.</li>
      <li>Les documents confidentiels nécessitent un accès autorisé ; une demande peut être faite depuis « Demander un accès ».</li>
      ${droit("importer") ? "<li>Importez un ou plusieurs scans depuis « Importer des documents ».</li>" : ""}
    </ul></details>`);
}

// ------------------------------------------------------------------ dossiers : années > mois > départements
export async function vueDossiers(p = {}) {
  return vueListe(p);
}

export async function vueMois(p) {
  const m = p.m || "", dep = {};
  S.nav.arbre.forEach((y) => y.mois.forEach((x) => { if (x.mois.startsWith(m)) x.departements.forEach((d) => { dep[d.valeur] = (dep[d.valeur] || { nom: d.nom, total: 0 }); dep[d.valeur].total += d.total; }); }));
  const lib = m.length === 4 ? "Année " + m : ((S.nav.arbre.flatMap((y) => y.mois).find((x) => x.mois === m) || {}).libelle || m);
  contenu(`<p><a href="#/dossiers">Retour aux mois</a></p><h3>${esc(lib)} : choisissez un département</h3>${Object.entries(dep).map(([v, d]) =>
    `<div class="card"><a href="#/liste?mois=${enc(m)}&dept=${enc(v)}"><b>📁 ${esc(d.nom)}</b></a> <span class="muted">- ${d.total} document(s)</span></div>`).join("") || "<p class='muted'>Aucun document.</p>"}`);
}

// ------------------------------------------------------------------ liste des documents
export async function vueListe(p) {
  const filtreCreation = /^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(p.cree || "") ? p.cree : "";
  const moisValide = /^\d{4}-(0[1-9]|1[0-2])$/.test(p.date_debut || "") ? p.date_debut : "";
  const moisFinValide = /^\d{4}-(0[1-9]|1[0-2])$/.test(p.date_fin || "") ? p.date_fin : "";
  const plageInvalide = moisValide && moisFinValide && moisValide > moisFinValide;
  const filtresApi = new URLSearchParams(p); filtresApi.delete("cree"); filtresApi.delete("date_debut"); filtresApi.delete("date_fin");
  const d = await api("/documents?" + filtresApi), sup = droit("supprimer");
  const documents = d.documents.filter((r) => {
    if (plageInvalide) return false;
    if (filtreCreation && (filtreCreation.length === 7 ? !(r.cree || "").startsWith(filtreCreation) : r.cree !== filtreCreation)) return false;
    if (moisValide || moisFinValide) {
      const moisClassement = (r.date || "").slice(0, 7);
      if (!moisClassement || (moisValide && moisClassement < moisValide) || (moisFinValide && moisClassement > moisFinValide)) return false;
    }
    return true;
  });
  const filtreClientActif = !!(filtreCreation || moisValide || moisFinValide);
  const total = filtreClientActif ? documents.length : d.total;
  const limiteApi = d.total > d.documents.length;
  const departements = S.nav.departements || [];
  const nomDept = p.dept ? ((departements.find((x) => x.valeur === p.dept) || {}).nom || (p.dept === "~" ? "(sans département)" : p.dept)) : "";
  const libelleMois = (m) => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"));
  const valeurCreation = filtreCreation ? (filtreCreation.length === 7
    ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(filtreCreation + "-01T00:00:00Z"))
    : fr(filtreCreation)) : "";
  const actifs = [["q", p.q, "Recherche"], ["niveau", p.niveau, "Niveau"], ["type", p.type, "Type"], ["etat", p.etat, "État"], ["tri", p.tri === "date" ? "Plus récents d'abord" : "", "Tri"], ["dept", nomDept, "Département"], ["mois", p.mois, "Période"], ["date_debut", moisValide ? libelleMois(moisValide) : "", "Date de début"], ["date_fin", moisFinValide ? libelleMois(moisFinValide) : "", "Date de fin"], ["cree", valeurCreation, "Création"]].filter((x) => x[1]);
  const nombreFiltres = actifs.filter(([k]) => k !== "q").length;
  const puces = actifs.map(([k, v, label]) => {
    const restant = new URLSearchParams(p); restant.delete(k);
    return `<a class="filter-chip" href="#/liste${restant.toString() ? "?" + restant : ""}" aria-label="Retirer le filtre ${esc(label)} : ${esc(v)}"><span>${esc(label)} : ${esc(v)}</span><span aria-hidden="true">×</span></a>`;
  }).join("");
  const lignes = documents.map((r) => `<tr>
      ${sup ? `<td class="select-cell"><input type="checkbox" class="coche" value="${r.id}" aria-label="Sélectionner ${esc(r.num)}"></td>` : ""}
      <td class="doc-cell"><a class="doc-link" href="${r.acces && r.a_fichier ? `${API}/documents/${r.id}/fichier` : "#/doc/" + r.id}" ${r.acces && r.a_fichier ? 'target="_blank" rel="noopener"' : ""}><b>${esc(r.num)}</b><span>${esc(r.titre)}</span></a></td>
      <td class="department-cell">${esc(r.service || "—")}</td><td class="type-cell">${esc(r.type)}</td><td class="date-cell">${fr(r.date)}</td>
      <td><span class="tag n-${esc(r.niveau)}">${esc(r.niveau)}</span></td><td><span class="tag">${esc(r.etat)}</span>${r.acces ? "" : `<span class="sr-only">, accès restreint</span>`}</td>
      <td class="actions-cell"><details class="row-menu"><summary aria-label="Actions pour ${esc(r.num)}">⋯</summary><div class="row-menu-items">
        ${r.acces && r.a_fichier
    ? `<a href="${API}/documents/${r.id}/fichier" target="_blank" rel="noopener"><span class="row-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg></span><span>Ouvrir le document</span></a>`
    : `<a href="#/doc/${r.id}"><span class="row-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg></span><span>${r.acces ? "Voir les informations" : "Voir les informations / accès"}</span></a>`}
        ${sup ? `<button type="button" class="row-delete" data-id="${r.id}"><span class="row-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"></path></svg></span><span>Supprimer</span></button>` : ""}
      </div></details></td>
    </tr>`).join("");
  contenu(`<header class="page-heading"><div><p class="eyebrow">Archives</p><h2>Documents</h2><p class="muted">${p.dept ? "Département : " + esc(nomDept) + " · " : ""}${p.mois ? "Période : " + esc(p.mois) + " · " : ""}${moisValide ? "Du " + esc(libelleMois(moisValide)) + " · " : ""}${moisFinValide ? "au " + esc(libelleMois(moisFinValide)) + " · " : ""}${valeurCreation ? "Création " + esc(valeurCreation) + " · " : ""}${total} document(s)</p></div>
      ${droit("importer") ? `<div class="page-actions"><a class="button button-secondary" href="#/import">Importer</a><a class="button" href="#/nouveau">+ Nouveau document</a></div>` : ""}</header>
    <form class="card table-toolbar" id="filtre">
      <div class="table-search-row">
        <label class="table-search">Rechercher dans les documents<input name="q" type="search" placeholder="Nom, numéro, département…" value="${esc(p.q || "")}"></label>
        <button type="submit">Rechercher</button>
      </div>
      <details class="filter-panel" ${actifs.length || plageInvalide ? "open" : ""}>
        <summary><span class="filter-summary-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z"></path></svg></span>
          <span class="filter-show">Afficher les filtres</span><span class="filter-hide">Masquer les filtres</span>
          ${nombreFiltres ? `<span class="filter-count">${nombreFiltres} actif(s)</span>` : ""}
        </summary>
        <div class="filter-grid">
          <label>Niveau<select name="niveau">${options(S.meta.niveaux, p.niveau, "Tous les niveaux")}</select></label>
          <label>Type<select name="type">${options(S.meta.types, p.type, "Tous les types")}</select></label>
          <label>État<select name="etat">${options(S.meta.etats, p.etat, "Tous les états")}</select></label>
          <label>Département<select name="dept"><option value="">Tous les départements</option>${departements.map((x) => `<option value="${esc(x.valeur)}" ${x.valeur === p.dept ? "selected" : ""}>${esc(x.nom)}</option>`).join("")}${p.dept && !departements.some((x) => x.valeur === p.dept) ? `<option value="${esc(p.dept)}" selected>${esc(nomDept)}</option>` : ""}</select></label>
          <label>Date de début<span class="sr-only"> du mois de classement</span><input name="date_debut" type="month" value="${esc(moisValide)}"></label>
          <label>Date de fin<span class="sr-only"> du mois de classement</span><input name="date_fin" type="month" value="${esc(moisFinValide)}"></label>
          <label>Trier par<select name="tri"><option value="">Ordre alphabétique</option><option value="date" ${p.tri === "date" ? "selected" : ""}>Plus récents</option></select></label>
          <input type="hidden" name="mois" value="${esc(p.mois || "")}">
          <input type="hidden" name="cree" value="${esc(filtreCreation)}">
          <p class="filter-error" id="range-error" role="alert" ${plageInvalide ? "" : "hidden"}>La date de début doit être antérieure ou égale à la date de fin.</p>
          <div class="toolbar-actions"><button type="submit">Appliquer les filtres</button>${actifs.length ? `<a class="button button-quiet" href="#/liste">Tout effacer</a>` : ""}</div>
        </div>
      </details>
    </form>
    ${puces ? `<div class="active-filters" aria-label="Filtres appliqués"><span>Filtres appliqués (${actifs.length})</span>${puces}</div>` : ""}
    <section class="card table-card" aria-label="Liste des documents">
      ${sup && documents.length ? `<div class="selection-bar"><label><input type="checkbox" id="tout" aria-label="Tout sélectionner les documents"> Tout sélectionner</label><span id="selection-count" class="muted" aria-live="polite">Aucune ligne sélectionnée</span><button class="danger" id="suppr" type="button" disabled>Supprimer la sélection</button></div>` : ""}
      ${documents.length ? `<div class="table-wrap"><table class="data-table"><caption class="sr-only">Documents correspondant aux critères appliqués</caption><thead><tr>${sup ? `<th class="select-cell" scope="col"><span class="sr-only">Sélection</span></th>` : ""}<th scope="col">Document</th><th scope="col">Département</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col">Niveau</th><th scope="col">État</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${lignes}</tbody></table></div>
        ${limiteApi ? `<p class="muted table-footnote">${documents.length} résultat(s) parmi les ${d.documents.length} documents reçus. L’API limite actuellement la liste à 2 000 documents.</p>` : `<p class="muted table-footnote">${total} résultat(s)</p>`}`
        : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><h3>${actifs.length ? "Aucun résultat" : "Aucun document à afficher"}</h3><p>${actifs.length ? "Modifiez ou réinitialisez vos critères de recherche." : "Les documents visibles apparaîtront ici."}</p>${actifs.length ? `<a class="button button-secondary" href="#/liste">Effacer les filtres</a>` : ""}</div>${limiteApi && filtreClientActif ? `<p class="muted table-footnote">Filtre appliqué aux ${d.documents.length} documents reçus ; l’API limite la liste à 2 000, le total complet peut différer.</p>` : ""}`}
    </section>`);
  q("#filtre").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target), debut = fd.get("date_debut"), fin = fd.get("date_fin"), erreur = q("#range-error");
    if (debut && fin && debut > fin) { erreur.hidden = false; q('[name="date_fin"]').focus(); return; }
    erreur.hidden = true;
    const f = new URLSearchParams(); fd.forEach((v, k) => { if (v) f.set(k, v); });
    if (debut || fin) f.delete("mois");
    location.hash = "#/liste" + (f.toString() ? "?" + f : "");
  });
  qa('#filtre [name="date_debut"], #filtre [name="date_fin"]').forEach((input) => input.addEventListener("change", () => { const erreur = q("#range-error"); if (erreur) erreur.hidden = true; }));
  const majSelection = () => {
    const coches = qa(".coche"), choisis = coches.filter((c) => c.checked).length, total = coches.length;
    const compteur = q("#selection-count"), supprimer = q("#suppr"), tout = q("#tout");
    if (compteur) compteur.textContent = choisis ? choisis + " ligne(s) sélectionnée(s)" : "Aucune ligne sélectionnée";
    if (supprimer) supprimer.disabled = !choisis;
    if (tout) { tout.checked = total > 0 && choisis === total; tout.indeterminate = choisis > 0 && choisis < total; }
  };
  const tout = q("#tout"); if (tout) tout.addEventListener("change", () => { qa(".coche").forEach((c) => (c.checked = tout.checked)); majSelection(); });
  qa(".coche").forEach((c) => c.addEventListener("change", majSelection));
  const supprimerDocuments = async (ids) => {
    if (!confirm(ids.length === 1 ? "Supprimer définitivement ce document ?" : "Supprimer définitivement " + ids.length + " document(s) ?")) return;
    const r = await post("/documents/supprimer", { ids }); message(r.supprimes + " document(s) supprimé(s)."); await actions.rafraichir(); actions.route();
  };
  const b = q("#suppr"); if (b) b.addEventListener("click", () => sur(async () => {
    const ids = qa(".coche").filter((c) => c.checked).map((c) => +c.value); if (!ids.length) return message("Cochez au moins un document.", "erreur");
    await supprimerDocuments(ids);
  }));
  qa(".row-delete").forEach((b) => b.addEventListener("click", () => sur(async () => { await supprimerDocuments([+b.dataset.id]); })));
}

// ------------------------------------------------------------------ fiche d'un document
export async function vueDoc(p, id) {
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
  const s = q("#suppr"); if (s) s.addEventListener("click", () => sur(async () => { if (!confirm("Supprimer définitivement ce document ?")) return; await post("/documents/supprimer", { ids: [d.id] }); message("Document supprimé."); await actions.rafraichir(); location.hash = "#/liste"; }));
  sur_envoi("#partage", async (f, fd) => { await post("/documents/" + d.id + "/partager", { user: +fd.get("user"), jours: +fd.get("jours"), note: fd.get("note") }); message("Document partagé."); actions.route(); });
  qa(".retirer").forEach((b) => b.addEventListener("click", () => sur(async () => { await del("/documents/" + d.id + "/partages/" + b.dataset.rid); message("Partage retiré."); actions.route(); })));
}

// ------------------------------------------------------------------ importer / nouveau document
export async function vueImport() {
  const dep = await api("/departements"), mois = new Date().toISOString().slice(0, 7);
  contenu(`<header class="page-heading"><div><p class="eyebrow">Gestion des archives</p><h2>Importer des documents</h2><p class="muted">Ajoutez plusieurs scans à la fois et classez-les ensemble.</p></div></header>
    <form class="card workflow-form" id="imp">
      <section class="form-section"><h3>Classement commun</h3><p class="section-hint">Ces informations seront appliquées à tous les fichiers importés.</p>
        <div class="form-grid">
          <label class="field">Mois de classement<input type="month" name="mois" value="${mois}" required></label>
          <label class="field">Département<select name="service" required><option value="">Choisir un département</option>${options(dep.tous)}</select></label>
          <label class="field">Type de document<select name="type">${options(S.meta.types)}</select></label>
          <label class="field">Niveau d'accès<select name="niveau">${options(S.meta.niveaux, "Interne")}</select></label>
          <label class="field field-full">Emplacement <span class="field-hint">Facultatif</span><input name="emplacement" placeholder="Ex. A1 - E2 - B0"></label>
        </div>
      </section>
      <section class="form-section"><h3>Fichiers à importer</h3><p class="section-hint">Formats acceptés : PDF, JPG et PNG.</p>
        <div class="file-pickers">
          <label class="dropzone" for="fichiers"><span class="dropzone-icon" aria-hidden="true">↑</span><b>Choisir des fichiers</b><span>Vous pouvez en sélectionner plusieurs.</span><input type="file" id="fichiers" multiple accept=".pdf,.jpg,.jpeg,.png" aria-describedby="file-hint"></label>
          <label class="dropzone folder-picker" for="dossier"><span class="dropzone-icon" aria-hidden="true">▧</span><b>Choisir un dossier</b><span>Importer les fichiers qu'il contient.</span><input type="file" id="dossier" webkitdirectory multiple aria-describedby="file-hint"></label>
        </div>
        <p id="file-hint" class="field-hint">Les extensions non prises en charge seront ignorées par le serveur.</p>
        <div class="file-summary" id="file-summary" hidden aria-live="polite"><b id="file-count"></b><ul id="file-list"></ul></div>
        <p class="form-error" id="file-error" role="alert" hidden></p>
        <div class="progress" id="barre" role="progressbar" aria-label="Progression de l'import" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><i></i></div>
        <p class="field-hint" id="progress-label" aria-live="polite" hidden></p>
      </section>
      <div class="form-actions"><a class="button button-secondary" href="#/dossiers">Annuler</a><button id="go" type="submit">Importer les fichiers</button></div>
    </form>`);
  const choisirFichiers = q("#fichiers"), choisirDossier = q("#dossier");
  function majFichiers() {
    const fichiers = [...choisirFichiers.files, ...choisirDossier.files], prisEnCharge = fichiers.filter((f) => /\.(pdf|jpe?g|png)$/i.test(f.name));
    const resume = q("#file-summary"), liste = q("#file-list");
    resume.hidden = fichiers.length === 0;
    q("#file-count").textContent = fichiers.length
      ? `${fichiers.length} fichier(s) sélectionné(s) · ${prisEnCharge.length} au format accepté${fichiers.length > prisEnCharge.length ? ` · ${fichiers.length - prisEnCharge.length} seront ignorés` : ""}`
      : "";
    liste.replaceChildren();
    fichiers.slice(0, 5).forEach((f) => { const li = document.createElement("li"); li.textContent = f.webkitRelativePath || f.name; liste.appendChild(li); });
    if (fichiers.length > 5) { const li = document.createElement("li"); li.textContent = `et ${fichiers.length - 5} autre(s)…`; liste.appendChild(li); }
    q("#file-error").hidden = true;
  }
  choisirFichiers.addEventListener("change", majFichiers);
  choisirDossier.addEventListener("change", majFichiers);
  sur_envoi("#imp", async (f, fd) => {
    const fichiers = [...choisirFichiers.files, ...choisirDossier.files];
    if (!fichiers.length) { q("#file-error").textContent = "Choisissez des fichiers ou un dossier avant de lancer l'import."; q("#file-error").hidden = false; choisirFichiers.focus(); return; }
    const form = new FormData(); ["mois", "service", "type", "niveau", "emplacement"].forEach((k) => form.append(k, fd.get(k))); fichiers.forEach((x) => form.append("fichiers", x, x.name));
    q("#go").disabled = true; q("#go").textContent = "Import en cours…";
    q("#barre").hidden = false; q("#progress-label").hidden = false; q("#progress-label").textContent = "Préparation de l'envoi…";
    try {
      const r = await envoyer("/documents/import", form, (n) => {
        q("#barre i").style.width = n + "%"; q("#barre").setAttribute("aria-valuenow", String(n)); q("#progress-label").textContent = `Envoi des fichiers : ${n} %`;
      });
      message(r.importes + " fichier(s) importé(s)" + (r.ignores ? ", " + r.ignores + " ignoré(s) (type non accepté)" : "") + "."); await actions.rafraichir(); actions.aller("#/mois?m=" + r.mois);
    } finally { const b = q("#go"); if (b) { b.disabled = false; b.textContent = "Importer les fichiers"; } }
  });
}

export async function vueNouveau() {
  const dep = await api("/departements"), auj = new Date().toISOString().slice(0, 10);
  contenu(`<header class="page-heading"><div><p class="eyebrow">Gestion des archives</p><h2>Nouveau document</h2><p class="muted">Renseignez les informations de classement et ajoutez le scan si vous l'avez.</p></div></header>
    <form class="card workflow-form" id="nv">
      <section class="form-section"><h3>Identification</h3><div class="form-grid">
        <label class="field field-full">Titre du document<input name="titre" maxlength="200" required placeholder="Nom, prénom ou description"></label>
        <label class="field">Département<select name="service" required><option value="">Choisir un département</option>${options(dep.tous)}</select></label>
        <label class="field">Type de document<select name="type">${options(S.meta.types)}</select></label>
      </div></section>
      <section class="form-section"><h3>Classement et accès</h3><div class="form-grid">
        <label class="field">Niveau d'accès<select name="niveau">${options(S.meta.niveaux, "Interne")}</select></label>
        <label class="field">Date de classement<input type="date" name="date" value="${auj}"></label>
        <label class="field">État<select name="etat">${options(S.meta.etats, "À scanner")}</select></label>
        <label class="field">Emplacement <span class="field-hint">Facultatif</span><input name="emplacement" maxlength="80" placeholder="Ex. A1 - E2 - B0"></label>
      </div></section>
      <section class="form-section"><h3>Scan</h3><label class="dropzone single-file-picker" for="fichier"><span class="dropzone-icon" aria-hidden="true">↑</span><b>Ajouter un fichier scanné</b><span>PDF, JPG ou PNG · facultatif</span><input type="file" id="fichier" name="fichier" accept=".pdf,.jpg,.jpeg,.png"></label></section>
      <div class="form-actions"><a class="button button-secondary" href="#/dossiers">Annuler</a><button type="submit">Enregistrer le document</button></div>
    </form>`);
  const fichier = q("#fichier");
  fichier.addEventListener("change", () => {
    const zone = fichier.closest(".dropzone"), titre = zone.querySelector("b"), detail = zone.querySelector("span:not(.dropzone-icon)");
    titre.textContent = fichier.files.length ? fichier.files[0].name : "Ajouter un fichier scanné";
    detail.textContent = fichier.files.length ? "Fichier prêt à être enregistré" : "PDF, JPG ou PNG · facultatif";
  });
  sur_envoi("#nv", async (f, fd) => { if (!fd.get("fichier").name) fd.delete("fichier"); const r = await api("/documents", { methode: "POST", form: fd }); message("Document enregistré : " + r.num); await actions.rafraichir(); actions.aller("#/doc/" + r.id); });
}

// ------------------------------------------------------------------ demandes d'accès
