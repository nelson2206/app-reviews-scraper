# App Reviews Scraper · MBC

Herramienta para **extraer y explorar reseñas de la Apple App Store de cualquier empresa o app**. Forma parte del [Hub de Herramientas de Minsait Business Consulting Perú](https://nelson2206.github.io/mbc-hub/).

🔗 **App web (en vivo):** https://nelson2206.github.io/app-reviews-scraper/

## ¿Qué hace?

Tiene **dos modos** que comparten el mismo esquema de datos:

### 1. App web dinámica (sin instalar nada)
- **Buscas** cualquier empresa o app y eliges la tienda (país): Perú, México, Chile, EE.UU., España, etc.
- **Eliges** una app de los resultados (con ícono, desarrollador y rating global).
- El **scraping ocurre en vivo en tu navegador** contra la API pública de Apple (búsqueda + feed RSS de reseñas) — *no necesita backend ni servidor*.
- Muestra **KPIs** (promedio, % promotores/detractores, periodo), **distribución de estrellas**, búsqueda y filtros, y permite **descargar CSV/JSON**.
- Incluye reintentos con *backoff* para tolerar el *rate-limit* de Apple. Límite: ~500 reseñas más recientes por app (paginación del RSS).

### 2. Script Python (CLI, para extracción masiva o automatizable)
- Descarga reseñas con **estrategia dual y tolerante a fallos**: `app-store-scraper` (principal) y *fallback* vía RSS (`requests`).
- **Normaliza**, **deduplica** por `review_id`, ordena por fecha y limpia el texto.
- **Exporta** a `CSV` (UTF-8) y `JSON` con timestamp, e imprime un resumen.

## Uso del scraper (CLI)

```bash
pip install -r requirements.txt

# Reseñas de BanBif (por defecto)
python app_store_reviews.py --app banbif --how_many 500

# Reseñas de Agora
python app_store_reviews.py --app agora --how_many 300

# App personalizada
python app_store_reviews.py \
    --country pe \
    --app_name mi-app-peru \
    --app_id 1234567890 \
    --how_many 200 \
    --output_file mis_reviews
```

| Parámetro | Descripción | Default |
|-----------|-------------|---------|
| `--app` | App predefinida (`banbif`, `agora`) | `banbif` |
| `--country` | Código de país ISO | — |
| `--app_name` | Slug de la app en App Store | — |
| `--app_id` | ID numérico de la app | — |
| `--how_many` | Máximo de reseñas a descargar | `500` |
| `--output_file` | Nombre base de salida | `reviews` |

## Esquema de salida

`source`, `app_name`, `app_id`, `review_id`, `review_title`, `review_text`, `rating`, `user_name`, `review_date`, `developer_response`, `country`, `extracted_at`.

## Estructura del repo

```
index.html             # app web dinámica (GitHub Pages) — busca y scrapea en vivo
app_store_reviews.py   # script de extracción (CLI)
data/                  # datasets de ejemplo (banbif.json, agora.json)
samples/               # salidas crudas (CSV/JSON) de ejecuciones previas
requirements.txt
```

## Notas

- La app web no usa backend: el scraping corre en el navegador del usuario contra los endpoints públicos de Apple (`itunes.apple.com/search` y el feed RSS `customerreviews`).
- Datos con fines analíticos internos (voz del cliente). Fuente: Apple App Store (datos públicos).

---
*Basado en el script original de [20222515/Script-scrapping-coeia](https://github.com/20222515/Script-scrapping-coeia).*
