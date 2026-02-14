# Systeme d'interpretation audio live (LAN)

Projet Node.js + Socket.IO pour diffusion audio en direct sur reseau local (sans Internet).

## Fonctionnalites couvertes
- Un interprete par langue, plusieurs auditeurs par langue.
- Capture micro navigateur (`getUserMedia`) cote interprete.
- Diffusion audio WebRTC (signalisation via Socket.IO), latence plus faible et meilleure stabilite mobile.
- Socket.IO reste utilise pour les etats, notifications et signalisation.
- Etats par langue et notifications:
  - Auditeur avant interprete: message d'attente.
  - Interprete avant auditeurs: message d'attente.
  - Interprete arrive apres auditeurs: notification auto cote auditeurs.
  - Auditeur arrive avec interprete deja connecte: notification cote interprete.
- Gestion deconnexion/reconnexion.
- QR codes generes par serveur pour acces rapide interprete/auditeur.

## Structure
- `server.js`: serveur Express + Socket.IO + gestion des etats.
- `public/index.html`: selection role.
- `public/interpreter.html`: interface interprete.
- `public/listener.html`: interface visiteur/auditeur.
- `public/js/*.js`: logique client.
- `public/css/styles.css`: styles UI.
- `GET /api/qr/interpreter`: QR PNG vers `/interpreter.html`.
- `GET /api/qr/listener`: QR PNG vers `/listener.html`.

## Installation
1. Aller dans le dossier:
   ```bash
   cd live-interpretation-node
   ```
2. Installer les dependances:
   ```bash
   npm install
   ```
3. Lancer le serveur:
   ```bash
   npm start
   ```

## HTTPS LAN (obligatoire pour permissions micro)

Pour que les traducteurs aient la permission micro sur telephone/PC en LAN, utilisez HTTPS avec un certificat local.

1. Installer `mkcert` sur la machine serveur.
2. Initialiser l'autorite locale:
   ```bash
   mkcert -install
   ```
3. Generer des certificats pour localhost + IP LAN (adaptez les IP):
   ```bash
   cd live-interpretation-node/certs
   mkcert -key-file server-key.pem -cert-file server-cert.pem localhost 127.0.0.1 ::1 192.168.1.10
   ```
4. Lancer le serveur:
   ```bash
   cd live-interpretation-node
   npm start
   ```

Le serveur demarre en HTTPS sur le port `3000`.
Un port HTTP `3080` est aussi expose uniquement pour rediriger vers HTTPS.

## Test sur reseau local
1. Connecter tous les appareils au meme Wi-Fi/Hotspot.
2. Demarrer le serveur sur l'ordinateur principal.
3. Ouvrir l'URL affichee dans la console:
   - `https://localhost:3000` (machine serveur)
   - `https://<IP-LOCALE-SERVEUR>:3000` (telephones/PC clients)
4. Flux de test:
   - Interprete: ouvrir `/interpreter.html`, choisir langue, cliquer `Se connecter`, puis `Demarrer micro`.
   - Visiteur: ouvrir `/listener.html`, meme langue, cliquer `Ecouter`.

## Notes techniques
- Ce projet diffuse l'audio via WebRTC pour reduire la latence et ameliorer la qualite vocale.
- Pour de tres grandes salles et meilleure resilience multi-appareils, un passage WebRTC SFU peut etre envisage.
- Si le navigateur bloque l'autoplay, interagir une fois avec la page auditeur (bouton `Ecouter`) suffit en general.
- Si un appareil affiche "connexion non privee", il faut installer/faire confiance au certificat racine `mkcert` sur cet appareil.

## Evenements Socket.IO principaux
- `join_role`: inscription role/langue.
- `language_state_update`: etat par langue.
- `status_notification`: bannieres d'information.
- `interpreter_stream_state`: etat micro (on/off).
- `webrtc_offer_needed`: serveur demande a l'interprete de creer une offre pour un auditeur.
- `webrtc_signal`: signalisation WebRTC (`offer`, `answer`, `candidate`).
- `listener_connected` / `listener_disconnected`: notifications interprete.
- `error_notification`: erreurs.
