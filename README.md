# App Reviews Scraper · MBC

Herramienta para **extraer y explorar reseñas de App Store y Google Play de cualquier empresa o app**. Forma parte del [Hub de Herramientas de Minsait Business Consulting Perú](https://nelson2206.github.io/mbc-hub/).

🔗 **App web (en vivo):** https://nelson2206.github.io/app-reviews-scraper/

## ¿Qué hace?

### 1. App web dinámica (sin instalar nada)
- **Eliges tienda** (🍎 App Store o 🤖 Google Play) y país: Perú, México, Chile, EE.UU., España, etc.
- **Buscas** cualquier empresa o app y eliges una de los resultados (ícono, desarrollador, rating).
- **Scraping en vivo:**
  - **App Store** → directo desde el navegador (API pública de Apple), sin backend.
  - **Google Play** → vía un pequeño backend serverless ([app-reviews-api](https://github.com/nelson2206/app-reviews-api)), porque Google bloquea CORS. Se configura una vez pegando la URL del backend (botón ⚙ en la app; se guarda en el navegador).
- **KPIs** (promedio, % promotores/detractores, periodo), **distribución de estrellas**, y **descarga CSV/JSON**.
- **Análisis de temas** (en el navegador): clasifica las reseñas en categorías (acceso/login, estabilidad, transferencias, comisiones, atención, seguridad, biometría, actualización, UX), con foco de dolor, mejor valorado, menciones, rating por tema y filtro por tema. Funciona para ambas tiendas.
- Reintentos con *backoff* ante *rate-limit*. Límite: ~500 reseñas (Apple RSS) / configurable hasta 1000 (Google).

### Configurar Google Play (una sola vez)
1. Despliega [app-reviews-api](https://github.com/nelson2206/app-reviews-api) en Vercel (botón de 1 clic en su README).
2. Copia la URL del proyecto (ej. `https://app-reviews-api.vercel.app`).
3. En la app web: tienda **Google Play** → **⚙ Backend Google Play** → pega la URL → **Guardar**.

### 2. Script Python (CLI, solo App Store, para extracción masiva o automatizable)
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
