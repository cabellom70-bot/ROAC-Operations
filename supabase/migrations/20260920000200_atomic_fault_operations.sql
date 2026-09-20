BEGIN;
CREATE OR REPLACE FUNCTION public.roac_publicar_averia(p_equipo_id bigint,p_sistema text,p_ubicacion text,p_detalle text,p_informado_por text)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_equipo public.equipos%ROWTYPE; v_id bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=auth.uid() AND rol='operaciones') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_sistema),'') IS NULL OR nullif(btrim(p_informado_por),'') IS NULL THEN
    RAISE EXCEPTION 'Indica sistema e informante';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(72622,1);
  SELECT * INTO v_equipo FROM public.equipos WHERE id=p_equipo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipo inexistente o no visible'; END IF;
  IF NOT v_equipo.activo OR v_equipo.estado<>'Operativo' THEN RAISE EXCEPTION 'El equipo no esta disponible'; END IF;
  IF EXISTS(SELECT 1 FROM public.averias WHERE equipo_id=p_equipo_id AND estado_averia<>'Cerrada') THEN
    RAISE EXCEPTION 'El equipo ya tiene una averia abierta' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.mantenimientos WHERE equipo_id=p_equipo_id AND estado='En curso') THEN
    RAISE EXCEPTION 'El equipo tiene mantenimiento activo';
  END IF;
  INSERT INTO public.averias(equipo_id,sistema,estado_equipo,estado_averia,ubicacion,detalle_inicial,informado_por)
    VALUES(p_equipo_id,btrim(p_sistema),'Fuera de servicio','Publicada',coalesce(p_ubicacion,''),coalesce(p_detalle,''),btrim(p_informado_por))
    RETURNING id INTO v_id;
  UPDATE public.equipos SET estado='Fuera de servicio',es_backup=false WHERE id=p_equipo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar el equipo'; END IF;
  UPDATE public.configuracion SET valor=null WHERE clave='caex_backup' AND valor=v_equipo.numero_mina;
  IF EXISTS(SELECT 1 FROM public.configuracion WHERE clave='caex_backup' AND valor=v_equipo.numero_mina) THEN
    RAISE EXCEPTION 'No se pudo retirar el backup';
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.roac_registrar_intervencion(p_averia_id bigint,p_tipo text,p_tecnico text,p_clave_turno text,p_detalle text DEFAULT NULL,p_tecnico_anterior text DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_equipo bigint; v_averia public.averias%ROWTYPE; v_fecha timestamptz; v_detalle text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.perfiles WHERE id=auth.uid() AND rol='operaciones') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_tecnico),'') IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('TOMA','CONTINUIDAD','AVANCE') THEN
    RAISE EXCEPTION 'Tecnico o tipo de intervencion invalido';
  END IF;
  SELECT equipo_id INTO v_equipo FROM public.averias WHERE id=p_averia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Averia inexistente o no visible'; END IF;
  PERFORM id FROM public.equipos WHERE id=v_equipo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipo inexistente o no visible'; END IF;
  SELECT * INTO v_averia FROM public.averias WHERE id=p_averia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Averia inexistente o no visible'; END IF;
  IF (p_tipo='TOMA' AND v_averia.estado_averia<>'Publicada')
    OR (p_tipo<>'TOMA' AND v_averia.estado_averia<>'En atención') THEN
    RAISE EXCEPTION 'La averia cambio de estado; actualiza los datos';
  END IF;
  IF EXISTS(SELECT 1 FROM public.mantenimientos WHERE equipo_id=v_equipo AND estado='En curso') THEN
    RAISE EXCEPTION 'El equipo tiene mantenimiento activo';
  END IF;
  v_fecha=clock_timestamp();
  IF p_tipo='TOMA' THEN
    UPDATE public.averias SET estado_averia='En atención',estado_equipo='En atención',tomada_por=btrim(p_tecnico),fecha_atencion=v_fecha WHERE id=p_averia_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo tomar la averia'; END IF;
    UPDATE public.equipos SET estado='En atención' WHERE id=v_equipo;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar el equipo'; END IF;
    v_detalle='Toma inicial de la avería.';
  ELSIF p_tipo='CONTINUIDAD' THEN
    IF v_averia.tomada_por IS DISTINCT FROM p_tecnico_anterior THEN RAISE EXCEPTION 'El tecnico cambio; actualiza los datos'; END IF;
    UPDATE public.averias SET tomada_por=btrim(p_tecnico) WHERE id=p_averia_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo cambiar el tecnico'; END IF;
    v_detalle='Continuidad de atención. Recibe de ' || coalesce(nullif(v_averia.tomada_por,''),'turno anterior') || '.';
  ELSE
    IF nullif(btrim(p_detalle),'') IS NULL THEN RAISE EXCEPTION 'Indica el avance realizado'; END IF;
    v_detalle=btrim(p_detalle);
  END IF;
  INSERT INTO public.intervenciones_averia(averia_id,tecnico,tipo,detalle,fecha,clave_turno)
    VALUES(p_averia_id,btrim(p_tecnico),p_tipo,v_detalle,v_fecha,p_clave_turno);
  RETURN v_fecha;
END; $$;
REVOKE ALL ON FUNCTION public.roac_publicar_averia(bigint,text,text,text,text),public.roac_registrar_intervencion(bigint,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.roac_publicar_averia(bigint,text,text,text,text),public.roac_registrar_intervencion(bigint,text,text,text,text,text) TO authenticated;
COMMIT;
