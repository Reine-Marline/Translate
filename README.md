# Translate - Interpretation Audio Live (LAN)

Application web de traduction/interprétation audio en direct sur réseau local (église), sans Internet.

## Resume de fonctionnement
- Un serveur Node.js héberge les pages web et gère les connexions temps réel (Socket.IO).
- Un interprète se connecte depuis `interpreter.html`, choisit une langue, puis active son micro.
- Les auditeurs se connectent depuis `listener.html`, choisissent la même langue et écoutent le flux.
- L’audio est diffusé via WebRTC (faible latence), avec signalisation via Socket.IO.
- Le serveur gère plusieurs langues en parallèle avec états et notifications:
  - interprète connecté / absent
  - auditeurs en attente
  - notifications d’arrivée/déconnexion
- Deux QR codes sont générés pour faciliter l’accès mobile:
  - `/api/qr/interpreter`
  - `/api/qr/listener`

## Ce qu’il faut installer sur un autre ordinateur

### 1. Prerequis
- Node.js 18+ (ou 20+ recommandé)
- npm (inclus avec Node.js)
- `mkcert` (recommandé/nécessaire pour HTTPS local et permissions micro sur mobile)

### 2. Recuperer le projet
```bash
git clone <URL_DU_REPO>
cd event_translation
```

### 3. Installer les dependances de l’application live
```bash
cd live-interpretation-node
npm install
```

### 4. Generer les certificats HTTPS locaux
Depuis l’ordinateur serveur:
```bash
mkcert -install
cd certs
mkcert -key-file server-key.pem -cert-file server-cert.pem localhost 127.0.0.1 ::1 <IP_LAN_DU_SERVEUR>

[ Par exemple de la commande : < mkcert -key-file server-key.pem -cert-file server-cert.pem localhost 127.0.0.1 ::1 192.168.1.10 > et tu peux trouver ton IP LAN avec la commande : < hostname -I > ]
```

### 5. Lancer l’application
```bash
cd ..
npm start
```

## Utilisation sur le reseau local
1. Connecter tous les téléphones/PC au même Wi-Fi/hotspot.
2. Ouvrir sur les appareils:
   - `https://<IP_LAN_DU_SERVEUR>:3000`
3. Sur mobile, si avertissement certificat:
   - faire confiance au certificat racine `mkcert`, sinon le micro peut être bloqué.
4. Interprète: cliquer `Se connecter`, puis `Demarrer micro`.
5. Auditeur: cliquer `Ecouter`.

## Notes
- Le backend principal de diffusion live est dans `live-interpretation-node/`.
- Le détail technique complet est disponible dans `live-interpretation-node/README.md`.
