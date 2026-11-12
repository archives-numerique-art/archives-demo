---
name: imf-archive
description: Référence complète du projet IMF Archive : architecture, base de données, règles métier, sécurité, déploiement, interface et accompagnement utilisateur. À consulter pour toute tâche liée au projet.
---

# IMF Archive

Référence unifiée des compétences du projet IMF Archive. Le projet gère les archives de documents scannés (crédits, contrats, dépôts à terme…) de l'institution de microfinance Bisou Bisou à Kinshasa. L'application est utilisée sur Windows, avec l'archiviste comme utilisateur principal.

## Vue d'ensemble et architecture

- `backend/` : API JSON Flask, port **5001**. Seul composant autorisé à lire et modifier la base de données ; il porte les règles de sécurité et de calcul.
- `frontend/` : pages web statiques HTML, CSS et JavaScript natifs, port **5000**. Appelle le backend avec `fetch`, cookies de session et en-tête `X-CSRF-Token`.
- La base principale CRUD est SQLite, dans un seul fichier. **Emplacement exact :** `C:\Users\HP\Documents\GitHub\imf_archives\backend\db\imf_archive_pro` (fichier sans extension). Le backend lit `config.DB`; routes, scripts et services utilisent cette même configuration.
- Dossier du projet : `C:\Users\HP\Documents\GitHub\imf_archives`.

### Chemins de référence

- Cette copie du projet se trouve dans `C:\Users\HP\Documents\GitHub\imf_archives`. Utiliser ce chemin comme racine pour les commandes, les liens et les chemins relatifs.
- Résoudre les chemins depuis cette racine et ne pas reprendre d'anciens chemins du projet.
- La base active est `backend\db\imf_archive_pro` dans la racine actuelle. Ne pas la déplacer, remplacer ou modifier pendant une tâche de code sans demande explicite et sauvegarde vérifiée.

### Fichiers backend importants

| Fichier | Rôle |
|---|---|
| `config.py` | chemins, ports, listes (rôles, types, niveaux), version |
| `db\imf_archive_pro` | base SQLite principale ; elle porte directement la structure des tables |
| `base.py` | connexion SQLite et migrations compatibles avec les anciennes bases |
| `regles.py` | classe `Droits` : qui voit, ouvre, partage et décide |
| `api.py` | routes `/api/...` |
| `services.py` | sauvegardes, fiches d'audit, tâches automatiques |
| `serveur.py` | lance l'API (waitress si installé, sinon serveur Flask) |
| `tests/test_api.py` | tests de l'API |

Le navigateur n'affiche que ce que le backend renvoie. Les compteurs, l'arbre de classement, la recherche et les listes sont calculés en SQL avec les fonctions SQLite de `Droits` (`visible`, `ouvrable`, `confidentiel`, `privilegie`) : les documents interdits ne doivent jamais sortir de la base.

## Base de données

### Emplacement et précautions

- Le fichier SQLite par défaut et la base principale des opérations CRUD est `C:\Users\HP\Documents\GitHub\imf_archives\backend\db\imf_archive_pro`. `IMF_DB` peut choisir explicitement un autre fichier. `IMF_DONNEES`, lorsqu'il est défini sans `IMF_DB`, conserve le comportement historique et place la base dans `<IMF_DONNEES>\archives.db`.
- La base réelle, ses sauvegardes, fichiers scannés, journaux et exports sont exclus de GitHub : ne jamais publier de données clients ou de secrets. Une copie autorisée de la base doit être installée localement avant de démarrer une copie fraîche du code.
- Documents scannés : répertoire de données du backend, historiquement `backend/donnees/fichiers/`. Vérifier la configuration courante avant toute opération sur les fichiers.
- Ne jamais partager la clé de session ni les données clients.
- Consulter la base via DBeaver, mais éviter toute modification manuelle : les règles d'accès sont appliquées par le backend. Pour explorer sans risque, travailler sur une copie de sauvegarde et fermer la connexion DBeaver avant de remplacer le fichier.
- Les vues SQLite (dont `v_documents`) sont la couche de lecture réutilisable privilégiée par le backend pour les jointures, colonnes normalisées et calculs partagés entre les routes. Elles facilitent les filtres et les réponses destinées au frontend, mais ne remplacent ni les règles métier ni les contrôles d'accès.
- Une vue expose des noms de colonnes explicites et stables, dont l'identifiant réel de chaque ligne (`id`), et retourne une ligne par entité sauf agrégation intentionnelle. Éviter `SELECT *`, les doublons issus des jointures et les colonnes sensibles inutiles.
- Définir et faire évoluer les vues dans les migrations de `backend/base.py`, de façon idempotente et compatible avec les anciennes bases. `CREATE VIEW IF NOT EXISTS` ne met pas à jour une définition existante : toute évolution doit vérifier le type et les colonnes présentes, puis remplacer la vue de façon contrôlée. Ne jamais modifier la base active à la main pour faire persister une évolution du code.
- Une vue SQLite n'est pas matérialisée et ne possède pas d'index propre. Pour les lenteurs, examiner la requête et son plan, puis envisager des index sur les tables sources ; ne pas créer de table de cache, de déclencheur ou de stockage redondant sans demande explicite.
- Le frontend ne se connecte jamais directement à SQLite. Toutes les listes, fiches, recherches, filtres, indicateurs et exports passent par l'API. Celle-ci utilise des requêtes paramétrées et applique les droits et filtres de visibilité à chaque lecture, y compris les décomptes, agrégats, pagination et exports. Une vue ne doit jamais rendre visibles des données que l'utilisateur n'est pas autorisé à voir.
- Garder les contrats d'API et les résultats métier stables lors d'une simple optimisation de vue. Si un filtre nécessaire n'existe pas dans l'API, le signaler plutôt que simuler un résultat complet côté navigateur ; tenir compte des limites de lignes et de pagination existantes.
- Tester les migrations et requêtes sur une base temporaire : schéma ancien et courant, colonnes/identifiants renvoyés, absence de doublons, cohérence des totaux et filtres, résultats selon les droits. Ne jamais utiliser la base réelle pour les tests.

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
4. Pour le réseau local, fermer d'abord les deux fenêtres de l'application, puis lancer `demarrer_reseau.bat`. Le script lie les serveurs au réseau, vérifie que les ports sont libres et attend que le frontend réponde. Utiliser l'adresse IPv4 affichée, sous la forme `http://ADRESSE_IPV4:5000` ; `localhost` désigne toujours l'ordinateur utilisé.
5. Les appareils doivent être sur le même réseau privé. Autoriser Python ou les ports TCP 5000 et 5001 uniquement sur le profil **Privé** du pare-feu Windows. Ne pas exposer ces ports sur un réseau public ou sur Internet.
6. Si Windows demande confirmation pour un fichier `.bat` du projet, vérifier sa provenance avant de l'exécuter.

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
5. Vérifier que le fichier de base configuré reste `C:\Users\HP\Documents\GitHub\imf_archives\backend\db\imf_archive_pro`.

Ne pas lancer les scripts depuis un fichier ZIP non extrait. Éviter les dossiers de données actifs synchronisés par OneDrive en cas de conflits. Le cookie de session s'appelle `imf_archive_session` ; les cookies ignorent les ports, donc éviter de réutiliser ce nom pour une autre application sur `localhost`.

## Design de l'interface

### Périmètre et méthode

- Pour une demande explicitement limitée au frontend, ne modifier ni base, ni formules, ni règles métier, permissions, validations ou contrats API. Utiliser uniquement les données et actions réellement fournies ; présenter séparément tout besoin d'évolution backend.
- Si l'utilisateur demande explicitement des vues, des calculs ou une évolution API, intervenir dans cette limite précise. Privilégier les vues SQL pour partager les lectures backend, sans exposer SQLite au navigateur ni contourner les permissions.
- Lire les instructions du dépôt et examiner les écrans et composants réellement utilisés. Améliorer d'abord les styles et composants communs, puis adapter les modules. Conserver HTML, CSS et JavaScript natifs ; ne pas introduire de framework ou dépendance sans nécessité et accord.
- Garder une identité IMF Archive professionnelle et reconnaissable : logo et palette existants, surfaces sobres, bordures fines, fond gris bleuté et cartes claires. Centraliser les couleurs et états dans les variables du thème. S'inspirer des références sans copier leur code, leur marque ou leurs ressources ; vérifier les licences avant tout emprunt.

### Références de conception

- Commencer par TailAdmin [Data Tables](https://demo.tailadmin.com/data-tables), [Products List](https://react-demo.tailadmin.com/products-list) et shadcn/ui [Combobox](https://ui.shadcn.com/docs/components/combobox).
- Pour les formulaires et la navigation, consulter TailAdmin [Form Elements](https://demo.tailadmin.com/form-elements) et [Form Layout](https://react-demo.tailadmin.com/form-layout) ; pour les interactions, shadcn/ui [Data Table](https://ui.shadcn.com/docs/components/data-table), [Sidebar](https://ui.shadcn.com/docs/components/sidebar), [Sheet](https://ui.shadcn.com/docs/components/sheet), [Empty](https://ui.shadcn.com/docs/components/empty) et [Alert Dialog](https://ui.shadcn.com/docs/components/alert-dialog).
- Pour les tableaux de bord, onglets et fiches, consulter TailAdmin [Dashboard](https://nextjs-demo.tailadmin.com/), [Tabs](https://react-demo.tailadmin.com/tabs) et [Profile](https://react-demo.tailadmin.com/profile). Odoo et [Line Awesome](https://icones8.fr/line-awesome) peuvent inspirer la grille d'applications et les pictogrammes. Si une référence est inaccessible, le signaler brièvement et poursuivre avec les autres.

### Identité et structure

- Logo `frontend/assets/logo.png` : intact, sur fond blanc, en haut de chaque page, sur la page de connexion et dans le bandeau de département.
- Couleurs principales du logo : bleu `#0f2f8f`, jaune `#f2c200`, vert `#2e9e4f`, rouge `#c0392b`, orange `#e8a33d`. Variables CSS dans `frontend/css/style.css`.
- Barre supérieure : logo, « Archives », nom de la personne connectée.
- Menu latéral : recherche, liens selon les droits, classement Année > Mois > Département, rubriques, options et version.
- Accueil : cartes de synthèse, guide repliable, documents partagés et résumé.
- Cartes des documents avec niveaux colorés ; contrôles de suppression uniquement aux personnes autorisées.

### Cohérence des tableaux, filtres et recherches

- Tous les registres utilisent les mêmes conventions et, si cela simplifie le code existant, les mêmes composants partagés : titre clair, action principale, barre d'outils unique, en-têtes lisibles, séparateurs fins, compteur, filtres actifs effaçables et pagination selon les fonctions déjà disponibles.
- La recherche en cours de saisie est distincte des critères appliqués. La recherche d'options dans un sélecteur reste distincte de la recherche dans le registre ; catégories, types, états et références métier utilisent des sélecteurs recherchables lorsque la pile existante le permet. Prévoir « Tous », « Non renseigné » si pertinent, option cochée, recherche insensible aux accents et état « Aucun résultat ».
- Un changement de filtre ramène à la première page et conserve les autres critères conformément au contrat API. Afficher des puces de filtres actifs et une commande de réinitialisation. Ne pas présenter un filtre comme appliqué si l'API ne le prend pas en charge ; ne pas calculer côté client un total qui ignore des lignes absentes de la réponse ou sa limite de pagination.
- Conserver tri, pagination, sélection multiple et préférences de colonnes, largeur et densité lorsqu'ils existent. Chaque action du menu `⋯` cible l'identifiant réel de sa ligne. Aligner les valeurs numériques à droite ; afficher dates seules comme dates, horodatages avec heure et statuts dans des pastilles textuelles accessibles.
- Sur téléphone et tablette, faire revenir les commandes à la ligne et limiter le défilement horizontal au tableau. Utiliser les mêmes libellés, icônes et styles pour les actions récurrentes ; une action principale pleine, les actions secondaires discrètes. Placer un seul bouton « Réglages » près de l'action principale si des options de colonnes, exports ou références existent.
- Regrouper Excel et CSV sous « Exporter » lorsqu'ils sont disponibles et nommer précisément le périmètre exporté : résultats filtrés ou sélection. Ne pas ajouter de faux exports ou d'options sans fonction correspondante.
- Garder les données affichées pendant une actualisation si possible. Distinguer chargement initial, actualisation, absence de résultats et erreur explicite. Préserver recherche et filtres lors du passage Cartes/Tableau si ces vues existent.

### Navigation, tableaux de bord et formulaires

- Regrouper les rubriques par métier dans des sections repliables, mettre en évidence la route active et ajouter « Trouver un menu… » si la navigation est longue. Garder la commande d'ouverture/fermeture du menu dans l'en-tête (trois traits et croix), accessible même sur téléphone lorsque le menu est fermé.
- Si l'application possède un espace d'applications, n'afficher que les accès disponibles pour le profil réel. Sur la connexion, privilégier un formulaire compact avec panneau d'identité sur grand écran et formulaire au premier plan sur téléphone.
- Rendre les indicateurs cliquables uniquement lorsqu'ils ont un détail correspondant et autorisé. Le détail doit reprendre la même période et les mêmes critères que l'indicateur ; prévoir un retour au tableau de bord. Ne pas révéler par un compteur l'existence de documents confidentiels.
- Réutiliser une fenêtre latérale commune si elle correspond aux parcours existants ; garder titre, fermeture et actions accessibles pendant le défilement. Sur téléphone, utiliser la largeur disponible. Les fiches 360 utilisent des sous-onglets compacts dont le contenu correspond toujours à l'enregistrement choisi ; au retour, restaurer filtres, page, sélection, défilement et focus lorsque possible.
- Utiliser le même formulaire de création et de modification lorsque les parcours le permettent, préremplir les champs en modification, les grouper par sujet et passer d'une à deux colonnes selon la largeur. Afficher les erreurs près des champs, conserver la saisie après échec et garder Annuler/Enregistrer accessibles. Confirmer suppression et abandon de changements non enregistrés.
- Pour la saisie multiple ou Excel, ne montrer que les étapes réellement prises en charge : modèle, import, collage, vérification/correction, erreurs et doublons. Ne pas inventer de validation métier ni changer les règles existantes.

### Comportements à préserver

- Thème clair/sombre enregistré dans le navigateur ; bandeau du logo blanc dans les deux thèmes.
- Sous 860 px : menu en rangée de boutons, arbre masqué au profit du menu Documents, cartes en deux colonnes.
- À l'impression (`Ctrl+P`), masquer menus, boutons et formulaires.
- Messages en français simple et vouvoiement ; états d'information jaunes et erreurs rouges.
- Pas de framework frontend : HTML/CSS/JavaScript natifs. Échapper toute donnée affichée (`esc`).
- Vérifier les écrans modifiés à différentes largeurs, dans les thèmes disponibles, au clavier et avec zoom ; contrôler états vide/erreur, visibilité des actions selon les droits, filtres, pagination et navigation vers la bonne fiche. Rapporter uniquement les tests réellement exécutés.

## Accompagnement utilisateur

- L'utilisateur travaille sous Windows, privilégie les étapes concrètes et peut utiliser la dictée vocale. Reformuler brièvement une demande ambiguë, prendre en compte attentivement les captures d'écran et signaler toute hypothèse.
- Répondre en français simple, vouvoiement, phrases courtes, étapes numérotées et chemins Windows complets.
- Dire ce qui a été réellement testé ; ne pas prétendre avoir effectué une opération non exécutée.
- Avant une mise à jour, rappeler la sauvegarde et la protection des données. Ne jamais remplacer la base par supposition.
- « Fenêtre noire avec `>>>` » : invite Python ; taper `exit()` puis ouvrir le terminal dans le dossier du projet.
- « Non sécurisé » dans Chrome indique généralement HTTP ; cela peut être attendu en test local, mais HTTPS est requis pour un usage réel hors du poste.
- Documents confidentiels invisibles par conception : utiliser le processus de demande d'accès autorisé.
