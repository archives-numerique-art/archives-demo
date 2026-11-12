import { q, qa, esc, fr, options, api, post, del, message, sur, contenu, sur_envoi } from "../core.js";

const actions = { rafraichir: () => {}, route: () => {}, aller: () => {} };
export function configurerAcces(context) { Object.assign(actions, context); }

export async function vueDemandes() {
  const d = await api("/demandes"), quoi = (r) => r.portee === "dept" ? "Tout le département : " + esc(r.valeur) : r.portee === "dossier" ? "Dossier demandé : " + esc(r.valeur) : esc((r.doc_num || "") + " " + (r.doc_titre || ""));
  contenu(`<h2>${d.peut_traiter ? "Demandes d'accès" : "Mes demandes"}</h2>${d.peut_demander ? `<p><a href="#/demandes/nouvelle"><button type="button">✉ Nouvelle demande d'accès</button></a></p>` : ""}
    ${d.demandes.map((r) => `<div class="card"><b>${esc(r.demandeur)}</b> - ${quoi(r)} - ${r.jours} jour(s) - ${fr(r.cree)}<br><span class="muted">Motif : ${esc(r.motif)}</span><br>Statut : <b>${esc(r.statut)}</b>${r.reponse ? ` <span class="muted">(${esc(r.reponse)})</span>` : ""}
      ${r.peut && r.statut === "attente" ? `<form class="decision ligne" data-id="${r.id}">Durée <select name="jours">${[1, 3, 7, 14, 30, 60, 90].map((j) => `<option ${j === Math.min(r.jours, 90) ? "selected" : ""}>${j}</option>`).join("")}</select> jours
        ${r.portee === "dossier" ? `<input name="num" size="30" placeholder="Numéro du document à partager (ex. ARC-2026-0001)">` : ""}<input name="note" placeholder="Message (facultatif)">
        <button name="action" value="ok">Accorder</button> <button name="action" value="non" class="danger">Refuser</button></form>` : ""}</div>`).join("") || "<p class='muted'>Aucune demande.</p>"}`);
  qa(".decision").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); const fd = new FormData(f); sur(async () => {
    await post("/demandes/" + f.dataset.id + "/decision", { action: e.submitter.value, jours: +fd.get("jours"), note: fd.get("note"), num: fd.get("num") }); message("Réponse enregistrée."); await actions.rafraichir(); actions.route(); }); }));
}

export async function vueNouvelleDemande() {
  const dep = await api("/departements");
  const departementsDisponibles = dep.confidentiels.length > 0;
  contenu(`<header class="page-heading"><div><p class="eyebrow">Accès et confidentialité</p><h2>Demander un accès</h2><p class="muted">Précisez les documents concernés et la durée souhaitée. Votre demande sera examinée par une personne autorisée.</p></div></header>
    <div class="request-notice"><span class="request-notice-icon" aria-hidden="true">i</span><p>Les documents Publics et Internes restent accessibles sans demande. Utilisez ce formulaire uniquement pour un document ou un département confidentiel.</p></div>
    <form class="card workflow-form request-form" id="dm">
      <section class="form-section"><h3>Quels documents souhaitez-vous consulter ?</h3><p class="section-hint">Choisissez une seule portée pour votre demande.</p>
        <div class="request-options">
          <label class="request-option${departementsDisponibles ? " selected" : ""}">
            <input type="radio" name="portee" value="dept" ${departementsDisponibles ? "checked" : "disabled"}>
            <span class="request-option-copy"><strong>Un département confidentiel</strong><small>${departementsDisponibles ? "Demander l’accès aux documents de ce service." : "Aucun département confidentiel n’est configuré."}</small></span>
            <span class="request-option-mark" aria-hidden="true">✓</span>
          </label>
          <label class="request-option${departementsDisponibles ? "" : " selected"}">
            <input type="radio" name="portee" value="dossier" ${departementsDisponibles ? "" : "checked"}>
            <span class="request-option-copy"><strong>Un dossier précis</strong><small>Demander un document qui n’apparaît pas dans la liste.</small></span>
            <span class="request-option-mark" aria-hidden="true">✓</span>
          </label>
        </div>
        <div class="form-grid request-targets">
          <label class="field request-target" id="request-department"><span>Département confidentiel</span>${departementsDisponibles ? `<select name="v_dept" required>${options(dep.confidentiels)}</select>` : `<span class="request-empty">Aucun département confidentiel n’est configuré.</span>`}</label>
          <label class="field request-target" id="request-file"><span>Référence du dossier</span><input name="v_texte" placeholder="Nom du client, numéro ou période" required></label>
        </div>
      </section>
      <section class="form-section"><h3>Motif et durée</h3><p class="section-hint">Ces précisions aident la personne responsable à examiner votre demande.</p>
        <div class="form-grid">
          <label class="field field-full">Motif de la demande<textarea name="motif" rows="4" placeholder="Expliquez brièvement pourquoi vous avez besoin de cet accès." required></textarea><span class="field-hint">N’indiquez que les informations nécessaires au traitement de la demande.</span></label>
          <label class="field">Durée souhaitée<select name="jours">${[1, 3, 7, 14, 30, 60, 90].map((j) => `<option value="${j}" ${j === 7 ? "selected" : ""}>${j} jour${j > 1 ? "s" : ""}</option>`).join("")}</select></label>
        </div>
      </section>
      <div class="form-actions"><a class="button button-secondary" href="#/demandes">Annuler</a><button type="submit">Envoyer la demande</button></div>
    </form>`);
  const basculePortee = () => {
    const portee = q('input[name="portee"]:checked').value, parDepartement = portee === "dept";
    q("#request-department").hidden = !parDepartement;
    q("#request-file").hidden = parDepartement;
    const select = q('[name="v_dept"]'), dossier = q('[name="v_texte"]');
    if (select) select.disabled = !parDepartement;
    dossier.disabled = parDepartement;
    qa(".request-option").forEach((option) => option.classList.toggle("selected", option.querySelector('input[name="portee"]').checked));
  };
  qa('input[name="portee"]').forEach((radio) => radio.addEventListener("change", basculePortee));
  basculePortee();
  sur_envoi("#dm", async (f, fd) => {
    const p = fd.get("portee"); await post("/demandes", { portee: p, valeur: p === "dept" ? fd.get("v_dept") : fd.get("v_texte"), motif: fd.get("motif"), jours: +fd.get("jours") });
    message("Demande envoyée. Elle sera traitée par l'archiviste ou par le responsable du département concerné."); await actions.rafraichir(); actions.aller("#/demandes");
  });
}

// ------------------------------------------------------------------ utilisateurs et départements
export async function vueAcces() {
  const a = await api("/acces");
  contenu(`<h2>Accès temporaires en cours</h2>${a.acces.length ? `<table><tr><th>Personne</th><th>Document / portée</th><th>Jusqu'au</th><th></th></tr>${a.acces.map((x) => `<tr><td>${esc(x.nom)}</td><td>${esc(x.num || (x.portee + " " + (x.valeur || "")))}</td><td>${fr(x.jusqu)}</td><td><button class="danger retire" data-id="${x.id}" style="padding:3px 10px">Retirer</button></td></tr>`).join("")}</table>` : "<p class='muted'>Aucun accès temporaire.</p>"}`);
  qa(".retire").forEach((b) => b.addEventListener("click", () => sur(async () => { if (!confirm("Retirer cet accès ?")) return; await del("/acces/" + b.dataset.id); message("Accès retiré."); actions.route(); })));
}

// ------------------------------------------------------------------ journal, sauvegardes, données
