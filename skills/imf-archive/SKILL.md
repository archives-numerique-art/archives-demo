---
name: imf-archive
description: Référence complète du projet IMF Archive : architecture, base de données, règles métier, sécurité, déploiement, interface et accompagnement utilisateur. À consulter pour toute tâche liée au projet.
---

# IMF Archive

Référence unifiée des compétences du projet IMF Archive. Le projet gère les archives de documents scannés (crédits, contrats, dépôts à terme…) de l'institution de microfinance Bisou Bisou à Kinshasa. L'application est utilisée sur Windows, avec l'archiviste comme utilisateur principal.

## Vue d'ensemble et architecture

- `backend/` : API JSON Flask, port **5001**. Seul composant autorisé à lire et modifier la base de données ; il porte les règles de sécurité et de calcul.
- `frontend/` : pages web statiques HTML, CSS et JavaScript natifs, port **5000**. Appelle le backend avec `fetch`, cookies de session et en-tête `X-CSRF-Token`.
- La base principale CRUD est SQLite, dans un seul fichier. **Emplacement exact :** `C:\Users\HP\Documents\imf_archive\backend\imf_archive_pro` (fichier sans extension). Le backend lit `config.DB`; routes, scripts et services utilisent cette même configuration.
- Dossier du projet : `C:\Users\HP\Documents\imf_archive`.

### Fichiers backend importants

| Fichier | Rôle |
|---|---|
| `config.py` | chemins, ports, listes (rôles, types, niveaux), version |
| `imf_archive_pro` | base SQLite principale ; elle porte directement la structure des tables |
| `base.py` | connexion SQLite et migrations compatibles avec les anciennes bases |
| `regles.py` | classe `Droits` : qui voit, ouvre, partage et décide |
| `api.py` | routes `/api/...` |
| `services.py` | sauvegardes, fiches d'audit, tâches automatiques |
| `serveur.py` | lance l'API (waitress si installé, sinon serveur Flask) |
| `tests/test_api.py` | tests de l'API |

Le navigateur n'affiche que ce que le backend renvoie. Les compteurs, l'arbre de classement, la recherche et les listes sont calculés en SQL avec les fonctions SQLite de `Droits` (`visible`, `ouvrable`, `confidentiel`, `privilegie`) : les documents interdits ne doivent jamais sortir de la base.

## Base de données

### Emplacement et précautions

- Le fichier SQLite par défaut et la base principale des opérations CRUD est `C:\Users\HP\Documents\imf_archive\backend\imf_archive_pro`. `IMF_DB` peut choisir explicitement un autre fichier. `IMF_DONNEES`, lorsqu'il est défini sans `IMF_DB`, conserve le comportement historique et place la base dans `<IMF_DONNEES>\archives.db`.
- La base réelle, ses sauvegardes, fichiers scannés, journaux et exports sont exclus de GitHub : ne jamais publier de données clients ou de secrets. Une copie autorisée de la base doit être installée localement avant de démarrer une copie fraîche du code.
- Documents scannés : répertoire de données du backend, historiquement `backend/donnees/fichiers/`. Vérifier la configuration courante avant toute opération sur les fichiers.
- Ne jamais partager la clé de session ni les données clients.
- Consulter la base via DBeaver, mais éviter toute modification manuelle : les règles d'accès sont appliquées par le backend. Pour explorer sans risque, travailler sur une copie de sauvegarde et fermer la connexion DBeaver avant de remplacer le fichier.

### Tables principales

La structure des tables est celle conservée dans le fichier de base SQLite principal. Le backend vérifie les tables requises au démarrage et complète les colonnes manquantes des anciennes versions.

- `users(id, nom, mdp, role, changer, departement, comptes, accorde, archiviste, confid, journal)` : `mdp` contient un hachage Werkzeug, jamais le mot de passe en clair.
- `depts(nom, confidentiel)`
- `docs(id, num, titre, service, type, date, niveau, emplacement, etat, fichier, cree)` : `date` est le mois de classement (`AAAA-MM-01`), `cree` la date d'enregistrement et `fichier` le nom interne du document.
- `grants(doc, user, jusqu, portee, valeur)` : accès temporaires à un document ou un département.
- `demandes(id, doc, user, jours, motif, statut, cree, reponse, portee, valeur)`
- `log(id, t, u, a, d)` : journal d'audit.

### DBeaver, exports et sauvegardes

- DBeaver : créer une connexion **SQLite** et renseigner le fichier de base ci-dessus.
- Excel ne lit pas directement SQLite. Utiliser les CSV dans `backend/journaux/` et `backend/exports/` ; séparateur `;`, UTF-8 avec BOM. Les cellules qui commencent par `=`, `+`, `@` ou `-` doivent être neutralisées contre l'injection de formules.
- Les sauvegardes `backend/sauvegardes/*.zip` comprennent une copie cohérente de la base (API SQLite) et les fichiers associés. Une sauvegarde quotidienne peut être conservée pendant 14 jours tant que le backend fonctionne.
- Copier régulièrement une sauvegarde sur un autre support. Pour restaurer, arrêter l'application et vérifier le contenu de l'archive avant de remplacer les données.
- Migration des anciennes versions : `base.init_db()` complète les colonnes manquantes sans effacer les données ; vérifier la compatibilité avec la version déployée.

## Règles métier

Le code de référence est `backend/regles.py` (classe `Droits`) et `backend/api.py`. Toute modification de permissions se fait dans le backend, jamais seulement dans le frontend.

### Rôles et droits supplémentaires

Rôles : `admin` (super administrateur / archiviste), `gestionnaire` (responsable de département), `agent`, `lecteur`, `controle` (contrôle interne, conformité, direction générale ou auditeur en consultation).

| Drapeau | Effet général |
|---|---|
| `comptes` | créer ou modifier des comptes gestionnaire, agent ou lecteur |
| `accorde` | accorder des demandes d'accès |
| `archiviste` | ajouter, importer et supprimer des documents |
| `confid` | voir et ouvrir les documents confidentiels, partager |
| `journal` | consulter et exporter le journal |

Un compte avec un rôle ou un drapeau spécial ne peut pas être modifié par l'informatique ; seul le super administrateur le peut. Le super administrateur n'est pas modifiable par un autre utilisateur.

### Visibilité, demandes et partage

- Les documents **Public** et **Interne** sont visibles et ouvrables par tout utilisateur connecté.
- Un document est confidentiel si son niveau est « Confidentiel », son type est « Dossier du personnel », ou son département est marqué confidentiel.
- Un document confidentiel et le nom d'un département confidentiel restent invisibles (listes, recherche, arbre et fiche) sauf pour le super administrateur, les porteurs de `confid`, le responsable du département concerné ou les personnes avec un accès temporaire.
- Le contrôle interne et les auditeurs ne voient pas les documents confidentiels sauf si `confid` leur est attribué.
- Les demandes concernent un département confidentiel ou un dossier précis. Peuvent décider : le super administrateur, les porteurs de `accorde`, le responsable du département pour une demande de ce département, et les porteurs de `confid` pour les dossiers précis. Pas d'auto-approbation. Durée : 1 à 90 jours.
- Une demande d'accès à un département confidentiel ouvre les documents confidentiels de ce département.
- Le partage d'un document confidentiel est possible par le responsable du département (pour son département), un porteur de `confid` ou le super administrateur ; durée de 1 à 30 jours, révocable, journalisée.

### Import, suppression et journal

- Seuls le super administrateur et les porteurs de `archiviste` peuvent importer, créer et supprimer. Les responsables de département seuls ne peuvent pas importer.
- L'import exige un département choisi dans la liste autorisée. Le mois de classement est libre, y compris dans le passé.
- On ne supprime que les documents visibles ; suppression définitive du fichier et journalisation.
- Format des numéros : `ARC-AAAA-NNNN`, où `NNNN` est le prochain numéro basé sur l'id maximal ; pas de doublon après suppression.
- Les connexions (avec adresse), échecs, déconnexions, consultations, imports, suppressions, partages et décisions sont inscrits dans la table `log` et dans `journaux/journal_AAAA-MM.csv`. Aucun bouton ne supprime le journal.
- Le tableau de bord ne doit jamais afficher de compteur de documents confidentiels. Ne pas révéler le nombre ou l'existence de documents auxquels un utilisateur n'a pas droit.

## Sécurité

### Mesures implémentées à préserver

- Mots de passe hachés avec Werkzeug, minimum 8 caractères ; changement obligatoire après réinitialisation ; blocage de 5 minutes après 5 échecs depuis la même adresse.
- Cookie de session `HttpOnly`, `SameSite=Lax`, durée de 8 heures ; `Secure` si `IMF_HTTPS=1`.
- CORS limité au frontend autorisé ; toute écriture exige `X-CSRF-Token` et une origine autorisée.
- Uploads limités à PDF/JPG/PNG, `nosniff`, noms internes aléatoires ; valider les chemins de téléchargement.
- Requêtes SQL paramétrées ; sorties HTML échappées avec `esc`.
- Filtrer les documents interdits dans la requête SQL, et pas seulement dans l'interface ; journaliser les refus d'accès.
- Exports Excel neutralisés contre les formules ; fiches d'audit sans mots de passe.
- Le frontend ne constitue jamais une frontière de sécurité : tous les contrôles doivent être faits côté backend.

### Limites et précautions opérationnelles

- HTTPS obligatoire hors poste local : HTTP transmet les données en clair.
- Utiliser un compte par personne ; le journal identifie le compte et l'adresse réseau.
- Supprimer les comptes de démonstration et changer leurs identifiants avant tout usage réel.
- Les scans ne sont pas chiffrés sur disque : protéger les données et sauvegardes avec les droits Windows et, si possible, BitLocker.
- Les exports d'audit peuvent contenir des noms de clients : protéger `backend/exports`.
- Réviser régulièrement les droits (`comptes`, `accorde`, `archiviste`, `confid`, `journal`) et désactiver les comptes qui ne sont plus nécessaires.
- Avant tout usage réel, vérifier l'accord de la direction et les exigences de protection des données applicables en RDC. Pour une offre à d'autres entreprises, prévoir séparation des données, engagements de confidentialité et hébergement fiable.

## Déploiement et dépannage (Windows)

### Démarrage local et réseau

1. Installer Python depuis python.org.
2. Lancer `demarrer_local.bat` pour utiliser l'application sur cet ordinateur, puis ouvrir `http://localhost:5000`.
3. Le frontend écoute sur le port **5000** et l'API sur **5001**. Ne pas fermer les fenêtres BACKEND et FRONTEND pendant l'utilisation.
4. Pour le réseau local, lancer `demarrer_reseau.bat` et utiliser `http://ADRESSE_IPV4:5000`. Les deux ports doivent être accessibles ; `localhost` désigne toujours l'ordinateur utilisé.
5. Si Windows demande confirmation pour un fichier `.bat` du projet, vérifier sa provenance avant de l'exécuter.

Erreurs fréquentes :
- `ERR_CONNECTION_TIMED_OUT` : pare-feu ou réseau bloque la connexion.
- `ERR_CONNECTION_REFUSED` sur `localhost` : application arrêtée ou démarrage local utilisé depuis un autre appareil.
- Les réseaux d'entreprise peuvent interdire la communication entre appareils ; demander à l'informatique.
- Une règle pare-feu temporaire peut ouvrir les ports TCP 5000 et 5001 ; limiter sa portée et la supprimer après les tests si elle n'est plus nécessaire.

### Configuration et hébergement

Variables utiles : `IMF_HOTE`, `IMF_PORT_BACKEND`, `IMF_PORT_FRONTEND`, `IMF_HTTPS=1`, `IMF_ORIGINES`, `IMF_DB` (fichier SQLite), `IMF_DONNEES` (fichiers scannés et clé de session ; ancien emplacement SQLite si `IMF_DB` n'est pas défini), `IMF_JOURNAUX`, `IMF_EXPORTS`, `IMF_SAUVEGARDE`. Si frontend et backend sont sur des machines distinctes, configurer `window.IMF_API` dans `frontend/js/config.js` et `IMF_ORIGINES` côté backend.

Pour héberger sur le serveur de l'entreprise : demander à l'informatique un proxy HTTPS (IIS, nginx ou Caddy), acheminer `/` vers le frontend et `/api` vers le backend, activer `IMF_HTTPS=1`, faire tourner le backend comme service ou tâche planifiée, sauvegarder hors du serveur et tester la restauration. Ne jamais exposer l'application sur internet sans HTTPS et pare-feu.

### Mise à jour

1. Arrêter frontend et backend.
2. Faire une sauvegarde vérifiée.
3. Mettre à jour le code sans écraser les données, journaux, exports ou sauvegardes.
4. Redémarrer, vérifier la version et faire `Ctrl+F5`.
5. Vérifier que le fichier de base configuré reste `C:\Users\HP\Documents\imf_archive\backend\imf_archive_pro`.

Ne pas lancer les scripts depuis un fichier ZIP non extrait. Éviter les dossiers de données actifs synchronisés par OneDrive en cas de conflits. Le cookie de session s'appelle `imf_archive_session` ; les cookies ignorent les ports, donc éviter de réutiliser ce nom pour une autre application sur `localhost`.

## Design de l'interface

### Identité et structure

- Logo `frontend/assets/logo.png` : intact, sur fond blanc, en haut de chaque page, sur la page de connexion et dans le bandeau de département.
- Couleurs principales du logo : bleu `#0f2f8f`, jaune `#f2c200`, vert `#2e9e4f`, rouge `#c0392b`, orange `#e8a33d`. Variables CSS dans `frontend/css/style.css`.
- Barre supérieure : logo, « Archives », nom de la personne connectée.
- Menu latéral : recherche, liens selon les droits, classement Année > Mois > Département, rubriques, options et version.
- Accueil : cartes de synthèse, guide repliable, documents partagés et résumé.
- Cartes des documents avec niveaux colorés ; contrôles de suppression uniquement aux personnes autorisées.

### Comportements à préserver

- Thème clair/sombre enregistré dans le navigateur ; bandeau du logo blanc dans les deux thèmes.
- Sous 860 px : menu en rangée de boutons, arbre masqué au profit du menu Documents, cartes en deux colonnes.
- À l'impression (`Ctrl+P`), masquer menus, boutons et formulaires.
- Messages en français simple et vouvoiement ; états d'information jaunes et erreurs rouges.
- Pas de framework frontend : HTML/CSS/JavaScript natifs. Échapper toute donnée affichée (`esc`).

## Accompagnement utilisateur

- L'utilisateur travaille sous Windows, privilégie les étapes concrètes et peut utiliser la dictée vocale. Reformuler brièvement une demande ambiguë, prendre en compte attentivement les captures d'écran et signaler toute hypothèse.
- Répondre en français simple, vouvoiement, phrases courtes, étapes numérotées et chemins Windows complets.
- Dire ce qui a été réellement testé ; ne pas prétendre avoir effectué une opération non exécutée.
- Avant une mise à jour, rappeler la sauvegarde et la protection des données. Ne jamais remplacer la base par supposition.
- « Fenêtre noire avec `>>>` » : invite Python ; taper `exit()` puis ouvrir le terminal dans le dossier du projet.
- « Non sécurisé » dans Chrome indique généralement HTTP ; cela peut être attendu en test local, mais HTTPS est requis pour un usage réel hors du poste.
- Documents confidentiels invisibles par conception : utiliser le processus de demande d'accès autorisé.
