#!/bin/bash
# Double-cliquer sur ce fichier lance le serveur de l'éditeur de positions.
# Se place à la racine du projet (deux dossiers au-dessus de ce script),
# quel que soit l'endroit où le Finder l'exécute.

cd "$(dirname "$0")/../.."

URL="http://localhost:3333/tools/position-editor/"

echo "Démarrage du serveur — Éditeur de positions"
echo "Ouverture de $URL dans le navigateur..."
echo "Pour arrêter : ferme cette fenêtre de Terminal, ou appuie sur Ctrl+C."
echo ""

# Lance le serveur en arrière-plan, laisse le temps de démarrer, puis ouvre
# l'URL dans le navigateur par défaut.
node tools/server.js &
SERVER_PID=$!

sleep 1
open "$URL"

# Attend le serveur au premier plan pour que la fenêtre reste ouverte tant
# qu'il tourne, et l'arrête proprement si on ferme la fenêtre/Ctrl+C.
trap "kill $SERVER_PID 2>/dev/null" EXIT
wait $SERVER_PID
