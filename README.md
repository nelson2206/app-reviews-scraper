# App Reviews Scraper · MBC

Herramienta para **extraer y explorar reseñas de la Apple App Store** de apps peruanas. Forma parte del [Hub de Herramientas de Minsait Business Consulting Perú](https://nelson2206.github.io/mbc-hub/).

🔗 **Explorador web (demo en vivo):** https://nelson2206.github.io/app-reviews-scraper/

Apps configuradas por defecto:

| App | App ID | País |
|-----|--------|------|
| Nueva BanBif App | `6736497481` | pe |
| Agora – Ahorra y Disfruta | `1478814349` | pe |

## ¿Qué hace?

- Descarga reseñas con una **estrategia dual y tolerante a fallos**:
  1. `app-store-scraper` (principal).
  2. *Fallback* vía el feed RSS público de iTunes (`requests`) si la primera falla.
- **Normaliza** cada reseña a un esquema único de 12 campos.
- **Deduplica** por `review_id`, ordena por fecha y limpia el texto.
- **Exporta** a `CSV` (UTF-8) y `JSON` con timestamp, e imprime un resumen (total, rating promedio, rango de fechas).
- Incluye un **explorador web** (`index.html`) que lee los datos recolectados y muestra KPIs, distribución de calificaciones, búsqueda y filtros — sin dependencias ni backend.

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
app_store_reviews.py   # script de extracción (CLI)
index.html             # explorador web (GitHub Pages)
data/                  # datasets que alimentan el explorador (banbif.json, agora.json)
samples/               # salidas crudas (CSV/JSON) de ejecuciones previas
requirements.txt
```

## Notas

- El explorador se sirve estáticamente; para verlo localmente usa `python -m http.server` y abre `http://localhost:8000` (abrir el HTML con `file://` bloquea la carga de los JSON por CORS).
- Datos con fines analíticos internos (voz del cliente). Fuente: Apple App Store, tienda de Perú.

---
*Basado en el script original de [20222515/Script-scrapping-coeia](https://github.com/20222515/Script-scrapping-coeia).*
