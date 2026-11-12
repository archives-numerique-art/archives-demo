import { q, esc, droit, api, post, put, message, sur, contenu, qa, sur_envoi } from "../core.js";

const actions = { rafraichir: () => {}, route: () => {}, aller: () => {} };
export function configurerUtilisateurs(context) { Object.assign(actions, context); }

export const DRAPEAUX = { comptes: "Peut créer des comptes", accorde: "Peut accorder les accès", archiviste: "Peut ajouter et supprimer des documents", confid: "Peut voir les documents confidentiels", journal: "Peut consulter le journal" };

export async function vueUtilisateurs() {
  const u = await api("/utilisateurs"), dep = await api("/departements"), adm = droit("admin"), roles = Object.entries(u.roles);
  const optRole = (c) => roles.map(([k, v]) => `<option value="${k}" ${k === c ? "selected" : ""}>${esc(v)}</option>`).join("");
  const optDep = (c) => `<option value="" ${c ? "" : "selected"}>Aucun département</option>` + dep.tous.map((x) => `<option value="${esc(x)}" ${x === c ? "selected" : ""}>${esc(x)}</option>`).join("");
  const clesDroits = Object.keys(DRAPEAUX);
  const entetesDroits = adm ? clesDroits.map((k) => `<th scope="col" title="${esc(DRAPEAUX[k])}">${esc({ comptes: "Comptes", accorde: "Accès", archiviste: "Archives", confid: "Confidentiel", journal: "Journal" }[k])}</th>`).join("") : "<th scope=\"col\">Autorisations</th>";
  const cellulesDroits = (x, formulaire) => adm
    ? clesDroits.map((k) => `<td class="user-right">${x.modifiable
      ? `<label><input type="checkbox" name="${k}" form="${formulaire}" aria-label="${esc(DRAPEAUX[k])} : ${esc(x.nom)}" ${x.drapeaux[k] ? "checked" : ""}></label>`
      : `<span class="permission-state${x.drapeaux[k] ? " granted" : ""}" aria-label="${esc(DRAPEAUX[k])} : ${x.drapeaux[k] ? "accordé" : "non accordé"}">${x.drapeaux[k] ? "✓" : "—"}</span>`}</td>`).join("")
    : `<td><span class="muted">Selon le rôle</span></td>`;
  const lignes = u.utilisateurs.map((x) => {
    const formId = `modifier-utilisateur-${x.id}`;
    const cellules = x.modifiable
      ? `<td><form class="u-edit" id="${formId}" data-id="${x.id}"></form><select name="role" form="${formId}" aria-label="Rôle de ${esc(x.nom)}">${optRole(x.role)}</select></td>
          <td><select name="departement" form="${formId}" aria-label="Département de ${esc(x.nom)}">${optDep(x.departement)}</select></td>
          ${cellulesDroits(x, formId)}
          <td><details class="password-reset"><summary>Mot de passe</summary><form class="u-mdp" data-id="${x.id}">
            <label class="sr-only" for="mdp-${x.id}">Nouveau mot de passe temporaire pour ${esc(x.nom)}</label><input id="mdp-${x.id}" name="mdp" type="password" placeholder="8 caractères minimum" minlength="8" required autocomplete="new-password">
            <button type="submit">Réinitialiser</button></form></details></td>
          <td><button class="row-save" type="submit" form="${formId}">Enregistrer</button></td>`
      : `<td>${esc(x.role_libelle)}</td><td>${esc(x.departement || "—")}</td>${cellulesDroits(x, formId)}
          <td><span class="user-badge protected">Protégé</span></td><td><span class="muted">—</span></td>`;
    const initiales = x.nom.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
    return `<tr class="user-row" data-search="${esc([x.nom, x.role_libelle, x.departement].join(" "))}">
      <th scope="row"><span class="user-identity"><span class="user-avatar" aria-hidden="true">${esc(initiales)}</span><span class="user-name">${esc(x.nom)}${x.modifiable ? "" : `<span class="sr-only">, compte protégé</span>`}</span></span></th>${cellules}</tr>`;
  }).join("");
  contenu(`<header class="page-heading"><div><p class="eyebrow">Administration</p><h2>Comptes utilisateurs</h2><p class="muted">Gérez les comptes, les rôles et les autorisations de l’application.</p></div><button class="button" id="focus-create-user" type="button">+ Nouveau compte</button></header>
    <form class="card workflow-form user-create" id="u-new"><section class="form-section" id="nouvel-utilisateur"><div class="section-heading"><div><h3>Créer un compte</h3><p class="section-hint">Un mot de passe temporaire sera demandé à la première connexion.</p></div><span class="user-step">Nouveau compte</span></div>
      <div class="form-grid">
        <label class="field">Nom du compte<input name="nom" placeholder="Nom de la personne" required autocomplete="off"></label>
        <label class="field">Rôle<select name="role">${optRole("agent")}</select></label>
        <label class="field">Département<select name="departement">${optDep("")}</select></label>
        <label class="field">Mot de passe temporaire<input name="mdp" type="password" placeholder="8 caractères minimum" minlength="8" required autocomplete="new-password"><span class="field-hint">Au moins 8 caractères.</span></label>
      </div><div class="form-actions"><button type="submit">Créer le compte</button></div>
    </section></form>
    <section class="users-section"><div class="section-heading"><div><p class="eyebrow">Comptes et accès</p><h3>Utilisateurs existants</h3></div><span class="user-total" id="users-count">${u.utilisateurs.length} compte(s)</span></div>
      <form class="card table-toolbar users-toolbar" id="users-search"><label class="table-search">Rechercher un compte<input type="search" name="q" placeholder="Nom, rôle ou département…" autocomplete="off"></label><span class="users-search-hint">La recherche ignore les accents et la casse.</span></form>
      <div class="card table-card users-table-card"><div class="table-wrap"><table class="data-table users-table${adm ? " has-permissions" : ""}"><caption class="sr-only">Comptes utilisateurs et autorisations</caption><thead><tr><th scope="col">Compte</th><th scope="col">Rôle</th><th scope="col">Département</th>${entetesDroits}<th scope="col">Réinitialisation</th><th scope="col">Action</th></tr></thead>
        <tbody>${lignes || `<tr><td colspan="${adm ? 10 : 6}"><div class="empty-state"><span class="empty-icon" aria-hidden="true">♙</span><h3>Aucun compte</h3><p>Aucun utilisateur n’est encore enregistré.</p></div></td></tr>`}
          <tr id="users-empty" hidden><td colspan="${adm ? 10 : 6}"><div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><h3>Aucun résultat</h3><p>Aucun compte ne correspond à cette recherche.</p></div></td></tr>
        </tbody></table></div></div></section>
    ${adm ? `<section class="department-settings"><div class="section-heading"><h3>Départements</h3><span class="muted">${dep.tous.length} département(s)</span></div>
      <form class="card department-card" id="d-new"><h4>Ajouter un département</h4>
        ${dep.tous.length ? `<div class="department-list">${dep.tous.map((x) => `<span class="department-chip">${esc(x)}</span>`).join("")}</div>` : `<p class="field-hint">Aucun département n'a encore été créé.</p>`}
        <div class="form-grid"><label class="field">Nom du département<input name="nom" placeholder="Ex. Comptabilité" required></label><div class="form-actions"><button type="submit">Ajouter le département</button></div></div>
      </form>
      <form class="card department-card" id="d-conf"><h4>Départements confidentiels</h4><p class="section-hint">Les documents de ces départements ne sont visibles qu'aux personnes autorisées. Les autres utilisateurs peuvent demander un accès.</p>
        ${dep.details.length ? `<div class="permission-grid">${dep.details.map((d) => `<label class="permission-option"><input type="checkbox" name="conf" value="${esc(d.nom)}" ${d.confidentiel ? "checked" : ""}><span>${esc(d.nom)}</span></label>`).join("")}</div>` : `<p class="field-hint">Ajoutez d'abord un département pour pouvoir le classer comme confidentiel.</p>`}
        <div class="form-actions"><button type="submit" ${dep.details.length ? "" : "disabled"}>Enregistrer les accès</button></div>
      </form></section>` : ""}`);
  const formulaireRecherche = q("#users-search"), recherche = q("#users-search input");
  q("#focus-create-user").addEventListener("click", () => { q("#nouvel-utilisateur").scrollIntoView({ behavior: "smooth" }); q('#u-new [name="nom"]').focus({ preventScroll: true }); });
  formulaireRecherche.addEventListener("submit", (e) => e.preventDefault());
  recherche.addEventListener("input", () => {
    const terme = recherche.value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    let visibles = 0;
    qa(".user-row").forEach((ligne) => {
      const texte = ligne.dataset.search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      ligne.hidden = !texte.includes(terme);
      if (!ligne.hidden) visibles++;
    });
    q("#users-empty").hidden = visibles > 0 || !u.utilisateurs.length;
    q("#users-count").textContent = terme ? `${visibles} sur ${u.utilisateurs.length} compte(s)` : `${u.utilisateurs.length} compte(s)`;
  });
  qa(".u-edit").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const fd = new FormData(f); sur(async () => {
    await put("/utilisateurs/" + f.dataset.id, { role: fd.get("role"), departement: fd.get("departement"), drapeaux: Object.fromEntries(Object.keys(DRAPEAUX).map((k) => [k, fd.get(k) === "on"])) }); message("Compte enregistré."); actions.route(); }); }));
  qa(".u-mdp").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); sur(async () => { await post("/utilisateurs/" + f.dataset.id + "/mot-de-passe", { mdp: new FormData(f).get("mdp") }); message("Mot de passe réinitialisé."); f.reset(); }); }));
  sur_envoi("#u-new", async (f, fd) => { await post("/utilisateurs", { nom: fd.get("nom"), role: fd.get("role"), departement: fd.get("departement"), mdp: fd.get("mdp") }); message("Compte créé."); actions.route(); });
  sur_envoi("#d-new", async (f, fd) => { await post("/departements", { nom: fd.get("nom") }); message("Département ajouté."); actions.route(); });
  sur_envoi("#d-conf", async (f, fd) => { await put("/departements/confidentiels", { noms: fd.getAll("conf") }); message("Départements confidentiels enregistrés."); await actions.rafraichir(); actions.route(); });
}

