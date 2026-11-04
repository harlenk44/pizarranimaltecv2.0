-- Create client licenses table for persistent storage of clients and PIN activations
CREATE TABLE IF NOT EXISTS public.client_licenses (
  id text PRIMARY KEY,
  client_name text NOT NULL,
  pin_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  expires_at timestamptz,
  max_devices int NOT NULL DEFAULT 1,
  bound_device_ids text[] DEFAULT '{}',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.client_licenses ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.client_licenses TO service_role;
GRANT SELECT ON public.client_licenses TO anon, authenticated;

-- Allow reading licenses for client activations and status queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'client_licenses' AND policyname = 'allow_read_licenses'
  ) THEN
    CREATE POLICY "allow_read_licenses" ON public.client_licenses
      FOR SELECT USING (true);
  END IF;
END $$;
