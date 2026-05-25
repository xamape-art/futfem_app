# FUTFEM_APP

App pública de estadísticas de fútbol femenino FCF.  
Scraping semanal automático de actas → Supabase → React SPA.

## Stack

- **Frontend**: React 19 + Vite 6 + TypeScript + Tailwind CSS 4
- **Base de datos**: Supabase (PostgreSQL + RLS)
- **Deploy**: Vercel (auto-deploy desde `main`)
- **Sync**: GitHub Actions (cron lunes 10:00 UTC)

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.example .env.local
# → Rellenar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY

# 3. Arrancar dev server
npm run dev
```

## Sync script

```bash
# Test sin escribir (dry-run)
node scripts/sync-actas.js \
  --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \
  --season 2627 \
  --dry-run

# Backfill histórico (una vez)
node scripts/sync-actas.js \
  --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \
  --season 2526

# Sync actual (lo ejecuta GitHub Actions cada lunes)
node scripts/sync-actas.js \
  --league futbol-femeni/tercera-federacio-futbol-femeni/grup-v \
  --season 2627
```

Variables de entorno para el script (no van a Vercel):
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Añadir una nueva liga

1. Insertar una fila en la tabla `leagues` de Supabase con el `group_path` de la FCF
2. Añadir su `group_path` al `matrix.league` en `.github/workflows/sync-actas.yml`
3. Ejecutar backfill manual desde GitHub Actions → `workflow_dispatch`

## Schema SQL

Ver `scripts/sql/01_schema.sql` — ejecutar una sola vez en Supabase SQL Editor.

## Documentación

Ver `docs/PLAN_FUTFEM_APP.html` para el plan completo de arquitectura.
