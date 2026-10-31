-- ==============================================================================
-- SISTEMA DE LICENCIAMIENTO POR CLIENTES Y EQUIPOS (TELEVISORES)
-- Pizarra Animaltec / Supabase Setup SQL
-- ==============================================================================

-- 1. Habilitar extensión pgcrypto para hashing y validación segura de claves
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Crear la tabla de licencias de clientes/dispositivos
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    serial_number TEXT UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    device_id TEXT DEFAULT NULL,
    activated_at TIMESTAMPTZ DEFAULT NULL,
    expires_at TIMESTAMPTZ DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para búsquedas rápidas por usuario y serial
CREATE INDEX IF NOT EXISTS idx_licenses_user_serial ON public.licenses(LOWER(username), UPPER(serial_number));

-- Habilitar Seguridad a Nivel de Fila (RLS)
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Política RLS: Solo lectura directa vía cliente para administradores autenticados
CREATE POLICY "Admins full control over licenses"
ON public.licenses
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
);

-- ==============================================================================
-- 3. FUNCIÓN RPC DE ACTIVACIÓN DE DISPOSITIVO (Ancla el serial al televisor)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.activate_device_license(
    p_username TEXT,
    p_password_plain TEXT,
    p_serial_number TEXT,
    p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_license RECORD;
BEGIN
    -- Buscar la licencia por Usuario y Serial
    SELECT * INTO v_license
    FROM public.licenses
    WHERE LOWER(username) = LOWER(TRIM(p_username))
      AND UPPER(serial_number) = UPPER(TRIM(p_serial_number));

    IF v_license.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'El usuario o Serial de Registro ingresado es incorrecto'
        );
    END IF;

    -- Validar estado activo
    IF NOT v_license.is_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Esta licencia se encuentra inactiva o suspendida. Contacte al administrador.'
        );
    END IF;

    -- Validar fecha de vencimiento si aplica
    IF v_license.expires_at IS NOT NULL AND v_license.expires_at < now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Esta licencia venció el ' || to_char(v_license.expires_at, 'DD/MM/YYYY')
        );
    END IF;

    -- Validar Clave (Soporta pgcrypto crypt, SHA-256 o comparación directa)
    IF v_license.password_hash != extensions.crypt(p_password_plain, v_license.password_hash)
       AND v_license.password_hash != encode(digest(p_password_plain, 'sha256'), 'hex')
       AND v_license.password_hash != p_password_plain THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'La clave ingresada es incorrecta'
        );
    END IF;

    -- Verificar si el serial ya fue registrado en otro equipo/televisor
    IF v_license.device_id IS NOT NULL AND v_license.device_id != p_device_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Este serial de registro ya está anclado a otro televisor/dispositivo'
        );
    END IF;

    -- Registrar y anclar el ID del televisor en la base de datos si es la primera vez
    IF v_license.device_id IS NULL THEN
        UPDATE public.licenses
        SET device_id = p_device_id,
            activated_at = now()
        WHERE id = v_license.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'license_id', v_license.id,
        'username', v_license.username,
        'serial_number', v_license.serial_number,
        'expires_at', v_license.expires_at
    );
END;
$$;

-- Permitir ejecución pública anónima y autenticada de la función RPC de activación
GRANT EXECUTE ON FUNCTION public.activate_device_license(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ==============================================================================
-- 4. FUNCIÓN RPC DE VALIDACIÓN INICIAL AL ARRANCAR LA APLICACIÓN
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.validate_device_license(
    p_serial_number TEXT,
    p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_license RECORD;
BEGIN
    SELECT * INTO v_license
    FROM public.licenses
    WHERE UPPER(serial_number) = UPPER(TRIM(p_serial_number))
      AND device_id = p_device_id;

    IF v_license.id IS NULL THEN
        RETURN jsonb_build_object(
            'valid', false,
            'message', 'Este equipo no cuenta con una licencia vinculada válida'
        );
    END IF;

    IF NOT v_license.is_active THEN
        RETURN jsonb_build_object(
            'valid', false,
            'message', 'La licencia asignada a este televisor se encuentra inactiva'
        );
    END IF;

    IF v_license.expires_at IS NOT NULL AND v_license.expires_at < now() THEN
        RETURN jsonb_build_object(
            'valid', false,
            'message', 'La licencia asignada a este televisor ha vencido'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'username', v_license.username,
        'expires_at', v_license.expires_at
    );
END;
$$;

-- Permitir ejecución pública anónima y autenticada de la función RPC de validación
GRANT EXECUTE ON FUNCTION public.validate_device_license(TEXT, TEXT) TO anon, authenticated;

-- ==============================================================================
-- EJEMPLO: INSERTAR UNA LICENCIA DEMO PARA PRUEBAS
-- ==============================================================================
-- Clave '123456' en texto plano (o hasheada):
INSERT INTO public.licenses (username, password_hash, serial_number, is_active)
VALUES ('televisor1', '123456', 'SERIAL-1234-5678', true)
ON CONFLICT (serial_number) DO NOTHING;
