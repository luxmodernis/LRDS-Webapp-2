#!/bin/bash
# Double-cliquer sur ce fichier lance le serveur de l'éditeur de positions.
# Se place à la racine du projet (deux dossiers au-dessus de ce script),
# quel que soit l'endroit où le Finder l'exécute.

cd "$(dirname "$0")/../.."

echo "Démarrage du serveur — Éditeur de positions"
echo "Ouvre ensuite : http://localhost:3333/tools/position-editor/"
echo "Pour arrêter : ferme cette fenêtre de Terminal, ou appuie sur Ctrl+C."
echo ""

node tools/server.js
