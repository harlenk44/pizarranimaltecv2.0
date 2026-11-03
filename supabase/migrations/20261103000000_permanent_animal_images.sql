-- ============================================================================
-- MIGRACIÓN: ALMACENAMIENTO PERMANENTE DE IMÁGENES Y VIDEOS DE ANIMALES POR JUEGO
-- Pizarra Animaltec (Lotto Activo, El Guácharo, La Granjita, Selva Plus, etc.)
-- ============================================================================

-- 1. Crear tabla permanente de imágenes/videos por lotería y número de animal
CREATE TABLE IF NOT EXISTS public.animal_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  animal_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT animal_images_game_id_animal_number_key UNIQUE (game_id, animal_number)
);

CREATE INDEX IF NOT EXISTS idx_animal_images_game_number
  ON public.animal_images (game_id, animal_number);

-- 2. Crear tabla permanente de nombres y etiquetas personalizadas ("0", "00") por lotería
CREATE TABLE IF NOT EXISTS public.animal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT animal_entries_game_id_number_key UNIQUE (game_id, number)
);

CREATE INDEX IF NOT EXISTS idx_animal_entries_game_number
  ON public.animal_entries (game_id, number);

-- 3. Trigger para actualizar updated_at automáticamente en animal_images
CREATE OR REPLACE FUNCTION public.set_animal_images_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_animal_images_updated_at ON public.animal_images;
CREATE TRIGGER trg_animal_images_updated_at
  BEFORE UPDATE ON public.animal_images
  FOR EACH ROW
  EXECUTE FUNCTION public.set_animal_images_updated_at();

-- 4. Habilitar Row Level Security (RLS) con lectura pública para pizarras/TVs
--    y escritura permanente desde el Panel de Administración
ALTER TABLE public.animal_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura publica de animal_images" ON public.animal_images;
CREATE POLICY "Lectura publica de animal_images"
  ON public.animal_images
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Gestion permanente de animal_images" ON public.animal_images;
CREATE POLICY "Gestion permanente de animal_images"
  ON public.animal_images
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura publica de animal_entries" ON public.animal_entries;
CREATE POLICY "Lectura publica de animal_entries"
  ON public.animal_entries
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Gestion permanente de animal_entries" ON public.animal_entries;
CREATE POLICY "Gestion permanente de animal_entries"
  ON public.animal_entries
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 5. Crear Bucket público permanente 'animal-images' en Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'animal-images',
  'animal-images',
  true,
  52428800, -- 50 MB (soporta PNG, JPG, WEBP, GIF, SVG y videos MP4/WEBM)
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'video/mp4',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'video/mp4',
    'video/webm'
  ];

-- 6. Políticas de Storage para el bucket 'animal-images'
DROP POLICY IF EXISTS "Ver imagenes de animales publicamente" ON storage.objects;
CREATE POLICY "Ver imagenes de animales publicamente"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'animal-images');

DROP POLICY IF EXISTS "Subir imagenes de animales permanentemente" ON storage.objects;
CREATE POLICY "Subir imagenes de animales permanentemente"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'animal-images');

DROP POLICY IF EXISTS "Actualizar imagenes de animales permanentemente" ON storage.objects;
CREATE POLICY "Actualizar imagenes de animales permanentemente"
  ON storage.objects
  FOR UPDATE
  TO public
  USING (bucket_id = 'animal-images')
  WITH CHECK (bucket_id = 'animal-images');

DROP POLICY IF EXISTS "Eliminar imagenes de animales desde admin" ON storage.objects;
CREATE POLICY "Eliminar imagenes de animales desde admin"
  ON storage.objects
  FOR DELETE
  TO public
  USING (bucket_id = 'animal-images');

-- 7. Activar Realtime en animal_images y animal_entries para sincronizar TVs al instante
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'animal_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.animal_images;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'animal_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.animal_entries;
  END IF;
END $$;
