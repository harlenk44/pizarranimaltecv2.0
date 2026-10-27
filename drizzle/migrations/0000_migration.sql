-- ===== Roles =====
CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  subscription_status text NOT NULL DEFAULT 'inactive' CHECK (subscription_status IN ('active','inactive','trial','expired')),
  subscription_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

CREATE POLICY "own or admin read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "own or admin read roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- First account becomes admin; everyone else is a viewer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, COALESCE(NEW.email, '')) ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Admin-only subscription changes
CREATE OR REPLACE FUNCTION public.set_subscription_status(target_user_id uuid, new_status text, new_expires_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF new_status NOT IN ('active','inactive','trial','expired') THEN RAISE EXCEPTION 'Estado de suscripcion invalido'; END IF;
  UPDATE public.profiles SET subscription_status = new_status, subscription_expires_at = new_expires_at WHERE id = target_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_subscription_status FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_subscription_status TO authenticated;

-- ===== Games / results =====
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  color text NOT NULL DEFAULT '#1a56db',
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  draw_date date NOT NULL,
  draw_time time NOT NULL,
  animal_number int NOT NULL CHECK (animal_number >= 0),
  animal_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, draw_date, draw_time)
);
CREATE INDEX idx_results_game_date ON public.results (game_id, draw_date DESC, draw_time DESC);
CREATE TABLE public.animal_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  animal_number int NOT NULL,
  image_url text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX animal_images_game_id_animal_number_key ON public.animal_images (game_id, animal_number);
CREATE TABLE public.animal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  number int NOT NULL,
  name text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (game_id, number)
);
CREATE TABLE public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  link_url text,
  placement text NOT NULL DEFAULT 'top' CHECK (placement IN ('top','bottom','sidebar','fullwidth')),
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_ads_active ON public.ads (is_active, display_order);
CREATE TABLE public.app_settings (
  id text PRIMARY KEY DEFAULT 'global',
  background_color text NOT NULL DEFAULT '#020617',
  surface_color text NOT NULL DEFAULT '#0f172a',
  primary_color text NOT NULL DEFAULT '#2563eb',
  text_color text NOT NULL DEFAULT '#f8fafc',
  font_family text NOT NULL DEFAULT 'Inter',
  base_font_size int NOT NULL DEFAULT 16,
  rotation_enabled boolean NOT NULL DEFAULT false,
  rotation_interval_seconds int NOT NULL DEFAULT 60,
  start_view text NOT NULL DEFAULT 'daily' CHECK (start_view IN ('daily','weekly')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['games','results','animal_images','animal_entries','ads','app_settings'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "admin insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.is_admin())', t);
    EXECUTE format('CREATE POLICY "admin update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
    EXECUTE format('CREATE POLICY "admin delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.is_admin())', t);
  END LOOP;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads;

-- ===== Storage (private buckets; signed-in users can view) =====
CREATE POLICY "signed in read app media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('animal-images','ads'));
CREATE POLICY "admin upload app media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('animal-images','ads') AND public.is_admin());
CREATE POLICY "admin update app media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('animal-images','ads') AND public.is_admin()) WITH CHECK (bucket_id IN ('animal-images','ads') AND public.is_admin());
CREATE POLICY "admin delete app media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('animal-images','ads') AND public.is_admin());

-- ===== Seed =====
INSERT INTO public.app_settings (id) VALUES ('global');

INSERT INTO public.games (id, name, slug, color, display_order) VALUES
  ('7d21a00b-0dfa-4bdc-9edf-8115802df1d6','LOTTO ACTIVO','lotto-activo','#1a56db',1),
  ('01da9c54-392a-45e3-ab66-9a08befe7694','GUACHARO','guacharo','#059669',2),
  ('0519825d-e7ea-4e59-bf7d-cef2c832edd3','GUACHARITO','guacharito','#7c2d12',3),
  ('8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e','SELVA PLUS','selva-plus','#0d9488',4),
  ('1efc5373-a547-4f7f-9955-845b5ede5ce2','LOTO CHAIM A','loto-chaim-a','#b45309',5);
INSERT INTO public.games (name, slug, color, display_order) VALUES
  ('TRIO ACTIVO','trio-activo','#be123c',6),
  ('TRIPLE FACIL','triple-facil','#6d28d9',7),
  ('GRANJITA','granjita','#ca8a04',8),
  ('LOTTO ACTIVO INTERNACIONAL','lotto-activo-internacional','#1e40af',9),
  ('MONJE MILLONARIO','monje-millonario','#0f766e',10);

INSERT INTO public.animal_entries (game_id, number, name)
SELECT g.id, (u.ord - 1)::int, u.name
FROM (VALUES
('guacharo', ARRAY['Ballena','Carnero','Toro','Ciempiés','Alacrán','León','Rana','Perico','Ratón','Águila','Tigre','Gato','Caballo','Mono','Paloma','Zorro','Oso','Pavo','Burro','Chivo','Cochino','Gallo','Camello','Cebra','Iguana','Gallina','Vaca','Perro','Zamuro','Elefante','Caimán','Lapa','Ardilla','Pescado','Venado','Jirafa','Culebra','Tortuga','Búfalo','Lechuza','Avispa','Canguro','Tucán','Mariposa','Chigüire','Garza','Puma','Pavo Real','Puercoespín','Pereza','Canario','Pelícano','Pulpo','Caracol','Grillo','Oso Hormiguero','Tiburón','Pato','Hormiga','Pantera','Camaleón','Panda','Cachicamo','Cangrejo','Gavilán','Araña','Lobo','Avestruz','Jaguar','Conejo','Bisonte','Guacamaya','Gorila','Hipopótamo','Turpial','Guácharo','Guacharo']),
('guacharito', ARRAY['Ballena','Carnero','Toro','Ciempiés','Alacrán','León','Rana','Perico','Ratón','Águila','Tigre','Gato','Caballo','Mono','Paloma','Zorro','Oso','Pavo','Burro','Chivo','Cochino','Gallo','Camello','Cebra','Iguana','Gallina','Vaca','Perro','Zamuro','Elefante','Caimán','Lapa','Ardilla','Pescado','Venado','Jirafa','Culebra','Tortuga','Búfalo','Lechuza','Avispa','Canguro','Tucán','Mariposa','Chigüire','Garza','Puma','Pavo Real','Puercoespín','Pereza','Canario','Pelícano','Pulpo','Caracol','Grillo','Oso Hormiguero','Tiburón','Pato','Hormiga','Pantera','Camaleón','Panda','Cachicamo','Cangrejo','Gavilán','Araña','Lobo','Avestruz','Jaguar','Conejo','Bisonte','Guacamaya','Gorila','Hipopótamo','Turpial','Guácharo','Rinoceronte','Pingüino','Antílope','Calamar','Murciélago','Cuervo','Cucaracha','Búho','Camarón','Hámster','Buey','Cabra','Erizo de Mar','Anguila','Hurón','Morrocoy','Cisne','Gaviota','Paujil','Escarabajo','Caballito de Mar','Loro','Cocodrilo','Guacharito','Delfín']),
('loto-chaim-a', ARRAY['Ballena','Carnero','Toro','Ciempiés','Alacrán','León','Rana','Perico','Ratón','Águila','Tigre','Gato','Caballo','Mono','Paloma','Zorro','Oso','Pavo','Burro','Chivo','Cochino','Gallo','Camello','Cebra','Iguana','Gallina','Vaca','Perro','Zamuro','Elefante','Caimán','Lapa','Ardilla','Pescado','Venado','Jirafa','Culebra','Tortuga','Búfalo','Lechuza','Avispa','Canguro','Tucán','Mariposa','Chigüire','Garza','Puma','Pavo Real','Puercoespín','Pereza','Canario','Pelícano','Pulpo','Caracol','Grillo','Oso Hormiguero','Delfín']),
('lotto-activo', ARRAY['Ballena','Carnero','Toro','Ciempiés','Alacrán','León','Rana','Perico','Ratón','Águila','Tigre','Gato','Caballo','Mono','Paloma','Zorro','Oso','Pavo','Burro','Chivo','Cochino','Gallo','Camello','Cebra','Iguana','Gallina','Vaca','Perro','Zamuro','Elefante','Caimán','Lapa','Ardilla','Pescado','Venado','Jirafa','Culebra','Delfín'])
) AS v(slug, names)
JOIN public.games g ON g.slug = v.slug
CROSS JOIN LATERAL unnest(v.names) WITH ORDINALITY AS u(name, ord);

INSERT INTO public.animal_entries (game_id, number, name)
SELECT '8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e', number, name FROM public.animal_entries
WHERE game_id = '0519825d-e7ea-4e59-bf7d-cef2c832edd3';

UPDATE public.animal_entries SET label = '00' WHERE name = 'Ballena';
UPDATE public.animal_entries SET label = '0' WHERE name = 'Delfín';