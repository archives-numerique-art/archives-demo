"use strict";
/* IMF Archive - FRONTEND (port 5000).
   Cette page n'accède jamais à la base de données : tout passe par l'API du backend (port 5001).
   Les règles de sécurité et les calculs sont faits par le backend ; ici on ne fait qu'afficher. */

const PORT_BACK = window.IMF_PORT_BACKEND || 5001;
const BASE = (window.IMF_API || (location.protocol + "//" + location.hostname + ":" + PORT_BACK)).replace(/\/$/, "");
export const API = BASE + "/api";
export const S = { moi: null, meta: null, nav: null, csrf: "" };

export const q = (s, r = document) => r.querySelector(s);
export const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
export const enc = encodeURIComponent;
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fr = (d) => (d && d.length >= 10 ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : d || "");
export const options = (liste, choisi, vide) => (vide !== undefined ? `<option value="">${esc(vide)}</option>` : "") + liste.map((x) => `<option ${x === choisi ? "selected" : ""}>${esc(x)}</option>`).join("");
export const droit = (n) => !!(S.moi && S.moi.droits[n]);

// ------------------------------------------------------------------ appels au backend
export async function api(chemin, o = {}) {
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
export const post = (c, corps) => api(c, { methode: "POST", corps: corps || {} });
export const put = (c, corps) => api(c, { methode: "PUT", corps });
export const del = (c) => api(c, { methode: "DELETE" });

export function envoyer(chemin, form, progression) {   // envoi de fichiers avec barre de progression
  return new Promise((ok, ko) => {
    const x = new XMLHttpRequest(); x.open("POST", API + chemin); x.withCredentials = true; x.setRequestHeader("X-CSRF-Token", S.csrf);
    x.upload.onprogress = (e) => { if (e.lengthComputable && progression) progression(Math.round((100 * e.loaded) / e.total)); };
    x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch (e) {} x.status < 300 ? ok(d) : ko(Object.assign(new Error((d && d.erreur) || "Erreur " + x.status), { status: x.status })); };
    x.onerror = () => ko(new Error("Le backend ne répond pas (port " + PORT_BACK + ")."));
    x.send(form);
  });
}

export function message(texte, type) {
  const z = q("#messages"); if (!z) return alert(texte);
  const p = document.createElement("p"); p.className = "msg" + (type === "erreur" ? " err" : ""); p.textContent = texte; z.appendChild(p); setTimeout(() => p.remove(), 7000);
}
export let relancerSession = () => {};
export function configurerExpirationSession(fn) { relancerSession = fn; }

export async function sur(fn) {   // exécute une action et affiche l'erreur éventuelle
  try { return await fn(); }
  catch (e) { if (e.status === 401 && S.moi) { S.moi = null; return relancerSession(); } if (e.data && e.data.changer_mdp) { location.hash = "#/mot-de-passe"; return; } message(e.message, "erreur"); }
}
export function contenu(html) { q("#contenu").innerHTML = html; window.scrollTo(0, 0); }
export const sur_envoi = (sel, fn) => { const f = q(sel); if (f) f.addEventListener("submit", (e) => { e.preventDefault(); sur(() => fn(f, new FormData(f))); }); };

// ------------------------------------------------------------------ thème clair / sombre (préférence d'affichage seulement)
export function themeActuel() { try { return localStorage.getItem("imf_theme") === "sombre" ? "sombre" : "clair"; } catch (e) { return "clair"; } }
export function appliquerTheme() { document.body.className = themeActuel() === "sombre" ? "sombre" : ""; }
export function changerTheme() { try { localStorage.setItem("imf_theme", themeActuel() === "sombre" ? "clair" : "sombre"); } catch (e) {} appliquerTheme(); majTheme(); }
export function majTheme() { const t = q("#theme"); if (t) t.textContent = themeActuel() === "sombre" ? "☀ Thème clair" : "🌙 Thème sombre"; }

// ------------------------------------------------------------------ connexion
