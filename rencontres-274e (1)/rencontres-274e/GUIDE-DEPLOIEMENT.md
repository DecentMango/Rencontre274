# Rencontres de mi-année | 274e Saint-Éphrem — Guide de mise en ligne

Durée totale : environ 20 minutes. Coût : 0 $.

**Architecture**
- **Supabase** (gratuit) : base de données partagée, sécurité, temps réel, connexion du chef de groupe.
- **Vercel** (gratuit) : hébergement du site et lien public à partager sur WhatsApp.

```
index.html              → page de réservation (publique, sans compte)
admin.html              → espace chef de groupe (protégé par mot de passe)
assets/config.js        → SEUL fichier à modifier (URL + clé Supabase)
supabase/schema.sql     → base de données à créer en un clic
vercel.json             → réglages d'hébergement
```

> Astuce : ouvrez `index.html` dans votre navigateur avant de configurer quoi que ce soit.
> L'application tourne en **mode démonstration** (mot de passe admin : `demo`).

---

## Étape 1 — Créer la base de données Supabase

1. Allez sur **supabase.com**, puis cliquez sur **Start your project** et connectez-vous (GitHub ou courriel).
2. **New project** → Nom : `rencontres-274e` → choisissez un mot de passe de base de données (gardez-le) → Région : **Canada (Central)** ou **East US** → **Create new project**. Attendez environ 2 minutes.
3. Menu de gauche → **SQL Editor** → **New query**.
4. Ouvrez le fichier `supabase/schema.sql`, copiez **tout** son contenu, collez-le, puis cliquez sur **Run**.
   ✅ Le message « Success. No rows returned » doit apparaître.
5. Vérifiez : **Table Editor** → `creneaux` → les 7 créneaux doivent être là.

## Étape 2 — Créer le compte du chef de groupe

1. Menu **Authentication** → **Users** → **Add user** → **Create new user**.
2. Entrez le courriel et le mot de passe du chef de groupe, puis cochez **Auto Confirm User**.
3. Retournez dans **SQL Editor** et exécutez (en remplaçant le courriel) :

   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'chef@exemple.com';
   ```

   Répétez l'opération pour chaque personne qui doit avoir accès.
4. **Important :** dans **Authentication** → **Sign In / Providers** (ou **Settings**), **désactivez « Allow new users to sign up »**.
   Les chefs n'ont pas besoin de compte pour réserver. Cette option empêche seulement la création de nouveaux comptes.

## Étape 3 — Relier l'application à Supabase

1. Dans Supabase : **Project Settings** (roue dentée) → **API** (ou **API Keys**).
2. Copiez :
   - **Project URL**, par exemple `https://abcd1234.supabase.co`
   - la clé **anon public** (ou **publishable**)
   - ⚠️ **Ne copiez jamais** la clé `service_role` ni la clé `secret`.
3. Ouvrez `assets/config.js` et remplacez :

   ```js
   SUPABASE_URL: "https://abcd1234.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...votre clé...",
   LIEU: "Local scout, 123 rue Exemple",   // facultatif, apparaît dans l'invitation calendrier
   ```

La clé « anon » peut être publique : la sécurité est assurée par les règles de la base de données.

## Étape 4 — Mettre en ligne sur Vercel

**Option A — Avec GitHub (recommandée, mises à jour faciles)**
1. Créez un compte sur **github.com**. Créez ensuite un **New repository**, par exemple `rencontres-274e` (choisissez **Private**).
2. Sur la page du dépôt, cliquez sur **uploading an existing file**, glissez **tout le contenu** du dossier (pas le dossier lui-même), puis cliquez sur **Commit changes**.
3. Allez sur **vercel.com**, puis **Sign up with GitHub**.
4. Cliquez sur **Add New… → Project** → importez `rencontres-274e`.
5. Framework Preset : **Other**. Ne changez aucun autre réglage, puis cliquez sur **Deploy**.
6. Vous obtenez un lien du type `https://rencontres-274e.vercel.app`. 🎉

Pour modifier le site plus tard, remplacez le fichier sur GitHub. Vercel redéploie le site automatiquement.

**Option B — Sans GitHub (glisser-déposer)**
Sur **app.netlify.com/drop**, glissez le dossier complet. Vous obtenez un lien en 30 secondes. C'est aussi gratuit et ça fonctionne de la même façon.

## Étape 5 — Tester avant de partager

1. Ouvrez votre lien. Le bandeau jaune « Mode démonstration » ne doit **plus** apparaître.
2. Faites une réservation test, puis ouvrez le lien sur un deuxième téléphone : le créneau doit apparaître en gris.
3. Allez sur `votre-lien/admin`, connectez-vous et vérifiez la réservation test.
4. **Annulez la réservation test** dans l'espace admin.
5. Partagez le lien sur WhatsApp. ✅

## Bon à savoir

- **Pause automatique :** Supabase met en pause les projets gratuits après environ une semaine sans activité. Ouvrez le site la veille du partage. En cas de pause, cliquez sur **Restore** dans Supabase.
- **Doubles réservations :** elles sont impossibles. La base refuse un 2e créneau pour une unité et une 2e unité sur un créneau, même en cas de clics simultanés (ce cas a été testé).
- **Données privées :** le public voit seulement quelle unité a pris quel créneau. Les noms, commentaires et notes confidentielles sont réservés au chef de groupe connecté.
- **Modifier une réservation :** seul le chef de groupe peut le faire, dans l'espace admin. Les chefs vous écrivent sur WhatsApp.
- **Export CSV :** il s'ouvre directement dans Excel, avec les accents et le séparateur « ; ».
- **Lien admin :** `https://votre-lien/admin` (aussi accessible par « Espace chef de groupe » en haut de la page).
