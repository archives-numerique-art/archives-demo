import { qa, esc, fr, options, api, post, del, message, sur, contenu, sur_envoi } from "../core.js";

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
  contenu(`<h2>Demander l'accès à des documents confidentiels</h2><p class="muted">Les documents Publics et Internes sont ouverts à tous. Pour les documents confidentiels, expliquez pourquoi vous en avez besoin : l'archiviste ou le responsable du département répond.</p>
    <form class="card" id="dm"><p><label><input type="radio" name="portee" value="dept" checked> Tous les documents d'un département confidentiel</label><br>${dep.confidentiels.length ? `<select name="v_dept">${options(dep.confidentiels)}</select>` : "<span class='muted'>Aucun département confidentiel n'est défini.</span>"}</p>
      <p><label><input type="radio" name="portee" value="dossier"> Un dossier précis qui ne figure pas dans la liste</label><br><input name="v_texte" size="40" placeholder="Nom du client, numéro, mois..."></p>
      <p>Motif <br><textarea name="motif" rows="3" cols="50" required></textarea></p><p>Durée souhaitée <select name="jours">${[1, 3, 7, 14, 30, 60, 90].map((j) => `<option ${j === 7 ? "selected" : ""}>${j}</option>`).join("")}</select> jours</p><button>Envoyer la demande</button></form>`);
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
