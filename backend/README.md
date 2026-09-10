# JurisPilot Engine V2

Backend sécurisé prévu pour l'application Android JurisPilot.

## Routes

- `GET /health` : état du moteur.
- `POST /analyze` : analyse juridique sourcée.
- `POST /counter-analyze` : recherche des exceptions et arguments susceptibles de fragiliser la première analyse.

## Secret obligatoire

Configurer `OPENAI_API_KEY` comme **secret côté serveur**. Ne jamais mettre cette clé dans l'APK, le JavaScript client ou le dépôt GitHub.

Le moteur utilise l'API Responses d'OpenAI avec recherche web et impose comme sources juridiques de référence : Légifrance, Code du travail numérique, Service-Public.fr, Justice.fr, Cour de cassation, Conseil d'État et CNIL.

## Renforcement futur par API officielles directes

L'architecture réserve les secrets suivants, sans les exposer au client :

- `PISTE_CLIENT_ID`
- `PISTE_CLIENT_SECRET`
- `JUDILIBRE_KEY_ID`

Ils permettront une interrogation directe de l'API Légifrance via PISTE et de Judilibre en complément de la recherche officielle sur le web.

## Déploiement Cloudflare Worker

Copier `wrangler.toml.example` vers `wrangler.toml`, puis déployer le Worker et ajouter les secrets dans l'environnement du Worker. L'URL HTTPS obtenue doit ensuite être renseignée une seule fois dans **JurisPilot > Réglages > Moteur juridique sécurisé**.

## Politique anti-hallucination

Le prompt serveur impose : recherche web à chaque réponse, vérification de la date d'application, prise en compte de la hiérarchie loi/convention/contrat en droit du travail, contre-analyse et interdiction d'inventer article, décision, date, délai ou source. Le serveur filtre en plus les URL retournées et rétrograde le verdict si aucune source officielle exploitable n'est présente.
