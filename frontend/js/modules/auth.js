import { S, q, post, sur_envoi } from "../core.js";

export function vueConnexion(setup, entrer) {
  q("#racine").innerHTML = `<div class="solo"><div class="card"><img src="assets/logo.png" alt="Microfinance Bisou Bisou"><h2 style="text-align:center">${setup ? "Première utilisation" : "Connexion"}</h2>
    ${setup ? "<p class='muted'>Créez le compte du super administrateur. Gardez bien son mot de passe.</p>" : ""}<div id="messages"></div>
    <form id="f"><label>Nom du compte<input name="nom" autocomplete="username" required autofocus></label><label>Mot de passe${setup ? " (8 caractères minimum)" : ""}<input name="mdp" type="password" autocomplete="${setup ? "new-password" : "current-password"}" required></label>
    <button>${setup ? "Créer le compte et entrer" : "Se connecter"}</button></form></div></div>`;
  sur_envoi("#f", async (f, d) => {
    const r = await post(setup ? "/setup" : "/connexion", { nom: d.get("nom"), mdp: d.get("mdp") });
    S.moi = r.moi; S.csrf = r.moi.csrf; await entrer();
  });
}

