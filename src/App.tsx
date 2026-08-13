import { supabase } from "./lib/supabase";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import "./App.css";

import EquipoCard from "./components/EquipoCard";
import DetalleAveria from "./pages/DetalleAveria";
import RegistrarAveria, {
  type DatosNuevaAveria,
} from "./pages/RegistrarAveria";

import type { Averia } from "./types/Averia";
import type { Equipo } from "./types/Equipo";


type Vista =
  | "inicio"
  | "averias"
  | "status"
  | "seleccionar-equipo"
  | "registrar-averia"
  | "detalle-averia"
  | "seleccionar-backup";

type RolUsuario = "operaciones" | "consulta";

type TipoTurno = "Día" | "Noche";

type TurnoActual = {
  tipo: TipoTurno;
  horario: string;
  fechaCalendario: string;
  fechaLarga: string;
  fechaInicioTurno: string;
  fechaFinTurno: string;
  horaInicioTurno: string;
  horaFinTurno: string;
  rangoTurno: string;
  claveTurno: string;
};

const ZONA_HORARIA_OPERACIONAL = "America/Santiago";

function obtenerPartesChile(fecha: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_OPERACIONAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);

  const valores = Object.fromEntries(
    partes
      .filter((parte) => parte.type !== "literal")
      .map((parte) => [parte.type, parte.value]),
  );

  return {
    year: Number(valores.year),
    month: Number(valores.month),
    day: Number(valores.day),
    hour: Number(valores.hour),
    minute: Number(valores.minute),
  };
}

function formatearFechaOperacional(
  year: number,
  month: number,
  day: number,
) {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(
    2,
    "0",
  )}/${year}`;
}

function formatearFechaLarga(
  year: number,
  month: number,
  day: number,
) {
  const fechaUtc = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(fechaUtc);
}

function sumarDiasCalendario(
  year: number,
  month: number,
  day: number,
  dias: number,
) {
  const fechaUtc = new Date(Date.UTC(year, month - 1, day));
  fechaUtc.setUTCDate(fechaUtc.getUTCDate() + dias);

  return {
    year: fechaUtc.getUTCFullYear(),
    month: fechaUtc.getUTCMonth() + 1,
    day: fechaUtc.getUTCDate(),
  };
}


function obtenerTurnoActual(fecha: Date = new Date()): TurnoActual {
  const partes = obtenerPartesChile(fecha);
  const minutos = partes.hour * 60 + partes.minute;

  // Día: 08:01 a 20:00
  // Noche: 20:01 a 08:00
  const esTurnoDia =
    minutos >= 8 * 60 + 1 &&
    minutos <= 20 * 60;

  const fechaCalendario = formatearFechaOperacional(
    partes.year,
    partes.month,
    partes.day,
  );

  const fechaLarga = formatearFechaLarga(
    partes.year,
    partes.month,
    partes.day,
  );

  let inicio: { year: number; month: number; day: number };
  let fin: { year: number; month: number; day: number };
  let horaInicioTurno: string;
  let horaFinTurno: string;

  if (esTurnoDia) {
    inicio = {
      year: partes.year,
      month: partes.month,
      day: partes.day,
    };

    fin = {
      year: partes.year,
      month: partes.month,
      day: partes.day,
    };

    horaInicioTurno = "08:01";
    horaFinTurno = "20:00";
  } else if (minutos >= 20 * 60 + 1) {
    inicio = {
      year: partes.year,
      month: partes.month,
      day: partes.day,
    };

    fin = sumarDiasCalendario(
      partes.year,
      partes.month,
      partes.day,
      1,
    );

    horaInicioTurno = "20:01";
    horaFinTurno = "08:00";
  } else {
    inicio = sumarDiasCalendario(
      partes.year,
      partes.month,
      partes.day,
      -1,
    );

    fin = {
      year: partes.year,
      month: partes.month,
      day: partes.day,
    };

    horaInicioTurno = "20:01";
    horaFinTurno = "08:00";
  }

  const fechaInicioTurno = formatearFechaOperacional(
    inicio.year,
    inicio.month,
    inicio.day,
  );

  const fechaFinTurno = formatearFechaOperacional(
    fin.year,
    fin.month,
    fin.day,
  );

  const tipo: TipoTurno =
    esTurnoDia ? "Día" : "Noche";

  return {
    tipo,
    horario:
      tipo === "Día"
        ? "08:01 a 20:00"
        : "20:01 a 08:00",

    // Esta fecha cambia con el calendario real,
    // aunque el turno noche continúe después de medianoche.
    fechaCalendario,
    fechaLarga,

    // Intervalo completo de 12 horas del turno.
    fechaInicioTurno,
    fechaFinTurno,
    horaInicioTurno,
    horaFinTurno,

    rangoTurno:
      `${fechaInicioTurno} ${horaInicioTurno} → ` +
      `${fechaFinTurno} ${horaFinTurno}`,

    // Identificador estable para histórico e informes.
    claveTurno:
      `${inicio.year}-` +
      `${String(inicio.month).padStart(2, "0")}-` +
      `${String(inicio.day).padStart(2, "0")}-` +
      `${tipo === "Día" ? "DIA" : "NOCHE"}`,
  };
}


function obtenerHoraActual() {
  return new Date().toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function App() {
  const [vista, setVista] = useState<Vista>("inicio");
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [averias, setAverias] = useState<Averia[]>([]);
  const [equipoSeleccionado, setEquipoSeleccionado] =
    useState<Equipo | null>(null);
  const [averiaSeleccionadaId, setAveriaSeleccionadaId] =
    useState<number | null>(null);
  const [numeroBackup, setNumeroBackup] =
    useState<string | null>(null);

  const [sesion, setSesion] = useState<Session | null>(null);
  const [rol, setRol] = useState<RolUsuario | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  const [usuarioLogin, setUsuarioLogin] = useState("");
  const [passwordLogin, setPasswordLogin] = useState("");
  const [errorLogin, setErrorLogin] = useState("");
  const [iniciandoSesion, setIniciandoSesion] = useState(false);

  const puedeModificar = rol === "operaciones";
  const [turnoActual, setTurnoActual] = useState<TurnoActual>(
    () => obtenerTurnoActual(),
  );

  async function cargarPerfil(userId: string) {
    const { data, error } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error al cargar perfil:", error);
      setRol(null);
      return;
    }

    if (data?.rol === "operaciones" || data?.rol === "consulta") {
      setRol(data.rol);
    } else {
      setRol(null);
    }
  }

  async function iniciarSesion() {
    const usuario = usuarioLogin.trim().toLowerCase();

    if (!usuario || !passwordLogin) {
      setErrorLogin("Ingresa usuario y contraseña.");
      return;
    }

    // Permitimos escribir solo "operaciones" o "consulta"
    // aunque Supabase internamente use el correo @roac.local.
    const email = usuario.includes("@")
      ? usuario
      : `${usuario}@roac.local`;

    try {
      setIniciandoSesion(true);
      setErrorLogin("");

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: passwordLogin,
      });

      if (error || !data.session) {
        console.error("Error de inicio de sesión:", error);
        setErrorLogin("Usuario o contraseña incorrectos.");
        return;
      }

      setSesion(data.session);
      await cargarPerfil(data.session.user.id);
      setPasswordLogin("");
      setVista("inicio");
    } catch (error) {
      console.error(error);
      setErrorLogin("No se pudo iniciar sesión.");
    } finally {
      setIniciandoSesion(false);
    }
  }

  async function cerrarSesionUsuario() {
    await supabase.auth.signOut();

    setSesion(null);
    setRol(null);
    setEquipos([]);
    setAverias([]);
    setNumeroBackup(null);
    setEquipoSeleccionado(null);
    setAveriaSeleccionadaId(null);
    setVista("inicio");
  }

  function exigirPermiso() {
    if (puedeModificar) {
      return true;
    }

    alert("Este acceso es de solo lectura.");
    return false;
  }

  async function cargarEquipos() {
    const { data, error } = await supabase
      .from("equipos")
      .select("*");

    if (error) {
      console.error(error);
      return;
    }

    const ordenEquipos = [
      "051",
      "052",
      "053",
      "054",
      "055",
      "070",
      "071",
      "072",
      "592",
      "067",
      "098",
      "099",
    ];

    const equiposConvertidos: Equipo[] = data.map((e) => ({
      numeroMina: e.numero_mina,
      numeroInterno: e.numero_interno,
      tipo: e.tipo,
      marca: e.marca,
      modelo: e.modelo,
      estado: e.estado,
    }));

    equiposConvertidos.sort((a, b) => {
      const posicionA = ordenEquipos.indexOf(a.numeroMina);
      const posicionB = ordenEquipos.indexOf(b.numeroMina);

      const ordenA =
        posicionA === -1 ? ordenEquipos.length : posicionA;
      const ordenB =
        posicionB === -1 ? ordenEquipos.length : posicionB;

      if (ordenA !== ordenB) {
        return ordenA - ordenB;
      }

      return a.numeroMina.localeCompare(b.numeroMina, "es", {
        numeric: true,
      });
    });

    setEquipos(equiposConvertidos);
  }


  async function cargarAverias() {
    const { data, error } = await supabase
      .from("averias")
      .select(`
        id,
        sistema,
        estado_equipo,
        estado_averia,
        ubicacion,
        detalle_inicial,
        informado_por,
        tomada_por,
        trabajo_realizado,
        fecha_aviso,
        fecha_atencion,
        fecha_cierre,
        equipos (
          numero_mina,
          numero_interno,
          tipo,
          marca,
          modelo,
          estado
        )
      `)
      .order("fecha_aviso", {
        ascending: false,
      });

    if (error) {
      console.error("Error al cargar averías:", error);
      alert("No se pudieron cargar las averías desde Supabase.");
      return;
    }

    const averiasConvertidas: Averia[] = data.map((registro) => {
      const equipoDb = Array.isArray(registro.equipos)
        ? registro.equipos[0]
        : registro.equipos;

      return {
        id: registro.id,
        equipo: {
          numeroMina: equipoDb.numero_mina,
          numeroInterno: equipoDb.numero_interno,
          tipo: equipoDb.tipo,
          marca: equipoDb.marca,
          modelo: equipoDb.modelo,
          estado: equipoDb.estado,
        },
        sistema: registro.sistema,
        estadoEquipo: registro.estado_equipo,
        estadoAveria: registro.estado_averia,
        ubicacion: registro.ubicacion ?? "",
        detalleInicial: registro.detalle_inicial ?? "",
        informadoPor: registro.informado_por,
        tomadaPor: registro.tomada_por ?? "",
        trabajoRealizado: registro.trabajo_realizado ?? "",
        horaAviso: new Date(registro.fecha_aviso).toLocaleTimeString(
          "es-CL",
          {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          },
        ),
        horaAtencion: registro.fecha_atencion
          ? new Date(registro.fecha_atencion).toLocaleTimeString(
              "es-CL",
              {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              },
            )
          : "",
        horaCierre: registro.fecha_cierre
          ? new Date(registro.fecha_cierre).toLocaleTimeString(
              "es-CL",
              {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              },
            )
          : "",
      };
    });

    setAverias(averiasConvertidas);
  }


  async function cargarBackup() {
    const { data, error } = await supabase
      .from("configuracion")
      .select("valor")
      .eq("clave", "caex_backup")
      .maybeSingle();

    if (error) {
      console.error("Error al cargar backup:", error);
      return;
    }

    setNumeroBackup(data?.valor ?? null);
  }


  useEffect(() => {
    function actualizarTurno() {
      setTurnoActual(obtenerTurnoActual());
    }

    actualizarTurno();

    // Actualización frecuente para que el cambio 08:01 / 20:01
    // ocurra sin recargar la página.
    const intervalo = window.setInterval(actualizarTurno, 30_000);

    return () => {
      window.clearInterval(intervalo);
    };
  }, []);

  useEffect(() => {
    let activo = true;

    async function cargarSesionInicial() {
      const { data, error } = await supabase.auth.getSession();

      if (!activo) {
        return;
      }

      if (error) {
        console.error("Error al recuperar sesión:", error);
      }

      const session = data.session ?? null;
      setSesion(session);

      if (session) {
        await cargarPerfil(session.user.id);
      } else {
        setRol(null);
      }

      if (activo) {
        setCargandoSesion(false);
      }
    }

    void cargarSesionInicial();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSesion(session);

      if (session) {
        void cargarPerfil(session.user.id);
      } else {
        setRol(null);
      }
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sesion || !rol) {
      return;
    }

    void Promise.all([
      cargarEquipos(),
      cargarAverias(),
      cargarBackup(),
    ]);
  }, [sesion?.user.id, rol]);

  useEffect(() => {
    if (!sesion || !rol) {
      return;
    }

    const canal = supabase
      .channel("roac-operations-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "averias",
        },
        () => {
          void cargarAverias();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "equipos",
        },
        () => {
          void cargarEquipos();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "configuracion",
        },
        () => {
          void cargarBackup();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [sesion?.user.id, rol]);

  const averiasAbiertas = averias.filter(
    (averia) => averia.estadoAveria !== "Cerrada",
  );

  const averiasCerradas = averias.filter(
    (averia) => averia.estadoAveria === "Cerrada",
  );

  const averiaSeleccionada = averias.find(
    (averia) => averia.id === averiaSeleccionadaId,
  );

  const equiposOperativos = equipos.filter(
    (equipo) => equipo.estado === "Operativo",
  ).length;

  const equiposEnAtencion = equipos.filter(
    (equipo) => equipo.estado === "En atención",
  ).length;

  const equiposFueraServicio = equipos.filter(
    (equipo) => equipo.estado === "Fuera de servicio",
  ).length;

  const caex = equipos.filter((equipo) => equipo.tipo === "CAEX");

  const equipoBackup = equipos.find(
    (equipo) => equipo.numeroMina === numeroBackup,
  );

  const caexOperativosEnMina = caex.filter(
    (equipo) =>
      equipo.estado === "Operativo" &&
      equipo.numeroMina !== numeroBackup,
  ).length;

  function irAInicio() {
    setEquipoSeleccionado(null);
    setAveriaSeleccionadaId(null);
    setVista("inicio");
  }

  function comenzarRegistro() {
    if (!exigirPermiso()) {
      return;
    }

    setEquipoSeleccionado(null);
    setVista("seleccionar-equipo");
  }

  function cancelarRegistro() {
    setEquipoSeleccionado(null);
    setVista("inicio");
  }

  function continuarConEquipo() {
    if (equipoSeleccionado) {
      setVista("registrar-averia");
    }
  }

  function obtenerAveriaAbierta(numeroMina: string) {
    return averiasAbiertas.find(
      (averia) => averia.equipo.numeroMina === numeroMina,
    );
  }

  function seleccionarEquipoParaAveria(equipo: Equipo) {
    const averiaAbierta = obtenerAveriaAbierta(equipo.numeroMina);

    if (averiaAbierta) {
      const abrir = window.confirm(
        `El equipo ${equipo.numeroMina} ya tiene una avería abierta.\n\n` +
          `Sistema: ${averiaAbierta.sistema}\n` +
          `Estado: ${averiaAbierta.estadoAveria}\n` +
          `Hora: ${averiaAbierta.horaAviso}\n\n` +
          "Presiona Aceptar para ver el detalle.",
      );

      if (abrir) {
        setAveriaSeleccionadaId(averiaAbierta.id);
        setVista("detalle-averia");
      }

      return;
    }

    setEquipoSeleccionado(equipo);
  }

  async function publicarAveria(datos: DatosNuevaAveria) {
  if (!exigirPermiso()) {
    return;
  }

  if (!equipoSeleccionado) {
    return;
  }

  const averiaAbierta = obtenerAveriaAbierta(
    equipoSeleccionado.numeroMina,
  );

  if (averiaAbierta) {
    alert(
      `El equipo ${equipoSeleccionado.numeroMina} ya tiene una avería abierta.`,
    );

    setAveriaSeleccionadaId(averiaAbierta.id);
    setVista("detalle-averia");
    return;
  }

  try {
    // 1. Buscar el ID real del equipo en Supabase
    const { data: equipoDb, error: errorEquipo } = await supabase
      .from("equipos")
      .select("id")
      .eq("numero_mina", equipoSeleccionado.numeroMina)
      .single();

    if (errorEquipo || !equipoDb) {
      console.error(errorEquipo);
      alert("No se pudo encontrar el equipo en Supabase.");
      return;
    }

    // 2. Crear la avería en Supabase
    const { data: averiaDb, error: errorAveria } = await supabase
      .from("averias")
      .insert({
        equipo_id: equipoDb.id,
        sistema: datos.sistema,
        estado_equipo: "Fuera de servicio",
        estado_averia: "Publicada",
        ubicacion: datos.ubicacion,
        detalle_inicial: datos.detalleInicial,
        informado_por: datos.informadoPor,
      })
      .select("id")
      .single();

    if (errorAveria || !averiaDb) {
      console.error(errorAveria);

      if (errorAveria?.code === "23505") {
        alert(
          `El equipo ${equipoSeleccionado.numeroMina} ya tiene una avería abierta.`,
        );
      } else {
        alert("No se pudo guardar la avería en Supabase.");
      }

      return;
    }

    // 3. Cambiar el estado del equipo en Supabase
    const { error: errorActualizarEquipo } = await supabase
      .from("equipos")
      .update({
        estado: "Fuera de servicio",
        es_backup: false,
      })
      .eq("id", equipoDb.id);

    if (errorActualizarEquipo) {
      console.error(errorActualizarEquipo);
      alert(
        "La avería fue creada, pero no se pudo actualizar el estado del equipo.",
      );
      return;
    }

    // 4. Si el equipo era backup, eliminar la asignación
    if (numeroBackup === equipoSeleccionado.numeroMina) {
      const { error: errorBackup } = await supabase
        .from("configuracion")
        .update({
          valor: null,
        })
        .eq("clave", "caex_backup");

      if (errorBackup) {
        console.error(errorBackup);
      }

      setNumeroBackup(null);

      alert(
        `El CAEX ${equipoSeleccionado.numeroMina} era el backup y quedó fuera de servicio. Actualmente no hay backup asignado.`,
      );
    }

    // 5. Recargar desde Supabase.
    // Evitamos agregar la avería manualmente al estado local porque
    // Realtime también puede recibir el INSERT y provocar un duplicado
    // por condición de carrera.
    await Promise.all([
      cargarAverias(),
      cargarEquipos(),
      cargarBackup(),
    ]);

    setEquipoSeleccionado(null);
    setVista("averias");
  } catch (error) {
    console.error(error);
    alert("Ocurrió un error inesperado al publicar la avería.");
  }
}

    
  function abrirDetalleAveria(id: number) {
    setAveriaSeleccionadaId(id);
    setVista("detalle-averia");
  }
  async function tomarAveria(responsable: string) {
  if (!exigirPermiso()) {
    return;
  }

  if (averiaSeleccionadaId === null) {
    return;
  }

  const averiaActual = averias.find(
    (averia) => averia.id === averiaSeleccionadaId,
  );

  if (!averiaActual) {
    return;
  }

  try {
    const fechaAtencion = new Date().toISOString();

    const { error: errorAveria } = await supabase
      .from("averias")
      .update({
        estado_averia: "En atención",
        estado_equipo: "En atención",
        tomada_por: responsable,
        fecha_atencion: fechaAtencion,
      })
      .eq("id", averiaSeleccionadaId);

    if (errorAveria) {
      console.error(errorAveria);
      alert("No se pudo tomar la avería en Supabase.");
      return;
    }

    const { error: errorEquipo } = await supabase
      .from("equipos")
      .update({
        estado: "En atención",
      })
      .eq(
        "numero_mina",
        averiaActual.equipo.numeroMina,
      );

    if (errorEquipo) {
      console.error(errorEquipo);
      alert(
        "La avería fue tomada, pero no se pudo actualizar el equipo.",
      );
      return;
    }

    const horaAtencion = obtenerHoraActual();

    setAverias((anteriores) =>
      anteriores.map((averia) =>
        averia.id === averiaSeleccionadaId
          ? {
              ...averia,
              estadoAveria: "En atención",
              estadoEquipo: "En atención",
              tomadaPor: responsable,
              horaAtencion,
            }
          : averia,
      ),
    );

    setEquipos((anteriores) =>
      anteriores.map((equipo) =>
        equipo.numeroMina === averiaActual.equipo.numeroMina
          ? {
              ...equipo,
              estado: "En atención",
            }
          : equipo,
      ),
    );
  } catch (error) {
    console.error(error);
    alert("Ocurrió un error al tomar la avería.");
  }
}
  async function cerrarAveria(
  trabajoRealizado: string,
) {
  if (!exigirPermiso()) {
    return;
  }

  if (averiaSeleccionadaId === null) {
    return;
  }

  const averiaActual = averias.find(
    (averia) => averia.id === averiaSeleccionadaId,
  );

  if (!averiaActual) {
    return;
  }

  try {
    const fechaCierre = new Date().toISOString();

    const { error: errorAveria } = await supabase
      .from("averias")
      .update({
        estado_averia: "Cerrada",
        estado_equipo: "Operativo",
        trabajo_realizado: trabajoRealizado,
        fecha_cierre: fechaCierre,
      })
      .eq("id", averiaSeleccionadaId);

    if (errorAveria) {
      console.error(errorAveria);
      alert("No se pudo cerrar la avería en Supabase.");
      return;
    }

    const { error: errorEquipo } = await supabase
      .from("equipos")
      .update({
        estado: "Operativo",
      })
      .eq(
        "numero_mina",
        averiaActual.equipo.numeroMina,
      );

    if (errorEquipo) {
      console.error(errorEquipo);
      alert(
        "La avería se cerró, pero no se pudo restaurar el equipo a Operativo.",
      );
      return;
    }

    const horaCierre = obtenerHoraActual();

    setAverias((anteriores) =>
      anteriores.map((averia) =>
        averia.id === averiaSeleccionadaId
          ? {
              ...averia,
              estadoAveria: "Cerrada",
              estadoEquipo: "Operativo",
              trabajoRealizado,
              horaCierre,
            }
          : averia,
      ),
    );

    setEquipos((anteriores) =>
      anteriores.map((equipo) =>
        equipo.numeroMina ===
        averiaActual.equipo.numeroMina
          ? {
              ...equipo,
              estado: "Operativo",
            }
          : equipo,
      ),
    );

    setAveriaSeleccionadaId(null);
    setVista("averias");
  } catch (error) {
    console.error(error);
    alert("Ocurrió un error al cerrar la avería.");
  }
}

  async function asignarBackup(numeroMina: string | null) {
    if (!exigirPermiso()) {
      return;
    }

    if (numeroMina !== null) {
      const equipo = equipos.find(
        (item) => item.numeroMina === numeroMina,
      );

      if (!equipo || equipo.tipo !== "CAEX") {
        alert("Solo se puede asignar un CAEX como backup.");
        return;
      }

      if (equipo.estado !== "Operativo") {
        alert(
          `El CAEX ${equipo.numeroMina} no está disponible para backup.`,
        );
        return;
      }

      if (obtenerAveriaAbierta(equipo.numeroMina)) {
        alert(
          `El CAEX ${equipo.numeroMina} tiene una avería abierta.`,
        );
        return;
      }
    }

    try {
      const { error: errorLimpiarBackup } = await supabase
        .from("equipos")
        .update({ es_backup: false })
        .eq("tipo", "CAEX");

      if (errorLimpiarBackup) {
        console.error(errorLimpiarBackup);
        alert("No se pudo limpiar la asignación de backup.");
        return;
      }

      if (numeroMina !== null) {
        const { error: errorAsignarBackup } = await supabase
          .from("equipos")
          .update({ es_backup: true })
          .eq("numero_mina", numeroMina);

        if (errorAsignarBackup) {
          console.error(errorAsignarBackup);
          alert("No se pudo asignar el CAEX como backup.");
          return;
        }
      }

      const { error: errorConfiguracion } = await supabase
        .from("configuracion")
        .upsert(
          {
            clave: "caex_backup",
            valor: numeroMina,
          },
          {
            onConflict: "clave",
          },
        );

      if (errorConfiguracion) {
        console.error(errorConfiguracion);
        alert("No se pudo guardar la configuración de backup.");
        return;
      }

      await Promise.all([
        cargarEquipos(),
        cargarBackup(),
      ]);

      setVista("inicio");
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error al asignar el backup.");
    }
  }

  async function recargarDatosDesdeSupabase() {
    try {
      await Promise.all([
        cargarEquipos(),
        cargarAverias(),
        cargarBackup(),
      ]);
      alert("Datos sincronizados con Supabase.");
    } catch (error) {
      console.error(error);
      alert("No se pudieron recargar los datos.");
    }
  }

  if (cargandoSesion) {
    return (
      <main className="auth-screen">
        <style>{`
          .auth-screen {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: #edf3f9;
            font-family: inherit;
          }

          .auth-card {
            width: min(420px, 100%);
            background: #ffffff;
            border-radius: 28px;
            padding: 30px;
            box-shadow: 0 20px 60px rgba(15, 34, 58, 0.14);
          }

          .auth-brand {
            text-align: center;
          }

          .auth-logo {
            width: 74px;
            height: 74px;
            margin: 0 auto 14px;
            border: 2px solid #4b86b0;
            border-radius: 50%;
            display: grid;
            place-items: center;
            font-weight: 800;
            letter-spacing: 2px;
            color: #315f82;
          }

          .auth-brand h1 {
            margin: 0;
            font-size: 30px;
          }

          .auth-brand p {
            margin: 8px 0 0;
            color: #607086;
          }
        `}</style>

        <section className="auth-card">
          <div className="auth-brand">
            <div className="auth-logo">ROAC</div>
            <h1>ROAC Operations</h1>
            <p>Iniciando sistema...</p>
          </div>
        </section>
      </main>
    );
  }

  if (!sesion) {
    return (
      <main className="auth-screen">
        <style>{`
          .auth-screen {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: #edf3f9;
            font-family: inherit;
          }

          .auth-card {
            width: min(420px, 100%);
            background: #ffffff;
            border-radius: 28px;
            padding: 30px;
            box-shadow: 0 20px 60px rgba(15, 34, 58, 0.14);
          }

          .auth-brand {
            text-align: center;
            margin-bottom: 26px;
          }

          .auth-logo {
            width: 74px;
            height: 74px;
            margin: 0 auto 14px;
            border: 2px solid #4b86b0;
            border-radius: 50%;
            display: grid;
            place-items: center;
            font-weight: 800;
            letter-spacing: 2px;
            color: #315f82;
          }

          .auth-brand h1 {
            margin: 0;
            font-size: 30px;
          }

          .auth-brand p {
            margin: 8px 0 0;
            color: #607086;
          }

          .auth-form {
            display: grid;
            gap: 14px;
          }

          .auth-form label {
            display: grid;
            gap: 7px;
            font-weight: 700;
            color: #26384e;
          }

          .auth-form input {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #cad6e2;
            border-radius: 14px;
            padding: 14px 15px;
            font: inherit;
            outline: none;
          }

          .auth-form input:focus {
            border-color: #3478f6;
            box-shadow: 0 0 0 3px rgba(52, 120, 246, 0.12);
          }

          .auth-submit {
            border: 0;
            border-radius: 14px;
            padding: 14px 18px;
            background: #2463eb;
            color: #ffffff;
            font: inherit;
            font-weight: 800;
            cursor: pointer;
          }

          .auth-submit:disabled {
            opacity: 0.6;
            cursor: wait;
          }

          .auth-error {
            margin: 0;
            padding: 10px 12px;
            border-radius: 12px;
            background: #fff0ee;
            color: #b42318;
            font-size: 14px;
          }

          .auth-help {
            margin: 16px 0 0;
            text-align: center;
            color: #718096;
            font-size: 13px;
          }
        `}</style>

        <section className="auth-card">
          <div className="auth-brand">
            <div className="auth-logo">ROAC</div>
            <h1>ROAC Operations</h1>
            <p>Acceso al sistema operacional</p>
          </div>

          <form
            className="auth-form"
            onSubmit={(evento) => {
              evento.preventDefault();
              void iniciarSesion();
            }}
          >
            <label>
              Usuario
              <input
                autoComplete="username"
                value={usuarioLogin}
                onChange={(evento) =>
                  setUsuarioLogin(evento.target.value)
                }
                placeholder="operaciones o consulta"
              />
            </label>

            <label>
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                value={passwordLogin}
                onChange={(evento) =>
                  setPasswordLogin(evento.target.value)
                }
                placeholder="••••••••"
              />
            </label>

            {errorLogin && (
              <p className="auth-error">{errorLogin}</p>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={iniciandoSesion}
            >
              {iniciandoSesion
                ? "Ingresando..."
                : "Iniciar sesión"}
            </button>
          </form>

          <p className="auth-help">
            Acceso restringido · ROAC Operations
          </p>
        </section>
      </main>
    );
  }

  if (!rol) {
    return (
      <main className="auth-screen">
        <style>{`
          .auth-screen {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: #edf3f9;
          }

          .auth-card {
            width: min(420px, 100%);
            background: #ffffff;
            border-radius: 28px;
            padding: 30px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(15, 34, 58, 0.14);
          }

          .auth-submit {
            border: 0;
            border-radius: 14px;
            padding: 14px 18px;
            background: #2463eb;
            color: #ffffff;
            font: inherit;
            font-weight: 800;
            cursor: pointer;
          }
        `}</style>

        <section className="auth-card">
          <h1>Acceso sin perfil</h1>
          <p>
            La cuenta autenticada no tiene un rol válido en
            ROAC Operations.
          </p>

          <button
            type="button"
            className="auth-submit"
            onClick={() => void cerrarSesionUsuario()}
          >
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`app ${!puedeModificar ? "read-only-mode" : ""}`}
    >
      <style>{`
        .app-header {
          position: relative;
          overflow: hidden;
          display: grid;
          grid-template-columns: 1.08fr 1fr 1.08fr;
          min-height: 215px;
          padding: 0;
          border-radius: 22px;
          background:
            radial-gradient(circle at 18% 38%, rgba(12, 93, 160, 0.14), transparent 30%),
            linear-gradient(135deg, #021426 0%, #05223c 52%, #021426 100%);
          border: 1px solid rgba(28, 160, 255, 0.72);
          box-shadow:
            0 14px 34px rgba(0, 21, 43, 0.28),
            inset 0 0 42px rgba(14, 100, 169, 0.05);
          color: #ffffff;
        }

        .app-header::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.18;
          background-image:
            radial-gradient(circle at 18% 42%, transparent 0 18%, rgba(32, 148, 226, 0.10) 18.3% 18.8%, transparent 19% 100%),
            radial-gradient(circle at 18% 42%, transparent 0 27%, rgba(32, 148, 226, 0.08) 27.3% 27.8%, transparent 28% 100%);
        }

        .header-brand-panel,
        .header-shift-panel,
        .header-access-panel {
          position: relative;
          z-index: 1;
          min-width: 0;
          padding: 22px 18px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .header-brand-panel,
        .header-shift-panel {
          border-right: 1px solid rgba(51, 155, 225, 0.28);
        }

        /* ───── IZQUIERDA: ROAC ───── */

        .header-brand-panel {
          align-items: flex-start;
        }

        .header-roac-logo {
          display: block;
          width: min(108px, 52%);
          height: auto;
          object-fit: contain;

          /* Integra el fondo negro original del PNG con el header */
          mix-blend-mode: screen;
          filter:
            saturate(1.08)
            contrast(1.03)
            drop-shadow(0 7px 14px rgba(0, 0, 0, 0.22));
        }

        .header-operations-label {
          margin-top: 3px;
          color: #ffc400;
          font-size: clamp(11px, 2.1vw, 16px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: clamp(1.5px, 0.35vw, 3px);
        }

        .header-system-label {
          margin: 13px 0 0;
          max-width: 200px;
          color: #a7b9ca;
          font-size: clamp(7px, 1.25vw, 10px);
          line-height: 1.35;
          font-weight: 700;
          letter-spacing: 0.55px;
          text-transform: uppercase;
        }

        /* ───── CENTRO: TURNO ───── */

        .header-shift-panel {
          align-items: flex-start;
          padding-left: clamp(18px, 4vw, 36px);
        }

        .header-section-label {
          margin: 0 0 8px;
          color: #22a8ff;
          font-size: clamp(8px, 1.45vw, 11px);
          font-weight: 900;
          letter-spacing: 0.95px;
          text-transform: uppercase;
        }

        .header-shift-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 14px;
          color: #ffffff;
          font-size: clamp(30px, 5.2vw, 46px);
          line-height: 0.95;
          font-weight: 900;
          letter-spacing: -0.7px;
        }

        .header-shift-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72em;
          line-height: 1;
        }

        .header-time-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          padding: 9px 12px;
          margin-bottom: 15px;
          border: 1px solid rgba(25, 156, 255, 0.78);
          border-radius: 12px;
          background: rgba(0, 14, 30, 0.58);
          box-shadow: inset 0 0 14px rgba(0, 102, 186, 0.08);
          color: #ffffff;
          font-size: clamp(11px, 2vw, 15px);
          font-weight: 850;
          white-space: nowrap;
        }

        .header-time-icon {
          color: #20a9ff;
          font-size: 1.15em;
        }

        .header-date {
          margin: 0;
          color: #18a7ff;
          font-size: clamp(9px, 1.75vw, 13px);
          line-height: 1.2;
          font-weight: 850;
          text-transform: capitalize;
        }

        .header-date-caption {
          margin: 4px 0 0;
          color: #9eb0c2;
          font-size: clamp(7px, 1.25vw, 10px);
        }

        /* ───── DERECHA: EPSA + ACCESO ───── */

        .header-access-panel {
          align-items: flex-end;
          gap: 9px;
        }

        .header-epsa-brand {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-bottom: 2px;
        }

        .header-epsa-logo {
          display: block;
          width: clamp(42px, 8vw, 65px);
          height: auto;
          object-fit: contain;

          /* El blanco del PNG se funde con el fondo del header */
          mix-blend-mode: multiply;
          filter:
            saturate(1.45)
            brightness(1.42)
            contrast(1.15);
        }

        .header-epsa-copy {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1;
        }

        .header-epsa-name {
          color: #ffffff;
          font-size: clamp(22px, 4.6vw, 38px);
          line-height: 0.92;
          font-weight: 950;
          letter-spacing: -0.8px;
        }

        .header-epsa-subtitle {
          margin-top: 6px;
          color: #159eff;
          font-size: clamp(7px, 1.45vw, 11px);
          font-weight: 900;
          letter-spacing: clamp(1.6px, 0.45vw, 3.2px);
        }

        .shift-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 11px;
          border-radius: 999px;
          background: rgba(0, 178, 99, 0.10);
          border: 1px solid rgba(0, 226, 129, 0.34);
          color: #28e78a;
          font-size: clamp(8px, 1.45vw, 10px);
          font-weight: 900;
        }

        .shift-badge::before {
          content: "";
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #19e77f;
          box-shadow: 0 0 9px rgba(25, 231, 127, 0.78);
        }

        .access-badge {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          width: min(175px, 100%);
          box-sizing: border-box;
          padding: 10px 13px;
          border: 1px solid rgba(25, 156, 255, 0.60);
          border-radius: 13px;
          background: rgba(0, 15, 31, 0.54);
          box-shadow: inset 0 0 20px rgba(0, 91, 160, 0.05);
        }

        .access-badge-label {
          color: #96a9bc;
          font-size: clamp(6px, 1.15vw, 8px);
          font-weight: 800;
          letter-spacing: 0.65px;
          text-transform: uppercase;
        }

        .access-badge-value {
          margin-top: 4px;
          color: #1ca6ff;
          font-size: clamp(10px, 1.9vw, 14px);
          line-height: 1.1;
          font-weight: 950;
          white-space: nowrap;
        }

        .logout-button {
          padding: 7px 12px;
          border: 1px solid rgba(25, 156, 255, 0.68);
          border-radius: 999px;
          background: rgba(0, 13, 28, 0.34);
          color: #41b7ff;
          font: inherit;
          font-size: clamp(7px, 1.25vw, 9px);
          font-weight: 850;
          cursor: pointer;
          transition:
            background 160ms ease,
            transform 160ms ease,
            border-color 160ms ease;
        }

        .logout-button:hover {
          transform: translateY(-1px);
          background: rgba(22, 153, 244, 0.11);
          border-color: rgba(45, 177, 255, 0.85);
        }

        /* ───── RESPONSIVE PARA TELÉFONO ───── */
        @media (max-width: 900px) {
          .app-header {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
              "brand epsa"
              "shift shift"
              "access access";
            min-height: 0;
            padding: 16px 16px 14px;
            gap: 0;
            border-radius: 20px;
          }

          .header-brand-panel,
          .header-shift-panel,
          .header-access-panel {
            padding: 0;
            border: 0;
          }

          .header-brand-panel {
            grid-area: brand;
            align-items: flex-start;
            justify-content: flex-start;
            min-height: 92px;
          }

          .header-roac-logo {
            width: 74px;
            max-width: 74px;
            height: auto;
          }

          .header-operations-label {
            margin-top: 2px;
            font-size: 10px;
            letter-spacing: 1.8px;
          }

          .header-system-label {
            margin-top: 8px;
            max-width: 145px;
            font-size: 6px;
            line-height: 1.35;
            letter-spacing: .4px;
          }

          .header-shift-panel {
            grid-area: shift;
            position: relative;
            align-items: center;
            text-align: center;
            margin-top: 5px;
            padding: 13px 0 12px;
            border-top: 1px solid rgba(51, 155, 225, .22);
            border-bottom: 1px solid rgba(51, 155, 225, .22);
          }

          .header-section-label {
            margin: 0 0 5px;
            font-size: 8px;
            letter-spacing: 1.1px;
          }

          .header-shift-title {
            justify-content: center;
            margin: 0 0 9px;
            gap: 8px;
            font-size: 31px;
            line-height: 1;
          }

          .header-time-chip {
            margin: 0 auto 9px;
            padding: 7px 13px;
            font-size: 11px;
            border-radius: 10px;
          }

          .header-date {
            font-size: 9px;
          }

          .header-date-caption {
            font-size: 6px;
          }

          .header-access-panel {
            grid-area: access;
            display: grid;
            grid-template-columns: auto 1fr auto;
            align-items: center;
            gap: 8px;
            padding-top: 12px;
          }

          .header-epsa-brand {
            grid-area: epsa;
            position: absolute;
            top: 17px;
            right: 17px;
            width: auto;
            margin: 0;
            gap: 6px;
          }

          .header-epsa-logo {
            width: 38px;
            height: 38px;
          }

          .header-epsa-name {
            font-size: 23px;
          }

          .header-epsa-subtitle {
            margin-top: 4px;
            font-size: 6px;
            letter-spacing: 1.8px;
          }

          .shift-badge {
            justify-self: start;
            padding: 5px 9px;
            font-size: 7px;
          }

          .access-badge {
            justify-self: center;
            width: auto;
            min-width: 118px;
            padding: 7px 10px;
            border-radius: 10px;
          }

          .access-badge-label {
            font-size: 5.5px;
          }

          .access-badge-value {
            font-size: 8px;
          }

          .logout-button {
            justify-self: end;
            padding: 6px 9px;
            font-size: 6.5px;
          }
        }

        .read-only-notice {
          margin: 14px 0;
          padding: 11px 14px;
          border: 1px solid #bdd4ea;
          border-radius: 14px;
          background: #eef7ff;
          color: #315f82;
          font-size: 13px;
          font-weight: 700;
          text-align: center;
        }
/* ======================================================
   ROAC OPERATIONS - CABECERA CON FONDO FIJO
   Ajuste final visual según referencia aprobada
   ====================================================== */

.roac-header-background {
  position: relative !important;

  /* Un poco más ancha que el contenido para dar aire a ROAC/EPSA */
  width: calc(100% + 18px) !important;
  max-width: none !important;
  left: -9px;

  /* Más baja y panorámica */
  aspect-ratio: 2.34 / 1 !important;

  min-height: 0 !important;
  height: auto !important;

  display: block !important;

  padding: 0 !important;
  margin: 0 0 18px !important;

  background-image: url("/roac-header-bg.png") !important;

  /* Usamos el fondo completo para no cortar ROAC ni EPSA */
  background-size: 100% 100% !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;

  border: none !important;
  border-radius: 20px !important;

  overflow: hidden !important;

  container-type: inline-size;

  box-shadow:
    0 8px 24px rgba(7, 35, 63, 0.14);
}


/* ======================================================
   TURNO DÍA / NOCHE
   ====================================================== */

.header-overlay-shift {
  position: absolute;

  left: 31.1%;
  top: 23.0%;

  width: 31.0%;
  height: 13.0%;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.0cqw;

  color: #ffffff;

  font-size: 3.85cqw;
  font-weight: 850;
  line-height: 1;

  text-align: center;
  white-space: nowrap;
}

.header-overlay-shift-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  font-size: 0.70em;
  line-height: 1;
}


/* ======================================================
   HORARIO
   ====================================================== */

.header-overlay-time {
  position: absolute;

  left: 32.1%;
  top: 44.3%;

  width: 29.8%;
  height: 8.8%;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #ffffff;

  font-size: 2.35cqw;
  font-weight: 800;
  line-height: 1;

  text-align: center;
  white-space: nowrap;
}


/* ======================================================
   FECHA OPERACIONAL
   ====================================================== */

.header-overlay-date {
  position: absolute;

  left: 36.0%;
  top: 67.0%;

  width: 25.0%;
  height: 8.5%;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #19a9ff;

  font-size: 1.78cqw;
  font-weight: 800;
  line-height: 1;

  text-align: center;
  text-transform: capitalize;
  white-space: nowrap;
}


/* ======================================================
   ESTADO ACTIVO
   ====================================================== */

.header-overlay-active {
  position: absolute;

  left: 72.4%;
  top: 39.8%;

  width: 16.0%;
  height: 8.8%;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #25ef98;

  font-size: 1.78cqw;
  font-weight: 800;
  line-height: 1;

  text-align: center;
  white-space: nowrap;
}

.header-active-dot {
  display: none !important;
}


.header-overlay-active::before,
.header-overlay-active::after {
  content: none !important;
  display: none !important;
}


/* ======================================================
   ACCESO ACTUAL
   ====================================================== */

.header-overlay-access {
  position: absolute;

  left: 68.2%;
  top: 57.0%;

  width: 23.6%;
  height: 9.8%;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #16a9ff;

  font-size: 1.88cqw;
  font-weight: 900;
  line-height: 1;

  text-align: center;
  white-space: nowrap;
}


/* ======================================================
   CERRAR SESIÓN
   ====================================================== */

.header-overlay-logout {
  position: absolute;

  left: 68.8%;
  top: 78.5%;

  width: 24.0%;
  height: 11.0%;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 0;

  border: 2px solid rgba(30, 174, 255, 1);
  border-radius: 999px;

  background: rgba(0, 31, 60, 0.88);

  color: #3fc1ff;

  font: inherit;
  font-size: 1.90cqw;
  font-weight: 900;
  line-height: 1;

  white-space: nowrap;
  cursor: pointer;

  box-shadow:
    inset 0 0 16px rgba(27, 165, 244, 0.14),
    0 0 10px rgba(28, 165, 244, 0.14);

  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease,
    box-shadow 160ms ease;
}

.header-overlay-logout:hover {
  transform: translateY(-1px);

  background: rgba(22, 126, 193, 0.24);

  border-color: #42c3ff;

  box-shadow:
    0 0 12px rgba(31, 173, 255, 0.20);
}


/* ======================================================
   ESPACIO INFERIOR
   ====================================================== */

.roac-header-background + .read-only-notice {
  margin-top: 0;
}

        .read-only-mode .attention-panel {
          display: none !important;
        }
      `}</style>
      <header className="app-header roac-header-background">
        {/* TURNO: DÍA / NOCHE */}
        <div className="header-overlay-shift">
          <span>{turnoActual.tipo}</span>
          <span
            className="header-overlay-shift-icon"
            aria-hidden="true"
          >
            {turnoActual.tipo === "Noche" ? "🌙" : "☀️"}
          </span>
        </div>

        {/* HORARIO */}
        <div className="header-overlay-time">
          {turnoActual.horario}
        </div>

        {/* FECHA OPERACIONAL */}
        <div className="header-overlay-date">
          {turnoActual.fechaLarga}
        </div>

        {/* ESTADO */}
        <div className="header-overlay-active">
          Activo
        </div>

        {/* TIPO DE ACCESO */}
        <div className="header-overlay-access">
          {puedeModificar ? "OPERACIONES" : "SOLO LECTURA"}
        </div>

        {/* CERRAR SESIÓN */}
        <button
          type="button"
          className="header-overlay-logout"
          onClick={() => void cerrarSesionUsuario()}
        >
          Cerrar sesión
        </button>
      </header>

      {!puedeModificar && (
        <div className="read-only-notice">
          Modo solo lectura · Puedes consultar el estado de la flota
          y las averías, sin modificar datos.
        </div>
      )}

      {vista === "inicio" && (
        <>
          <section className="fleet-summary">
            <div className="summary-item summary-green">
              <strong>{equiposOperativos}</strong>
              <span>Operativos</span>
            </div>

            <div className="summary-item summary-yellow">
              <strong>{equiposEnAtencion}</strong>
              <span>En atención</span>
            </div>

            <div className="summary-item summary-red">
              <strong>{equiposFueraServicio}</strong>
              <span>Fuera de servicio</span>
            </div>
          </section>

          <section className="backup-card">
            <div>
              <p className="eyebrow eyebrow-dark">
                Respaldo contractual
              </p>

              <h2>
                {equipoBackup
                  ? `CAEX backup: ${equipoBackup.numeroMina}`
                  : "Sin CAEX backup"}
              </h2>

              <p>
                CAEX operativos en mina:{" "}
                <strong>{caexOperativosEnMina}</strong> de 7
              </p>

              {equipoBackup && (
                <p>
                  Interno {equipoBackup.numeroInterno} ·{" "}
                  {equipoBackup.modelo}
                </p>
              )}
            </div>

            {puedeModificar && (
              <button
                type="button"
                className="backup-button"
                onClick={() => setVista("seleccionar-backup")}
              >
                {equipoBackup ? "Cambiar backup" : "Asignar backup"}
              </button>
            )}
          </section>

          {puedeModificar && (
            <button
              type="button"
              className="primary-button"
              onClick={comenzarRegistro}
            >
              + Publicar avería
            </button>
          )}

          <section className="section">
            <div className="section-title">
              <h2>Estado de la flota</h2>
              <span>{equipos.length}</span>
            </div>

            <div className="equipment-grid">
              {equipos.map((equipo) => (
                <div
                  className={
                    equipo.numeroMina === numeroBackup
                      ? "backup-equipment-wrapper"
                      : ""
                  }
                  key={equipo.numeroMina}
                >
                  {equipo.numeroMina === numeroBackup && (
                    <span className="backup-label">BACKUP</span>
                  )}

                  <EquipoCard
                    numeroMina={equipo.numeroMina}
                    numeroInterno={equipo.numeroInterno}
                    modelo={equipo.modelo}
                    estado={equipo.estado}
                    mostrarEstado
                  />
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {vista === "seleccionar-backup" && puedeModificar && (
        <section className="equipment-selector">
          <div className="form-header">
            <div>
              <p className="eyebrow eyebrow-dark">
                Respaldo contractual
              </p>
              <h2>Selecciona el CAEX backup</h2>
            </div>

            <button
              type="button"
              className="close-button"
              onClick={irAInicio}
              aria-label="Cerrar selector"
            >
              ×
            </button>
          </div>

          <button
            type="button"
            className={
              numeroBackup === null
                ? "no-backup-button no-backup-button-selected"
                : "no-backup-button"
            }
            onClick={() => asignarBackup(null)}
          >
            Sin backup
            <small>
              Úsalo cuando no exista un CAEX de respaldo disponible
            </small>
          </button>

          <div className="equipment-grid backup-grid">
            {caex.map((equipo) => {
              const disponible =
                equipo.estado === "Operativo" &&
                !obtenerAveriaAbierta(equipo.numeroMina);

              return (
                <button
                  type="button"
                  className={`backup-select-card ${
                    equipo.numeroMina === numeroBackup
                      ? "backup-select-card-selected"
                      : ""
                  } ${
                    !disponible
                      ? "backup-select-card-disabled"
                      : ""
                  }`}
                  key={equipo.numeroMina}
                  disabled={!disponible}
                  onClick={() => asignarBackup(equipo.numeroMina)}
                >
                  <strong>{equipo.numeroMina}</strong>
                  <span>{equipo.numeroInterno}</span>
                  <small>{equipo.modelo}</small>
                  <small>
                    {disponible ? "Disponible" : equipo.estado}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {vista === "averias" && (
        <section className="section screen-section">
          <div className="screen-header">
            <div>
              <p className="eyebrow eyebrow-dark">
                Seguimiento del turno
              </p>
              <h2>Averías abiertas</h2>
            </div>

            <span className="count-badge">
              {averiasAbiertas.length}
            </span>
          </div>

          {averiasAbiertas.length === 0 ? (
            <p className="empty-state">
              No existen averías abiertas.
            </p>
          ) : (
            <div className="open-faults">
              {averiasAbiertas.map((averia) => (
                <button
                  type="button"
                  className="fault-card fault-card-button"
                  key={averia.id}
                  onClick={() => abrirDetalleAveria(averia.id)}
                >
                  <div className="fault-card-header">
                    <div>
                      <h3>
                        {averia.equipo.numeroMina} (
                        {averia.equipo.numeroInterno})
                      </h3>
                      <p>{averia.equipo.modelo}</p>
                    </div>

                    <span className="fault-badge">
                      {averia.estadoAveria}
                    </span>
                  </div>

                  <p className="fault-type">
                    Sistema: {averia.sistema}
                  </p>

                  {averia.ubicacion && (
                    <p className="fault-location">
                      Ubicación: {averia.ubicacion}
                    </p>
                  )}

                  {averia.detalleInicial && (
                    <p className="fault-description">
                      {averia.detalleInicial}
                    </p>
                  )}

                  <div className="fault-footer">
                    <span>Aviso: {averia.horaAviso}</span>
                    <span>Ver detalle →</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {puedeModificar && (
            <button
              type="button"
              className="primary-button fault-register-button"
              onClick={comenzarRegistro}
            >
              + Publicar otra avería
            </button>
          )}
        </section>
      )}

      {vista === "status" && (
        <section className="status-screen">
          <p className="eyebrow eyebrow-dark">
            Resumen del turno
          </p>

          <h2>Status turno {turnoActual.tipo.toLowerCase()}</h2>

          <p className="shift-date">
            Rango del turno: {turnoActual.rangoTurno}
          </p>

          <div className="status-summary-card">
            <p>
              <span>CAEX operativos en mina</span>
              <strong>{caexOperativosEnMina}</strong>
            </p>

            <p>
              <span>CAEX backup</span>
              <strong>
                {equipoBackup ? equipoBackup.numeroMina : "Sin backup"}
              </strong>
            </p>

            <p>
              <span>Equipos operativos</span>
              <strong>{equiposOperativos}</strong>
            </p>

            <p>
              <span>Equipos en atención</span>
              <strong>{equiposEnAtencion}</strong>
            </p>

            <p>
              <span>Fuera de servicio</span>
              <strong>{equiposFueraServicio}</strong>
            </p>

            <p>
              <span>Averías abiertas</span>
              <strong>{averiasAbiertas.length}</strong>
            </p>

            <p>
              <span>Averías cerradas</span>
              <strong>{averiasCerradas.length}</strong>
            </p>
          </div>

          <button
            type="button"
            className="reset-data-button"
            onClick={recargarDatosDesdeSupabase}
          >
            Recargar desde Supabase
          </button>
        </section>
      )}

      {vista === "seleccionar-equipo" && puedeModificar && (
        <section className="equipment-selector">
          <div className="form-header">
            <div>
              <p className="eyebrow eyebrow-dark">
                Publicar avería
              </p>
              <h2>Selecciona el equipo</h2>
            </div>

            <button
              type="button"
              className="close-button"
              onClick={cancelarRegistro}
              aria-label="Cancelar registro"
            >
              ×
            </button>
          </div>

          <div className="equipment-grid">
            {equipos.map((equipo) => {
              const tieneAveriaAbierta = Boolean(
                obtenerAveriaAbierta(equipo.numeroMina),
              );

              return (
                <div
                  className="fault-selection-wrapper"
                  key={equipo.numeroMina}
                >
                  {tieneAveriaAbierta && (
                    <span className="open-fault-label">
                      AVERÍA ABIERTA
                    </span>
                  )}

                  <EquipoCard
                    numeroMina={equipo.numeroMina}
                    numeroInterno={equipo.numeroInterno}
                    modelo={equipo.modelo}
                    estado={equipo.estado}
                    seleccionado={
                      equipoSeleccionado?.numeroMina ===
                      equipo.numeroMina
                    }
                    onClick={() =>
                      seleccionarEquipoParaAveria(equipo)
                    }
                  />
                </div>
              );
            })}
          </div>

          {equipoSeleccionado && (
            <div className="selected-equipment">
              <p className="eyebrow">Equipo seleccionado</p>
              <h3>{equipoSeleccionado.numeroMina}</h3>

              <p>
                Interno:{" "}
                <strong>
                  {equipoSeleccionado.numeroInterno}
                </strong>
              </p>

              <p>
                Modelo:{" "}
                <strong>{equipoSeleccionado.modelo}</strong>
              </p>

              <p>
                Estado actual:{" "}
                <strong>{equipoSeleccionado.estado}</strong>
              </p>

              <button
                type="button"
                className="continue-button"
                onClick={continuarConEquipo}
              >
                Continuar
              </button>
            </div>
          )}
        </section>
      )}

      {vista === "registrar-averia" &&
        puedeModificar &&
        equipoSeleccionado && (
          <RegistrarAveria
            equipo={equipoSeleccionado}
            onVolver={() => setVista("seleccionar-equipo")}
            onCancelar={cancelarRegistro}
            onPublicar={publicarAveria}
          />
        )}

      {vista === "detalle-averia" &&
        averiaSeleccionada && (
          <DetalleAveria
            averia={averiaSeleccionada}
            onVolver={() => setVista("averias")}
            onTomar={tomarAveria}
            onCerrar={cerrarAveria}
          />
        )}

      {vista !== "seleccionar-equipo" &&
        vista !== "registrar-averia" &&
        vista !== "detalle-averia" &&
        vista !== "seleccionar-backup" && (
          <nav className="bottom-navigation">
            <button
              type="button"
              className={
                vista === "inicio"
                  ? "navigation-button navigation-button-active"
                  : "navigation-button"
              }
              onClick={irAInicio}
            >
              <span>⌂</span>
              Inicio
            </button>

            <button
              type="button"
              className={
                vista === "averias"
                  ? "navigation-button navigation-button-active"
                  : "navigation-button"
              }
              onClick={() => setVista("averias")}
            >
              <span>⚠</span>
              Averías
            </button>

            <button
              type="button"
              className={
                vista === "status"
                  ? "navigation-button navigation-button-active"
                  : "navigation-button"
              }
              onClick={() => setVista("status")}
            >
              <span>▤</span>
              Status
            </button>
          </nav>
        )}
    </main>
  );
}

export default App;