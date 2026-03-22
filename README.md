# SISE demo build

Contenido:
- `index.html`: página principal del demo.
- `styles.css`: estilos del sitio.
- `app.js`: lógica de mapa, tablas y panel comparativo.
- `assets/munis_top50.geojson`: top 50 municipios con métricas y promedios nacional/departamental.
- `assets/munis_all.geojson`: 340 municipios simplificados para uso posterior.
- `assets/top10.json`, `assets/top50.json`, `assets/summary.json`: datasets auxiliares.

## Cómo probar localmente
Abra esta carpeta con VS Code y ejecute un servidor local, por ejemplo con Live Server.
También puede usar Python:

```bash
python -m http.server 8000
```

Luego abra `http://localhost:8000`.

## Siguiente integración sugerida
Migrar este demo estático a el repositorio del sitio y luego refinar secciones, textos, paleta e iconografía.
