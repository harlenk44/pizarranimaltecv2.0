ALTER TABLE public.games ADD COLUMN IF NOT EXISTS loading_mode text NOT NULL DEFAULT 'manual';
ALTER TABLE public.games ADD CONSTRAINT games_loading_mode_valid CHECK (loading_mode IN ('manual', 'automatic'));
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.results ADD CONSTRAINT results_source_valid CHECK (source IN ('manual', 'automatic'));

CREATE OR REPLACE FUNCTION public.sync_automatic_result(p_game_id uuid, p_draw_date date, p_draw_time time, p_animal_number integer, p_animal_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mode text; affected integer;
BEGIN
  SELECT loading_mode INTO mode FROM public.games WHERE id = p_game_id AND is_active = true FOR UPDATE;
  IF mode IS DISTINCT FROM 'automatic' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.animal_entries WHERE game_id = p_game_id AND number = p_animal_number AND name = p_animal_name) THEN
    RAISE EXCEPTION 'Animal no valido para esta loteria';
  END IF;
  INSERT INTO public.results (game_id, draw_date, draw_time, animal_number, animal_name, source)
  VALUES (p_game_id, p_draw_date, p_draw_time, p_animal_number, p_animal_name, 'automatic')
  ON CONFLICT (game_id, draw_date, draw_time) DO UPDATE
  SET animal_number = EXCLUDED.animal_number, animal_name = EXCLUDED.animal_name, source = 'automatic'
  WHERE public.results.source = 'automatic';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_automatic_result(uuid, date, time, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_automatic_result(uuid, date, time, integer, text) TO service_role;
COMMENT ON FUNCTION public.sync_automatic_result(uuid, date, time, integer, text) IS 'Atomic automatic ingestion: validates game mode and animal catalog, and never overwrites manual results.';