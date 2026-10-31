-- ==============================================================================
-- SISTEMA DE VINCULACIÓN PARA SMART TV (ANDROID TV & GOOGLE TV)
-- Pizarra Animaltec / Supabase SQL Setup
-- ==============================================================================

-- 1. Tabla de Dispositivos y Televisores Registrados
CREATE TABLE IF NOT EXISTS public.tv_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT UNIQUE NOT NULL,
    device_name TEXT NOT NULL DEFAULT 'Smart TV',
    pairing_code TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ DEFAULT NULL,
    activated_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para búsquedas rápidas por ID de dispositivo y código
CREATE INDEX IF NOT EXISTS idx_tv_devices_lookup ON public.tv_devices(device_id, pairing_code);

-- Habilitar RLS
ALTER TABLE public.tv_devices ENABLE ROW LEVEL SECURITY;

-- Política RLS: Administradores tienen control total sobre dispositivos TV
CREATE POLICY "Admins control tv_devices"
ON public.tv_devices
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
);

-- 2. Tabla de Códigos de Vinculación Temporal (Pairing Codes de 6 dígitos)
CREATE TABLE IF NOT EXISTS public.tv_pairing_codes (
    code TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para vencimiento rápido
CREATE INDEX IF NOT EXISTS idx_tv_pairing_created ON public.tv_pairing_codes(created_at);

ALTER TABLE public.tv_pairing_codes ENABLE ROW LEVEL SECURITY;

-- Permitir lectura y escritura a clientes anónimos para vincular
CREATE POLICY "Public tv_pairing_codes access"
ON public.tv_pairing_codes
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 3. FUNCIÓN RPC: Generar/Obtener Código de Vinculación de 6 Dígitos para Televisores
CREATE OR REPLACE FUNCTION public.request_tv_pairing_code(p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_code TEXT;
    v_device RECORD;
BEGIN
    -- Comprobar si el dispositivo ya está activado
    SELECT * INTO v_device FROM public.tv_devices WHERE device_id = p_device_id;
    IF v_device.id IS NOT NULL AND v_device.is_active THEN
        IF v_device.expires_at IS NULL OR v_device.expires_at > now() THEN
            RETURN jsonb_build_object(
                'status', 'already_active',
                'device_name', v_device.device_name,
                'expires_at', v_device.expires_at
            );
        END IF;
    END IF;

    -- Comprobar si ya existe un código reciente para este dispositivo
    SELECT code INTO v_code FROM public.tv_pairing_codes
    WHERE device_id = p_device_id AND created_at > (now() - INTERVAL '15 minutes')
    ORDER BY created_at DESC LIMIT 1;

    -- Si no existe, generar nuevo código de 6 dígitos
    IF v_code IS NULL THEN
        v_code := lpad(floor(random() * 900000 + 100000)::text, 6, '0');
        -- Formatear con guión para fácil lectura ej: 482-901
        v_code := substring(v_code from 1 for 3) || '-' || substring(v_code from 4 for 3);
        
        INSERT INTO public.tv_pairing_codes (code, device_id)
        VALUES (v_code, p_device_id)
        ON CONFLICT (code) DO UPDATE SET created_at = now();
    END IF;

    RETURN jsonb_build_object(
        'status', 'code_generated',
        'code', v_code,
        'device_id', p_device_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_tv_pairing_code(TEXT) TO anon, authenticated;

-- 4. FUNCIÓN RPC: Autorizar Televisor mediante Código desde el Panel de Administrador
CREATE OR REPLACE FUNCTION public.authorize_tv_device(
    p_code TEXT,
    p_device_name TEXT DEFAULT 'Smart TV',
    p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_device_id TEXT;
    v_expires_at TIMESTAMPTZ;
    v_formatted_code TEXT;
BEGIN
    v_formatted_code := TRIM(p_code);
    IF length(replace(v_formatted_code, '-', '')) = 6 AND position('-' in v_formatted_code) = 0 THEN
        v_formatted_code := substring(v_formatted_code from 1 for 3) || '-' || substring(v_formatted_code from 4 for 3);
    END IF;

    SELECT device_id INTO v_device_id
    FROM public.tv_pairing_codes
    WHERE code = v_formatted_code;

    IF v_device_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'El código de vincular no es válido o ha expirado.'
        );
    END IF;

    IF p_days IS NOT NULL THEN
        v_expires_at := now() + (p_days || ' days')::INTERVAL;
    ELSE
        v_expires_at := NULL;
    END IF;

    -- Registrar o actualizar el televisor
    INSERT INTO public.tv_devices (device_id, device_name, pairing_code, is_active, expires_at, activated_at)
    VALUES (v_device_id, COALESCE(p_device_name, 'Smart TV'), v_formatted_code, true, v_expires_at, now())
    ON CONFLICT (device_id) DO UPDATE SET
        device_name = EXCLUDED.device_name,
        pairing_code = EXCLUDED.pairing_code,
        is_active = true,
        expires_at = v_expires_at,
        activated_at = now();

    -- Limpiar el código usado
    DELETE FROM public.tv_pairing_codes WHERE code = v_formatted_code;

    RETURN jsonb_build_object(
        'success', true,
        'device_id', v_device_id,
        'device_name', p_device_name,
        'expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.authorize_tv_device(TEXT, TEXT, INTEGER) TO anon, authenticated;

-- 5. FUNCIÓN RPC: Verificar estado del Televisor (Llamado cada pocos segundos por la TV)
CREATE OR REPLACE FUNCTION public.check_tv_device_status(p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_device RECORD;
BEGIN
    SELECT * INTO v_device FROM public.tv_devices WHERE device_id = p_device_id;

    IF v_device.id IS NULL THEN
        RETURN jsonb_build_object('active', false, 'message', 'Pendiente de activación');
    END IF;

    IF NOT v_device.is_active THEN
        RETURN jsonb_build_object('active', false, 'message', 'Televisor pausado o suspendido');
    END IF;

    IF v_device.expires_at IS NOT NULL AND v_device.expires_at < now() THEN
        RETURN jsonb_build_object('active', false, 'message', 'Servicio vencido el ' || to_char(v_device.expires_at, 'DD/MM/YYYY'));
    END IF;

    RETURN jsonb_build_object(
        'active', true,
        'device_name', v_device.device_name,
        'expires_at', v_device.expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_tv_device_status(TEXT) TO anon, authenticated;
