-- Normalización de slugs canónicos en public.games y consolidación de registros huérfanos en public.results
-- Idempotente y segura: preserva siempre correcciones manuales (source = 'manual').

-- 1. Asegurar columna opcional game_slug en public.results para trazabilidad consistente
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS game_slug text;

CREATE INDEX IF NOT EXISTS idx_results_game_slug_draw_date
  ON public.results (game_slug, draw_date);

-- 2. Función reutilizable para consolidar duplicados de games y reasignar resultados huérfanos
CREATE OR REPLACE FUNCTION public.consolidate_games_and_orphan_results()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair record;
  v_winner_id uuid;
  v_loser record;
  v_migrated int := 0;
  v_deleted_conflicts int := 0;
  v_deduped_games int := 0;
  v_backfilled int := 0;
BEGIN
  -- Mapa de normalización estricta: (alias -> canonical_slug)
  FOR v_pair IN
    SELECT * FROM (VALUES
      ('guacharo', 'guacharo-activo'),
      ('el-guacharo', 'guacharo-activo'),
      ('guacharito', 'el-guacharito-millonario'),
      ('el-guacharito', 'el-guacharito-millonario'),
      ('guacharito-millonario', 'el-guacharito-millonario'),
      ('granjita', 'la-granjita'),
      ('lagranjita', 'la-granjita'),
      ('loto-chaima', 'loto-chaim-a'),
      ('lotto-activo-rd', 'lotto-activo-internacional'),
      ('lotto-activo-rd-internacional', 'lotto-activo-internacional')
    ) AS t(old_slug, canonical_slug)
  LOOP
    -- Encontrar o promover el juego oficial con el slug canónico
    SELECT id INTO v_winner_id
    FROM public.games
    WHERE slug = v_pair.canonical_slug
    ORDER BY is_active DESC, display_order ASC, created_at ASC
    LIMIT 1;

    IF v_winner_id IS NULL THEN
      -- Si no existe aún con el slug canónico, renombrar el registro alias más prioritario
      SELECT id INTO v_winner_id
      FROM public.games
      WHERE slug = v_pair.old_slug
      ORDER BY is_active DESC, display_order ASC, created_at ASC
      LIMIT 1;

      IF v_winner_id IS NOT NULL THEN
        UPDATE public.games SET slug = v_pair.canonical_slug WHERE id = v_winner_id;
      END IF;
    END IF;

    -- Si además existen filas duplicadas bajo old_slug, migrar sus results y eliminarlas
    IF v_winner_id IS NOT NULL THEN
      FOR v_loser IN
        SELECT id FROM public.games
        WHERE slug = v_pair.old_slug AND id <> v_winner_id
      LOOP
        -- Si hay conflicto con el ganador y el huérfano era manual pero el ganador automático, promoverlo
        UPDATE public.results target
        SET animal_number = src.animal_number,
            animal_name = src.animal_name,
            source = 'manual',
            game_slug = v_pair.canonical_slug
        FROM public.results src
        WHERE src.game_id = v_loser.id
          AND target.game_id = v_winner_id
          AND target.draw_date = src.draw_date
          AND target.draw_time = src.draw_time
          AND src.source = 'manual'
          AND target.source <> 'manual';

        -- Eliminar resultados duplicados en conflicto
        DELETE FROM public.results src
        USING public.results target
        WHERE src.game_id = v_loser.id
          AND target.game_id = v_winner_id
          AND target.draw_date = src.draw_date
          AND target.draw_time = src.draw_time;
        GET DIAGNOSTICS v_deleted_conflicts = v_deleted_conflicts + ROW_COUNT;

        -- Migrar resultados restantes al game_id oficial
        UPDATE public.results
        SET game_id = v_winner_id,
            game_slug = v_pair.canonical_slug
        WHERE game_id = v_loser.id;
        GET DIAGNOSTICS v_migrated = v_migrated + ROW_COUNT;

        -- Migrar imágenes y entradas si existen
        DELETE FROM public.animal_images src
        USING public.animal_images target
        WHERE src.game_id = v_loser.id
          AND target.game_id = v_winner_id
          AND target.animal_number = src.animal_number;

        UPDATE public.animal_images
        SET game_id = v_winner_id
        WHERE game_id = v_loser.id;

        DELETE FROM public.animal_entries src
        USING public.animal_entries target
        WHERE src.game_id = v_loser.id
          AND target.game_id = v_winner_id
          AND target.number = src.number;

        UPDATE public.animal_entries
        SET game_id = v_winner_id
        WHERE game_id = v_loser.id;

        DELETE FROM public.games WHERE id = v_loser.id;
        v_deduped_games := v_deduped_games + 1;
      END LOOP;
    END IF;
  END LOOP;

  -- 3. Consolidar resultados huérfanos que tengan game_slug pero un game_id inexistente en public.games
  WITH resolved_orphans AS (
    SELECT
      r.id AS result_id,
      g.id AS target_game_id,
      g.slug AS canonical_slug,
      r.draw_date,
      r.draw_time,
      r.source,
      r.animal_number,
      r.animal_name
    FROM public.results r
    LEFT JOIN public.games existing_g ON existing_g.id = r.game_id
    JOIN public.games g ON g.slug = CASE lower(coalesce(r.game_slug, ''))
      WHEN 'guacharo' THEN 'guacharo-activo'
      WHEN 'el-guacharo' THEN 'guacharo-activo'
      WHEN 'guacharito' THEN 'el-guacharito-millonario'
      WHEN 'el-guacharito' THEN 'el-guacharito-millonario'
      WHEN 'granjita' THEN 'la-granjita'
      WHEN 'loto-chaima' THEN 'loto-chaim-a'
      ELSE lower(coalesce(r.game_slug, ''))
    END
    WHERE existing_g.id IS NULL
  )
  UPDATE public.results r
  SET game_id = ro.target_game_id,
      game_slug = ro.canonical_slug
  FROM resolved_orphans ro
  WHERE r.id = ro.result_id
    AND NOT EXISTS (
      SELECT 1 FROM public.results conflict
      WHERE conflict.game_id = ro.target_game_id
        AND conflict.draw_date = ro.draw_date
        AND conflict.draw_time = ro.draw_time
    );
  GET DIAGNOSTICS v_migrated = v_migrated + ROW_COUNT;

  -- 4. Rellenar game_slug en todos los resultados oficiales consistentes
  UPDATE public.results r
  SET game_slug = g.slug
  FROM public.games g
  WHERE r.game_id = g.id
    AND (r.game_slug IS DISTINCT FROM g.slug);
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  RETURN jsonb_build_object(
    'deduplicated_games', v_deduped_games,
    'migrated_results', v_migrated,
    'deleted_conflict_results', v_deleted_conflicts,
    'backfilled_game_slugs', v_backfilled
  );
END;
$$;
