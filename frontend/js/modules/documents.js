import { API, S, q, qa, enc, esc, fr, options, droit, api, post, del, envoyer, message, sur, contenu, sur_envoi } from "../core.js";

const actions = { rafraichir: () => {}, route: () => {}, aller: () => {} };
export function configurerDocuments(context) { Object.assign(actions, context); }

export async function vueAccueil() {
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
export async function vueDossiers() {
  const arbre = S.nav.arbre;
  contenu(`<h2>Choisissez un mois</h2>${arbre.map((y) => `<h4><a href="#/mois?m=${y.annee}">Année ${esc(y.annee)}</a> <span class="muted">- ${y.total} document(s), tous les mois</span></h4>${y.mois.map((m) =>
    `<div class="card"><a href="#/mois?m=${m.mois}"><b>📁 ${esc(m.libelle)}</b></a> <span class="muted">- ${m.total} document(s)</span></div>`).join("")}`).join("") || "<p class='muted'>Aucun document pour le moment.</p>"}`);
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
  const d = await api("/documents?" + new URLSearchParams(p)), sup = droit("supprimer");
  const nomDept = p.dept ? (p.dept === "~" ? "(sans département)" : p.dept) : "";
  const actifs = [["q", p.q, "Recherche"], ["niveau", p.niveau, "Niveau"], ["type", p.type, "Type"], ["tri", p.tri === "date" ? "Plus récents d'abord" : "", "Tri"], ["dept", nomDept, "Département"], ["mois", p.mois, "Mois"]].filter((x) => x[1]);
  const puces = actifs.map(([k, v, label]) => {
    const restant = new URLSearchParams(p); restant.delete(k);
    return `<a class="filter-chip" href="#/liste${restant.toString() ? "?" + restant : ""}">${esc(label)} : ${esc(v)} <span aria-hidden="true">×</span><span class="sr-only">, retirer ce filtre</span></a>`;
  }).join("");
  const lignes = d.documents.map((r) => `<tr>
      ${sup ? `<td class="select-cell"><input type="checkbox" class="coche" value="${r.id}" aria-label="Sélectionner ${esc(r.num)}"></td>` : ""}
      <td><a class="doc-link" href="#/doc/${r.id}"><b>${esc(r.num)}</b><span>${esc(r.titre)}</span></a></td>
      <td>${esc(r.service || "—")}</td><td>${esc(r.type)}</td><td>${fr(r.date)}</td>
      <td><span class="tag n-${esc(r.niveau)}">${esc(r.niveau)}</span></td><td><span class="tag">${esc(r.etat)}</span>${r.acces ? "" : `<span class="sr-only">, accès restreint</span>`}</td>
      <td><details class="row-menu"><summary aria-label="Actions pour ${esc(r.num)}">⋯</summary><div class="row-menu-items"><a href="#/doc/${r.id}">Ouvrir la fiche</a></div></details></td>
    </tr>`).join("");
  contenu(`<header class="page-heading"><div><p class="eyebrow">Archives</p><h2>Documents</h2><p class="muted">${p.dept ? "Département : " + esc(nomDept) + " · " : ""}${p.mois ? "Période : " + esc(p.mois) + " · " : ""}${d.total} document(s)</p></div>
      ${droit("importer") ? `<div class="page-actions"><a class="button button-secondary" href="#/import">Importer</a><a class="button" href="#/nouveau">+ Nouveau document</a></div>` : ""}</header>
    <form class="card table-toolbar" id="filtre">
      <label class="table-search">Rechercher dans les documents<input name="q" type="search" placeholder="Nom, numéro, département…" value="${esc(p.q || "")}"></label>
      <label>Niveau<select name="niveau">${options(S.meta.niveaux, p.niveau, "Tous les niveaux")}</select></label>
      <label>Type<select name="type">${options(S.meta.types, p.type, "Tous les types")}</select></label>
      <label>Trier par<select name="tri"><option value="">Ordre alphabétique</option><option value="date" ${p.tri === "date" ? "selected" : ""}>Plus récents</option></select></label>
      <input type="hidden" name="mois" value="${esc(p.mois || "")}"><input type="hidden" name="dept" value="${esc(p.dept || "")}">
      <div class="toolbar-actions"><button type="submit">Rechercher</button>${actifs.length ? `<a class="button button-quiet" href="#/liste">Réinitialiser</a>` : ""}</div>
    </form>
    ${puces ? `<div class="active-filters" aria-label="Filtres actifs"><span>Filtres actifs</span>${puces}</div>` : ""}
    <section class="card table-card" aria-label="Liste des documents">
      ${sup && d.documents.length ? `<div class="selection-bar"><label><input type="checkbox" id="tout" aria-label="Tout sélectionner les documents"> Tout sélectionner</label><span id="selection-count" class="muted">Aucune ligne sélectionnée</span><button class="danger" id="suppr" type="button" disabled>Supprimer la sélection</button></div>` : ""}
      ${d.documents.length ? `<div class="table-wrap"><table class="data-table"><thead><tr>${sup ? `<th class="select-cell"><span class="sr-only">Sélection</span></th>` : ""}<th>Document</th><th>Département</th><th>Type</th><th>Date</th><th>Niveau</th><th>État</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${lignes}</tbody></table></div>
        ${d.total > d.documents.length ? `<p class="muted table-footnote">${d.documents.length} résultats affichés sur ${d.total}. L’API limite actuellement la liste à 2 000 documents.</p>` : `<p class="muted table-footnote">${d.total} résultat(s)</p>`}`
        : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><h3>${actifs.length ? "Aucun résultat" : "Aucun document à afficher"}</h3><p>${actifs.length ? "Modifiez ou réinitialisez vos critères de recherche." : "Les documents visibles apparaîtront ici."}</p>${actifs.length ? `<a class="button button-secondary" href="#/liste">Effacer les filtres</a>` : ""}</div>`}
    </section>`);
  q("#filtre").addEventListener("submit", (e) => { e.preventDefault(); const f = new URLSearchParams(); new FormData(e.target).forEach((v, k) => { if (v) f.set(k, v); }); location.hash = "#/liste?" + f; });
  const majSelection = () => {
    const coches = qa(".coche"), choisis = coches.filter((c) => c.checked).length, total = coches.length;
    const compteur = q("#selection-count"), supprimer = q("#suppr"), tout = q("#tout");
    if (compteur) compteur.textContent = choisis ? choisis + " ligne(s) sélectionnée(s)" : "Aucune ligne sélectionnée";
    if (supprimer) supprimer.disabled = !choisis;
    if (tout) { tout.checked = total > 0 && choisis === total; tout.indeterminate = choisis > 0 && choisis < total; }
  };
  const tout = q("#tout"); if (tout) tout.addEventListener("change", () => { qa(".coche").forEach((c) => (c.checked = tout.checked)); majSelection(); });
  qa(".coche").forEach((c) => c.addEventListener("change", majSelection));
  const b = q("#suppr"); if (b) b.addEventListener("click", () => sur(async () => {
    const ids = qa(".coche").filter((c) => c.checked).map((c) => +c.value); if (!ids.length) return message("Cochez au moins un document.", "erreur");
    if (!confirm("Supprimer définitivement " + ids.length + " document(s) ?")) return;
    const r = await post("/documents/supprimer", { ids }); message(r.supprimes + " document(s) supprimé(s)."); await actions.rafraichir(); actions.route();
  }));
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
