#!/usr/bin/env bash

# ==============================================================================
# Script de regroupement du code pour analyse IA
# Concatène les fichiers de chaque sous-dossier et des fichiers racine
# dans des fichiers .txt dédiés avec séparateurs clairs et chemins d'accès.
# ==============================================================================

set -euo pipefail

# Dossier source (par défaut le dossier courant)
SRC_DIR="${1:-.}"
OUTPUT_DIR="ai_context_export"

# Création du dossier d'exportation
mkdir -p "$OUTPUT_DIR"

echo "📦 Début du regroupement du code depuis '$SRC_DIR'..."
echo "📂 Les fichiers générés seront enregistrés dans '$OUTPUT_DIR/'"
echo "------------------------------------------------------------"

# Function pour écrire le contenu d'un fichier avec un en-tête propre
append_file_content() {
    local file_path="$1"
    local target_txt="$2"
    
    # Séparateur visuel clair
    cat << EOF >> "$target_txt"
================================================================================
FILE: $file_path
================================================================================

EOF
    
    # Injection du contenu du fichier
    cat "$file_path" >> "$target_txt"
    
    # Saut de ligne à la fin du fichier
    cat << EOF >> "$target_txt"


EOF
}

# 1. Traitement des sous-dossiers (checkpoint, interactive, process, pty, tests, etc.)
find "$SRC_DIR" -maxdepth 1 -mindepth 1 -type d ! -name "$OUTPUT_DIR" ! -name ".*" | while read -r dir; do
    dir_name=$(basename "$dir")
    target_file="$OUTPUT_DIR/${dir_name}.txt"
    
    # Nettoyage préalable si le fichier existe déjà
    > "$target_file"
    
    echo "📁 Traitement du dossier '$dir_name' -> $target_file"
    
    # Parcourir tous les fichiers dans le sous-dossier
    find "$dir" -type f ! -name ".*" | sort | while read -r file; do
        append_file_content "$file" "$target_file"
    done
done

# 2. Traitement des fichiers à la racine (fichiers de code / configuration .ts, .py, .json, etc.)
root_code_file="$OUTPUT_DIR/root_files.txt"
> "$root_code_file"

echo "📄 Traitement des fichiers source à la racine -> $root_code_file"
find "$SRC_DIR" -maxdepth 1 -type f ! -name ".*" ! -name "*.md" ! -name "*.sh" | sort | while read -r file; do
    append_file_content "$file" "$root_code_file"
done

# 3. Traitement séparé des fichiers de documentation / manifestes Markdown (.md) à la racine
root_md_file="$OUTPUT_DIR/root_docs.txt"
> "$root_md_file"

echo "📝 Traitement des fichiers de documentation (.md) -> $root_md_file"
find "$SRC_DIR" -maxdepth 1 -type f -name "*.md" | sort | while read -r file; do
    append_file_content "$file" "$root_md_file"
done

echo "------------------------------------------------------------"
echo "✅ Exportation terminée avec succès !"
echo "📋 Fichiers créés dans le dossier '$OUTPUT_DIR/' :"
ls -lh "$OUTPUT_DIR"