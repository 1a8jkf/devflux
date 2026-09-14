#!/bin/bash
cd /home/marcos
echo "Compactando projeto DevFlux..."
# Ignoramos a pasta node_modules (muito pesada) e a android/build/ (arquivos temporarios)
zip -r /mnt/c/Users/user01/Desktop/DevFlux-Project-Backup.zip DevFlux -x "DevFlux/node_modules/*" "DevFlux/android/build/*" "DevFlux/android/app/build/*"

echo "Backup concluído! Arquivo DevFlux-Project-Backup.zip salvo na sua Área de Trabalho."
