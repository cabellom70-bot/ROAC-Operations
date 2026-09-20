-- Guardados completos. SECURITY INVOKER conserva las politicas RLS existentes.
BEGIN;
CREATE OR REPLACE FUNCTION public.roac_iniciar_mantenimiento(p_numero_mina text, p_motivo text, p_responsable text)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_equipo public.equipos%ROWTYPE; v_id bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=auth.uid() AND rol='operaciones') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_motivo),'') IS NULL OR nullif(btrim(p_responsable),'') IS NULL THEN
    RAISE EXCEPTION 'Indica motivo y responsable';
  END IF;
  -- Las operaciones que afectan al backup comparten el orden de bloqueo.
  PERFORM pg_catalog.pg_advisory_xact_lock(72622,1);
  SELECT * INTO v_equipo FROM public.equipos WHERE numero_mina=p_numero_mina FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipo inexistente o no visible'; END IF;
  IF NOT v_equipo.activo OR v_equipo.estado<>'Operativo' THEN RAISE EXCEPTION 'El equipo no esta disponible'; END IF;
  IF EXISTS(SELECT 1 FROM public.averias WHERE equipo_id=v_equipo.id AND estado_averia<>'Cerrada')
    OR EXISTS(SELECT 1 FROM public.mantenimientos WHERE equipo_id=v_equipo.id AND estado='En curso') THEN
    RAISE EXCEPTION 'El equipo tiene una averia o mantenimiento activo';
  END IF;
  INSERT INTO public.mantenimientos(equipo_id,motivo,responsable,estado)
    VALUES(v_equipo.id,btrim(p_motivo),btrim(p_responsable),'En curso') RETURNING id INTO v_id;
  UPDATE public.equipos SET estado='Mantenimiento programado',es_backup=false WHERE id=v_equipo.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar el equipo'; END IF;
  UPDATE public.configuracion SET valor=null WHERE clave='caex_backup' AND valor=p_numero_mina;
  IF EXISTS(SELECT 1 FROM public.configuracion WHERE clave='caex_backup' AND valor=p_numero_mina) THEN
    RAISE EXCEPTION 'No se pudo retirar el backup';
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.roac_finalizar_mantenimiento(p_mantenimiento_id bigint,p_trabajo text)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_equipo bigint; v_estado text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=auth.uid() AND rol='operaciones') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_trabajo),'') IS NULL THEN RAISE EXCEPTION 'Indica el trabajo realizado'; END IF;
  SELECT equipo_id INTO v_equipo FROM public.mantenimientos WHERE id=p_mantenimiento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mantenimiento inexistente o no visible'; END IF;
  PERFORM id FROM public.equipos WHERE id=v_equipo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipo inexistente o no visible'; END IF;
  SELECT estado INTO v_estado FROM public.mantenimientos WHERE id=p_mantenimiento_id FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'En curso' THEN RAISE EXCEPTION 'El mantenimiento ya no esta en curso'; END IF;
  IF EXISTS(SELECT 1 FROM public.averias WHERE equipo_id=v_equipo AND estado_averia<>'Cerrada') THEN
    RAISE EXCEPTION 'El equipo tiene una averia abierta; revisa su estado';
  END IF;
  UPDATE public.mantenimientos SET estado='Finalizado',trabajo_realizado=btrim(p_trabajo),fecha_fin=clock_timestamp()
    WHERE id=p_mantenimiento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo finalizar el mantenimiento'; END IF;
  UPDATE public.equipos SET estado='Operativo' WHERE id=v_equipo;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar el equipo'; END IF;
  RETURN v_equipo;
END; $$;

CREATE OR REPLACE FUNCTION public.roac_asignar_backup(p_numero_mina text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_equipo public.equipos%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=auth.uid() AND rol='operaciones') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(72622,1);
  PERFORM id FROM public.equipos WHERE tipo='CAEX' ORDER BY id FOR UPDATE;
  IF p_numero_mina IS NOT NULL THEN
    SELECT * INTO v_equipo FROM public.equipos WHERE numero_mina=p_numero_mina AND tipo='CAEX';
    IF NOT FOUND THEN RAISE EXCEPTION 'Selecciona un CAEX valido'; END IF;
    IF NOT v_equipo.activo OR v_equipo.estado<>'Operativo'
      OR EXISTS(SELECT 1 FROM public.averias WHERE equipo_id=v_equipo.id AND estado_averia<>'Cerrada')
      OR EXISTS(SELECT 1 FROM public.mantenimientos WHERE equipo_id=v_equipo.id AND estado='En curso') THEN
      RAISE EXCEPTION 'El CAEX no esta disponible para backup';
    END IF;
  END IF;
  UPDATE public.equipos SET es_backup=false WHERE tipo='CAEX' AND es_backup;
  IF p_numero_mina IS NOT NULL THEN
    UPDATE public.equipos SET es_backup=true WHERE id=v_equipo.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo asignar el backup'; END IF;
  END IF;
  INSERT INTO public.configuracion(clave,valor) VALUES('caex_backup',p_numero_mina)
    ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo guardar el backup'; END IF;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.roac_iniciar_mantenimiento(text,text,text),public.roac_finalizar_mantenimiento(bigint,text),public.roac_asignar_backup(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.roac_iniciar_mantenimiento(text,text,text),public.roac_finalizar_mantenimiento(bigint,text),public.roac_asignar_backup(text) TO authenticated;
COMMIT;
