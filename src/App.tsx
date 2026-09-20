import { supabase } from "./lib/supabase";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import "./App.css";

import EquipoCard from "./components/EquipoCard";
import DetalleAveria from "./pages/DetalleAveria";
import RegistrarAveria, {
  type DatosNuevaAveria,
} from "./pages/RegistrarAveria";

import type { Averia, SistemaAveria } from "./types/Averia";
import type { Equipo } from "./types/Equipo";
import type { Mantenimiento } from "./types/Mantenimiento";
import type { IntervencionAveria } from "./types/IntervencionAveria";


type Vista =
  | "inicio"
  | "averias"
  | "status"
  | "historial"
  | "historial-equipo"
  | "detalle-averia-historial"
  | "informe-turno"
  | "seleccionar-equipo"
  | "registrar-averia"
  | "detalle-averia"
  | "seleccionar-backup"
  | "seleccionar-equipo-mantenimiento"
  | "registrar-mantenimiento"
  | "detalle-mantenimiento"
  | "registrar-emergencia"
  | "detalle-emergencia";

type RolUsuario = "operaciones" | "consulta";

type TipoTurno = "Día" | "Noche";
type BloqueTrabajo = "A/B" | "C/D";

type TurnoActual = {
  tipo: TipoTurno;
  bloqueTrabajo: BloqueTrabajo;
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

type ResumenStatusTurno = {
  caexOperativosEnMina: number;
  numeroBackup: string | null;
  equiposOperativos: number;
  equiposEnAtencion: number;
  equiposFueraServicio: number;
  mantenimientosEnCurso: number;
  averiasIniciadas: number;
  averiasHeredadas: number;
  averiasCerradas: number;
  mantenimientosIniciados: number;
  mantenimientosHeredados: number;
  mantenimientosFinalizados: number;
};

type StatusTurnoGuardado = {
  id: number;
  claveTurno: string;
  tipoTurno: TipoTurno;
  bloqueTrabajo: BloqueTrabajo;
  rangoTurno: string;
  fechaInicio: string;
  fechaFin: string;
  resumen: ResumenStatusTurno;
  averias: Averia[];
  mantenimientos: Mantenimiento[];
  creadoEn: string;
};

type InformeTurnoSnapshot = {
  generadoEn: string;
  turno: TurnoActual;
  resumen: ResumenStatusTurno;
  averias: Averia[];
  mantenimientos: Mantenimiento[];
  intervenciones: IntervencionAveria[];
};

type EmergenciaMina = {
  id: number;
  tipoEmergencia: string;
  sector: string;
  descripcion: string;
  estado: "ACTIVA" | "FINALIZADA";
  fechaInicio: string;
  fechaFin: string | null;
  creadaPor: string | null;
  finalizadaPor: string | null;
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

// Ciclo operacional de cuadrillas:
// A/B trabaja 10 días y C/D descansa; luego se invierten por 10 días.
// Referencia confirmada: A/B inicia ciclo activo el 06/09/2026 a las 08:00.
const REFERENCIA_BLOQUE_AB = { year: 2026, month: 9, day: 6 };
const DIAS_POR_BLOQUE = 10;
const DIAS_CICLO_COMPLETO = DIAS_POR_BLOQUE * 2;

function obtenerBloqueTrabajo(fecha: Date = new Date()): BloqueTrabajo {
  const partes = obtenerPartesChile(fecha);
  const minutos = partes.hour * 60 + partes.minute;

  // El relevo de bloque ocurre a las 08:00 hora Chile.
  // Antes de las 08:00 todavía corresponde al día operacional anterior.
  const fechaOperacional =
    minutos >= 8 * 60
      ? { year: partes.year, month: partes.month, day: partes.day }
      : sumarDiasCalendario(partes.year, partes.month, partes.day, -1);

  const referenciaUtc = Date.UTC(
    REFERENCIA_BLOQUE_AB.year,
    REFERENCIA_BLOQUE_AB.month - 1,
    REFERENCIA_BLOQUE_AB.day,
  );
  const fechaOperacionalUtc = Date.UTC(
    fechaOperacional.year,
    fechaOperacional.month - 1,
    fechaOperacional.day,
  );

  const diferenciaDias = Math.floor(
    (fechaOperacionalUtc - referenciaUtc) / 86_400_000,
  );
  const posicionCiclo =
    ((diferenciaDias % DIAS_CICLO_COMPLETO) + DIAS_CICLO_COMPLETO) %
    DIAS_CICLO_COMPLETO;

  return posicionCiclo < DIAS_POR_BLOQUE ? "A/B" : "C/D";
}


function obtenerTurnoActual(fecha: Date = new Date()): TurnoActual {
  const partes = obtenerPartesChile(fecha);
  const minutos = partes.hour * 60 + partes.minute;

  // Día: 08:00 a 19:59
  // Noche: 20:00 a 07:59
  // Cada minuto pertenece a un solo turno, sin solapamientos.
  const esTurnoDia =
    minutos >= 8 * 60 &&
    minutos < 20 * 60;

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

    horaInicioTurno = "08:00";
    horaFinTurno = "19:59";
  } else if (minutos >= 20 * 60) {
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

    horaInicioTurno = "20:00";
    horaFinTurno = "07:59";
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

    horaInicioTurno = "20:00";
    horaFinTurno = "07:59";
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
    bloqueTrabajo: obtenerBloqueTrabajo(fecha),
    horario:
      tipo === "Día"
        ? "08:00 a 19:59"
        : "20:00 a 07:59",

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
function crearFechaChile(
  fecha: string,
  hora: string,
) {
  const [dia, mes, year] = fecha.split("/").map(Number);
  const [horas, minutos] = hora.split(":").map(Number);

  // Primera aproximación UTC
  let fechaUtc = new Date(
    Date.UTC(
      year,
      mes - 1,
      dia,
      horas,
      minutos,
      0,
      0,
    ),
  );

  // Calculamos qué hora representa esa fecha en Santiago
  const partesChile = obtenerPartesChile(fechaUtc);

  const minutosEsperados =
    horas * 60 + minutos;

  const minutosObtenidos =
    partesChile.hour * 60 + partesChile.minute;

  let diferencia =
    minutosEsperados - minutosObtenidos;

  // Corrige cruces de medianoche
  if (diferencia > 720) {
    diferencia -= 1440;
  }

  if (diferencia < -720) {
    diferencia += 1440;
  }

  fechaUtc = new Date(
    fechaUtc.getTime() + diferencia * 60_000,
  );

  return fechaUtc;
}


function obtenerIntervaloTurno(turno: TurnoActual) {
  const inicio = crearFechaChile(
    turno.fechaInicioTurno,
    turno.horaInicioTurno,
  );

  const fin = crearFechaChile(
    turno.fechaFinTurno,
    turno.horaFinTurno,
  );

  return {
    inicio,
    fin,
  };
}

function fechaDentroDelTurno(
  fechaIso: string,
  turno: TurnoActual,
) {
  if (!fechaIso) {
    return false;
  }

  const fecha = new Date(fechaIso);
  const { inicio, fin } = obtenerIntervaloTurno(turno);

  return fecha >= inicio && fecha <= fin;
}

function esMinutoEntregaTurno() {
  const partes = obtenerPartesChile(new Date());

  return (
    (partes.hour === 7 && partes.minute === 59) ||
    (partes.hour === 19 && partes.minute === 59)
  );
}

function formatearFechaHoraChile(fechaIso: string) {
  if (!fechaIso) {
    return "";
  }

  const fecha = new Date(fechaIso);

  if (Number.isNaN(fecha.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_HORARIA_OPERACIONAL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(fecha)
    .replace(",", " ·");
}


function formatearTiempoFueraServicio(
  fechaAviso: string,
  fechaCierre: string,
) {
  if (!fechaAviso || !fechaCierre) {
    return "";
  }

  const inicio = new Date(fechaAviso).getTime();
  const fin = new Date(fechaCierre).getTime();

  if (Number.isNaN(inicio) || Number.isNaN(fin) || fin < inicio) {
    return "";
  }

  const minutosTotales = Math.floor((fin - inicio) / 60_000);
  const dias = Math.floor(minutosTotales / 1440);
  const horas = Math.floor((minutosTotales % 1440) / 60);
  const minutos = minutosTotales % 60;

  const horasTexto = String(horas).padStart(2, "0");
  const minutosTexto = String(minutos).padStart(2, "0");

  if (dias > 0) {
    return `${dias} d ${horasTexto} h ${minutosTexto} min`;
  }

  return `${horasTexto} h ${minutosTexto} min`;
}

type TipoAlertaPatron = "REINCIDENCIA" | "CONCENTRACION" | "DOBLE";

type RegistroPatronAveria = {
  id: number;
  sistema: string;
  detalleInicial: string;
  fechaAviso: string;
};

type AlertaPatronTecnico = {
  tipo: TipoAlertaPatron;
  numeroMina: string;
  averiaId: number;
  titulo: string;
  mensaje: string;
  familia: string;
  cantidadReincidencia: number;
  cantidadFamilia: number;
  relacionados: RegistroPatronAveria[];
};

function normalizarTextoPatron(texto: string) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_VACIAS_PATRON = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "y", "en", "con",
  "por", "para", "se", "equipo", "presenta", "presento", "activo", "activa",
  "falla", "fallas", "sistema", "codigo", "alarma",
]);

function tokensTecnicosPatron(texto: string) {
  return new Set(
    normalizarTextoPatron(texto)
      .split(" ")
      .filter((token) => token.length >= 3 && !PALABRAS_VACIAS_PATRON.has(token)),
  );
}

function obtenerPatronEspecifico(sistema: string, detalle: string) {
  const texto = normalizarTextoPatron(`${sistema} ${detalle}`);
  const incluye = (...terminos: string[]) =>
    terminos.some((termino) => texto.includes(termino));

  // Patrones deliberadamente específicos. La categoría general por sí sola
  // nunca basta para declarar una reincidencia.
  if (
    incluye("motor", "ecm", "ecu", "engine") &&
    incluye("codigo", "alarma", "ecm", "ecu", "check engine", "falla motor")
  ) return "control_motor";
  if (incluye("presion") && incluye("aceite") && incluye("motor", "engine")) return "presion_aceite_motor";
  if (incluye("temperatura", "sobretemperatura") && incluye("refrigerante", "coolant", "motor")) return "temperatura_motor";
  if (incluye("inyector", "inyectores", "inyeccion")) return "inyeccion_motor";
  if (incluye("nivel") && incluye("aceite") && incluye("motor", "engine")) return "nivel_aceite_motor";
  if (incluye("turbo", "turbocompresor")) return "turbo_motor";
  if (incluye("arranque") && incluye("motor", "engine")) return "arranque_motor";

  return "";
}

function sonAveriasEspecificamenteSimilares(
  a: Pick<RegistroPatronAveria, "sistema" | "detalleInicial">,
  b: Pick<RegistroPatronAveria, "sistema" | "detalleInicial">,
) {
  const patronA = obtenerPatronEspecifico(a.sistema, a.detalleInicial);
  const patronB = obtenerPatronEspecifico(b.sistema, b.detalleInicial);

  if (patronA && patronA === patronB) {
    return true;
  }

  const tokensA = tokensTecnicosPatron(`${a.sistema} ${a.detalleInicial}`);
  const tokensB = tokensTecnicosPatron(`${b.sistema} ${b.detalleInicial}`);
  if (tokensA.size < 2 || tokensB.size < 2) return false;

  const comunes = [...tokensA].filter((token) => tokensB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const similitud = union > 0 ? comunes / union : 0;

  // Dos términos técnicos compartidos y una similitud razonable evitan que
  // dos fallas coincidan solo porque ambas pertenecen a "Motor" o "Eléctrico".
  return comunes >= 2 && similitud >= 0.4;
}

function esEventoRutinarioExcluidoDePatron(
  sistema: string,
  detalle: string,
) {
  const texto = normalizarTextoPatron(`${sistema} ${detalle}`);

  // Estos eventos corresponden a tareas rutinarias o programadas y no deben
  // contaminar los patrones técnicos de falla. La exclusión es deliberadamente
  // específica para no ocultar síntomas reales como "bajo nivel de aceite",
  // "fuga de aceite" o una "falla del sistema AdBlue".
  const frasesRutinarias = [
    "relleno adblue",
    "relleno de adblue",
    "carga adblue",
    "carga de adblue",
    "abastecimiento adblue",
    "abastecimiento de adblue",
    "relleno de niveles",
    "relleno niveles",
    "chequeo y relleno de niveles",
    "chequeo relleno de niveles",
    "revision y relleno de niveles",
    "revision relleno de niveles",
    "engrase general",
    "lubricacion programada",
    "lubricacion general",
    "engrase programado",
    "chequeo de niveles programado",
    "revision de niveles programada",
  ];

  return frasesRutinarias.some((frase) => texto.includes(frase));
}

function obtenerFamiliaTecnica(sistema: string, detalle: string) {
  const texto = normalizarTextoPatron(`${sistema} ${detalle}`);
  const incluye = (...terminos: string[]) =>
    terminos.some((termino) => texto.includes(termino));

  if (
    incluye(
      "motor", "engine", "ecm", "ecu", "inyector", "inyeccion", "refrigerante",
      "coolant", "turbo", "turbocompresor",
    ) || (incluye("aceite") && incluye("motor"))
  ) return "Motor diésel";
  if (incluye("freno", "brake", "retardo", "retarder")) return "Frenos y retardo";
  if (incluye("direccion", "steering")) return "Dirección";
  if (incluye("suspension", "suspencion")) return "Suspensión";
  if (incluye("hidraulic", "bomba hid", "valvula hid", "cilindro")) return "Sistema hidráulico";
  if (incluye("electrico", "electrica", "alternador", "bateria", "24v", "voltaje")) return "Sistema eléctrico";
  if (incluye("aire acondicionado", "climatizacion", "a c")) return "Aire acondicionado";

  // Si no podemos asociarla con seguridad a una familia técnica conocida,
  // no generamos una alerta de concentración. Es preferible omitir una
  // advertencia dudosa antes que mezclar fallas mecánicas no relacionadas.
  return "";
}

function App() {
  const [vista, setVista] = useState<Vista>("inicio");
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [averias, setAverias] = useState<Averia[]>([]);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [emergencias, setEmergencias] = useState<EmergenciaMina[]>([]);
  const [intervenciones, setIntervenciones] = useState<IntervencionAveria[]>([]);
  const [equipoSeleccionado, setEquipoSeleccionado] =
    useState<Equipo | null>(null);
  const [equipoHistorialSeleccionado, setEquipoHistorialSeleccionado] =
    useState<Equipo | null>(null);
  const [averiaSeleccionadaId, setAveriaSeleccionadaId] =
    useState<number | null>(null);
  const [mantenimientoSeleccionadoId, setMantenimientoSeleccionadoId] =
    useState<number | null>(null);
  const [motivoMantenimiento, setMotivoMantenimiento] = useState("");
  const [responsableMantenimiento, setResponsableMantenimiento] = useState("");
  const [trabajoMantenimiento, setTrabajoMantenimiento] = useState("");
  const [emergenciaSeleccionadaId, setEmergenciaSeleccionadaId] = useState<number | null>(null);
  const [tipoEmergencia, setTipoEmergencia] = useState("");
  const [sectorEmergencia, setSectorEmergencia] = useState("");
  const [descripcionEmergencia, setDescripcionEmergencia] = useState("");
  const [alertaEmergenciaGuardada, setAlertaEmergencia] = useState<EmergenciaMina | null>(null);
  const [numeroBackup, setNumeroBackup] =
    useState<string | null>(null);

  const [sesion, setSesion] = useState<Session | null>(null);
  const [rol, setRol] = useState<RolUsuario | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  const [usuarioLogin, setUsuarioLogin] = useState("");
  const [passwordLogin, setPasswordLogin] = useState("");
  const [errorLogin, setErrorLogin] = useState("");
  const [iniciandoSesion, setIniciandoSesion] = useState(false);
  const [mostrandoEntrada, setMostrandoEntrada] = useState(false);

  const [alertaNuevaAveria, setAlertaNuevaAveria] = useState<{
    id: number;
    numeroMina: string;
    sistema: string;
    informadoPor: string;
  } | null>(null);

  const [alertaEquipoOperativo, setAlertaEquipoOperativo] = useState<{
    id: number;
    numeroMina: string;
    trabajoRealizado: string;
  } | null>(null);

  const [alertaPatronTecnico, setAlertaPatronTecnico] =
    useState<AlertaPatronTecnico | null>(null);

  // Diagnóstico temporal de Supabase Realtime.
  // Nos permitirá comprobar desde PC y celular si el canal realmente queda conectado.
  const [estadoRealtimeConexion, setEstadoRealtime] = useState("CONECTANDO");

  const [estadoPush, setEstadoPush] = useState<
    "NO_COMPATIBLE" | "NO_INSTALADA" | "PENDIENTE" | "ACTIVANDO" | "ACTIVA" | "BLOQUEADA" | "ERROR"
  >("PENDIENTE");

  const audioContextRef = useRef<AudioContext | null>(null);
  const alertaTimeoutRef = useRef<number | null>(null);
  const alertaOperativaTimeoutRef = useRef<number | null>(null);
  const alertaPatronTimeoutRef = useRef<number | null>(null);
  const sirenaEmergenciaIntervalRef = useRef<number | null>(null);
  const emergenciaSonandoIdRef = useRef<number | null>(null);
  const patronesAlertadosRef = useRef<Set<string>>(new Set());
  const operativosAlertadosRef = useRef<Set<number>>(new Set());
  const averiaLocalPendienteRef = useRef<{
    equipoId: number;
    sistema: string;
    vence: number;
  } | null>(null);
  const sincronizacionEnCursoRef = useRef(false);
  const estadoRealtimeRef = useRef("CONECTANDO");
  const canalBackupBroadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const canalAveriasBroadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const averiasAlertadasRef = useRef<Set<number>>(new Set());

  const usuarioId = sesion?.user.id ?? null;
  const estadoRealtime = usuarioId && rol ? estadoRealtimeConexion : "CERRADO";
  const puedeModificar = rol === "operaciones";
  const emergenciaActiva = emergencias.find((emergencia) => emergencia.estado === "ACTIVA") ?? null;
  const alertaEmergencia = usuarioId && emergenciaActiva?.id === alertaEmergenciaGuardada?.id
    ? alertaEmergenciaGuardada : null;
  const emergenciaSeleccionada = emergencias.find(
    (emergencia) => emergencia.id === emergenciaSeleccionadaId,
  ) ?? null;
  const [turnoActual, setTurnoActual] = useState<TurnoActual>(
    () => obtenerTurnoActual(),
  );
  const turnoAnteriorRef = useRef<TurnoActual>(turnoActual);
  const [historialTurnos, setHistorialTurnos] = useState<StatusTurnoGuardado[]>([]);
  const generandoPdfRef = useRef(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [informeTurno, setInformeTurno] = useState<InformeTurnoSnapshot | null>(null);
  const [claveHistorialAbierto, setClaveHistorialAbierto] = useState<string | null>(null);
  const [mesHistorialAbierto, setMesHistorialAbierto] = useState<string | null>(null);
  const [datosCargadosPara, setDatosCargadosPara] = useState<string | null>(null);
  const claveSesionDatos = usuarioId && rol ? usuarioId + ":" + rol : null;
  const datosOperacionalesListos = claveSesionDatos !== null && datosCargadosPara === claveSesionDatos;

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

      // Credenciales correctas: mostramos la transición visual
      // mientras cargamos el perfil. La animación dura al menos 2 s.
      setMostrandoEntrada(true);
      setSesion(data.session);

      await Promise.all([
        cargarPerfil(data.session.user.id),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2000);
        }),
      ]);

      setPasswordLogin("");
      setVista("inicio");
      setMostrandoEntrada(false);
    } catch (error) {
      console.error(error);
      setMostrandoEntrada(false);
      setErrorLogin("No se pudo iniciar sesión.");
    } finally {
      setIniciandoSesion(false);
    }
  }

  async function cerrarSesionUsuario() {
    await supabase.auth.signOut();

    setSesion(null);
    setDatosCargadosPara(null);
    setRol(null);
    setEquipos([]);
    setAverias([]);
    setMantenimientos([]);
    setEmergencias([]);
    detenerSirenaEmergencia();
    setAlertaEmergencia(null);
    setIntervenciones([]);
    setNumeroBackup(null);
    setEquipoSeleccionado(null);
    setAveriaSeleccionadaId(null);
    setMantenimientoSeleccionadoId(null);
    setMotivoMantenimiento("");
    setResponsableMantenimiento("");
    setTrabajoMantenimiento("");
    setVista("inicio");
  }

  function exigirPermiso() {
    if (puedeModificar) {
      return true;
    }

    alert("Este acceso es de solo lectura.");
    return false;
  }

  function convertirClaveVapid(claveBase64: string) {
    const relleno = "=".repeat((4 - (claveBase64.length % 4)) % 4);
    const base64 = (claveBase64 + relleno)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const datos = window.atob(base64);
    return Uint8Array.from([...datos].map((caracter) => caracter.charCodeAt(0)));
  }

  function esIOS() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function esModoInstalado() {
    const navegadorIOS = window.navigator as Navigator & {
      standalone?: boolean;
    };

    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      navegadorIOS.standalone === true
    );
  }

  function obtenerDeviceIdPersistente() {
    const clave = "roac_device_id";
    const existente = window.localStorage.getItem(clave);

    if (existente) {
      return existente;
    }

    const nuevo =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `roac-device-${crypto.randomUUID()}`
        : `roac-device-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    window.localStorage.setItem(clave, nuevo);
    return nuevo;
  }


  async function guardarSuscripcionPush(
    suscripcion: PushSubscription,
  ) {
    if (!sesion) {
      return false;
    }

    const datos = suscripcion.toJSON();
    const endpoint = datos.endpoint;

    if (!endpoint) {
      console.error("La suscripción Push no contiene endpoint.");
      return false;
    }

    const deviceId = obtenerDeviceIdPersistente();
    const ahora = new Date().toISOString();

    /*
      Migración segura:
      si este navegador ya tenía una fila antigua identificada solo
      por endpoint, la reutilizamos y le asignamos device_id.
      Así no creamos un registro adicional en el primer arranque
      de esta nueva versión.
    */
    const { data: filaEndpoint, error: errorBuscarEndpoint } = await supabase
      .from("push_subscriptions")
      .select("id, device_id")
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (errorBuscarEndpoint) {
      console.error(
        "Error buscando la suscripción Push existente:",
        errorBuscarEndpoint,
      );
      return false;
    }

    if (filaEndpoint) {
      const { error: errorActualizar } = await supabase
        .from("push_subscriptions")
        .update({
          user_id: sesion.user.id,
          device_id: deviceId,
          endpoint,
          p256dh: datos.keys?.p256dh,
          auth: datos.keys?.auth,
          user_agent: navigator.userAgent,
          activo: true,
          updated_at: ahora,
        })
        .eq("id", filaEndpoint.id);

      if (errorActualizar) {
        console.error(
          "Error migrando/actualizando la suscripción Push:",
          errorActualizar,
        );
        return false;
      }

      return true;
    }

    /*
      A partir de aquí device_id es la identidad estable del navegador.
      Si Apple/Chrome renuevan el endpoint, se actualiza ESTA MISMA fila.
    */
    const { error: errorUpsert } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: sesion.user.id,
          device_id: deviceId,
          endpoint,
          p256dh: datos.keys?.p256dh,
          auth: datos.keys?.auth,
          user_agent: navigator.userAgent,
          activo: true,
          updated_at: ahora,
        },
        {
          onConflict: "device_id",
        },
      );

    if (errorUpsert) {
      console.error(
        "Error guardando la suscripción Push por device_id:",
        errorUpsert,
      );
      return false;
    }

    return true;
  }


  async function sincronizarSuscripcionPushExistente() {
    if (
      !sesion ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    if (esIOS() && !esModoInstalado()) {
      return;
    }

    try {
      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const suscripcion = await registro.pushManager.getSubscription();

      if (!suscripcion) {
        return;
      }

      const guardada = await guardarSuscripcionPush(suscripcion);

      if (guardada) {
        setEstadoPush("ACTIVA");
        console.log(
          "[ROAC Push] Suscripción actual sincronizada con device_id.",
        );
      }
    } catch (error) {
      console.error(
        "No se pudo sincronizar la suscripción Push existente:",
        error,
      );
    }
  }


  async function activarNotificacionesPush() {
    if (!sesion) {
      return;
    }

    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      alert("Este dispositivo o navegador no soporta notificaciones Web Push.");
      setEstadoPush("NO_COMPATIBLE");
      return;
    }

    if (esIOS() && !esModoInstalado()) {
      alert(
        "En iPhone, primero agrega ROAC Operations a la pantalla de inicio y ábrelo desde ese icono. Luego vuelve a activar las notificaciones.",
      );
      setEstadoPush("NO_INSTALADA");
      return;
    }

    const claveVapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

    if (!claveVapid) {
      alert("Falta configurar VITE_VAPID_PUBLIC_KEY en ROAC Operations.");
      setEstadoPush("ERROR");
      return;
    }

    try {
      setEstadoPush("ACTIVANDO");

      const permiso = await Notification.requestPermission();

      if (permiso !== "granted") {
        setEstadoPush(permiso === "denied" ? "BLOQUEADA" : "PENDIENTE");
        return;
      }

      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let suscripcion = await registro.pushManager.getSubscription();

      if (!suscripcion) {
        suscripcion = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertirClaveVapid(claveVapid),
        });
      }

      const guardada = await guardarSuscripcionPush(suscripcion);

      if (!guardada) {
        alert("No se pudo registrar este dispositivo para notificaciones.");
        setEstadoPush("ERROR");
        return;
      }

      setEstadoPush("ACTIVA");
      alert("Notificaciones de ROAC Operations activadas en este dispositivo.");
    } catch (error) {
      console.error("Error activando Web Push:", error);
      setEstadoPush("ERROR");
      alert("No se pudieron activar las notificaciones en este dispositivo.");
    }
  }

  async function obtenerEndpointPushActual() {
    try {
      if (!("serviceWorker" in navigator)) {
        return null;
      }

      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = await registro?.pushManager.getSubscription();

      return suscripcion?.endpoint ?? null;
    } catch (error) {
      console.error("No se pudo leer la suscripción Push actual:", error);
      return null;
    }
  }

  async function enviarPushOperacional(
    accion: "NUEVA_AVERIA" | "EQUIPO_OPERATIVO" | "PATRON_TECNICO",
    averiaId: number,
    patron?: {
      tipo: TipoAlertaPatron;
      familia: string;
      cantidadReincidencia: number;
      cantidadFamilia: number;
    },
  ) {
    try {
      const excludeEndpoint = await obtenerEndpointPushActual();

      const { error } = await supabase.functions.invoke(
        "roac-web-push",
        {
          body: {
            accion,
            averiaId,
            excludeEndpoint,
            ...(accion === "PATRON_TECNICO" && patron
              ? {
                  tipoPatron: patron.tipo,
                  familiaPatron: patron.familia,
                  cantidadReincidencia: patron.cantidadReincidencia,
                  cantidadFamilia: patron.cantidadFamilia,
                }
              : {}),
          },
        },
      );

      if (error) {
        console.error(
          "La operación se guardó correctamente, pero falló la notificación Push:",
          error,
        );
      }
    } catch (error) {
      // Muy importante: el Push nunca debe bloquear ni revertir
      // una operación ya guardada en ROAC.
      console.error(
        "Error no crítico al enviar notificación Push:",
        error,
      );
    }
  }

  async function enviarPushEmergencia(emergenciaId: number) {
    try {
      const excludeEndpoint = await obtenerEndpointPushActual();
      const { error } = await supabase.functions.invoke("roac-web-push", {
        body: {
          accion: "EMERGENCIA_MINA",
          emergenciaId,
          excludeEndpoint,
        },
      });

      if (error) {
        console.error(
          "La emergencia se guardó, pero falló la notificación Push:",
          error,
        );
      }
    } catch (error) {
      console.error("Error no crítico enviando Push de emergencia:", error);
    }
  }

  function obtenerAudioContexto() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    return audioContextRef.current;
  }

  function reproducirPulsoEmergencia() {
    try {
      const contexto = obtenerAudioContexto();
      if (contexto.state === "suspended") {
        void contexto.resume();
      }

      const inicio = contexto.currentTime + 0.02;
      const tonos = [
        { desfase: 0, frecuencia: 720 },
        { desfase: 0.34, frecuencia: 980 },
        { desfase: 0.68, frecuencia: 720 },
      ];

      tonos.forEach(({ desfase, frecuencia }) => {
        const oscilador = contexto.createOscillator();
        const ganancia = contexto.createGain();
        const comienzo = inicio + desfase;
        const termino = comienzo + 0.28;

        oscilador.type = "sawtooth";
        oscilador.frequency.setValueAtTime(frecuencia, comienzo);
        ganancia.gain.setValueAtTime(0.0001, comienzo);
        ganancia.gain.exponentialRampToValueAtTime(0.24, comienzo + 0.03);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, termino);
        oscilador.connect(ganancia);
        ganancia.connect(contexto.destination);
        oscilador.start(comienzo);
        oscilador.stop(termino + 0.02);
      });
    } catch (error) {
      console.warn("No se pudo reproducir la sirena de emergencia:", error);
    }
  }

  function detenerSirenaEmergencia() {
    if (sirenaEmergenciaIntervalRef.current !== null) {
      window.clearInterval(sirenaEmergenciaIntervalRef.current);
      sirenaEmergenciaIntervalRef.current = null;
    }
    emergenciaSonandoIdRef.current = null;
  }

  function iniciarSirenaEmergencia(emergenciaId: number) {
    if (emergenciaSonandoIdRef.current === emergenciaId) {
      return;
    }

    detenerSirenaEmergencia();
    emergenciaSonandoIdRef.current = emergenciaId;
    reproducirPulsoEmergencia();
    sirenaEmergenciaIntervalRef.current = window.setInterval(
      reproducirPulsoEmergencia,
      1800,
    );
  }

  function reproducirAlertaSonora() {
    try {
      const contexto = obtenerAudioContexto();

      if (contexto.state === "suspended") {
        void contexto.resume();
      }

      const inicio = contexto.currentTime + 0.03;
      const pulsos = [0, 0.22, 0.44];

      pulsos.forEach((desfase, indice) => {
        const oscilador = contexto.createOscillator();
        const ganancia = contexto.createGain();
        const comienzo = inicio + desfase;
        const termino = comienzo + 0.14;

        oscilador.type = "sine";
        oscilador.frequency.setValueAtTime(
          indice === 1 ? 980 : 820,
          comienzo,
        );

        ganancia.gain.setValueAtTime(0.0001, comienzo);
        ganancia.gain.exponentialRampToValueAtTime(0.18, comienzo + 0.02);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, termino);

        oscilador.connect(ganancia);
        ganancia.connect(contexto.destination);
        oscilador.start(comienzo);
        oscilador.stop(termino + 0.02);
      });
    } catch (error) {
      console.warn("No se pudo reproducir la alerta sonora:", error);
    }
  }

  function cerrarAlertaNuevaAveria() {
    setAlertaNuevaAveria(null);

    if (alertaTimeoutRef.current !== null) {
      window.clearTimeout(alertaTimeoutRef.current);
      alertaTimeoutRef.current = null;
    }
  }

  function reproducirAlertaPatronTecnico() {
    try {
      const contexto = obtenerAudioContexto();

      if (contexto.state === "suspended") {
        void contexto.resume();
      }

      const inicio = contexto.currentTime + 0.03;
      const tonos = [
        { desfase: 0, frecuencia: 540, duracion: 0.18 },
        { desfase: 0.24, frecuencia: 540, duracion: 0.18 },
        { desfase: 0.52, frecuencia: 760, duracion: 0.26 },
      ];

      tonos.forEach(({ desfase, frecuencia, duracion }) => {
        const oscilador = contexto.createOscillator();
        const ganancia = contexto.createGain();
        const comienzo = inicio + desfase;
        const termino = comienzo + duracion;

        oscilador.type = "triangle";
        oscilador.frequency.setValueAtTime(frecuencia, comienzo);
        ganancia.gain.setValueAtTime(0.0001, comienzo);
        ganancia.gain.exponentialRampToValueAtTime(0.2, comienzo + 0.025);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, termino);
        oscilador.connect(ganancia);
        ganancia.connect(contexto.destination);
        oscilador.start(comienzo);
        oscilador.stop(termino + 0.02);
      });
    } catch (error) {
      console.warn("No se pudo reproducir la advertencia de patrón técnico:", error);
    }
  }

  function cerrarAlertaPatronTecnico() {
    setAlertaPatronTecnico(null);

    if (alertaPatronTimeoutRef.current !== null) {
      window.clearTimeout(alertaPatronTimeoutRef.current);
      alertaPatronTimeoutRef.current = null;
    }
  }

  async function evaluarPatronesTecnicosAveria(
    equipoId: number,
    numeroMina: string,
    averiaId: number,
    enviarPushPatron = false,
    forzarMostrar = false,
  ) {
    const { data, error } = await supabase
      .from("averias")
      .select("id, sistema, detalle_inicial, fecha_aviso")
      .eq("equipo_id", equipoId)
      .order("fecha_aviso", { ascending: true });

    if (error || !data) {
      console.error("No se pudo evaluar reincidencia de averías:", error);
      return;
    }

    const registros: RegistroPatronAveria[] = data.map((registro) => ({
      id: registro.id,
      sistema: registro.sistema ?? "",
      detalleInicial: registro.detalle_inicial ?? "",
      fechaAviso: registro.fecha_aviso ?? "",
    }));

    const actual = registros.find((registro) => registro.id === averiaId);
    if (!actual) return;

    // Una tarea rutinaria/programada nunca puede originar un patrón técnico.
    if (
      esEventoRutinarioExcluidoDePatron(
        actual.sistema,
        actual.detalleInicial,
      )
    ) {
      return;
    }

    // Para una notificación antigua reconstruimos el patrón tal como existía
    // cuando se publicó ESA avería, sin mezclar fallas posteriores.
    const instanteActual = new Date(actual.fechaAviso).getTime();
    const registrosHastaActual = registros.filter(
      (registro) =>
        new Date(registro.fechaAviso).getTime() <= instanteActual &&
        !esEventoRutinarioExcluidoDePatron(
          registro.sistema,
          registro.detalleInicial,
        ),
    );

    const similares = registrosHastaActual.filter((registro) =>
      sonAveriasEspecificamenteSimilares(actual, registro),
    );

    const familiaActual = obtenerFamiliaTecnica(actual.sistema, actual.detalleInicial);
    const mismaFamilia = familiaActual
      ? registrosHastaActual.filter(
          (registro) =>
            obtenerFamiliaTecnica(registro.sistema, registro.detalleInicial) === familiaActual,
        )
      : [];

    const disparaReincidencia =
      similares.length >= 3 && similares.length % 3 === 0;
    const disparaFamilia =
      mismaFamilia.length >= 5 && mismaFamilia.length % 5 === 0;

    if (!disparaReincidencia && !disparaFamilia) return;

    const claveAlerta = `${averiaId}:${disparaReincidencia ? similares.length : 0}:${disparaFamilia ? mismaFamilia.length : 0}`;
    if (patronesAlertadosRef.current.has(claveAlerta) && !forzarMostrar) return;
    patronesAlertadosRef.current.add(claveAlerta);

    const tipo: TipoAlertaPatron =
      disparaReincidencia && disparaFamilia
        ? "DOBLE"
        : disparaReincidencia
          ? "REINCIDENCIA"
          : "CONCENTRACION";

    let titulo = "Advertencia de patrón técnico";
    let mensaje = `El equipo registra ${mismaFamilia.length} fallas relacionadas con ${familiaActual}.`;
    let relacionados = mismaFamilia.slice(-5);

    if (tipo === "REINCIDENCIA") {
      titulo = "Posible reincidencia detectada";
      mensaje = `El equipo registra ${similares.length} detenciones con motivo o descripción iguales o técnicamente similares.`;
      relacionados = similares.slice(-3);
    } else if (tipo === "DOBLE") {
      titulo = "Reincidencia y patrón técnico detectados";
      mensaje =
        `Se detectaron ${similares.length} detenciones similares y, además, ` +
        `${mismaFamilia.length} fallas relacionadas con ${familiaActual}.`;
      const ids = new Set<number>();
      relacionados = [...similares.slice(-3), ...mismaFamilia.slice(-5)].filter((registro) => {
        if (ids.has(registro.id)) return false;
        ids.add(registro.id);
        return true;
      });
    }

    cerrarAlertaNuevaAveria();
    if (alertaPatronTimeoutRef.current !== null) {
      window.clearTimeout(alertaPatronTimeoutRef.current);
    }

    setAlertaPatronTecnico({
      tipo,
      numeroMina,
      averiaId,
      titulo,
      mensaje,
      familia: familiaActual,
      cantidadReincidencia: similares.length,
      cantidadFamilia: mismaFamilia.length,
      relacionados,
    });
    reproducirAlertaPatronTecnico();

    // Solo el dispositivo que PUBLICÓ la avería registra y solicita el Push.
    // Guardamos el snapshot exacto del patrón para que en el futuro sepamos
    // qué avería lo disparó y cuáles fueron los eventos relacionados.
    if (enviarPushPatron) {
      const { error: errorRegistroPatron } = await supabase.rpc(
        "registrar_alerta_patron_tecnico",
        {
          p_averia_disparadora_id: averiaId,
          p_equipo_id: equipoId,
          p_tipo_patron: tipo,
          p_familia: familiaActual,
          p_cantidad_reincidencia: similares.length,
          p_cantidad_familia: mismaFamilia.length,
          p_averias_relacionadas: relacionados,
        },
      );

      if (errorRegistroPatron) {
        console.error(
          "La alerta se detectó, pero no se pudo guardar su historial:",
          errorRegistroPatron,
        );
      }

      void enviarPushOperacional("PATRON_TECNICO", averiaId, {
        tipo,
        familia: familiaActual,
        cantidadReincidencia: similares.length,
        cantidadFamilia: mismaFamilia.length,
      });
    }

    // Cuando se abre desde una Push, la advertencia queda visible hasta que
    // el usuario la cierre. En una alerta normal conserva el cierre automático.
    if (!forzarMostrar) {
      alertaPatronTimeoutRef.current = window.setTimeout(() => {
        setAlertaPatronTecnico(null);
        alertaPatronTimeoutRef.current = null;
      }, 25_000);
    }
  }

  function reproducirAlertaEquipoOperativo() {
    try {
      const contexto = obtenerAudioContexto();

      if (contexto.state === "suspended") {
        void contexto.resume();
      }

      const inicio = contexto.currentTime + 0.03;
      const tonos = [
        { desfase: 0, frecuencia: 720 },
        { desfase: 0.22, frecuencia: 1040 },
      ];

      tonos.forEach(({ desfase, frecuencia }) => {
        const oscilador = contexto.createOscillator();
        const ganancia = contexto.createGain();
        const comienzo = inicio + desfase;
        const termino = comienzo + 0.18;

        oscilador.type = "sine";
        oscilador.frequency.setValueAtTime(frecuencia, comienzo);

        ganancia.gain.setValueAtTime(0.0001, comienzo);
        ganancia.gain.exponentialRampToValueAtTime(0.16, comienzo + 0.025);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, termino);

        oscilador.connect(ganancia);
        ganancia.connect(contexto.destination);
        oscilador.start(comienzo);
        oscilador.stop(termino + 0.02);
      });
    } catch (error) {
      console.warn("No se pudo reproducir alerta de equipo operativo:", error);
    }
  }

  function cerrarAlertaEquipoOperativo() {
    setAlertaEquipoOperativo(null);

    if (alertaOperativaTimeoutRef.current !== null) {
      window.clearTimeout(alertaOperativaTimeoutRef.current);
      alertaOperativaTimeoutRef.current = null;
    }
  }

  async function manejarEquipoOperativoRealtime(registro: {
    id?: number;
    equipo_id?: number;
    trabajo_realizado?: string;
  }) {
    if (!registro.id || !registro.equipo_id) {
      return;
    }

    if (operativosAlertadosRef.current.has(registro.id)) {
      return;
    }

    operativosAlertadosRef.current.add(registro.id);

    const { data: equipoDb, error } = await supabase
      .from("equipos")
      .select("numero_mina")
      .eq("id", registro.equipo_id)
      .single();

    if (error || !equipoDb) {
      console.error("No se pudo identificar el equipo operativo:", error);
      return;
    }

    if (alertaOperativaTimeoutRef.current !== null) {
      window.clearTimeout(alertaOperativaTimeoutRef.current);
    }

    setAlertaEquipoOperativo({
      id: registro.id,
      numeroMina: equipoDb.numero_mina,
      trabajoRealizado:
        registro.trabajo_realizado?.trim() ||
        "Avería finalizada. Equipo disponible para operación.",
    });

    reproducirAlertaEquipoOperativo();

    alertaOperativaTimeoutRef.current = window.setTimeout(() => {
      setAlertaEquipoOperativo(null);
      alertaOperativaTimeoutRef.current = null;
    }, 12_000);
  }

  async function manejarNuevaAveriaRealtime(registro: {
    id?: number;
    equipo_id?: number;
    sistema?: string;
    informado_por?: string;
  }) {
    if (!registro.id || !registro.equipo_id) {
      return;
    }

    const pendienteLocal = averiaLocalPendienteRef.current;
    const esPublicacionDeEsteDispositivo = Boolean(
      pendienteLocal &&
        Date.now() <= pendienteLocal.vence &&
        pendienteLocal.equipoId === registro.equipo_id &&
        pendienteLocal.sistema === (registro.sistema ?? ""),
    );

    if (esPublicacionDeEsteDispositivo) {
      averiaLocalPendienteRef.current = null;
      return;
    }

    if (averiasAlertadasRef.current.has(registro.id)) {
      return;
    }

    averiasAlertadasRef.current.add(registro.id);

    const { data: equipoDb, error } = await supabase
      .from("equipos")
      .select("numero_mina")
      .eq("id", registro.equipo_id)
      .single();

    if (error || !equipoDb) {
      console.error("No se pudo identificar el equipo de la nueva avería:", error);
      return;
    }

    if (alertaTimeoutRef.current !== null) {
      window.clearTimeout(alertaTimeoutRef.current);
    }

    setAlertaNuevaAveria({
      id: registro.id,
      numeroMina: equipoDb.numero_mina,
      sistema: registro.sistema ?? "Sin sistema informado",
      informadoPor: registro.informado_por ?? "Sin informar",
    });

    reproducirAlertaSonora();

    alertaTimeoutRef.current = window.setTimeout(() => {
      setAlertaNuevaAveria(null);
      alertaTimeoutRef.current = null;
    }, 12_000);

    // La evaluación usa el historial completo del equipo. Si corresponde una
    // advertencia técnica, reemplaza la alerta normal por la de mayor prioridad.
    void evaluarPatronesTecnicosAveria(
      registro.equipo_id,
      equipoDb.numero_mina,
      registro.id,
    );
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
        fechaAviso: registro.fecha_aviso,
        fechaAtencion: registro.fecha_atencion ?? "", 
        fechaCierre: registro.fecha_cierre ?? "",
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


  async function cargarIntervenciones() {
    const { data, error } = await supabase
      .from("intervenciones_averia")
      .select(`
        id,
        averia_id,
        tecnico,
        tipo,
        detalle,
        fecha,
        clave_turno
      `)
      .order("fecha", { ascending: true });

    if (error) {
      console.error("Error al cargar intervenciones de avería:", error);
      return;
    }

    const convertidas: IntervencionAveria[] = (data ?? []).map((registro) => ({
      id: registro.id,
      averiaId: registro.averia_id,
      tecnico: registro.tecnico,
      tipo: registro.tipo,
      detalle: registro.detalle ?? "",
      fecha: registro.fecha,
      claveTurno: registro.clave_turno ?? "",
    }));

    setIntervenciones(convertidas);
  }


  async function cargarEmergencias() {
    const { data, error } = await supabase
      .from("emergencias_mina")
      .select(
        "id, tipo_emergencia, sector, descripcion, estado, fecha_inicio, fecha_fin, creada_por, finalizada_por",
      )
      .order("fecha_inicio", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error cargando emergencias de mina:", error);
      return;
    }

    setEmergencias(
      (data ?? []).map((registro) => ({
        id: registro.id,
        tipoEmergencia: registro.tipo_emergencia,
        sector: registro.sector,
        descripcion: registro.descripcion ?? "",
        estado: registro.estado as "ACTIVA" | "FINALIZADA",
        fechaInicio: registro.fecha_inicio,
        fechaFin: registro.fecha_fin,
        creadaPor: registro.creada_por,
        finalizadaPor: registro.finalizada_por,
      })),
    );
  }

  async function cargarMantenimientos() {
    const { data, error } = await supabase
      .from("mantenimientos")
      .select(`
        id,
        motivo,
        responsable,
        trabajo_realizado,
        estado,
        fecha_inicio,
        fecha_fin,
        equipos (
          numero_mina,
          numero_interno,
          tipo,
          marca,
          modelo,
          estado
        )
      `)
      .order("fecha_inicio", {
        ascending: false,
      });

    if (error) {
      console.error("Error al cargar mantenimientos:", error);
      return;
    }

    const mantenimientosConvertidos: Mantenimiento[] = data.map(
      (registro) => {
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
          motivo: registro.motivo,
          responsable: registro.responsable,
          trabajoRealizado: registro.trabajo_realizado ?? "",
          estado: registro.estado,
          fechaInicio: registro.fecha_inicio,
          fechaFin: registro.fecha_fin ?? "",
          horaInicio: new Date(registro.fecha_inicio).toLocaleTimeString(
            "es-CL",
            {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            },
          ),
          horaFin: registro.fecha_fin
            ? new Date(registro.fecha_fin).toLocaleTimeString(
                "es-CL",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                },
              )
            : "",
        };
      },
    );

    setMantenimientos(mantenimientosConvertidos);
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


  async function cargarHistorialTurnos() {
    const { data, error } = await supabase
      .from("status_turnos")
      .select("*")
      .order("fecha_inicio", { ascending: false })
      .limit(60);

    if (error) {
      console.error("Error al cargar historial de turnos:", error);
      return;
    }

    const convertidos: StatusTurnoGuardado[] = (data ?? []).map((registro) => ({
      id: registro.id,
      claveTurno: registro.clave_turno,
      tipoTurno: registro.tipo_turno,
      bloqueTrabajo: obtenerBloqueTrabajo(new Date(registro.fecha_inicio)),
      rangoTurno: registro.rango_turno,
      fechaInicio: registro.fecha_inicio,
      fechaFin: registro.fecha_fin,
      resumen: registro.resumen as ResumenStatusTurno,
      averias: (registro.averias ?? []) as Averia[],
      mantenimientos: (registro.mantenimientos ?? []) as Mantenimiento[],
      creadoEn: registro.created_at,
    }));

    setHistorialTurnos(convertidos);
  }

  async function sincronizarDatosOperacionales(
    motivo: string = "manual",
  ) {
    if (!sesion || !rol || sincronizacionEnCursoRef.current) {
      return;
    }

    sincronizacionEnCursoRef.current = true;

    try {
      await Promise.all([
        cargarEquipos(),
        cargarAverias(),
        cargarMantenimientos(),
        cargarEmergencias(),
        cargarIntervenciones(),
        cargarBackup(),
      ]);

      console.log(`[ROAC Sync] Sincronización completada (${motivo}).`);
    } catch (error) {
      console.error(`[ROAC Sync] Error de sincronización (${motivo}):`, error);
    } finally {
      sincronizacionEnCursoRef.current = false;
    }
  }


  function obtenerAveriasRelevantesParaTurno(turno: TurnoActual) {
    const { inicio, fin } = obtenerIntervaloTurno(turno);

    return averias.filter((averia) => {
      if (!averia.fechaAviso) {
        return false;
      }

      const inicioAveria = new Date(averia.fechaAviso);
      const cierreAveria = averia.fechaCierre
        ? new Date(averia.fechaCierre)
        : null;

      return (
        inicioAveria <= fin &&
        (!cierreAveria || cierreAveria >= inicio)
      );
    });
  }

  function obtenerMantenimientosRelevantesParaTurno(turno: TurnoActual) {
    const { inicio, fin } = obtenerIntervaloTurno(turno);

    return mantenimientos.filter((mantenimiento) => {
      if (!mantenimiento.fechaInicio) {
        return false;
      }

      const inicioMantenimiento = new Date(mantenimiento.fechaInicio);
      const finMantenimiento = mantenimiento.fechaFin
        ? new Date(mantenimiento.fechaFin)
        : null;

      return (
        inicioMantenimiento <= fin &&
        (!finMantenimiento || finMantenimiento >= inicio)
      );
    });
  }

  function construirResumenTurno(turno: TurnoActual): ResumenStatusTurno {
    const { inicio } = obtenerIntervaloTurno(turno);

    const averiasIniciadas = averias.filter((averia) =>
      fechaDentroDelTurno(averia.fechaAviso, turno),
    );

    const averiasHeredadasTurno = averias.filter((averia) => {
      if (!averia.fechaAviso) {
        return false;
      }

      const fechaAviso = new Date(averia.fechaAviso);
      const estabaAbiertaAlInicio =
        !averia.fechaCierre || new Date(averia.fechaCierre) >= inicio;

      return fechaAviso < inicio && estabaAbiertaAlInicio;
    });

    const averiasCerradasTurno = averias.filter(
      (averia) =>
        Boolean(averia.fechaCierre) &&
        fechaDentroDelTurno(averia.fechaCierre, turno),
    );

    const mantenimientosIniciados = mantenimientos.filter((mantenimiento) =>
      fechaDentroDelTurno(mantenimiento.fechaInicio, turno),
    );

    const mantenimientosHeredadosTurno = mantenimientos.filter((mantenimiento) => {
      if (!mantenimiento.fechaInicio) {
        return false;
      }

      const fechaInicio = new Date(mantenimiento.fechaInicio);
      const estabaActivoAlInicio =
        !mantenimiento.fechaFin || new Date(mantenimiento.fechaFin) >= inicio;

      return fechaInicio < inicio && estabaActivoAlInicio;
    });

    const mantenimientosFinalizados = mantenimientos.filter(
      (mantenimiento) =>
        Boolean(mantenimiento.fechaFin) &&
        fechaDentroDelTurno(mantenimiento.fechaFin, turno),
    );

    return {
      caexOperativosEnMina,
      numeroBackup,
      equiposOperativos,
      equiposEnAtencion,
      equiposFueraServicio,
      mantenimientosEnCurso: mantenimientosEnCurso.length,
      averiasIniciadas: averiasIniciadas.length,
      averiasHeredadas: averiasHeredadasTurno.length,
      averiasCerradas: averiasCerradasTurno.length,
      mantenimientosIniciados: mantenimientosIniciados.length,
      mantenimientosHeredados: mantenimientosHeredadosTurno.length,
      mantenimientosFinalizados: mantenimientosFinalizados.length,
    };
  }

  async function guardarStatusTurno(turno: TurnoActual) {
    if (rol !== "operaciones") {
      return;
    }

    const { inicio, fin } = obtenerIntervaloTurno(turno);
    const resumen = construirResumenTurno(turno);
    const averiasTurno = obtenerAveriasRelevantesParaTurno(turno);
    const mantenimientosTurno = obtenerMantenimientosRelevantesParaTurno(turno);

    const { error } = await supabase
      .from("status_turnos")
      .upsert(
        {
          clave_turno: turno.claveTurno,
          tipo_turno: turno.tipo,
          rango_turno: turno.rangoTurno,
          fecha_inicio: inicio.toISOString(),
          fecha_fin: fin.toISOString(),
          resumen,
          averias: averiasTurno,
          mantenimientos: mantenimientosTurno,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clave_turno", ignoreDuplicates: true },
      );

    if (error) {
      console.error("No se pudo archivar el status del turno:", error);
      return;
    }

    await cargarHistorialTurnos();
  }


  useEffect(() => {
    function habilitarAudio() {
      try {
        const contexto = obtenerAudioContexto();
        if (contexto.state === "suspended") {
          void contexto.resume();
        }
      } catch (error) {
        console.warn("No se pudo habilitar el audio:", error);
      }
    }

    window.addEventListener("pointerdown", habilitarAudio, { once: true });
    window.addEventListener("keydown", habilitarAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", habilitarAudio);
      window.removeEventListener("keydown", habilitarAudio);

      if (alertaTimeoutRef.current !== null) {
        window.clearTimeout(alertaTimeoutRef.current);
      }

      if (alertaOperativaTimeoutRef.current !== null) {
        window.clearTimeout(alertaOperativaTimeoutRef.current);
      }
    };
  }, []);

  const alComprobarPush = useEffectEvent(() => sincronizarSuscripcionPushExistente());
  useEffect(() => {
    if (!usuarioId || !rol) return;
    let activo = true;
    async function comprobarEstadoPush(): Promise<typeof estadoPush> {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        return "NO_COMPATIBLE";
      }

      if (esIOS() && !esModoInstalado()) {
        return "NO_INSTALADA";
      }

      if (Notification.permission === "denied") {
        return "BLOQUEADA";
      }

      try {
        const registro = await navigator.serviceWorker.register("/sw.js");
        const suscripcion = await registro.pushManager.getSubscription();

        return suscripcion && Notification.permission === "granted" ? "ACTIVA" : "PENDIENTE";
      } catch (error) {
        console.error("Error comprobando Web Push:", error);
        return "ERROR";
      }
    }


    void comprobarEstadoPush().then((estado) => {
      if (!activo) return;
      setEstadoPush(estado);
      void alComprobarPush();
    });
    return () => { activo = false; };
  }, [usuarioId, rol]);

  useEffect(() => {
    function actualizarTurno() {
      setTurnoActual(obtenerTurnoActual());
    }

    actualizarTurno();

    // Actualización frecuente para que el cambio 08:00 / 20:00
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
        setDatosCargadosPara(null);
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
        setDatosCargadosPara(null);
      }
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!claveSesionDatos) {
      return;
    }

    let activo = true;

    async function cargarDatosIniciales() {

      await Promise.all([
        cargarEquipos(),
        cargarAverias(),
        cargarMantenimientos(),
        cargarEmergencias(),
        cargarIntervenciones(),
        cargarBackup(),
        cargarHistorialTurnos(),
      ]);

      if (activo) {
        setDatosCargadosPara(claveSesionDatos);
      }
    }

    void cargarDatosIniciales();

    return () => {
      activo = false;
    };
  }, [claveSesionDatos]);

  const alAbrirNotificacion = useEffectEvent(() => {
    if (!sesion || !rol || !datosOperacionalesListos) {
      return;
    }

    const parametros = new URLSearchParams(window.location.search);
    const emergenciaDesdePush = parametros.get("emergencia");
    const averiaDesdePush = parametros.get("averia");
    const esPatronDesdePush = parametros.get("patron") === "1";

    function limpiarParametrosPush() {
      const urlLimpia = new URL(window.location.href);
      urlLimpia.searchParams.delete("emergencia");
      urlLimpia.searchParams.delete("averia");
      urlLimpia.searchParams.delete("patron");
      window.history.replaceState(
        {},
        "",
        `${urlLimpia.pathname}${urlLimpia.search}${urlLimpia.hash}`,
      );
    }

    if (emergenciaDesdePush) {
      const emergenciaId = Number(emergenciaDesdePush);
      if (Number.isInteger(emergenciaId) && emergenciaId > 0) {
        const existe = emergencias.some((emergencia) => emergencia.id === emergenciaId);
        if (existe) {
          void abrirDetalleEmergencia(emergenciaId);
          limpiarParametrosPush();
          return;
        }
      }
    }

    if (!averiaDesdePush) {
      return;
    }

    const averiaId = Number(averiaDesdePush);

    if (!Number.isInteger(averiaId) || averiaId <= 0) {
      limpiarParametrosPush();
      return;
    }

    if (esPatronDesdePush) {
      void (async () => {
        // Primero intentamos leer el snapshot exacto guardado cuando se generó
        // la alerta. Así no dependemos de recalcular el patrón tiempo después.
        const { data: alertaGuardada, error: errorAlertaGuardada } =
          await supabase
            .from("alertas_patron_tecnico")
            .select(`
              tipo_patron,
              familia,
              cantidad_reincidencia,
              cantidad_familia,
              averias_relacionadas,
              equipos (
                numero_mina
              )
            `)
            .eq("averia_disparadora_id", averiaId)
            .maybeSingle();

        if (!errorAlertaGuardada && alertaGuardada) {
          const equipoDb = Array.isArray(alertaGuardada.equipos)
            ? alertaGuardada.equipos[0]
            : alertaGuardada.equipos;

          const tipo = alertaGuardada.tipo_patron as TipoAlertaPatron;
          const familia = alertaGuardada.familia ?? "";
          const cantidadReincidencia =
            alertaGuardada.cantidad_reincidencia ?? 0;
          const cantidadFamilia = alertaGuardada.cantidad_familia ?? 0;
          const relacionados = Array.isArray(
            alertaGuardada.averias_relacionadas,
          )
            ? (alertaGuardada.averias_relacionadas as RegistroPatronAveria[])
            : [];

          let titulo = "Advertencia de patrón técnico";
          let mensaje =
            `El equipo registra ${cantidadFamilia} fallas relacionadas` +
            `${familia ? ` con ${familia}` : ""}.`;

          if (tipo === "REINCIDENCIA") {
            titulo = "Posible reincidencia detectada";
            mensaje =
              `El equipo registra ${cantidadReincidencia} detenciones con motivo ` +
              "o descripción iguales o técnicamente similares.";
          } else if (tipo === "DOBLE") {
            titulo = "Reincidencia y patrón técnico detectados";
            mensaje =
              `Se detectaron ${cantidadReincidencia} detenciones similares y, además, ` +
              `${cantidadFamilia} fallas relacionadas` +
              `${familia ? ` con ${familia}` : ""}.`;
          }

          cerrarAlertaNuevaAveria();
          cerrarAlertaPatronTecnico();
          setAlertaPatronTecnico({
            tipo,
            numeroMina: equipoDb?.numero_mina ?? "Equipo",
            averiaId,
            titulo,
            mensaje,
            familia,
            cantidadReincidencia,
            cantidadFamilia,
            relacionados,
          });
          reproducirAlertaPatronTecnico();
          limpiarParametrosPush();
          return;
        }

        if (errorAlertaGuardada) {
          console.warn(
            `[ROAC Push] No se pudo leer el patrón guardado de la avería #${averiaId}; se intentará reconstruir.`,
            errorAlertaGuardada,
          );
        }

        // Compatibilidad con alertas antiguas creadas antes de existir la tabla
        // alertas_patron_tecnico: se reconstruyen con la lógica histórica.
        const { data, error } = await supabase
          .from("averias")
          .select(`
            id,
            equipo_id,
            equipos (
              numero_mina
            )
          `)
          .eq("id", averiaId)
          .single();

        if (error || !data) {
          console.error(
            `[ROAC Push] No se pudo reconstruir el patrón de la avería #${averiaId}:`,
            error,
          );
          return;
        }

        const equipoDb = Array.isArray(data.equipos)
          ? data.equipos[0]
          : data.equipos;

        if (!equipoDb?.numero_mina) {
          console.warn(
            `[ROAC Push] La avería #${averiaId} no tiene equipo asociado.`,
          );
          return;
        }

        await evaluarPatronesTecnicosAveria(
          data.equipo_id,
          equipoDb.numero_mina,
          averiaId,
          false,
          true,
        );

        limpiarParametrosPush();
      })();

      return;
    }

    const averiaExiste = averias.some((averia) => averia.id === averiaId);

    if (!averiaExiste) {
      console.warn(
        `[ROAC Push] No se encontró la avería #${averiaId} al abrir la notificación.`,
      );
      return;
    }

    setAveriaSeleccionadaId(averiaId);
    setVista("detalle-averia");
    limpiarParametrosPush();
  });
  useEffect(() => {
    if (!usuarioId || !rol || !datosOperacionalesListos) return;
    const parametros = new URLSearchParams(window.location.search);
    const esEmergencia = parametros.has("emergencia");
    const id = Number(parametros.get(esEmergencia ? "emergencia" : "averia"));
    if (!Number.isInteger(id) || id <= 0) return;
    let activo = true;
    // Confirmar que el evento sigue siendo accesible antes de abrir un enlace push antiguo.
    void supabase.from(esEmergencia ? "emergencias_mina" : "averias")
      .select("id").eq("id", id).maybeSingle()
      .then(({ data, error }) => {
        if (!activo) return;
        if (error || !data) {
          console.warn("No se pudo verificar el evento de la notificación:", error);
          return;
        }
        alAbrirNotificacion();
      });
    return () => { activo = false; };
  }, [usuarioId, rol, datosOperacionalesListos, emergencias, averias]);

  const alReconocerEstadoEmergencia = useEffectEvent((id: number) => iniciarSirenaEmergencia(id));
  const alCambiarTurno = useEffectEvent((turno: TurnoActual) => guardarStatusTurno(turno));
  const alRecibirNuevaAveria = useEffectEvent((registro: Parameters<typeof manejarNuevaAveriaRealtime>[0]) => manejarNuevaAveriaRealtime(registro));
  const alRecibirEquipoOperativo = useEffectEvent((registro: Parameters<typeof manejarEquipoOperativoRealtime>[0]) => manejarEquipoOperativoRealtime(registro));
  const alRecuperarDatos = useEffectEvent((motivo: string) => sincronizarDatosOperacionales(motivo));

  useEffect(() => {
    if (!usuarioId) {
      detenerSirenaEmergencia();
      return;
    }

    if (!emergenciaActiva) {
      detenerSirenaEmergencia();
      return;
    }

    let cancelado = false;
    const deviceId = obtenerDeviceIdPersistente();

    void (async () => {
      const { data, error } = await supabase
        .from("emergencias_reconocimientos")
        .select("id")
        .eq("emergencia_id", emergenciaActiva.id)
        .eq("device_id", deviceId)
        .maybeSingle();

      if (cancelado) return;

      if (error) {
        console.error("No se pudo comprobar reconocimiento de emergencia:", error);
      }

      if (!data) {
        setAlertaEmergencia(emergenciaActiva);
        alReconocerEstadoEmergencia(emergenciaActiva.id);
      } else {
        detenerSirenaEmergencia();
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [usuarioId, emergenciaActiva]);

  useEffect(() => {
    const turnoAnterior = turnoAnteriorRef.current;

    if (turnoAnterior.claveTurno === turnoActual.claveTurno) {
      return;
    }

    turnoAnteriorRef.current = turnoActual;

    if (!datosOperacionalesListos || rol !== "operaciones") {
      return;
    }

    void alCambiarTurno(turnoAnterior);
  }, [turnoActual, datosOperacionalesListos, rol]);

  useEffect(() => {
    if (!usuarioId || !rol) {
      return;
    }

    const canalBackup = supabase
      .channel("roac-backup-broadcast")
      .on(
        "broadcast",
        {
          event: "backup_changed",
        },
        (payload) => {
          console.log("[ROAC Broadcast] backup_changed:", payload);

          const nuevoBackup =
            typeof payload.payload?.numeroMina === "string"
              ? payload.payload.numeroMina
              : null;

          setNumeroBackup(nuevoBackup);
          void cargarEquipos();
        },
      )
      .subscribe((status) => {
        console.log("[ROAC Broadcast] estado backup:", status);
      });

    canalBackupBroadcastRef.current = canalBackup;

    return () => {
      canalBackupBroadcastRef.current = null;
      void supabase.removeChannel(canalBackup);
    };
  }, [usuarioId, rol]);


  useEffect(() => {
    if (!usuarioId || !rol) {
      return;
    }

    const canalAverias = supabase
      .channel("roac-averias-broadcast", {
        config: {
          broadcast: {
            self: false,
          },
        },
      })
      .on(
        "broadcast",
        {
          event: "averia_changed",
        },
        (mensaje) => {
          const payload = mensaje.payload as {
            accion?: "NUEVA_AVERIA" | "TOMAR_AVERIA" | "EQUIPO_OPERATIVO";
            averiaId?: number;
            equipoId?: number;
            sistema?: string;
            informadoPor?: string;
            trabajoRealizado?: string;
          };

          console.log("[ROAC Broadcast] averia_changed:", payload);

          // Los datos cambian de inmediato en los demás dispositivos.
          void cargarAverias();
          void cargarEquipos();

          if (
            payload.accion === "NUEVA_AVERIA" &&
            payload.averiaId &&
            payload.equipoId
          ) {
            void alRecibirNuevaAveria({
              id: payload.averiaId,
              equipo_id: payload.equipoId,
              sistema: payload.sistema,
              informado_por: payload.informadoPor,
            });
          }

          if (payload.accion === "TOMAR_AVERIA") {
            // El cambio a "En atención" debe reflejarse al instante
            // en todos los demás dispositivos.
            void cargarAverias();
            void cargarEquipos();
          }

          if (
            payload.accion === "EQUIPO_OPERATIVO" &&
            payload.averiaId &&
            payload.equipoId
          ) {
            void alRecibirEquipoOperativo({
              id: payload.averiaId,
              equipo_id: payload.equipoId,
              trabajo_realizado: payload.trabajoRealizado,
            });
          }
        },
      )
      .subscribe((status) => {
        console.log("[ROAC Broadcast] estado averías:", status);
      });

    canalAveriasBroadcastRef.current = canalAverias;

    return () => {
      canalAveriasBroadcastRef.current = null;
      void supabase.removeChannel(canalAverias);
    };
  }, [usuarioId, rol]);


  useEffect(() => {
    if (!usuarioId || !rol) {
      estadoRealtimeRef.current = "CERRADO";
      return;
    }

    let desmontado = false;
    let canalActual: ReturnType<typeof supabase.channel> | null = null;
    let timerReconexion: number | null = null;
    let intentoReconexion = 0;

    const limpiarTimerReconexion = () => {
      if (timerReconexion !== null) {
        window.clearTimeout(timerReconexion);
        timerReconexion = null;
      }
    };

    const retirarCanalActual = async () => {
      if (!canalActual) {
        return;
      }

      const canalAnterior = canalActual;
      canalActual = null;

      try {
        await supabase.removeChannel(canalAnterior);
      } catch (error) {
        console.warn("[ROAC Realtime] Error retirando canal anterior:", error);
      }
    };

    const programarReconexion = (motivo: string) => {
      if (
        desmontado ||
        !navigator.onLine ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      limpiarTimerReconexion();

      const espera = Math.min(15_000, 2_000 * 2 ** intentoReconexion);
      intentoReconexion += 1;

      console.warn(
        `[ROAC Realtime] Reconexión programada en ${espera} ms (${motivo}).`,
      );

      timerReconexion = window.setTimeout(() => {
        void crearCanalRealtime(`reconexion:${motivo}`);
      }, espera);
    };

    const crearCanalRealtime = async (motivo: string) => {
      if (desmontado || !navigator.onLine) {
        return;
      }

      limpiarTimerReconexion();
      await retirarCanalActual();

      if (desmontado) {
        return;
      }

      estadoRealtimeRef.current = "CONECTANDO";
      setEstadoRealtime("CONECTANDO");

      const canal = supabase
        .channel(`roac-operations-realtime-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "averias",
          },
          (payload) => {
            console.log("[ROAC Realtime] averias:", payload);

            // Actualización inmediata de datos.
            void cargarAverias();

            // Se conserva EXACTAMENTE la alerta visual + sonido
            // de nueva avería para los demás dispositivos.
            if (payload.eventType === "INSERT") {
              void alRecibirNuevaAveria(
                payload.new as {
                  id?: number;
                  equipo_id?: number;
                  sistema?: string;
                  informado_por?: string;
                },
              );
            }

            // Se conserva EXACTAMENTE la confirmación visual + sonido
            // cuando la avería queda cerrada / equipo operativo.
            if (
              payload.eventType === "UPDATE" &&
              (payload.new as { estado_averia?: string }).estado_averia ===
                "Cerrada"
            ) {
              void alRecibirEquipoOperativo(
                payload.new as {
                  id?: number;
                  equipo_id?: number;
                  trabajo_realizado?: string;
                },
              );
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "equipos",
          },
          (payload) => {
            console.log("[ROAC Realtime] equipos:", payload);
            void cargarEquipos();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "mantenimientos",
          },
          (payload) => {
            console.log("[ROAC Realtime] mantenimientos:", payload);
            void cargarMantenimientos();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "emergencias_mina",
          },
          (payload) => {
            console.log("[ROAC Realtime] emergencias_mina:", payload);
            void cargarEmergencias();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "intervenciones_averia",
          },
          (payload) => {
            console.log("[ROAC Realtime] intervenciones_averia:", payload);
            void cargarIntervenciones();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "configuracion",
          },
          (payload) => {
            console.log("[ROAC Realtime] configuracion:", payload);
            void cargarBackup();
          },
        )
        .subscribe((status, error) => {
          if (desmontado) {
            return;
          }

          console.log(
            `[ROAC Realtime] estado (${motivo}):`,
            status,
            error ?? "",
          );

          estadoRealtimeRef.current = status;

          if (status === "SUBSCRIBED") {
            setEstadoRealtime("CONECTADO");
            intentoReconexion = 0;
            limpiarTimerReconexion();

            // Al recuperar conexión, reconciliamos por si se perdió
            // algún evento mientras el socket estaba fuera.
            void alRecuperarDatos("realtime-conectado");
            return;
          }

          if (status === "CHANNEL_ERROR") {
            setEstadoRealtime("ERROR");
            programarReconexion("CHANNEL_ERROR");
            return;
          }

          if (status === "TIMED_OUT") {
            setEstadoRealtime("TIMEOUT");
            programarReconexion("TIMED_OUT");
            return;
          }

          if (status === "CLOSED") {
            setEstadoRealtime("CERRADO");
            programarReconexion("CLOSED");
            return;
          }

          setEstadoRealtime(status);
        });

      canalActual = canal;
    };

    const recuperar = (motivo: string) => {
      if (desmontado || !navigator.onLine) {
        return;
      }

      // Siempre recuperamos el estado verdadero de Supabase.
      void alRecuperarDatos(motivo);

      // Y si el socket no está suscrito, lo reconstruimos.
      if (estadoRealtimeRef.current !== "SUBSCRIBED") {
        void crearCanalRealtime(motivo);
      }
    };

    const alVolverInternet = () => {
      recuperar("online");
    };

    const alPerderInternet = () => {
      limpiarTimerReconexion();
      estadoRealtimeRef.current = "SIN_RED";
      setEstadoRealtime("SIN RED");
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        recuperar("visible");
      }
    };

    const alRecuperarFoco = () => {
      recuperar("focus");
    };

    /*
      Realtime sigue siendo la vía PRINCIPAL e INSTANTÁNEA.
      Este intervalo es solo un respaldo para impedir que un PC/teléfono
      quede mostrando datos antiguos si el navegador pierde silenciosamente
      un evento WebSocket.
    */
    const respaldo = window.setInterval(() => {
      if (
        !desmontado &&
        navigator.onLine &&
        document.visibilityState === "visible"
      ) {
        void alRecuperarDatos("respaldo-10s");

        if (estadoRealtimeRef.current !== "SUBSCRIBED") {
          void crearCanalRealtime("respaldo-10s");
        }
      }
    }, 10_000);

    window.addEventListener("online", alVolverInternet);
    window.addEventListener("offline", alPerderInternet);
    window.addEventListener("focus", alRecuperarFoco);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    void crearCanalRealtime("inicio");

    return () => {
      desmontado = true;
      limpiarTimerReconexion();
      window.clearInterval(respaldo);

      window.removeEventListener("online", alVolverInternet);
      window.removeEventListener("offline", alPerderInternet);
      window.removeEventListener("focus", alRecuperarFoco);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);

      if (canalActual) {
        void supabase.removeChannel(canalActual);
        canalActual = null;
      }
    };
  }, [usuarioId, rol]);

  const averiasAbiertas = averias.filter(
    (averia) => averia.estadoAveria !== "Cerrada",
  );

const averiasDelTurno = averias.filter(
  (averia) =>
    fechaDentroDelTurno(
      averia.fechaAviso,
      turnoActual,
    ),
);

const averiasHeredadas = averias.filter((averia) => {
  if (!averia.fechaAviso) {
    return false;
  }

  const fechaAviso = new Date(averia.fechaAviso);
  const { inicio } = obtenerIntervaloTurno(turnoActual);

  const estabaAbiertaAlInicio =
    !averia.fechaCierre ||
    new Date(averia.fechaCierre) >= inicio;

  return (
    fechaAviso < inicio &&
    estabaAbiertaAlInicio
  );
});

const averiasCerradasEnTurno = averias.filter(
  (averia) =>
    Boolean(averia.fechaCierre) &&
    fechaDentroDelTurno(
      averia.fechaCierre,
      turnoActual,
    ),
);

  const mantenimientosEnCurso = mantenimientos.filter(
    (mantenimiento) => mantenimiento.estado === "En curso",
  );

  const mantenimientosDelTurno = mantenimientos.filter(
    (mantenimiento) =>
      fechaDentroDelTurno(
        mantenimiento.fechaInicio,
        turnoActual,
      ),
  );

  const mantenimientosHeredados = mantenimientos.filter((mantenimiento) => {
    if (!mantenimiento.fechaInicio) {
      return false;
    }

    const fechaInicio = new Date(mantenimiento.fechaInicio);
    const { inicio } = obtenerIntervaloTurno(turnoActual);

    const estabaActivoAlInicio =
      !mantenimiento.fechaFin ||
      new Date(mantenimiento.fechaFin) >= inicio;

    return fechaInicio < inicio && estabaActivoAlInicio;
  });

  const mantenimientosFinalizadosEnTurno = mantenimientos.filter(
    (mantenimiento) =>
      Boolean(mantenimiento.fechaFin) &&
      fechaDentroDelTurno(
        mantenimiento.fechaFin,
        turnoActual,
      ),
  );

  const mantenimientoSeleccionado = mantenimientos.find(
    (mantenimiento) => mantenimiento.id === mantenimientoSeleccionadoId,
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

  const equiposEnMantenimiento = equipos.filter(
    (equipo) => equipo.estado === "Mantenimiento programado",
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

  const historialTurnosCerrados = historialTurnos.filter(
    (status) => status.claveTurno !== turnoActual.claveTurno,
  );

  const historialTurnosRecientes = historialTurnosCerrados.slice(0, 10);
  const historialTurnosArchivados = historialTurnosCerrados.slice(10);

  const historialTurnosPorMes = historialTurnosArchivados.reduce(
    (grupos, status) => {
      const partes = obtenerPartesChile(new Date(status.fechaInicio));
      const claveMes = `${partes.year}-${String(partes.month).padStart(2, "0")}`;

      if (!grupos[claveMes]) {
        grupos[claveMes] = [];
      }

      grupos[claveMes].push(status);
      return grupos;
    },
    {} as Record<string, StatusTurnoGuardado[]>,
  );

  const mesesHistorial = Object.entries(historialTurnosPorMes).map(
    ([claveMes, turnos]) => {
      const fechaReferencia = new Date(turnos[0].fechaInicio);
      const etiquetaMes = new Intl.DateTimeFormat("es-CL", {
        timeZone: ZONA_HORARIA_OPERACIONAL,
        month: "long",
        year: "numeric",
      }).format(fechaReferencia);

      return {
        claveMes,
        etiquetaMes:
          etiquetaMes.charAt(0).toUpperCase() + etiquetaMes.slice(1),
        turnos,
      };
    },
  );


  function generarInformeTurnoActual() {
    const averiasUnicas = Array.from(
      new Map(
        [...averiasHeredadas, ...averiasDelTurno].map((averia) => [
          averia.id,
          averia,
        ]),
      ).values(),
    );

    const mantenimientosUnicos = Array.from(
      new Map(
        [...mantenimientosHeredados, ...mantenimientosDelTurno].map(
          (mantenimiento) => [mantenimiento.id, mantenimiento],
        ),
      ).values(),
    );

    const idsAverias = new Set(averiasUnicas.map((averia) => averia.id));

    setInformeTurno({
      generadoEn: new Date().toISOString(),
      turno: { ...turnoActual },
      resumen: {
        caexOperativosEnMina,
        numeroBackup,
        equiposOperativos,
        equiposEnAtencion,
        equiposFueraServicio,
        mantenimientosEnCurso: mantenimientosEnCurso.length,
        averiasIniciadas: averiasDelTurno.length,
        averiasHeredadas: averiasHeredadas.length,
        averiasCerradas: averiasCerradasEnTurno.length,
        mantenimientosIniciados: mantenimientosDelTurno.length,
        mantenimientosHeredados: mantenimientosHeredados.length,
        mantenimientosFinalizados: mantenimientosFinalizadosEnTurno.length,
      },
      averias: averiasUnicas.map((averia) => ({
        ...averia,
        equipo: { ...averia.equipo },
      })),
      mantenimientos: mantenimientosUnicos.map((mantenimiento) => ({
        ...mantenimiento,
        equipo: { ...mantenimiento.equipo },
      })),
      intervenciones: intervenciones
        .filter((intervencion) => idsAverias.has(intervencion.averiaId))
        .map((intervencion) => ({ ...intervencion })),
    });

    setVista("informe-turno");
  }

  async function descargarInformePdf() {
    if (!informeTurno || generandoPdfRef.current) return;
    generandoPdfRef.current = true;
    setGenerandoPdf(true);
    try {
    const { jsPDF } = await import("jspdf");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const x = 15;
    const ancho = 180;
    const limite = 282;
    let y = 16;

    const asegurarEspacio = (alto = 12) => {
      if (y + alto > limite) {
        pdf.addPage();
        y = 16;
      }
    };

    const escribir = (texto: string, negrita = false, tamano = 9) => {
      pdf.setFont("helvetica", negrita ? "bold" : "normal");
      pdf.setFontSize(tamano);
      const lineas = pdf.splitTextToSize(texto, ancho);
      asegurarEspacio(lineas.length * 4.5 + 3);
      pdf.text(lineas, x, y);
      y += lineas.length * 4.5 + 1.5;
    };

    const seccion = (texto: string) => {
      asegurarEspacio(14);
      y += 3;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(texto.toUpperCase(), x, y);
      y += 3;
      pdf.setDrawColor(40, 76, 120);
      pdf.line(x, y, x + ancho, y);
      y += 6;
    };

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("ROAC OPERATIONS · EPSA", x, y);
    y += 6;
    pdf.setFontSize(16);
    pdf.text(
      `Informe de turno ${informeTurno.turno.tipo} · ${informeTurno.turno.bloqueTrabajo}`,
      x,
      y,
    );
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(informeTurno.turno.rangoTurno, x, y);
    y += 5;
    pdf.text(`Generado: ${formatearFechaHoraChile(informeTurno.generadoEn)}`, x, y);
    y += 7;
    pdf.setDrawColor(25, 63, 105);
    pdf.line(x, y, x + ancho, y);
    y += 6;

    seccion("Resumen operacional");
    escribir(`CAEX operativos en mina: ${informeTurno.resumen.caexOperativosEnMina}`);
    escribir(`CAEX backup: ${informeTurno.resumen.numeroBackup ?? "Sin backup"}`);
    escribir(`Equipos operativos: ${informeTurno.resumen.equiposOperativos}`);
    escribir(`Equipos en atención: ${informeTurno.resumen.equiposEnAtencion}`);
    escribir(`Fuera de servicio: ${informeTurno.resumen.equiposFueraServicio}`);
    escribir(`Mantenimiento programado: ${informeTurno.resumen.mantenimientosEnCurso}`);
    escribir(`Averías iniciadas: ${informeTurno.resumen.averiasIniciadas}`);
    escribir(`Recibidas del turno anterior: ${informeTurno.resumen.averiasHeredadas}`);
    escribir(`Cerradas durante el turno: ${informeTurno.resumen.averiasCerradas}`);

    seccion("Averías del turno");
    if (informeTurno.averias.length === 0) {
      escribir("Sin averías registradas o heredadas al momento de generar el informe.");
    } else {
      informeTurno.averias.forEach((averia, indice) => {
        asegurarEspacio(40);
        escribir(
          `${indice + 1}. ${averia.equipo.numeroMina} (${averia.equipo.numeroInterno}) · ${averia.equipo.modelo} · ${averia.sistema}`,
          true,
          10,
        );
        escribir(`Estado: ${averia.estadoAveria === "Cerrada" ? "Operativo" : averia.estadoAveria}`, true);
        escribir(`Ubicación: ${averia.ubicacion}`);
        escribir(`Detalle inicial: ${averia.detalleInicial}`);
        escribir(`Detención: ${formatearFechaHoraChile(averia.fechaAviso)}`);

        if (averia.fechaAtencion) escribir(`Atención: ${formatearFechaHoraChile(averia.fechaAtencion)}`);
        if (averia.tomadaPor) escribir(`${averia.estadoAveria === "Cerrada" ? "Técnico final" : "Técnico actual"}: ${averia.tomadaPor}`);

        if (averia.estadoAveria === "Cerrada" && averia.fechaCierre) {
          escribir(`Operativo: ${formatearFechaHoraChile(averia.fechaCierre)}`);
          escribir(`Tiempo fuera de servicio: ${formatearTiempoFueraServicio(averia.fechaAviso, averia.fechaCierre)}`, true);
        }

        if (averia.trabajoRealizado) escribir(`Trabajo realizado: ${averia.trabajoRealizado}`);

        if (averia.estadoAveria !== "Cerrada") {
          const ultimoAvance = informeTurno.intervenciones
            .filter((i) => i.averiaId === averia.id && i.tipo === "AVANCE" && i.detalle.trim() !== "")
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];

          if (ultimoAvance) escribir(`Último avance: ${ultimoAvance.detalle}`, true);
          if (averia.estadoAveria === "Publicada") escribir("Equipo fuera de servicio, pendiente de atención.", true);
          if (averia.estadoAveria === "En atención") escribir("Equipo en atención; pendiente de continuidad o cierre.", true);
        }

        y += 3;
        pdf.setDrawColor(220, 227, 235);
        pdf.line(x, y, x + ancho, y);
        y += 5;
      });
    }

    seccion("Mantenimientos programados");
    if (informeTurno.mantenimientos.length === 0) {
      escribir("Sin mantenimientos programados asociados al turno al momento de generar el informe.");
    } else {
      informeTurno.mantenimientos.forEach((m, indice) => {
        asegurarEspacio(32);
        escribir(`${indice + 1}. ${m.equipo.numeroMina} (${m.equipo.numeroInterno}) · ${m.equipo.modelo}`, true, 10);
        escribir(`Estado: ${m.estado}`);
        escribir(`Inicio: ${formatearFechaHoraChile(m.fechaInicio)}`);
        escribir(`Responsable: ${m.responsable}`);
        escribir(`Motivo: ${m.motivo}`);
        if (m.fechaFin) escribir(`Fin: ${formatearFechaHoraChile(m.fechaFin)}`);
        if (m.trabajoRealizado) escribir(`Trabajo realizado: ${m.trabajoRealizado}`);
        y += 4;
      });
    }

    const fecha = new Date(informeTurno.generadoEn)
      .toLocaleDateString("en-CA", { timeZone: "America/Santiago" })
      .replaceAll("-", "");
    const bloqueArchivo = informeTurno.turno.bloqueTrabajo.replace("/", "-");
    pdf.save(
      `ROAC-Informe-${bloqueArchivo}-${informeTurno.turno.tipo.toLowerCase()}-${fecha}.pdf`,
    );
    } catch (error) {
      console.error("No se pudo generar el PDF:", error);
      alert("No se pudo generar el PDF. Comprueba tu conexión e inténtalo nuevamente.");
    } finally {
      generandoPdfRef.current = false;
      setGenerandoPdf(false);
    }
  }

  function obtenerUltimoAvanceInforme(averiaId: number) {
    if (!informeTurno) {
      return null;
    }

    const avances = informeTurno.intervenciones
      .filter(
        (intervencion) =>
          intervencion.averiaId === averiaId &&
          intervencion.tipo === "AVANCE" &&
          intervencion.detalle.trim() !== "",
      )
      .sort(
        (a, b) =>
          new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );

    return avances[0] ?? null;
  }

  function irAInicio() {
    setEquipoSeleccionado(null);
    setEmergenciaSeleccionadaId(null);
    setEquipoHistorialSeleccionado(null);
    setAveriaSeleccionadaId(null);
    setMantenimientoSeleccionadoId(null);
    setMotivoMantenimiento("");
    setResponsableMantenimiento("");
    setTrabajoMantenimiento("");
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

  function comenzarEmergencia() {
    if (!exigirPermiso()) {
      return;
    }

    if (emergenciaActiva) {
      void abrirDetalleEmergencia(emergenciaActiva.id);
      return;
    }

    setTipoEmergencia("");
    setSectorEmergencia("");
    setDescripcionEmergencia("");
    setVista("registrar-emergencia");
  }

  async function reconocerEmergencia(emergenciaId: number) {
    if (!sesion) return;

    const deviceId = obtenerDeviceIdPersistente();
    const { error } = await supabase
      .from("emergencias_reconocimientos")
      .upsert(
        {
          emergencia_id: emergenciaId,
          device_id: deviceId,
          user_id: sesion.user.id,
          reconocido_at: new Date().toISOString(),
        },
        { onConflict: "emergencia_id,device_id" },
      );

    if (error) {
      console.error("No se pudo registrar el reconocimiento de emergencia:", error);
    }
  }

  async function abrirDetalleEmergencia(emergenciaId: number) {
    detenerSirenaEmergencia();
    setAlertaEmergencia(null);
    setEmergenciaSeleccionadaId(emergenciaId);
    setVista("detalle-emergencia");
    await reconocerEmergencia(emergenciaId);
  }

  async function activarEmergenciaMina() {
    if (!exigirPermiso() || !sesion) return;

    const tipo = tipoEmergencia.trim();
    const sector = sectorEmergencia.trim();
    const descripcion = descripcionEmergencia.trim();

    if (!tipo) {
      alert("Indica el tipo de emergencia.");
      return;
    }
    if (!sector) {
      alert("Indica el sector o fase de la mina.");
      return;
    }

    const { data, error } = await supabase
      .from("emergencias_mina")
      .insert({
        tipo_emergencia: tipo,
        sector,
        descripcion,
        estado: "ACTIVA",
        creada_por: sesion.user.id,
      })
      .select(
        "id, tipo_emergencia, sector, descripcion, estado, fecha_inicio, fecha_fin, creada_por, finalizada_por",
      )
      .single();

    if (error || !data) {
      console.error("No se pudo activar la emergencia:", error);
      if (error?.code === "23505") {
        alert("Ya existe una emergencia de mina activa.");
        await cargarEmergencias();
      } else {
        alert("No se pudo activar la emergencia de mina.");
      }
      return;
    }

    await reconocerEmergencia(data.id);
    detenerSirenaEmergencia();
    void enviarPushEmergencia(data.id);
    await cargarEmergencias();
    setEmergenciaSeleccionadaId(data.id);
    setVista("detalle-emergencia");
  }

  async function finalizarEmergenciaMina(emergenciaId: number) {
    if (!exigirPermiso() || !sesion) return;

    const confirmar = window.confirm(
      "¿Confirmas que la emergencia de mina terminó? Se registrará la hora de término.",
    );
    if (!confirmar) return;

    const { error } = await supabase
      .from("emergencias_mina")
      .update({
        estado: "FINALIZADA",
        fecha_fin: new Date().toISOString(),
        finalizada_por: sesion.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emergenciaId)
      .eq("estado", "ACTIVA");

    if (error) {
      console.error("No se pudo finalizar la emergencia:", error);
      alert("No se pudo finalizar la emergencia de mina.");
      return;
    }

    detenerSirenaEmergencia();
    setAlertaEmergencia(null);
    await cargarEmergencias();
  }

  function comenzarMantenimiento() {
    if (!exigirPermiso()) {
      return;
    }

    setEquipoSeleccionado(null);
    setMotivoMantenimiento("");
    setResponsableMantenimiento("");
    setVista("seleccionar-equipo-mantenimiento");
  }

  function cancelarMantenimiento() {
    setEquipoSeleccionado(null);
    setMantenimientoSeleccionadoId(null);
    setMotivoMantenimiento("");
    setResponsableMantenimiento("");
    setTrabajoMantenimiento("");
    setVista("inicio");
  }

  function obtenerMantenimientoActivo(numeroMina: string) {
    return mantenimientosEnCurso.find(
      (mantenimiento) => mantenimiento.equipo.numeroMina === numeroMina,
    );
  }

  function seleccionarEquipoParaMantenimiento(equipo: Equipo) {
    const averiaAbierta = obtenerAveriaAbierta(equipo.numeroMina);
    const mantenimientoActivo = obtenerMantenimientoActivo(equipo.numeroMina);

    if (averiaAbierta) {
      alert(`El equipo ${equipo.numeroMina} tiene una avería abierta y no puede iniciar mantenimiento programado.`);
      return;
    }

    if (mantenimientoActivo) {
      alert(`El equipo ${equipo.numeroMina} ya tiene un mantenimiento programado en curso.`);
      return;
    }

    if (equipo.estado !== "Operativo") {
      alert(`El equipo ${equipo.numeroMina} no está disponible para iniciar mantenimiento programado. Estado actual: ${equipo.estado}.`);
      return;
    }

    setEquipoSeleccionado(equipo);
  }

  function continuarConMantenimiento() {
    if (equipoSeleccionado) {
      setVista("registrar-mantenimiento");
    }
  }

  async function iniciarMantenimientoProgramado() {
    if (!exigirPermiso() || !equipoSeleccionado) {
      return;
    }

    const motivo = motivoMantenimiento.trim();
    const responsable = responsableMantenimiento.trim();

    if (!motivo) {
      alert("Ingresa el motivo del mantenimiento programado.");
      return;
    }

    if (!responsable) {
      alert("Ingresa el nombre del responsable del mantenimiento.");
      return;
    }

    if (obtenerAveriaAbierta(equipoSeleccionado.numeroMina)) {
      alert(`El equipo ${equipoSeleccionado.numeroMina} tiene una avería abierta.`);
      return;
    }

    if (obtenerMantenimientoActivo(equipoSeleccionado.numeroMina)) {
      alert(`El equipo ${equipoSeleccionado.numeroMina} ya tiene un mantenimiento programado en curso.`);
      return;
    }

    try {
      const { data: mantenimientoId, error } = await supabase.rpc(
        "roac_iniciar_mantenimiento",
        { p_numero_mina: equipoSeleccionado.numeroMina, p_motivo: motivo, p_responsable: responsable },
      );
      if (error || !mantenimientoId) {
        console.error(error);
        alert("No se pudo confirmar el mantenimiento. Actualiza los datos antes de reintentar.");
        await Promise.all([cargarMantenimientos(), cargarEquipos(), cargarBackup()]);
        return;
      }

      if (numeroBackup === equipoSeleccionado.numeroMina) {
        setNumeroBackup(null);

        if (canalBackupBroadcastRef.current) {
          void canalBackupBroadcastRef.current.send({
            type: "broadcast",
            event: "backup_changed",
            payload: {
              numeroMina: null,
            },
          }).catch((error) => console.warn("No se pudo emitir el aviso Realtime:", error));
        }

        alert(`El CAEX ${equipoSeleccionado.numeroMina} era el backup y entró a mantenimiento programado. Actualmente no hay backup asignado.`);
      }

      await Promise.all([
        cargarMantenimientos(),
        cargarEquipos(),
        cargarBackup(),
      ]);

      setEquipoSeleccionado(null);
      setMotivoMantenimiento("");
      setResponsableMantenimiento("");
      setVista("inicio");
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error inesperado al iniciar el mantenimiento.");
    }
  }

  function abrirDetalleMantenimiento(id: number) {
    setMantenimientoSeleccionadoId(id);
    setTrabajoMantenimiento("");
    setVista("detalle-mantenimiento");
  }

  async function finalizarMantenimientoProgramado() {
    if (!exigirPermiso() || !mantenimientoSeleccionado) {
      return;
    }

    const trabajo = trabajoMantenimiento.trim();

    if (!trabajo) {
      alert("Ingresa el trabajo realizado durante el mantenimiento.");
      return;
    }

    try {
      const { data: equipoId, error } = await supabase.rpc(
        "roac_finalizar_mantenimiento",
        { p_mantenimiento_id: mantenimientoSeleccionado.id, p_trabajo: trabajo },
      );
      if (error || !equipoId) {
        console.error(error);
        alert("No se pudo confirmar el cierre del mantenimiento. Actualiza los datos antes de reintentar.");
        await Promise.all([cargarMantenimientos(), cargarEquipos()]);
        return;
      }

      await Promise.all([
        cargarMantenimientos(),
        cargarEquipos(),
      ]);

      setMantenimientoSeleccionadoId(null);
      setTrabajoMantenimiento("");
      setVista("inicio");
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error al finalizar el mantenimiento.");
    }
  }

  function abrirHistorial() {
    setEquipoHistorialSeleccionado(null);
    setAveriaSeleccionadaId(null);
    setVista("historial");
  }

  function seleccionarEquipoHistorial(equipo: Equipo) {
    setEquipoHistorialSeleccionado(equipo);
    setAveriaSeleccionadaId(null);
    setVista("historial-equipo");
  }

  function abrirDetalleAveriaHistorial(id: number) {
    setAveriaSeleccionadaId(id);
    setVista("detalle-averia-historial");
  }

  function volverDesdeDetalleHistorial() {
    setAveriaSeleccionadaId(null);
    setVista("historial-equipo");
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
    const mantenimientoActivo = obtenerMantenimientoActivo(equipo.numeroMina);

    if (mantenimientoActivo || equipo.estado === "Mantenimiento programado") {
      alert(`El equipo ${equipo.numeroMina} está en mantenimiento programado y no puede recibir una nueva avería desde este flujo.`);
      return;
    }

    if (equipo.estado !== "Operativo" && !averiaAbierta) {
      alert(`El equipo ${equipo.numeroMina} no está disponible para publicar una nueva avería. Estado actual: ${equipo.estado}.`);
      return;
    }

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

    // Marcamos temporalmente esta publicación como local para que
    // este mismo dispositivo no se alerte a sí mismo por Realtime.
    averiaLocalPendienteRef.current = {
      equipoId: equipoDb.id,
      sistema: datos.sistema,
      vence: Date.now() + 15_000,
    };

    const { data: averiaId, error: errorAveria } = await supabase.rpc(
      "roac_publicar_averia",
      { p_equipo_id: equipoDb.id, p_sistema: datos.sistema, p_ubicacion: datos.ubicacion,
        p_detalle: datos.detalleInicial, p_informado_por: datos.informadoPor },
    );
    const averiaDb = averiaId ? { id: averiaId } : null;

    if (errorAveria || !averiaDb) {
      averiaLocalPendienteRef.current = null;
      console.error(errorAveria);

      if (errorAveria?.code === "23505") {
        alert(
          `El equipo ${equipoSeleccionado.numeroMina} ya tiene una avería abierta.`,
        );
      } else {
        alert("No se pudo confirmar la avería. Actualiza los datos antes de reintentar.");
      }

      return;
    }

    // El registro de la avería YA terminó correctamente.
    // Desde aquí el Push se ejecuta en segundo plano y nunca bloquea ROAC.
    void enviarPushOperacional("NUEVA_AVERIA", averiaDb.id);

    // Aviso Realtime dedicado: actualización + alerta visual/sonora inmediata
    // en los demás dispositivos, sin esperar la reconciliación de seguridad.
    if (canalAveriasBroadcastRef.current) {
      void canalAveriasBroadcastRef.current.send({
        type: "broadcast",
        event: "averia_changed",
        payload: {
          accion: "NUEVA_AVERIA",
          averiaId: averiaDb.id,
          equipoId: equipoDb.id,
          sistema: datos.sistema,
          informadoPor: datos.informadoPor,
        },
      }).catch((error) => console.warn("No se pudo emitir el aviso Realtime:", error));
    }

    // 4. Si el equipo era backup, eliminar la asignación
    if (numeroBackup === equipoSeleccionado.numeroMina) {
      setNumeroBackup(null);

      if (canalBackupBroadcastRef.current) {
        void canalBackupBroadcastRef.current.send({
          type: "broadcast",
          event: "backup_changed",
          payload: {
            numeroMina: null,
          },
        }).catch((error) => console.warn("No se pudo emitir el aviso Realtime:", error));
      }

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

    // Este dispositivo ignora su propio INSERT en Realtime para no duplicar la
    // alerta de nueva avería, por eso evaluamos aquí el patrón recién creado.
    void evaluarPatronesTecnicosAveria(
      equipoDb.id,
      equipoSeleccionado.numeroMina,
      averiaDb.id,
      true,
    );

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
  async function validarPinModificarAveria(pin: string) {
    const { data, error } = await supabase.rpc(
      "validar_pin_modificar_averia",
      {
        pin_ingresado: pin,
      },
    );

    if (error) {
      console.error(
        "Error al validar PIN de modificación:",
        error,
      );
      throw new Error("No se pudo validar el PIN.");
    }

    return data === true;
  }

  async function modificarAveriaConPin(datos: {
    pin: string;
    sistema: SistemaAveria;
    ubicacion: string;
    detalleInicial: string;
    informadoPor: string;
    fechaAviso: string;
    horaAviso: string;
  }) {
    if (!exigirPermiso()) {
      throw new Error("Sin permiso para modificar averías.");
    }

    if (averiaSeleccionadaId === null) {
      throw new Error("No hay una avería seleccionada.");
    }

    const [year, mes, dia] = datos.fechaAviso.split("-");
    const fechaChile = crearFechaChile(
      `${dia}/${mes}/${year}`,
      datos.horaAviso,
    );

    if (Number.isNaN(fechaChile.getTime())) {
      throw new Error("Fecha u hora de aviso inválida.");
    }

    const { error } = await supabase.rpc(
      "modificar_averia_con_pin",
      {
        p_averia_id: averiaSeleccionadaId,
        p_pin: datos.pin,
        p_sistema: datos.sistema,
        p_ubicacion: datos.ubicacion,
        p_detalle_inicial: datos.detalleInicial,
        p_informado_por: datos.informadoPor,
        p_fecha_aviso: fechaChile.toISOString(),
      },
    );

    if (error) {
      console.error("Error al modificar avería:", error);
      throw error;
    }

    // La modificación YA quedó confirmada por Supabase.
    // Actualizamos la avería seleccionada inmediatamente para no bloquear
    // la interfaz esperando una recarga completa (en iOS/PWA esa consulta
    // puede quedar pendiente aunque el UPDATE ya se haya ejecutado).
    const fechaAvisoActualizada = fechaChile.toISOString();

    setAverias((anteriores) =>
      anteriores.map((averia) =>
        averia.id === averiaSeleccionadaId
          ? {
              ...averia,
              sistema: datos.sistema,
              ubicacion: datos.ubicacion,
              detalleInicial: datos.detalleInicial,
              informadoPor: datos.informadoPor,
              fechaAviso: fechaAvisoActualizada,
              horaAviso: datos.horaAviso,
            }
          : averia,
      ),
    );

    // Reconciliación de respaldo: mantiene la fuente de verdad en Supabase,
    // pero nunca impide que el usuario termine la operación.
    void cargarAverias();
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
    const { data: fechaAtencion, error } = await supabase.rpc(
      "roac_registrar_intervencion",
      { p_averia_id: averiaSeleccionadaId, p_tipo: "TOMA", p_tecnico: responsable,
        p_clave_turno: turnoActual.claveTurno },
    );
    if (error || !fechaAtencion) {
      console.error(error);
      alert("No se pudo tomar la avería. Puede haber sido tomada o cerrada por otro técnico. Actualiza los datos antes de reintentar.");
      await Promise.all([cargarAverias(), cargarEquipos(), cargarIntervenciones()]);
      return;
    }
    void cargarIntervenciones();

    // Broadcast dedicado para que "Tomar avería" sea instantáneo
    // y no dependa de la sincronización de seguridad.
    if (canalAveriasBroadcastRef.current) {
      void canalAveriasBroadcastRef.current.send({
        type: "broadcast",
        event: "averia_changed",
        payload: {
          accion: "TOMAR_AVERIA",
          averiaId: averiaSeleccionadaId,
        },
      }).catch((error) => console.warn("No se pudo emitir el aviso Realtime:", error));
    }

    const horaAtencion = new Date(fechaAtencion).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false });

    setAverias((anteriores) =>
      anteriores.map((averia) =>
        averia.id === averiaSeleccionadaId
          ? {
              ...averia,
              estadoAveria: "En atención",
              estadoEquipo: "En atención",
              tomadaPor: responsable,
              fechaAtencion,
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
  async function registrarAvanceAveria(
    tecnico: string,
    detalle: string,
  ) {
    if (!exigirPermiso() || averiaSeleccionadaId === null) {
      return;
    }

    const texto = detalle.trim();
    const nombreTecnico = tecnico.trim();

    if (!nombreTecnico) {
      alert("No hay un técnico activo asignado a esta avería.");
      return;
    }

    if (!texto) {
      alert("Escribe el avance realizado.");
      return;
    }

    const { error } = await supabase.rpc("roac_registrar_intervencion", {
      p_averia_id: averiaSeleccionadaId, p_tipo: "AVANCE", p_tecnico: nombreTecnico,
      p_clave_turno: turnoActual.claveTurno, p_detalle: texto,
    });

    if (error) {
      console.error("No se pudo registrar el avance:", error);
      alert("No se pudo guardar el avance de la avería.");
      return;
    }

    await cargarIntervenciones();
  }

  async function tomarContinuidadAveria(nuevoTecnico: string) {
    if (!exigirPermiso() || averiaSeleccionadaId === null) {
      return;
    }

    const tecnico = nuevoTecnico.trim();

    if (!tecnico) {
      alert("Indica el técnico que continuará la atención.");
      return;
    }

    const averiaActual = averias.find(
      (averia) => averia.id === averiaSeleccionadaId,
    );

    if (!averiaActual || averiaActual.estadoAveria !== "En atención") {
      alert("Esta avería no está disponible para tomar continuidad.");
      return;
    }

    const { data: fecha, error } = await supabase.rpc("roac_registrar_intervencion", {
      p_averia_id: averiaSeleccionadaId, p_tipo: "CONTINUIDAD", p_tecnico: tecnico,
      p_clave_turno: turnoActual.claveTurno, p_tecnico_anterior: averiaActual.tomadaPor,
    });
    if (error || !fecha) {
      console.error(error);
      alert("No se pudo confirmar la continuidad. Actualiza los datos antes de reintentar.");
      await Promise.all([cargarAverias(), cargarIntervenciones()]);
      return;
    }

    setAverias((anteriores) =>
      anteriores.map((averia) =>
        averia.id === averiaSeleccionadaId
          ? { ...averia, tomadaPor: tecnico }
          : averia,
      ),
    );

    await cargarIntervenciones();
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
    const { data: equipoIdCerrado, error: errorCierre } = await supabase.rpc(
      "roac_cerrar_averia_atomica",
      { p_averia_id: averiaSeleccionadaId, p_trabajo: trabajoRealizado },
    );
    if (errorCierre || !equipoIdCerrado) {
      console.error(errorCierre);
      alert("No se pudo confirmar el cierre. Actualiza los datos antes de reintentar; otro técnico podría haberlo cerrado.");
      await Promise.all([cargarAverias(), cargarEquipos()]);
      return;
    }

    // La reparación y el cambio a Operativo ya quedaron guardados.
    // La alerta Push se envía aparte y no puede bloquear el cierre.
    void enviarPushOperacional(
      "EQUIPO_OPERATIVO",
      averiaSeleccionadaId,
    );

    if (canalAveriasBroadcastRef.current) {
      // El cierre ya quedó confirmado en Supabase. Broadcast es una ayuda
      // de sincronización y jamás debe bloquear la interfaz local (especialmente iOS).
      void canalAveriasBroadcastRef.current
        .send({
          type: "broadcast",
          event: "averia_changed",
          payload: {
            accion: "EQUIPO_OPERATIVO",
            averiaId: averiaSeleccionadaId,
            equipoId: equipoIdCerrado,
            trabajoRealizado,
          },
        })
        .catch((error) => {
          console.error("No se pudo emitir Broadcast de equipo operativo:", error);
        });
    }

    const fechaCierre = new Date().toISOString();
    const horaCierre = new Date(fechaCierre).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hour12: false });

    setAverias((anteriores) =>
      anteriores.map((averia) =>
        averia.id === averiaSeleccionadaId
          ? {
              ...averia,
              estadoAveria: "Cerrada",
              estadoEquipo: "Operativo",
              trabajoRealizado,
              fechaCierre,
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

    // La vista responde al cierre confirmado; luego recupera la fecha del servidor.
    void Promise.all([cargarAverias(), cargarEquipos()]);

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
      const { data: confirmado, error } = await supabase.rpc(
        "roac_asignar_backup", { p_numero_mina: numeroMina },
      );
      if (error || confirmado !== true) {
        console.error(error);
        alert("No se pudo confirmar el cambio de backup. Actualiza los datos antes de reintentar.");
        await Promise.all([cargarEquipos(), cargarBackup()]);
        return;
      }

      await Promise.all([
        cargarEquipos(),
        cargarBackup(),
      ]);

      if (canalBackupBroadcastRef.current) {
        void canalBackupBroadcastRef.current.send({
          type: "broadcast",
          event: "backup_changed",
          payload: {
            numeroMina,
          },
        }).catch((error) => console.warn("No se pudo emitir el aviso Realtime:", error));
      }

      setVista("inicio");
    } catch (error) {
      console.error(error);
      alert("Ocurrió un error al asignar el backup.");
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

  if (mostrandoEntrada) {
    return (
      <main className="roac-entry-screen">
        <style>{`
          .roac-entry-screen {
            min-height: 100vh;
            box-sizing: border-box;
            display: grid;
            place-items: center;
            padding: 24px;
            position: relative;
            overflow: hidden;
            background-color: #021426;
            background-image: url("/roac-login-bg.png");
            background-size: 100% 100%;
            background-position: center center;
            background-repeat: no-repeat;
            font-family: inherit;
          }

          .roac-entry-screen::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            background:
              radial-gradient(
                circle at 50% 48%,
                rgba(22, 140, 255, 0.15),
                transparent 28%
              ),
              rgba(0, 9, 26, 0.13);
          }

          .roac-entry-content {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
          }

          .roac-entry-logo-wrap {
            width: 190px;
            height: 190px;
            display: grid;
            place-items: center;
            position: relative;
            margin-bottom: 22px;
          }

          .roac-entry-logo-wrap::before,
          .roac-entry-logo-wrap::after {
            content: "";
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
          }

          .roac-entry-logo-wrap::before {
            inset: 13px;
            border: 1px solid rgba(44, 165, 255, 0.30);
            box-shadow:
              0 0 30px rgba(32, 145, 255, 0.20),
              inset 0 0 26px rgba(32, 145, 255, 0.08);
            animation: roacHalo 1.5s ease-in-out infinite;
          }

          .roac-entry-logo-wrap::after {
            inset: 0;
            background: radial-gradient(
              circle,
              rgba(26, 139, 255, 0.15) 0%,
              rgba(26, 139, 255, 0.05) 40%,
              transparent 68%
            );
            filter: blur(7px);
            animation: roacGlow 1.5s ease-in-out infinite;
          }

          .roac-entry-logo {
            width: 138px;
            height: auto;
            position: relative;
            z-index: 2;
            transform-origin: center center;
            filter:
              drop-shadow(0 0 8px rgba(0, 129, 255, 0.32))
              drop-shadow(0 12px 25px rgba(0, 0, 0, 0.24));
            animation: roacLogoPulse 1.5s ease-in-out infinite;
          }

          .roac-entry-title {
            margin: 0;
            color: #ffffff;
            font-size: clamp(13px, 1.8vw, 17px);
            font-weight: 850;
            letter-spacing: 2.3px;
            text-transform: uppercase;
            text-shadow: 0 0 14px rgba(31, 155, 255, 0.28);
          }

          .roac-entry-dots {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            margin-top: 15px;
          }

          .roac-entry-dots span {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #28a9ff;
            box-shadow: 0 0 8px rgba(40, 169, 255, 0.75);
            animation: roacDot 1.05s ease-in-out infinite;
          }

          .roac-entry-dots span:nth-child(2) {
            animation-delay: 0.16s;
          }

          .roac-entry-dots span:nth-child(3) {
            animation-delay: 0.32s;
          }

          @keyframes roacLogoPulse {
            0%, 100% {
              transform: scale(0.96) rotate(-1deg);
              opacity: 0.88;
            }
            50% {
              transform: scale(1.04) rotate(1deg);
              opacity: 1;
            }
          }

          @keyframes roacHalo {
            0%, 100% {
              transform: scale(0.91);
              opacity: 0.34;
            }
            50% {
              transform: scale(1.06);
              opacity: 0.92;
            }
          }

          @keyframes roacGlow {
            0%, 100% {
              transform: scale(0.90);
              opacity: 0.38;
            }
            50% {
              transform: scale(1.14);
              opacity: 1;
            }
          }

          @keyframes roacDot {
            0%, 100% {
              transform: translateY(0) scale(0.82);
              opacity: 0.35;
            }
            50% {
              transform: translateY(-4px) scale(1.08);
              opacity: 1;
            }
          }

          @media (max-width: 520px) {
            .roac-entry-logo-wrap {
              width: 155px;
              height: 155px;
            }

            .roac-entry-logo {
              width: 112px;
            }

            .roac-entry-title {
              font-size: 12px;
              letter-spacing: 1.7px;
            }
          }
        `}</style>

        <section
          className="roac-entry-content"
          aria-live="polite"
          aria-label="Iniciando ROAC Operations"
        >
          <div className="roac-entry-logo-wrap">
            <img
              className="roac-entry-logo"
              src="/roac-logo.png"
              alt="ROAC"
            />
          </div>

          <p className="roac-entry-title">
            Iniciando ROAC Operations
          </p>

          <div className="roac-entry-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

  if (!sesion) {
    return (
      <main className="login-screen">
        <style>{`
          .login-screen {
            min-height: 100vh;
            box-sizing: border-box;
            display: grid;
            place-items: center;
            padding: 28px 18px;
            position: relative;
            overflow: hidden;
            font-family: inherit;
            background-color: #021426;
            background-image: url("/roac-login-bg.png");
            background-repeat: no-repeat;
            background-size: 100% 100%;
            background-position: center center;
          }

          .login-screen::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            background: rgba(0, 8, 22, 0.08);
            z-index: 0;
          }

          .login-screen::after {
            content: none;
          }

          .login-card {
            position: relative;
            z-index: 2;
            width: min(430px, 100%);
            box-sizing: border-box;
            padding: 36px 34px 30px;
            overflow: hidden;
            background: linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.995),
              rgba(250, 252, 255, 0.985)
            );
            border: 1px solid rgba(197, 213, 232, 0.80);
            border-radius: 28px;
            box-shadow:
              0 28px 75px rgba(0, 8, 24, 0.43),
              0 0 45px rgba(32, 126, 255, 0.10);
          }

          .login-card::before {
            content: "";
            position: absolute;
            top: 0;
            left: 15%;
            right: 15%;
            height: 1px;
            background: linear-gradient(
              90deg,
              transparent,
              rgba(31, 126, 255, 0.48),
              transparent
            );
          }

          .login-brand {
            text-align: center;
            margin-bottom: 25px;
          }

          .login-logo {
            display: block;
            width: 122px;
            max-width: 42%;
            height: auto;
            object-fit: contain;
            margin: 0 auto 7px;
            filter: drop-shadow(0 8px 14px rgba(19, 77, 141, 0.12));
          }

          .login-brand h1 {
            margin: 4px 0 0;
            color: #071a38;
            font-size: 29px;
            line-height: 1.12;
            font-weight: 800;
            letter-spacing: -0.7px;
          }

          .login-brand p {
            margin: 9px 0 0;
            color: #587294;
            font-size: 15px;
            font-weight: 500;
          }

          .login-divider {
            display: flex;
            align-items: center;
            margin: 24px 0 24px;
          }

          .login-divider::before,
          .login-divider::after {
            content: "";
            flex: 1;
            height: 1px;
          }

          .login-divider::before {
            background: linear-gradient(
              90deg,
              transparent,
              #b5c9df
            );
          }

          .login-divider::after {
            background: linear-gradient(
              90deg,
              #b5c9df,
              transparent
            );
          }

          .login-divider-dot {
            width: 7px;
            height: 7px;
            flex: 0 0 7px;
            margin: 0 7px;
            border-radius: 50%;
            background: #168cff;
            box-shadow: 0 0 8px rgba(22, 140, 255, 0.74);
          }

          .login-form {
            display: grid;
            gap: 17px;
          }

          .login-field {
            display: grid;
            gap: 8px;
            color: #101d36;
            font-size: 14px;
            font-weight: 800;
          }

          .login-input-wrapper {
            position: relative;
          }

          .login-input-icon {
            position: absolute;
            left: 15px;
            top: 50%;
            transform: translateY(-50%);
            width: 21px;
            height: 21px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6b8bad;
            pointer-events: none;
          }

          .login-input-icon svg {
            width: 21px;
            height: 21px;
            display: block;
          }

          .login-input {
            width: 100%;
            height: 57px;
            box-sizing: border-box;
            padding: 0 16px 0 48px;
            border: 1px solid #bed0e3;
            border-radius: 13px;
            background: rgba(255, 255, 255, 0.94);
            color: #0b172d;
            font: inherit;
            font-size: 15px;
            font-weight: 700;
            outline: none;
            transition:
              border-color 150ms ease,
              box-shadow 150ms ease,
              background 150ms ease;
          }

          .login-input::placeholder {
            color: #9aabba;
            font-weight: 500;
          }

          .login-input:focus {
            border-color: #268cff;
            background: #ffffff;
            box-shadow: 0 0 0 3px rgba(38, 140, 255, 0.12);
          }

          .login-submit {
            width: 100%;
            height: 56px;
            margin-top: 4px;
            border: 1px solid rgba(0, 102, 255, 0.55);
            border-radius: 13px;
            background: linear-gradient(
              135deg,
              #1260ef 0%,
              #176bff 50%,
              #0750e9 100%
            );
            box-shadow:
              0 9px 19px rgba(14, 92, 225, 0.23),
              inset 0 1px 0 rgba(255, 255, 255, 0.20);
            color: #ffffff;
            font: inherit;
            font-size: 16px;
            font-weight: 850;
            cursor: pointer;
            transition:
              transform 150ms ease,
              box-shadow 150ms ease,
              opacity 150ms ease;
          }

          .login-submit:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow:
              0 12px 25px rgba(14, 92, 225, 0.29),
              inset 0 1px 0 rgba(255, 255, 255, 0.20);
          }

          .login-submit:active:not(:disabled) {
            transform: translateY(0);
          }

          .login-submit:disabled {
            opacity: 0.62;
            cursor: wait;
          }

          .login-error {
            margin: -3px 0 0;
            padding: 10px 12px;
            border: 1px solid #ffd0cb;
            border-radius: 10px;
            background: #fff2f0;
            color: #b42318;
            font-size: 13px;
            font-weight: 650;
          }

          .login-footer {
            margin: 24px 0 0;
            text-align: center;
            color: #617895;
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.1px;
          }

          @media (max-width: 520px) {
            .login-screen {
              padding: 18px 14px;
            }

            .login-card {
              padding: 30px 22px 25px;
              border-radius: 24px;
            }

            .login-logo {
              width: 108px;
            }

            .login-brand h1 {
              font-size: 26px;
            }

            .login-brand p {
              font-size: 14px;
            }

            .login-input {
              height: 54px;
            }

            .login-submit {
              height: 54px;
            }
          }
        `}</style>

        <section className="login-card">
          <div className="login-brand">
            <img
              className="login-logo"
              src="/roac-logo.png"
              alt="ROAC"
            />

            <h1>ROAC Operations</h1>
            <p>Acceso al sistema operacional</p>

            <div className="login-divider" aria-hidden="true">
              <span className="login-divider-dot" />
            </div>
          </div>

          <form
            className="login-form"
            onSubmit={(evento) => {
              evento.preventDefault();
              void iniciarSesion();
            }}
          >
            <label className="login-field">
              Usuario

              <div className="login-input-wrapper">
                <span className="login-input-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4.5 21c0-4.1 3.3-7.4 7.5-7.4s7.5 3.3 7.5 7.4" />
                  </svg>
                </span>

                <input
                  className="login-input"
                  autoComplete="username"
                  value={usuarioLogin}
                  onChange={(evento) =>
                    setUsuarioLogin(evento.target.value)
                  }
                  placeholder="operaciones o consulta"
                />
              </div>
            </label>

            <label className="login-field">
              Contraseña

              <div className="login-input-wrapper">
                <span className="login-input-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <rect
                      x="5"
                      y="10"
                      width="14"
                      height="11"
                      rx="2"
                    />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>

                <input
                  className="login-input"
                  type="password"
                  autoComplete="current-password"
                  value={passwordLogin}
                  onChange={(evento) =>
                    setPasswordLogin(evento.target.value)
                  }
                  placeholder="••••••••"
                />
              </div>
            </label>

            {errorLogin && (
              <p className="login-error">{errorLogin}</p>
            )}

            <button
              type="submit"
              className="login-submit"
              disabled={iniciandoSesion}
            >
              {iniciandoSesion
                ? "Ingresando..."
                : "Iniciar sesión"}
            </button>
          </form>

          <p className="login-footer">
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
        /* ───── MANTENIMIENTO PROGRAMADO: presentación visual ───── */
        .equipment-selector .equipment-grid {
          align-items: stretch;
        }

        .equipment-selector .fault-selection-wrapper {
          position: relative;
          min-width: 0;
          display: flex;
        }

        .equipment-selector .fault-selection-wrapper > .equipment-card {
          flex: 1;
          min-height: 118px;
          border-radius: 15px;
          box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
          transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }

        .equipment-selector .fault-selection-wrapper > .equipment-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        }

        /* Reserva una franja superior para el estado sin tapar el número del equipo. */
        .equipment-selector .fault-selection-wrapper.maintenance-card-unavailable > .equipment-card {
          padding-top: 34px;
        }

        .equipment-selector .maintenance-unavailable-label {
          position: absolute;
          top: 7px;
          right: 7px;
          z-index: 5;
          max-width: calc(100% - 14px);
          padding: 4px 7px;
          border-radius: 8px;
          font-size: 0.54rem;
          line-height: 1.08;
          font-weight: 900;
          letter-spacing: 0.025em;
          text-align: center;
          box-shadow: 0 2px 5px rgba(15, 23, 42, 0.08);
          pointer-events: none;
        }

        .equipment-selector .maintenance-unavailable-fault {
          background: #fff0c7;
          color: #9a5600;
          border: 1px solid #ffd36a;
        }

        .equipment-selector .maintenance-unavailable-active {
          background: #e9e7ff;
          color: #4f46e5;
          border: 1px solid #c4b5fd;
        }

        .equipment-selector .maintenance-unavailable-state {
          background: #e2e8f0;
          color: #475569;
          border: 1px solid #cbd5e1;
        }

        .equipment-selector .equipment-programmed-maintenance {
          border-color: #8b7cf6;
          border-left-color: #6366f1;
          background: linear-gradient(180deg, #f4f3ff 0%, #eef2ff 100%);
        }

        .equipment-selector .equipment-card-selected {
          border-color: #6d5dfc;
          border-left-color: #6d5dfc;
          background: linear-gradient(180deg, #f4f3ff 0%, #eef2ff 100%);
          box-shadow: 0 0 0 2px rgba(109, 93, 252, 0.12);
        }

        .maintenance-selected {
          margin-top: 18px;
          border: 1px solid #ddd6fe;
          background: linear-gradient(180deg, #fafaff 0%, #f5f3ff 100%);
        }

        /* Resumen de equipo seleccionado para AVERÍAS:
           el panel original es oscuro, por lo que necesita texto claro. */
        .selected-equipment {
          color: #ffffff;
        }

        .selected-equipment .eyebrow {
          color: #b9d7ff;
        }

        .selected-equipment h3 {
          color: #ffffff;
        }

        .selected-equipment p,
        .selected-equipment strong {
          color: #e6f0ff;
        }

        .selected-equipment .continue-button {
          color: #ffffff;
        }

        /* MANTENIMIENTO usa un panel claro; aquí se aplica el contraste oscuro
           solo a ese caso, sin afectar el selector de averías. */
        .selected-equipment.maintenance-selected {
          color: #172033;
        }

        .selected-equipment.maintenance-selected .eyebrow {
          color: #5b6f91;
        }

        .selected-equipment.maintenance-selected h3 {
          color: #172033;
        }

        .selected-equipment.maintenance-selected p,
        .selected-equipment.maintenance-selected strong {
          color: #334155;
        }

        .maintenance-form {
          overflow: hidden;
        }

        .maintenance-form .form-header {
          margin-bottom: 20px;
          padding-bottom: 14px;
          border-bottom: 1px solid #e2e8f0;
        }

        .maintenance-form .form-header h2 {
          font-size: clamp(1.35rem, 4vw, 1.75rem);
          color: #172033;
        }

        .maintenance-form .equipment-model {
          margin-top: 4px;
          color: #64748b;
          font-size: 1rem;
          font-weight: 800;
        }

        .maintenance-form .form-group {
          margin-top: 16px;
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #f8fafc;
        }

        .maintenance-form .form-group label {
          display: block;
          margin-bottom: 9px;
          color: #172033;
          font-weight: 800;
        }

        .maintenance-form textarea,
        .maintenance-form .form-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: #ffffff;
          color: #172033;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
          transition: border-color 0.16s ease, box-shadow 0.16s ease;
        }

        .maintenance-form textarea:focus,
        .maintenance-form .form-input:focus {
          outline: none;
          border-color: #7c6df2;
          box-shadow: 0 0 0 3px rgba(124, 109, 242, 0.12);
        }

        .maintenance-form .automatic-data {
          margin-top: 18px;
          padding: 4px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        }

        .maintenance-form .automatic-data p {
          align-items: center;
          min-height: 52px;
        }

        .maintenance-form .automatic-data span {
          color: #334155;
          font-weight: 700;
        }

        .maintenance-form .automatic-data strong {
          color: #172033;
          font-weight: 900;
          text-align: right;
        }

        .maintenance-form .automatic-data p:first-child strong {
          padding: 6px 9px;
          border-radius: 999px;
          background: #e9e7ff;
          color: #4f46e5;
          font-size: 0.78rem;
        }

        .maintenance-form .start-maintenance-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          width: 100%;
          margin-top: 20px;
          padding: 15px 18px;
          border: 0;
          border-radius: 13px;
          background: linear-gradient(135deg, #6d4df4 0%, #5538e8 100%);
          color: #ffffff;
          font: inherit;
          font-size: 1rem;
          font-weight: 900;
          line-height: 1.2;
          box-shadow: 0 9px 20px rgba(85, 56, 232, 0.22);
          cursor: pointer;
          transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
        }

        .maintenance-form .start-maintenance-button::before {
          content: "▶";
          font-size: 0.82rem;
        }

        .maintenance-form .start-maintenance-button:hover {
          transform: translateY(-1px);
          filter: brightness(0.98);
          box-shadow: 0 11px 22px rgba(85, 56, 232, 0.28);
        }

        .maintenance-form .start-maintenance-button:active {
          transform: translateY(0);
        }

        .maintenance-form .secondary-button {
          width: 100%;
          margin-top: 12px;
          padding: 13px 16px;
          border: 1px solid #cbd5e1;
          border-radius: 13px;
          background: #ffffff;
          color: #263247;
          font: inherit;
          font-weight: 800;
          cursor: pointer;
        }

        @media (max-width: 560px) {
          .equipment-selector .equipment-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }

          .equipment-selector .fault-selection-wrapper > .equipment-card {
            min-height: 112px;
            padding: 12px 5px;
          }

          .equipment-selector .fault-selection-wrapper.maintenance-card-unavailable > .equipment-card {
            padding-top: 31px;
          }

          .equipment-selector .maintenance-unavailable-label {
            top: 5px;
            left: 6px;
            right: 6px;
            max-width: none;
            padding: 3px 4px;
            font-size: 0.45rem;
            white-space: normal;
          }

          .maintenance-form .form-group {
            padding: 12px;
          }

          .maintenance-form .automatic-data {
            padding: 3px 12px;
          }
        }
      `}</style>

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

        .report-screen {
          width: min(980px, 100%);
          margin: 0 auto;
          padding: 4px 0 28px;
        }

        .report-actions {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }

        .report-action-button {
          border: 0;
          border-radius: 12px;
          padding: 11px 16px;
          font: inherit;
          font-weight: 850;
          cursor: pointer;
        }

        .report-back-button {
          background: #edf2f7;
          color: #20344d;
        }

        .report-print-button {
          background: #0d6efd;
          color: #ffffff;
        }

        .report-document {
          background: #ffffff;
          border: 1px solid #d8e2ee;
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 14px 36px rgba(25, 49, 80, 0.08);
        }

        .report-title-row {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          padding-bottom: 16px;
          border-bottom: 2px solid #163d69;
        }

        .report-title-row h2 {
          margin: 3px 0 4px;
          color: #102f53;
        }

        .report-title-row p {
          margin: 3px 0;
          color: #52657b;
        }

        .report-generated {
          text-align: right;
          font-size: 12px;
          color: #617389;
        }

        .report-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 18px 0 22px;
        }

        .report-summary-item {
          padding: 12px;
          border: 1px solid #dde6f0;
          border-radius: 12px;
          background: #f8fafc;
        }

        .report-summary-item span {
          display: block;
          color: #66778b;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .45px;
        }

        .report-summary-item strong {
          display: block;
          margin-top: 5px;
          color: #173b65;
          font-size: 18px;
        }

        .report-section-title {
          margin: 22px 0 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #d9e3ee;
          color: #163d69;
          font-size: 15px;
          text-transform: uppercase;
          letter-spacing: .7px;
        }

        .report-record {
          padding: 12px 0;
          border-bottom: 1px solid #e5ebf2;
          break-inside: avoid;
        }

        .report-record:last-child {
          border-bottom: 0;
        }

        .report-record h4 {
          margin: 0 0 6px;
          color: #172f4d;
        }

        .report-record p {
          margin: 4px 0;
          color: #354a63;
          line-height: 1.4;
          font-size: 13px;
        }

        .report-record .report-emphasis {
          font-weight: 850;
          color: #0d477d;
        }

        .report-empty {
          color: #748397;
          font-style: italic;
        }

        @media print {
          body {
            background: #ffffff !important;
          }

          .app-header,
          .bottom-navigation,
          .report-actions,
          .new-fault-alert {
            display: none !important;
          }

          .app {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .report-screen {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .report-document {
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          .report-summary-grid {
            grid-template-columns: repeat(4, 1fr);
          }

          @page {
            size: A4;
            margin: 14mm;
          }
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

        .new-fault-alert {
          position: fixed;
          z-index: 1000;
          top: 18px;
          left: 50%;
          width: min(460px, calc(100% - 28px));
          transform: translateX(-50%);
          box-sizing: border-box;
          padding: 16px 16px 15px;
          border: 1px solid rgba(239, 68, 68, 0.42);
          border-left: 5px solid #ef2b2d;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 18px 48px rgba(29, 42, 63, 0.24);
          animation: newFaultAlertIn 220ms ease-out;
        }

        .new-fault-alert-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .new-fault-alert-kicker {
          margin: 0 0 3px;
          color: #d51f2a;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }

        .new-fault-alert h3 {
          margin: 0;
          color: #172238;
          font-size: 20px;
        }

        .new-fault-alert p {
          margin: 7px 0 0;
          color: #52627a;
          font-size: 14px;
          line-height: 1.4;
        }

        .new-fault-alert-close {
          flex: 0 0 auto;
          width: 34px;
          height: 34px;
          border: 0;
          border-radius: 10px;
          background: #f2f5f9;
          color: #52627a;
          font: inherit;
          font-size: 20px;
          cursor: pointer;
        }

        .new-fault-alert-action {
          width: 100%;
          margin-top: 12px;
          border: 0;
          border-radius: 11px;
          padding: 11px 14px;
          background: #e9272e;
          color: #ffffff;
          font: inherit;
          font-weight: 850;
          cursor: pointer;
        }

        .new-fault-alert.operational-alert {
          border-color: rgba(22, 163, 74, 0.38);
          border-left-color: #16a34a;
        }

        .operational-alert .new-fault-alert-kicker {
          color: #138a3d;
        }

        .operational-alert .new-fault-alert-action {
          background: #148a43;
        }

        .new-fault-alert.pattern-alert {
          border-color: rgba(217, 119, 6, 0.45);
          border-left-color: #d97706;
          max-width: 520px;
        }

        .pattern-alert .new-fault-alert-kicker {
          color: #b45309;
        }

        .pattern-alert .new-fault-alert-action {
          background: #b45309;
        }

        .pattern-alert-list {
          margin: 10px 0 0;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          font-size: 12px;
          line-height: 1.4;
        }

        .pattern-alert-list div + div {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid #fed7aa;
        }

        @keyframes newFaultAlertIn {
          from {
            opacity: 0;
            transform: translate(-50%, -12px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>

      {alertaEmergencia && (
        <aside
          role="alert"
          aria-live="assertive"
          style={{
            position: "fixed",
            left: "14px",
            right: "14px",
            top: "78px",
            zIndex: 12000,
            maxWidth: "620px",
            margin: "0 auto",
            padding: "18px",
            borderRadius: "18px",
            background: "linear-gradient(135deg, #8b0000 0%, #d11a2a 100%)",
            color: "#fff",
            boxShadow: "0 18px 45px rgba(120,0,0,.38)",
            border: "2px solid rgba(255,255,255,.5)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: ".08em" }}>
            🚨 EMERGENCIA MINA EN CURSO
          </p>
          <h3 style={{ margin: "8px 0 5px", fontSize: "22px" }}>
            {alertaEmergencia.tipoEmergencia}
          </h3>
          <p style={{ margin: "0 0 4px" }}>
            <strong>Sector:</strong> {alertaEmergencia.sector}
          </p>
          {alertaEmergencia.descripcion && (
            <p style={{ margin: "0 0 12px" }}>{alertaEmergencia.descripcion}</p>
          )}
          <button
            type="button"
            onClick={() => void abrirDetalleEmergencia(alertaEmergencia.id)}
            style={{
              width: "100%",
              border: 0,
              borderRadius: "12px",
              padding: "12px 16px",
              fontWeight: 800,
              cursor: "pointer",
              color: "#8b0000",
              background: "#fff",
            }}
          >
            Abrir emergencia y silenciar alarma
          </button>
        </aside>
      )}

      {alertaPatronTecnico && (
        <aside
          className="new-fault-alert pattern-alert"
          role="alert"
          aria-live="assertive"
        >
          <div className="new-fault-alert-top">
            <div>
              <p className="new-fault-alert-kicker">⚠ Advertencia técnica</p>
              <h3>{alertaPatronTecnico.titulo}</h3>
              <p>
                <strong>Equipo {alertaPatronTecnico.numeroMina}</strong>
                <br />
                {alertaPatronTecnico.mensaje}
              </p>

              <div className="pattern-alert-list">
                <strong>Eventos que originaron la advertencia:</strong>
                {alertaPatronTecnico.relacionados.map((registro) => (
                  <div key={registro.id}>
                    <strong>#{registro.id}</strong> · {formatearFechaHoraChile(registro.fechaAviso)}
                    <br />
                    {registro.sistema}
                    {registro.detalleInicial ? ` — ${registro.detalleInicial}` : ""}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="new-fault-alert-close"
              onClick={cerrarAlertaPatronTecnico}
              aria-label="Cerrar advertencia técnica"
            >
              ×
            </button>
          </div>

          <button
            type="button"
            className="new-fault-alert-action"
            onClick={() => {
              const equipo = equipos.find(
                (item) => item.numeroMina === alertaPatronTecnico.numeroMina,
              );
              cerrarAlertaPatronTecnico();
              if (equipo) {
                seleccionarEquipoHistorial(equipo);
              } else {
                setAveriaSeleccionadaId(alertaPatronTecnico.averiaId);
                setVista("detalle-averia");
              }
            }}
          >
            Ver historial del equipo
          </button>
        </aside>
      )}

      {alertaNuevaAveria && (
        <aside
          className="new-fault-alert"
          role="alert"
          aria-live="assertive"
        >
          <div className="new-fault-alert-top">
            <div>
              <p className="new-fault-alert-kicker">Nueva avería</p>
              <h3>Equipo {alertaNuevaAveria.numeroMina}</h3>
              <p>
                Sistema: <strong>{alertaNuevaAveria.sistema}</strong>
                <br />
                Informado por: {alertaNuevaAveria.informadoPor}
              </p>
            </div>

            <button
              type="button"
              className="new-fault-alert-close"
              onClick={cerrarAlertaNuevaAveria}
              aria-label="Cerrar alerta"
            >
              ×
            </button>
          </div>

          <button
            type="button"
            className="new-fault-alert-action"
            onClick={() => {
              const id = alertaNuevaAveria.id;
              cerrarAlertaNuevaAveria();
              setAveriaSeleccionadaId(id);
              setVista("detalle-averia");
            }}
          >
            Ver avería
          </button>
        </aside>
      )}
      {alertaEquipoOperativo && (
        <aside
          className="new-fault-alert operational-alert"
          role="status"
          aria-live="assertive"
        >
          <div className="new-fault-alert-top">
            <div>
              <p className="new-fault-alert-kicker">Equipo operativo</p>
              <h3>Equipo {alertaEquipoOperativo.numeroMina}</h3>
              <p>
                Reparación finalizada.
                <br />
                <strong>Trabajo realizado:</strong>{" "}
                {alertaEquipoOperativo.trabajoRealizado}
              </p>
            </div>

            <button
              type="button"
              className="new-fault-alert-close"
              onClick={cerrarAlertaEquipoOperativo}
              aria-label="Cerrar alerta de equipo operativo"
            >
              ×
            </button>
          </div>

          <button
            type="button"
            className="new-fault-alert-action"
            onClick={() => {
              const id = alertaEquipoOperativo.id;
              cerrarAlertaEquipoOperativo();
              setAveriaSeleccionadaId(id);
              setVista("detalle-averia");
            }}
          >
            Ver reparación
          </button>
        </aside>
      )}

      <div
        aria-live="polite"
        title="Diagnóstico temporal de Supabase Realtime"
        style={{
          position: "fixed",
          top: "8px",
          right: "8px",
          zIndex: 9999,
          padding: "6px 10px",
          borderRadius: "999px",
          border: "1px solid rgba(255,255,255,0.25)",
          background:
            estadoRealtime === "CONECTADO"
              ? "rgba(0, 124, 73, 0.94)"
              : estadoRealtime === "CONECTANDO"
                ? "rgba(145, 100, 0, 0.94)"
                : "rgba(179, 32, 32, 0.95)",
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.4px",
          boxShadow: "0 5px 18px rgba(0,0,0,0.18)",
        }}
      >
        Realtime: {estadoRealtime}
      </div>

      {vista !== "informe-turno" && (
      <header className="app-header roac-header-background">
        {/* TURNO HORARIO + BLOQUE DE TRABAJO */}
        <div className="header-overlay-shift">
          <span>{turnoActual.tipo} · {turnoActual.bloqueTrabajo}</span>
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
      )}

      {!puedeModificar && (
        <div className="read-only-notice">
          Modo solo lectura · Puedes consultar el estado de la flota
          y las averías, sin modificar datos.
        </div>
      )}

      {sesion && estadoPush !== "ACTIVA" && (
        <section
          style={{
            margin: "10px 14px 4px",
            padding: "12px 14px",
            borderRadius: "14px",
            border: "1px solid rgba(74, 72, 225, 0.25)",
            background: "rgba(245, 246, 255, 0.98)",
            boxShadow: "0 6px 18px rgba(30, 45, 80, 0.06)",
          }}
        >
          <strong
            style={{
              display: "block",
              marginBottom: "5px",
              color: "#1d2b4f",
            }}
          >
            🔔 Notificaciones de ROAC
          </strong>

          <p
            style={{
              margin: "0 0 10px",
              color: "#526079",
              fontSize: "13px",
              lineHeight: 1.4,
            }}
          >
            {estadoPush === "NO_INSTALADA"
              ? "En iPhone, agrega ROAC Operations a la pantalla de inicio para recibir alertas aunque Safari esté cerrado."
              : estadoPush === "BLOQUEADA"
                ? "Las notificaciones están bloqueadas en este dispositivo."
                : estadoPush === "NO_COMPATIBLE"
                  ? "Este navegador no permite notificaciones Web Push."
                  : estadoPush === "ERROR"
                    ? "No se pudo configurar Web Push. Revisa la configuración."
                    : "Activa las alertas del sistema para recibir nuevas averías y avisos de equipo operativo incluso con ROAC cerrado."}
          </p>

          {(estadoPush === "PENDIENTE" ||
            estadoPush === "ACTIVANDO" ||
            estadoPush === "NO_INSTALADA" ||
            estadoPush === "ERROR") && (
            <button
              type="button"
              className="primary-button"
              disabled={estadoPush === "ACTIVANDO"}
              onClick={() => void activarNotificacionesPush()}
              style={{ width: "100%" }}
            >
              {estadoPush === "ACTIVANDO"
                ? "Activando..."
                : estadoPush === "NO_INSTALADA"
                  ? "Verificar instalación"
                  : "Activar notificaciones"}
            </button>
          )}
        </section>
      )}

      {vista === "inicio" && (
        <>
          {emergenciaActiva && (
            <button
              type="button"
              onClick={() => void abrirDetalleEmergencia(emergenciaActiva.id)}
              style={{
                width: "calc(100% - 28px)",
                margin: "14px 14px 4px",
                padding: "16px",
                borderRadius: "16px",
                border: "2px solid #ffb3b3",
                background: "linear-gradient(135deg, #8b0000 0%, #d71920 100%)",
                color: "#fff",
                textAlign: "left",
                cursor: "pointer",
                boxShadow: "0 12px 28px rgba(151, 13, 13, .28)",
              }}
            >
              <strong style={{ display: "block", fontSize: "18px" }}>
                🚨 EMERGENCIA EN CURSO
              </strong>
              <span style={{ display: "block", marginTop: "5px" }}>
                {emergenciaActiva.tipoEmergencia} · {emergenciaActiva.sector}
              </span>
              <small style={{ display: "block", marginTop: "5px", opacity: .9 }}>
                Inicio {formatearFechaHoraChile(emergenciaActiva.fechaInicio)} · Toca para abrir
              </small>
            </button>
          )}

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

            <div className="summary-item summary-maintenance">
              <strong>{equiposEnMantenimiento}</strong>
              <span>Mantenimiento</span>
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
            <div className="home-action-grid">
              <button
                type="button"
                className="primary-button"
                onClick={comenzarRegistro}
              >
                + Publicar avería
              </button>

              <button
                type="button"
                className="maintenance-button"
                onClick={comenzarMantenimiento}
              >
                + Mantenimiento programado
              </button>
            </div>
          )}

          {puedeModificar && (
            <button
              type="button"
              onClick={comenzarEmergencia}
              style={{
                display: "flex",
                width: "calc(100% - 28px)",
                margin: "12px 14px 20px",
                padding: "15px 16px",
                borderRadius: "18px",
                border: emergenciaActiva
                  ? "2px solid #ff7b7b"
                  : "1px solid #f09a9a",
                background: emergenciaActiva
                  ? "linear-gradient(135deg, #dc101f 0%, #9e0b15 100%)"
                  : "linear-gradient(135deg, #fff8f8 0%, #ffe7e7 100%)",
                color: emergenciaActiva ? "#fff" : "#8f1019",
                boxShadow: emergenciaActiva
                  ? "0 10px 28px rgba(190, 18, 32, 0.32)"
                  : "0 8px 22px rgba(183, 28, 42, 0.12)",
                cursor: "pointer",
                alignItems: "center",
                gap: "13px",
                textAlign: "left",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "46px",
                  height: "46px",
                  minWidth: "46px",
                  borderRadius: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: emergenciaActiva
                    ? "rgba(255,255,255,0.18)"
                    : "#c9101d",
                  color: "#fff",
                  fontSize: "23px",
                  boxShadow: emergenciaActiva
                    ? "none"
                    : "0 6px 16px rgba(201, 16, 29, 0.28)",
                }}
              >
                🚨
              </span>

              <span
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                }}
              >
                <span
                  style={{
                    fontWeight: 900,
                    fontSize: "18px",
                    lineHeight: 1.1,
                    letterSpacing: "0.1px",
                  }}
                >
                  {emergenciaActiva ? "EMERGENCIA EN CURSO" : "Emergencia mina"}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "12.5px",
                    lineHeight: 1.25,
                    color: emergenciaActiva ? "#ffe2e2" : "#8f4449",
                  }}
                >
                  {emergenciaActiva
                    ? "Toca para revisar o finalizar la emergencia"
                    : "Registrar y alertar una emergencia operacional"}
                </span>
              </span>

              <span
                aria-hidden="true"
                style={{
                  fontSize: "30px",
                  lineHeight: 1,
                  fontWeight: 500,
                  color: emergenciaActiva ? "#fff" : "#c9101d",
                }}
              >
                ›
              </span>
            </button>
          )}

          {mantenimientosEnCurso.length > 0 && (
            <section className="section">
              <div className="section-title">
                <h2>Mantenimientos en curso</h2>
                <span>{mantenimientosEnCurso.length}</span>
              </div>

              <div className="maintenance-list">
                {mantenimientosEnCurso.map((mantenimiento) => (
                  <button
                    type="button"
                    className="maintenance-card"
                    key={mantenimiento.id}
                    onClick={() => abrirDetalleMantenimiento(mantenimiento.id)}
                  >
                    <div>
                      <strong>{mantenimiento.equipo.numeroMina}</strong>
                      <span> ({mantenimiento.equipo.numeroInterno})</span>
                    </div>
                    <small>{mantenimiento.equipo.modelo}</small>
                    <p>{mantenimiento.motivo}</p>
                    <span className="maintenance-meta">
                      Inicio {mantenimiento.horaInicio} · {mantenimiento.responsable}
                    </span>
                  </button>
                ))}
              </div>
            </section>
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
            Resumen operacional
          </p>

          <h2>
            Status turno {turnoActual.tipo} · {turnoActual.bloqueTrabajo}
          </h2>

          <p className="shift-date">
            {turnoActual.rangoTurno}
          </p>

          <div className="status-summary-card">
            <div className="status-summary-section">
              <div
                style={{
                  padding: "2px 0 8px",
                  color: "#53647d",
                  fontSize: "11px",
                  fontWeight: 900,
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                }}
              >
                Estado operacional
              </div>

              <p>
                <span>CAEX operativos en mina</span>
                <strong>{caexOperativosEnMina}</strong>
              </p>

              <p>
                <span>CAEX backup</span>
                <strong>
                  {equipoBackup
                    ? equipoBackup.numeroMina
                    : "Sin backup"}
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
                <span>Mantenimiento programado</span>
                <strong>{mantenimientosEnCurso.length}</strong>
              </p>
            </div>

            <div
              className="status-summary-section"
              style={{ marginTop: "18px" }}
            >
              <div
                style={{
                  padding: "0 0 8px",
                  color: "#c62828",
                  fontSize: "11px",
                  fontWeight: 900,
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                }}
              >
                Averías
              </div>

              <p>
                <span>Iniciadas en este turno</span>
                <strong>{averiasDelTurno.length}</strong>
              </p>

              <p>
                <span>Recibidas del turno anterior</span>
                <strong>{averiasHeredadas.length}</strong>
              </p>

              <p>
                <span>Cerradas durante este turno</span>
                <strong>{averiasCerradasEnTurno.length}</strong>
              </p>
            </div>

            <div
              className="status-summary-section"
              style={{ marginTop: "18px" }}
            >
              <div
                style={{
                  padding: "0 0 8px",
                  color: "#5546e8",
                  fontSize: "11px",
                  fontWeight: 900,
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                }}
              >
                Mantenimientos
              </div>

              <p>
                <span>Iniciados en este turno</span>
                <strong>{mantenimientosDelTurno.length}</strong>
              </p>

              <p>
                <span>Recibidos del turno anterior</span>
                <strong>{mantenimientosHeredados.length}</strong>
              </p>

              <p>
                <span>Finalizados en este turno</span>
                <strong>{mantenimientosFinalizadosEnTurno.length}</strong>
              </p>
            </div>
          </div>

          {averiasHeredadas.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <p className="eyebrow eyebrow-dark">
                Recibidas del turno anterior
              </p>

              <div className="open-faults">
                {averiasHeredadas.map((averia) => {
                  const cierreEnEsteTurno =
                    Boolean(averia.fechaCierre) &&
                    fechaDentroDelTurno(
                      averia.fechaCierre,
                      turnoActual,
                    );

                  const turnoSiguiente =
                    turnoActual.tipo === "Noche"
                      ? "Día"
                      : "Noche";

                  const enEntregaTurno =
                    esMinutoEntregaTurno();

                  const tiempoFueraServicio =
                    cierreEnEsteTurno
                      ? formatearTiempoFueraServicio(
                          averia.fechaAviso,
                          averia.fechaCierre,
                        )
                      : "";

                  return (
                    <div
                      className="fault-card"
                      key={`heredada-${averia.id}`}
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
                          {averia.estadoAveria === "Cerrada"
                            ? "Operativo"
                            : "HEREDADA"}
                        </span>
                      </div>

                      <p className="fault-type">
                        Sistema: {averia.sistema}
                      </p>

                      <p>
                        Detención original:{" "}
                        <strong>{formatearFechaHoraChile(averia.fechaAviso)}</strong>
                      </p>

                      {averia.fechaAtencion && (
                        <p>
                          Inicio atención:{" "}
                          <strong>{formatearFechaHoraChile(averia.fechaAtencion)}</strong>
                        </p>
                      )}

                      {averia.tomadaPor && (
                        <p>
                          Técnico:{" "}
                          <strong>{averia.tomadaPor}</strong>
                        </p>
                      )}

                      {cierreEnEsteTurno && (
                        <>
                          <p>
                            Operativo:{" "}
                            <strong>{formatearFechaHoraChile(averia.fechaCierre)}</strong>
                          </p>

                          {tiempoFueraServicio && (
                            <div
                              style={{
                                margin: "12px 0",
                                padding: "12px 14px",
                                borderRadius: "12px",
                                background: "#eef6ff",
                                border: "1px solid #bad8ff",
                                textAlign: "center",
                              }}
                            >
                              <small
                                style={{
                                  display: "block",
                                  fontWeight: 800,
                                  letterSpacing: "0.7px",
                                  color: "#42617f",
                                }}
                              >
                                TIEMPO FUERA DE SERVICIO
                              </small>
                              <strong
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  fontSize: "18px",
                                  color: "#0c3f73",
                                }}
                              >
                                {tiempoFueraServicio}
                              </strong>
                            </div>
                          )}
                        </>
                      )}

                      {cierreEnEsteTurno &&
                        averia.trabajoRealizado && (
                          <p className="fault-description">
                            Trabajo realizado:{" "}
                            {averia.trabajoRealizado}
                          </p>
                        )}

                      {!cierreEnEsteTurno &&
                        averia.estadoAveria === "Publicada" && (
                          <>
                            <p>
                              <strong>
                                {enEntregaTurno
                                  ? `Equipo queda fuera de servicio, sin atención. Pendiente para turno ${turnoSiguiente}.`
                                  : "Equipo sin atención."}
                              </strong>
                            </p>

                            {!enEntregaTurno && (
                              <p>
                                Fuera de servicio desde{" "}
                                <strong>{formatearFechaHoraChile(averia.fechaAviso)}</strong>
                              </p>
                            )}
                          </>
                        )}

                      {!cierreEnEsteTurno &&
                        averia.estadoAveria === "En atención" && (
                          <p>
                            <strong>
                              {enEntregaTurno
                                ? `Equipo queda fuera de servicio con atención en curso. Continúa intervención en turno ${turnoSiguiente}.`
                                : "Atención en curso."}
                            </strong>
                          </p>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: "24px" }}>
            <p className="eyebrow eyebrow-dark">
              Averías del turno
            </p>

            {averiasDelTurno.length === 0 ? (
              <p className="empty-state">
                No se han registrado averías durante este turno.
              </p>
            ) : (
              <div className="open-faults">
                {averiasDelTurno.map((averia) => {
                  const turnoSiguiente =
                    turnoActual.tipo === "Noche"
                      ? "Día"
                      : "Noche";

                  const enEntregaTurno =
                    esMinutoEntregaTurno();

                  const tiempoFueraServicio =
                    averia.estadoAveria === "Cerrada"
                      ? formatearTiempoFueraServicio(
                          averia.fechaAviso,
                          averia.fechaCierre,
                        )
                      : "";

                  return (
                    <div
                      className="fault-card"
                      key={`turno-${averia.id}`}
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
                          {averia.estadoAveria === "Cerrada"
                            ? "Operativo"
                            : averia.estadoAveria}
                        </span>
                      </div>

                      <p className="fault-type">
                        Sistema: {averia.sistema}
                      </p>

                      {averia.ubicacion && (
                        <p>Ubicación: {averia.ubicacion}</p>
                      )}

                      {averia.detalleInicial && (
                        <p className="fault-description">
                          {averia.detalleInicial}
                        </p>
                      )}

                      <p>
                        Detención:{" "}
                        <strong>{formatearFechaHoraChile(averia.fechaAviso)}</strong>
                      </p>

                      {averia.fechaAtencion && (
                        <p>
                          Atención:{" "}
                          <strong>{formatearFechaHoraChile(averia.fechaAtencion)}</strong>
                        </p>
                      )}

                      {averia.tomadaPor && (
                        <p>
                          Técnico:{" "}
                          <strong>{averia.tomadaPor}</strong>
                        </p>
                      )}

                      {averia.estadoAveria === "Cerrada" && (
                        <>
                          <p>
                            Operativo:{" "}
                            <strong>{formatearFechaHoraChile(averia.fechaCierre)}</strong>
                          </p>

                          {tiempoFueraServicio && (
                            <div
                              style={{
                                margin: "12px 0",
                                padding: "12px 14px",
                                borderRadius: "12px",
                                background: "#eef6ff",
                                border: "1px solid #bad8ff",
                                textAlign: "center",
                              }}
                            >
                              <small
                                style={{
                                  display: "block",
                                  fontWeight: 800,
                                  letterSpacing: "0.7px",
                                  color: "#42617f",
                                }}
                              >
                                TIEMPO FUERA DE SERVICIO
                              </small>
                              <strong
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  fontSize: "18px",
                                  color: "#0c3f73",
                                }}
                              >
                                {tiempoFueraServicio}
                              </strong>
                            </div>
                          )}
                        </>
                      )}

                      {averia.estadoAveria === "Cerrada" &&
                        averia.trabajoRealizado && (
                          <p className="fault-description">
                            Trabajo realizado:{" "}
                            {averia.trabajoRealizado}
                          </p>
                        )}

                      {averia.estadoAveria === "Publicada" && (
                        <>
                          <p>
                            <strong>
                              {enEntregaTurno
                                ? `Equipo queda fuera de servicio, sin atención. Pendiente para turno ${turnoSiguiente}.`
                                : "Equipo sin atención."}
                            </strong>
                          </p>

                          {!enEntregaTurno && (
                            <p>
                              Fuera de servicio desde{" "}
                              <strong>{formatearFechaHoraChile(averia.fechaAviso)}</strong>
                            </p>
                          )}
                        </>
                      )}

                      {averia.estadoAveria === "En atención" && (
                        <p>
                          <strong>
                            {enEntregaTurno
                              ? `Equipo queda fuera de servicio con atención en curso. Continúa intervención en turno ${turnoSiguiente}.`
                              : "Atención en curso."}
                          </strong>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {mantenimientosHeredados.length > 0 && (
            <div style={{ marginTop: "24px" }}>
              <p className="eyebrow eyebrow-dark">
                Mantenimientos recibidos del turno anterior
              </p>

              <div className="open-faults">
                {mantenimientosHeredados.map((mantenimiento) => {
                  const finalizadoEnEsteTurno =
                    Boolean(mantenimiento.fechaFin) &&
                    fechaDentroDelTurno(
                      mantenimiento.fechaFin,
                      turnoActual,
                    );

                  const duracion =
                    finalizadoEnEsteTurno
                      ? formatearTiempoFueraServicio(
                          mantenimiento.fechaInicio,
                          mantenimiento.fechaFin,
                        )
                      : "";

                  return (
                    <div
                      className="fault-card"
                      key={`mantenimiento-heredado-${mantenimiento.id}`}
                      style={{ borderLeftColor: "#6366f1" }}
                    >
                      <div className="fault-card-header">
                        <div>
                          <h3>
                            {mantenimiento.equipo.numeroMina} (
                            {mantenimiento.equipo.numeroInterno})
                          </h3>
                          <p>{mantenimiento.equipo.modelo}</p>
                        </div>

                        <span className="maintenance-state-badge">
                          {finalizadoEnEsteTurno
                            ? "Operativo"
                            : "HEREDADO"}
                        </span>
                      </div>

                      <p className="fault-type">
                        Mantenimiento programado
                      </p>

                      <p className="fault-description">
                        {mantenimiento.motivo}
                      </p>

                      <p>
                        Inicio original: {" "}
                        <strong>{mantenimiento.horaInicio}</strong>
                      </p>

                      <p>
                        Responsable: {" "}
                        <strong>{mantenimiento.responsable}</strong>
                      </p>

                      {finalizadoEnEsteTurno ? (
                        <>
                          <p>
                            Operativo: {" "}
                            <strong>{mantenimiento.horaFin}</strong>
                          </p>

                          {duracion && (
                            <div
                              style={{
                                margin: "12px 0",
                                padding: "12px 14px",
                                borderRadius: "12px",
                                background: "#eef2ff",
                                border: "1px solid #c7d2fe",
                                textAlign: "center",
                              }}
                            >
                              <small
                                style={{
                                  display: "block",
                                  fontWeight: 800,
                                  letterSpacing: "0.7px",
                                  color: "#4f46e5",
                                }}
                              >
                                TIEMPO EN MANTENIMIENTO
                              </small>
                              <strong
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  fontSize: "18px",
                                  color: "#3730a3",
                                }}
                              >
                                {duracion}
                              </strong>
                            </div>
                          )}

                          {mantenimiento.trabajoRealizado && (
                            <p className="fault-description">
                              Trabajo realizado: {" "}
                              {mantenimiento.trabajoRealizado}
                            </p>
                          )}
                        </>
                      ) : (
                        <p>
                          <strong>
                            Continúa en mantenimiento programado.
                          </strong>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: "24px" }}>
            <p className="eyebrow eyebrow-dark">
              Mantenimientos programados del turno
            </p>

            {mantenimientosDelTurno.length === 0 ? (
              <p className="empty-state">
                No se han iniciado mantenimientos programados durante este turno.
              </p>
            ) : (
              <div className="open-faults">
                {mantenimientosDelTurno.map((mantenimiento) => {
                  const duracion =
                    mantenimiento.estado === "Finalizado" &&
                    mantenimiento.fechaFin
                      ? formatearTiempoFueraServicio(
                          mantenimiento.fechaInicio,
                          mantenimiento.fechaFin,
                        )
                      : "";

                  return (
                    <div
                      className="fault-card"
                      key={`mantenimiento-turno-${mantenimiento.id}`}
                      style={{ borderLeftColor: "#6366f1" }}
                    >
                      <div className="fault-card-header">
                        <div>
                          <h3>
                            {mantenimiento.equipo.numeroMina} (
                            {mantenimiento.equipo.numeroInterno})
                          </h3>
                          <p>{mantenimiento.equipo.modelo}</p>
                        </div>

                        <span className="maintenance-state-badge">
                          {mantenimiento.estado === "Finalizado"
                            ? "Operativo"
                            : "En curso"}
                        </span>
                      </div>

                      <p className="fault-type">
                        Mantenimiento programado
                      </p>

                      <p className="fault-description">
                        {mantenimiento.motivo}
                      </p>

                      <p>
                        Inicio: {" "}
                        <strong>{mantenimiento.horaInicio}</strong>
                      </p>

                      <p>
                        Responsable: {" "}
                        <strong>{mantenimiento.responsable}</strong>
                      </p>

                      {mantenimiento.estado === "En curso" ? (
                        <p>
                          <strong>Mantenimiento en curso.</strong>
                        </p>
                      ) : (
                        <>
                          <p>
                            Operativo: {" "}
                            <strong>{mantenimiento.horaFin}</strong>
                          </p>

                          {duracion && (
                            <div
                              style={{
                                margin: "12px 0",
                                padding: "12px 14px",
                                borderRadius: "12px",
                                background: "#eef2ff",
                                border: "1px solid #c7d2fe",
                                textAlign: "center",
                              }}
                            >
                              <small
                                style={{
                                  display: "block",
                                  fontWeight: 800,
                                  letterSpacing: "0.7px",
                                  color: "#4f46e5",
                                }}
                              >
                                TIEMPO EN MANTENIMIENTO
                              </small>
                              <strong
                                style={{
                                  display: "block",
                                  marginTop: "4px",
                                  fontSize: "18px",
                                  color: "#3730a3",
                                }}
                              >
                                {duracion}
                              </strong>
                            </div>
                          )}

                          {mantenimiento.trabajoRealizado && (
                            <p className="fault-description">
                              Trabajo realizado: {" "}
                              {mantenimiento.trabajoRealizado}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: "26px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              className="reset-data-button"
              onClick={generarInformeTurnoActual}
            >
              Generar informe de turno
            </button>
          </div>

          <div
            style={{
              marginTop: "30px",
              paddingTop: "22px",
              borderTop: "1px solid #dbe4ef",
            }}
          >
            <p className="eyebrow eyebrow-dark">Historial de turnos</p>
            <h3 style={{ margin: "4px 0 6px" }}>Status cerrados</h3>
            <p
              style={{
                margin: "0 0 14px",
                color: "#63748a",
                fontSize: "13px",
                lineHeight: 1.45,
              }}
            >
              Cada turno queda archivado de forma independiente para mantener
              limpio el status actual y usarlo después en el informe PDF.
            </p>

            {historialTurnosCerrados.length === 0 ? (
              <p className="empty-state">
                Aún no hay turnos cerrados archivados. El primero se guardará
                automáticamente en el próximo cambio de turno.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "18px" }}>
                <div>
                  <strong
                    style={{
                      display: "block",
                      marginBottom: "10px",
                      color: "#213a59",
                      fontSize: "14px",
                    }}
                  >
                    Turnos recientes
                  </strong>

                  <div style={{ display: "grid", gap: "10px" }}>
                    {historialTurnosRecientes.map((statusHistorico) => {
                      const abierto =
                        claveHistorialAbierto === statusHistorico.claveTurno;

                      return (
                        <article
                          key={statusHistorico.claveTurno}
                          style={{
                            border: "1px solid #d9e3ef",
                            borderRadius: "14px",
                            background: "#ffffff",
                            overflow: "hidden",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setClaveHistorialAbierto(
                                abierto ? null : statusHistorico.claveTurno,
                              )
                            }
                            style={{
                              width: "100%",
                              border: 0,
                              background: "transparent",
                              padding: "14px 16px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "12px",
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <span>
                              <strong
                                style={{
                                  display: "block",
                                  color: "#172b46",
                                  fontSize: "14px",
                                }}
                              >
                                Status turno {statusHistorico.tipoTurno} · {statusHistorico.bloqueTrabajo}
                              </strong>
                              <small style={{ color: "#6b7b90" }}>
                                {statusHistorico.rangoTurno}
                              </small>
                            </span>
                            <strong style={{ color: "#40556f" }}>
                              {abierto ? "−" : "+"}
                            </strong>
                          </button>

                          {abierto && (
                            <div
                              style={{
                                padding: "0 16px 16px",
                                borderTop: "1px solid #edf1f6",
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                  gap: "8px",
                                  marginTop: "14px",
                                }}
                              >
                                <div className="status-summary-card">
                                  <small>Averías iniciadas</small>
                                  <strong>{statusHistorico.resumen.averiasIniciadas}</strong>
                                </div>
                                <div className="status-summary-card">
                                  <small>Averías cerradas</small>
                                  <strong>{statusHistorico.resumen.averiasCerradas}</strong>
                                </div>
                                <div className="status-summary-card">
                                  <small>Heredadas</small>
                                  <strong>{statusHistorico.resumen.averiasHeredadas}</strong>
                                </div>
                                <div className="status-summary-card">
                                  <small>Mantenciones</small>
                                  <strong>{statusHistorico.resumen.mantenimientosIniciados}</strong>
                                </div>
                              </div>

                              {statusHistorico.averias.length > 0 && (
                                <div style={{ marginTop: "16px" }}>
                                  <strong
                                    style={{
                                      display: "block",
                                      marginBottom: "8px",
                                      color: "#213a59",
                                    }}
                                  >
                                    Averías del status
                                  </strong>
                                  <div style={{ display: "grid", gap: "8px" }}>
                                    {statusHistorico.averias.map((averia) => (
                                      <div
                                        key={`hist-${statusHistorico.claveTurno}-${averia.id}`}
                                        style={{
                                          padding: "10px 12px",
                                          borderRadius: "10px",
                                          background: "#f7f9fc",
                                          border: "1px solid #e5ebf2",
                                        }}
                                      >
                                        <strong>
                                          {averia.equipo.numeroMina} · {averia.sistema}
                                        </strong>
                                        <div
                                          style={{
                                            marginTop: "4px",
                                            color: "#617187",
                                            fontSize: "12px",
                                            lineHeight: 1.45,
                                          }}
                                        >
                                          Inicio: {formatearFechaHoraChile(averia.fechaAviso)}
                                          {averia.fechaAtencion && (
                                            <>
                                              <br />
                                              Atención: {formatearFechaHoraChile(averia.fechaAtencion)}
                                            </>
                                          )}
                                          {averia.fechaCierre && (
                                            <>
                                              <br />
                                              Operativo: {formatearFechaHoraChile(averia.fechaCierre)}
                                            </>
                                          )}
                                          <br />
                                          Estado: {averia.estadoAveria === "Cerrada" ? "Operativo" : averia.estadoAveria}
                                        </div>
                                        {averia.trabajoRealizado && (
                                          <p
                                            style={{
                                              margin: "7px 0 0",
                                              fontSize: "12px",
                                              color: "#40536c",
                                            }}
                                          >
                                            Trabajo: {averia.trabajoRealizado}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {statusHistorico.mantenimientos.length > 0 && (
                                <div style={{ marginTop: "16px" }}>
                                  <strong
                                    style={{
                                      display: "block",
                                      marginBottom: "8px",
                                      color: "#4338ca",
                                    }}
                                  >
                                    Mantenimientos del status
                                  </strong>
                                  <div style={{ display: "grid", gap: "8px" }}>
                                    {statusHistorico.mantenimientos.map((mantenimiento) => (
                                      <div
                                        key={`hist-mant-${statusHistorico.claveTurno}-${mantenimiento.id}`}
                                        style={{
                                          padding: "10px 12px",
                                          borderRadius: "10px",
                                          background: "#f7f7ff",
                                          border: "1px solid #e1e2ff",
                                        }}
                                      >
                                        <strong>
                                          {mantenimiento.equipo.numeroMina} · Mantenimiento programado
                                        </strong>
                                        <p
                                          style={{
                                            margin: "5px 0 0",
                                            color: "#5d617a",
                                            fontSize: "12px",
                                          }}
                                        >
                                          {mantenimiento.motivo}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>

                {mesesHistorial.length > 0 && (
                  <div
                    style={{
                      paddingTop: "16px",
                      borderTop: "1px solid #e6edf5",
                    }}
                  >
                    <strong
                      style={{
                        display: "block",
                        marginBottom: "4px",
                        color: "#213a59",
                        fontSize: "14px",
                      }}
                    >
                      Archivo mensual
                    </strong>
                    <p
                      style={{
                        margin: "0 0 10px",
                        color: "#718096",
                        fontSize: "12px",
                      }}
                    >
                      Los turnos anteriores quedan agrupados por mes para evitar una lista extensa.
                    </p>

                    <div style={{ display: "grid", gap: "9px" }}>
                      {mesesHistorial.map(({ claveMes, etiquetaMes, turnos }) => {
                        const mesAbierto = mesHistorialAbierto === claveMes;

                        return (
                          <div
                            key={claveMes}
                            style={{
                              border: "1px solid #d9e3ef",
                              borderRadius: "14px",
                              background: "#f8fafc",
                              overflow: "hidden",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setMesHistorialAbierto(mesAbierto ? null : claveMes)
                              }
                              style={{
                                width: "100%",
                                border: 0,
                                background: "transparent",
                                padding: "14px 16px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "12px",
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              <span>
                                <strong
                                  style={{
                                    display: "block",
                                    color: "#172b46",
                                    fontSize: "14px",
                                  }}
                                >
                                  {etiquetaMes}
                                </strong>
                                <small style={{ color: "#6b7b90" }}>
                                  {turnos.length} {turnos.length === 1 ? "turno archivado" : "turnos archivados"}
                                </small>
                              </span>
                              <strong style={{ color: "#40556f" }}>
                                {mesAbierto ? "−" : "+"}
                              </strong>
                            </button>

                            {mesAbierto && (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "9px",
                                  padding: "0 10px 10px",
                                  borderTop: "1px solid #e8eef5",
                                }}
                              >
                                {turnos.map((statusHistorico) => {
                                  const abierto =
                                    claveHistorialAbierto === statusHistorico.claveTurno;

                                  return (
                                    <article
                                      key={statusHistorico.claveTurno}
                                      style={{
                                        border: "1px solid #d9e3ef",
                                        borderRadius: "12px",
                                        background: "#ffffff",
                                        overflow: "hidden",
                                        marginTop: "9px",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setClaveHistorialAbierto(
                                            abierto ? null : statusHistorico.claveTurno,
                                          )
                                        }
                                        style={{
                                          width: "100%",
                                          border: 0,
                                          background: "transparent",
                                          padding: "12px 14px",
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          gap: "12px",
                                          textAlign: "left",
                                          cursor: "pointer",
                                        }}
                                      >
                                        <span>
                                          <strong
                                            style={{
                                              display: "block",
                                              color: "#172b46",
                                              fontSize: "13px",
                                            }}
                                          >
                                            Status turno {statusHistorico.tipoTurno} · {statusHistorico.bloqueTrabajo}
                                          </strong>
                                          <small style={{ color: "#6b7b90" }}>
                                            {statusHistorico.rangoTurno}
                                          </small>
                                        </span>
                                        <strong style={{ color: "#40556f" }}>
                                          {abierto ? "−" : "+"}
                                        </strong>
                                      </button>

                                      {abierto && (
                                        <div
                                          style={{
                                            padding: "0 14px 14px",
                                            borderTop: "1px solid #edf1f6",
                                          }}
                                        >
                                          <div
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                              gap: "8px",
                                              marginTop: "12px",
                                            }}
                                          >
                                            <div className="status-summary-card">
                                              <small>Averías iniciadas</small>
                                              <strong>{statusHistorico.resumen.averiasIniciadas}</strong>
                                            </div>
                                            <div className="status-summary-card">
                                              <small>Averías cerradas</small>
                                              <strong>{statusHistorico.resumen.averiasCerradas}</strong>
                                            </div>
                                            <div className="status-summary-card">
                                              <small>Heredadas</small>
                                              <strong>{statusHistorico.resumen.averiasHeredadas}</strong>
                                            </div>
                                            <div className="status-summary-card">
                                              <small>Mantenciones</small>
                                              <strong>{statusHistorico.resumen.mantenimientosIniciados}</strong>
                                            </div>
                                          </div>

                                          {statusHistorico.averias.length > 0 && (
                                            <div style={{ marginTop: "14px" }}>
                                              <strong
                                                style={{
                                                  display: "block",
                                                  marginBottom: "8px",
                                                  color: "#213a59",
                                                }}
                                              >
                                                Averías del status
                                              </strong>
                                              <div style={{ display: "grid", gap: "8px" }}>
                                                {statusHistorico.averias.map((averia) => (
                                                  <div
                                                    key={`hist-${statusHistorico.claveTurno}-${averia.id}`}
                                                    style={{
                                                      padding: "10px 12px",
                                                      borderRadius: "10px",
                                                      background: "#f7f9fc",
                                                      border: "1px solid #e5ebf2",
                                                    }}
                                                  >
                                                    <strong>
                                                      {averia.equipo.numeroMina} · {averia.sistema}
                                                    </strong>
                                                    <div
                                                      style={{
                                                        marginTop: "4px",
                                                        color: "#617187",
                                                        fontSize: "12px",
                                                        lineHeight: 1.45,
                                                      }}
                                                    >
                                                      Inicio: {formatearFechaHoraChile(averia.fechaAviso)}
                                                      {averia.fechaAtencion && (
                                                        <>
                                                          <br />
                                                          Atención: {formatearFechaHoraChile(averia.fechaAtencion)}
                                                        </>
                                                      )}
                                                      {averia.fechaCierre && (
                                                        <>
                                                          <br />
                                                          Operativo: {formatearFechaHoraChile(averia.fechaCierre)}
                                                        </>
                                                      )}
                                                      <br />
                                                      Estado: {averia.estadoAveria === "Cerrada" ? "Operativo" : averia.estadoAveria}
                                                    </div>
                                                    {averia.trabajoRealizado && (
                                                      <p
                                                        style={{
                                                          margin: "7px 0 0",
                                                          fontSize: "12px",
                                                          color: "#40536c",
                                                        }}
                                                      >
                                                        Trabajo: {averia.trabajoRealizado}
                                                      </p>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {statusHistorico.mantenimientos.length > 0 && (
                                            <div style={{ marginTop: "14px" }}>
                                              <strong
                                                style={{
                                                  display: "block",
                                                  marginBottom: "8px",
                                                  color: "#4338ca",
                                                }}
                                              >
                                                Mantenimientos del status
                                              </strong>
                                              <div style={{ display: "grid", gap: "8px" }}>
                                                {statusHistorico.mantenimientos.map((mantenimiento) => (
                                                  <div
                                                    key={`hist-mant-${statusHistorico.claveTurno}-${mantenimiento.id}`}
                                                    style={{
                                                      padding: "10px 12px",
                                                      borderRadius: "10px",
                                                      background: "#f7f7ff",
                                                      border: "1px solid #e1e2ff",
                                                    }}
                                                  >
                                                    <strong>
                                                      {mantenimiento.equipo.numeroMina} · Mantenimiento programado
                                                    </strong>
                                                    <p
                                                      style={{
                                                        margin: "5px 0 0",
                                                        color: "#5d617a",
                                                        fontSize: "12px",
                                                      }}
                                                    >
                                                      {mantenimiento.motivo}
                                                    </p>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </article>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </section>
      )}

      {vista === "informe-turno" && informeTurno && (
        <section className="report-screen">
          <div className="report-actions">
            <button
              type="button"
              className="report-action-button report-back-button"
              onClick={() => setVista("status")}
            >
              ← Volver al Status
            </button>

            <button
              type="button"
              className="report-action-button report-print-button"
              onClick={descargarInformePdf}
              disabled={generandoPdf}
              aria-busy={generandoPdf}
            >
              {generandoPdf ? "Generando PDF…" : "Descargar PDF"}
            </button>
          </div>

          <article className="report-document">
            <div className="report-title-row">
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "1.1px",
                    color: "#315a87",
                  }}
                >
                  ROAC OPERATIONS · EPSA
                </p>
                <h2>
                  Informe de turno {informeTurno.turno.tipo} · {informeTurno.turno.bloqueTrabajo}
                </h2>
                <p>{informeTurno.turno.rangoTurno}</p>
              </div>

              <div className="report-generated">
                <strong>Generado</strong>
                <br />
                {formatearFechaHoraChile(informeTurno.generadoEn)}
              </div>
            </div>

            <div className="report-summary-grid">
              <div className="report-summary-item">
                <span>CAEX operativos en mina</span>
                <strong>{informeTurno.resumen.caexOperativosEnMina}</strong>
              </div>
              <div className="report-summary-item">
                <span>Backup</span>
                <strong>{informeTurno.resumen.numeroBackup ?? "Sin backup"}</strong>
              </div>
              <div className="report-summary-item">
                <span>Fuera de servicio</span>
                <strong>{informeTurno.resumen.equiposFueraServicio}</strong>
              </div>
              <div className="report-summary-item">
                <span>En atención</span>
                <strong>{informeTurno.resumen.equiposEnAtencion}</strong>
              </div>
              <div className="report-summary-item">
                <span>Equipos operativos</span>
                <strong>{informeTurno.resumen.equiposOperativos}</strong>
              </div>
              <div className="report-summary-item">
                <span>Mant. programado</span>
                <strong>{informeTurno.resumen.mantenimientosEnCurso}</strong>
              </div>
              <div className="report-summary-item">
                <span>Averías iniciadas</span>
                <strong>{informeTurno.resumen.averiasIniciadas}</strong>
              </div>
              <div className="report-summary-item">
                <span>Averías cerradas</span>
                <strong>{informeTurno.resumen.averiasCerradas}</strong>
              </div>
            </div>

            <h3 className="report-section-title">Averías del turno</h3>

            {informeTurno.averias.length === 0 ? (
              <p className="report-empty">
                Sin averías registradas o heredadas al momento de generar el informe.
              </p>
            ) : (
              informeTurno.averias.map((averia) => {
                const ultimoAvance = obtenerUltimoAvanceInforme(averia.id);
                const tiempoFueraServicio =
                  averia.estadoAveria === "Cerrada" && averia.fechaCierre
                    ? formatearTiempoFueraServicio(
                        averia.fechaAviso,
                        averia.fechaCierre,
                      )
                    : "";

                return (
                  <div className="report-record" key={`informe-${averia.id}`}>
                    <h4>
                      {averia.equipo.numeroMina} ({averia.equipo.numeroInterno}) ·{" "}
                      {averia.sistema}
                    </h4>

                    <p>
                      <strong>Estado:</strong>{" "}
                      {averia.estadoAveria === "Cerrada"
                        ? "Operativo"
                        : averia.estadoAveria}
                    </p>

                    <p>
                      <strong>Detención:</strong>{" "}
                      {formatearFechaHoraChile(averia.fechaAviso)}
                    </p>

                    {averia.fechaAtencion && (
                      <p>
                        <strong>Atención:</strong>{" "}
                        {formatearFechaHoraChile(averia.fechaAtencion)}
                      </p>
                    )}

                    {averia.tomadaPor && (
                      <p>
                        <strong>
                          {averia.estadoAveria === "Cerrada"
                            ? "Técnico final:"
                            : "Técnico actual:"}
                        </strong>{" "}
                        {averia.tomadaPor}
                      </p>
                    )}

                    {averia.estadoAveria === "Cerrada" && averia.fechaCierre && (
                      <>
                        <p>
                          <strong>Operativo:</strong>{" "}
                          {formatearFechaHoraChile(averia.fechaCierre)}
                        </p>
                        <p className="report-emphasis">
                          Tiempo fuera de servicio: {tiempoFueraServicio}
                        </p>
                      </>
                    )}

                    {averia.trabajoRealizado && (
                      <p>
                        <strong>Trabajo realizado:</strong>{" "}
                        {averia.trabajoRealizado}
                      </p>
                    )}

                    {averia.estadoAveria !== "Cerrada" && ultimoAvance && (
                      <p>
                        <strong>Último avance:</strong>{" "}
                        {ultimoAvance.detalle}
                      </p>
                    )}

                    {averia.estadoAveria === "Publicada" && (
                      <p className="report-emphasis">
                        Equipo fuera de servicio, pendiente de atención.
                      </p>
                    )}

                    {averia.estadoAveria === "En atención" && (
                      <p className="report-emphasis">
                        Equipo en atención. Intervención pendiente de continuidad/cierre.
                      </p>
                    )}
                  </div>
                );
              })
            )}

            <h3 className="report-section-title">Mantenimientos programados</h3>

            {informeTurno.mantenimientos.length === 0 ? (
              <p className="report-empty">
                Sin mantenimientos programados asociados al turno al momento de generar el informe.
              </p>
            ) : (
              informeTurno.mantenimientos.map((mantenimiento) => {
                const duracion =
                  mantenimiento.estado === "Finalizado" &&
                  mantenimiento.fechaFin
                    ? formatearTiempoFueraServicio(
                        mantenimiento.fechaInicio,
                        mantenimiento.fechaFin,
                      )
                    : "";

                return (
                  <div
                    className="report-record"
                    key={`informe-mant-${mantenimiento.id}`}
                  >
                    <h4>
                      {mantenimiento.equipo.numeroMina} (
                      {mantenimiento.equipo.numeroInterno}) · Mantenimiento programado
                    </h4>
                    <p>
                      <strong>Estado:</strong>{" "}
                      {mantenimiento.estado === "Finalizado"
                        ? "Finalizado"
                        : "En curso"}
                    </p>
                    <p>
                      <strong>Inicio:</strong>{" "}
                      {formatearFechaHoraChile(mantenimiento.fechaInicio)}
                    </p>
                    <p>
                      <strong>Responsable:</strong>{" "}
                      {mantenimiento.responsable}
                    </p>
                    <p>
                      <strong>Motivo:</strong>{" "}
                      {mantenimiento.motivo}
                    </p>

                    {mantenimiento.fechaFin && (
                      <p>
                        <strong>Fin:</strong>{" "}
                        {formatearFechaHoraChile(mantenimiento.fechaFin)}
                      </p>
                    )}

                    {duracion && (
                      <p className="report-emphasis">
                        Tiempo en mantenimiento: {duracion}
                      </p>
                    )}

                    {mantenimiento.trabajoRealizado && (
                      <p>
                        <strong>Trabajo realizado:</strong>{" "}
                        {mantenimiento.trabajoRealizado}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </article>
        </section>
      )}

      {vista === "seleccionar-equipo-mantenimiento" && puedeModificar && (
        <section className="equipment-selector">
          <div className="form-header">
            <div>
              <p className="eyebrow eyebrow-dark">
                Mantenimiento programado
              </p>
              <h2>Selecciona el equipo</h2>
            </div>

            <button
              type="button"
              className="close-button"
              onClick={cancelarMantenimiento}
              aria-label="Cancelar mantenimiento"
            >
              ×
            </button>
          </div>

          <div className="equipment-grid">
            {equipos.map((equipo) => {
              const tieneAveria = Boolean(obtenerAveriaAbierta(equipo.numeroMina));
              const tieneMantenimiento = Boolean(obtenerMantenimientoActivo(equipo.numeroMina));
              const disponible = equipo.estado === "Operativo" && !tieneAveria && !tieneMantenimiento;

              return (
                <div
                  className={`fault-selection-wrapper ${!disponible ? "maintenance-card-unavailable" : ""}`}
                  key={equipo.numeroMina}
                >
                  {!disponible && (
                    <span
                      className={`maintenance-unavailable-label ${
                        tieneAveria
                          ? "maintenance-unavailable-fault"
                          : tieneMantenimiento
                            ? "maintenance-unavailable-active"
                            : "maintenance-unavailable-state"
                      }`}
                    >
                      {tieneAveria ? "AVERÍA ABIERTA" : tieneMantenimiento ? "EN MANTENIMIENTO" : equipo.estado.toUpperCase()}
                    </span>
                  )}

                  <EquipoCard
                    numeroMina={equipo.numeroMina}
                    numeroInterno={equipo.numeroInterno}
                    modelo={equipo.modelo}
                    estado={equipo.estado}
                    seleccionado={equipoSeleccionado?.numeroMina === equipo.numeroMina}
                    onClick={() => seleccionarEquipoParaMantenimiento(equipo)}
                  />
                </div>
              );
            })}
          </div>

          {equipoSeleccionado && (
            <div className="selected-equipment maintenance-selected">
              <p className="eyebrow">Equipo seleccionado</p>
              <h3>{equipoSeleccionado.numeroMina}</h3>
              <p>Interno: <strong>{equipoSeleccionado.numeroInterno}</strong></p>
              <p>Modelo: <strong>{equipoSeleccionado.modelo}</strong></p>
              <p>Estado actual: <strong>{equipoSeleccionado.estado}</strong></p>

              <button
                type="button"
                className="continue-button"
                onClick={continuarConMantenimiento}
              >
                Continuar
              </button>
            </div>
          )}
        </section>
      )}

      {vista === "registrar-emergencia" && puedeModificar && (
        <section className="fault-detail" style={{ maxWidth: "720px", margin: "0 auto" }}>
          <button type="button" className="back-button" onClick={irAInicio}>
            ← Volver
          </button>

          <div style={{
            marginTop: "14px",
            padding: "18px",
            borderRadius: "18px",
            border: "1px solid #f0b0b0",
            background: "#fff7f7",
          }}>
            <p className="eyebrow eyebrow-dark">Emergencia mina</p>
            <h2 style={{ color: "#a20d18", marginTop: "4px" }}>🚨 Activar emergencia</h2>
            <p style={{ color: "#596273" }}>
              Registra solo la información disponible en los primeros minutos.
            </p>

            <label style={{ display: "block", marginTop: "16px", fontWeight: 700 }}>
              Tipo de emergencia
            </label>
            <input
              list="tipos-emergencia-mina"
              value={tipoEmergencia}
              onChange={(evento) => setTipoEmergencia(evento.target.value)}
              placeholder="Ej.: Amago de incendio"
              style={{ width: "100%", marginTop: "6px", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />
            <datalist id="tipos-emergencia-mina">
              <option value="Amago de incendio" />
              <option value="Incendio" />
              <option value="Accidente" />
              <option value="Derrame" />
              <option value="Emergencia geotécnica" />
              <option value="Rescate" />
              <option value="Otro" />
            </datalist>

            <label style={{ display: "block", marginTop: "14px", fontWeight: 700 }}>
              Sector / fase de mina
            </label>
            <input
              value={sectorEmergencia}
              onChange={(evento) => setSectorEmergencia(evento.target.value)}
              placeholder="Ej.: Fase 3, sector norte"
              style={{ width: "100%", marginTop: "6px", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
            />

            <label style={{ display: "block", marginTop: "14px", fontWeight: 700 }}>
              Breve descripción
            </label>
            <textarea
              value={descripcionEmergencia}
              onChange={(evento) => setDescripcionEmergencia(evento.target.value)}
              placeholder="Información preliminar disponible..."
              rows={4}
              style={{ width: "100%", marginTop: "6px", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", resize: "vertical" }}
            />

            <button
              type="button"
              onClick={() => void activarEmergenciaMina()}
              style={{
                width: "100%",
                marginTop: "20px",
                padding: "16px 18px",
                border: "1px solid #9f0b15",
                borderRadius: "15px",
                background: "linear-gradient(135deg, #d41120 0%, #9e0b15 100%)",
                color: "#fff",
                fontWeight: 900,
                fontSize: "17px",
                letterSpacing: "0.15px",
                cursor: "pointer",
                boxShadow: "0 9px 22px rgba(178, 13, 24, 0.24)",
              }}
            >
              🚨 Activar emergencia
            </button>
          </div>
        </section>
      )}

      {vista === "detalle-emergencia" && emergenciaSeleccionada && (
        <section className="fault-detail" style={{ maxWidth: "720px", margin: "0 auto" }}>
          <button type="button" className="back-button" onClick={irAInicio}>
            ← Inicio
          </button>

          <div style={{
            marginTop: "14px",
            padding: "20px",
            borderRadius: "18px",
            border: emergenciaSeleccionada.estado === "ACTIVA" ? "2px solid #e03434" : "1px solid #cbd5e1",
            background: emergenciaSeleccionada.estado === "ACTIVA" ? "#fff5f5" : "#fff",
          }}>
            <p style={{ margin: 0, fontWeight: 800, color: emergenciaSeleccionada.estado === "ACTIVA" ? "#b20d18" : "#526079" }}>
              {emergenciaSeleccionada.estado === "ACTIVA" ? "🚨 EMERGENCIA EN CURSO" : "Emergencia finalizada"}
            </p>
            <h2 style={{ margin: "8px 0" }}>{emergenciaSeleccionada.tipoEmergencia}</h2>
            <p><strong>Sector / fase:</strong> {emergenciaSeleccionada.sector}</p>
            {emergenciaSeleccionada.descripcion && (
              <p><strong>Descripción inicial:</strong> {emergenciaSeleccionada.descripcion}</p>
            )}
            <p><strong>Inicio:</strong> {formatearFechaHoraChile(emergenciaSeleccionada.fechaInicio)}</p>
            {emergenciaSeleccionada.fechaFin && (
              <p><strong>Término:</strong> {formatearFechaHoraChile(emergenciaSeleccionada.fechaFin)}</p>
            )}

            {puedeModificar && emergenciaSeleccionada.estado === "ACTIVA" && (
              <button
                type="button"
                onClick={() => void finalizarEmergenciaMina(emergenciaSeleccionada.id)}
                style={{
                  width: "100%",
                  marginTop: "14px",
                  padding: "13px",
                  border: 0,
                  borderRadius: "12px",
                  background: "#243247",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Finalizar emergencia
              </button>
            )}
          </div>
        </section>
      )}

      {vista === "registrar-mantenimiento" && puedeModificar && equipoSeleccionado && (
        <section className="fault-form maintenance-form">
          <div className="form-header">
            <div>
              <p className="eyebrow eyebrow-dark">Mantenimiento programado</p>
              <h2>{equipoSeleccionado.numeroMina} ({equipoSeleccionado.numeroInterno})</h2>
              <p className="equipment-model">{equipoSeleccionado.modelo}</p>
            </div>
            <button type="button" className="close-button" onClick={cancelarMantenimiento}>×</button>
          </div>

          <div className="form-group">
            <label htmlFor="motivoMantenimiento">Motivo / trabajo programado *</label>
            <textarea
              id="motivoMantenimiento"
              value={motivoMantenimiento}
              onChange={(evento) => setMotivoMantenimiento(evento.target.value)}
              placeholder="Ejemplo: PM 500 horas, cambio programado de motor..."
              rows={4}
            />
          </div>

          <div className="form-group">
            <label htmlFor="responsableMantenimiento">Responsable del mantenimiento *</label>
            <input
              id="responsableMantenimiento"
              className="form-input"
              value={responsableMantenimiento}
              onChange={(evento) => setResponsableMantenimiento(evento.target.value)}
              placeholder="Nombre y apellido"
            />
          </div>

          <div className="automatic-data">
            <p><span>Estado al iniciar</span><strong>Mantenimiento programado</strong></p>
            <p><span>Hora de inicio</span><strong>Automática</strong></p>
          </div>

          <button
            type="button"
            className="start-maintenance-button"
            onClick={() => void iniciarMantenimientoProgramado()}
          >
            Iniciar mantenimiento programado
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setVista("seleccionar-equipo-mantenimiento")}
          >
            ← Cambiar equipo
          </button>
        </section>
      )}

      {vista === "detalle-mantenimiento" && mantenimientoSeleccionado && (
        <section className="fault-detail maintenance-detail">
          <button
            type="button"
            className="back-button"
            onClick={irAInicio}
          >
            ← Volver a inicio
          </button>

          <div className="detail-header">
            <div>
              <p className="eyebrow eyebrow-dark">Mantenimiento programado</p>
              <h2>{mantenimientoSeleccionado.equipo.numeroMina} ({mantenimientoSeleccionado.equipo.numeroInterno})</h2>
              <p>{mantenimientoSeleccionado.equipo.modelo}</p>
            </div>
            <span className="maintenance-state-badge">{mantenimientoSeleccionado.estado}</span>
          </div>

          <div className="detail-information maintenance-information">
            <p><span>Motivo</span><strong>{mantenimientoSeleccionado.motivo}</strong></p>
            <p><span>Responsable</span><strong>{mantenimientoSeleccionado.responsable}</strong></p>
            <p><span>Inicio</span><strong>{mantenimientoSeleccionado.horaInicio}</strong></p>
            {mantenimientoSeleccionado.horaFin && (
              <p><span>Operativo</span><strong>{mantenimientoSeleccionado.horaFin}</strong></p>
            )}
          </div>

          {mantenimientoSeleccionado.estado === "En curso" && puedeModificar && (
            <div className="attention-panel maintenance-finish-panel">
              <h3>Finalizar mantenimiento</h3>
              <label htmlFor="trabajoMantenimiento">Trabajo realizado *</label>
              <textarea
                id="trabajoMantenimiento"
                value={trabajoMantenimiento}
                onChange={(evento) => setTrabajoMantenimiento(evento.target.value)}
                placeholder="Describe el trabajo realizado y las pruebas efectuadas"
                rows={5}
              />
              <button
                type="button"
                className="finish-maintenance-button"
                style={{
                  width: "100%",
                  marginTop: "14px",
                  border: 0,
                  borderRadius: "14px",
                  padding: "15px 18px",
                  background: "#16a34a",
                  color: "#ffffff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                onClick={() => void finalizarMantenimientoProgramado()}
              >
                Finalizar mantenimiento y dejar operativo
              </button>
            </div>
          )}

          {mantenimientoSeleccionado.estado === "Finalizado" && (
            <>
              <div className="maintenance-duration">
                <small>TIEMPO EN MANTENIMIENTO PROGRAMADO</small>
                <strong>{formatearTiempoFueraServicio(mantenimientoSeleccionado.fechaInicio, mantenimientoSeleccionado.fechaFin)}</strong>
              </div>
              {mantenimientoSeleccionado.trabajoRealizado && (
                <div className="detail-block completed-work">
                  <h3>Trabajo realizado</h3>
                  <p>{mantenimientoSeleccionado.trabajoRealizado}</p>
                </div>
              )}
            </>
          )}
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

      {vista === "historial" && (
        <section className="equipment-selector">
          <button
            type="button"
            className="back-button"
            onClick={irAInicio}
          >
            ← Volver a inicio
          </button>

          <div className="selector-header">
            <p className="eyebrow eyebrow-dark">Historial técnico</p>
            <h2>Selecciona un equipo</h2>
            <p>
              Consulta todas las averías registradas y la secuencia de atención de cada técnico.
            </p>
          </div>

          <div className="equipment-grid">
            {equipos.map((equipo) => (
              <div key={equipo.numeroMina}>
                <EquipoCard
                  numeroMina={equipo.numeroMina}
                  numeroInterno={equipo.numeroInterno}
                  modelo={equipo.modelo}
                  estado={equipo.estado}
                  seleccionado={false}
                  onClick={() => seleccionarEquipoHistorial(equipo)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {vista === "historial-equipo" &&
        equipoHistorialSeleccionado && (
          <section className="section screen-section">
            <button
              type="button"
              className="back-button"
              onClick={abrirHistorial}
            >
              ← Volver a equipos
            </button>

            <div className="screen-header" style={{ marginTop: "14px" }}>
              <div>
                <p className="eyebrow eyebrow-dark">Historial del equipo</p>
                <h2>
                  {equipoHistorialSeleccionado.numeroMina} (
                  {equipoHistorialSeleccionado.numeroInterno})
                </h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  {equipoHistorialSeleccionado.modelo}
                </p>
              </div>

              <span className="count-badge">
                {
                  averias.filter(
                    (averia) =>
                      averia.equipo.numeroMina ===
                      equipoHistorialSeleccionado.numeroMina,
                  ).length
                }
              </span>
            </div>

            {averias.filter(
              (averia) =>
                averia.equipo.numeroMina ===
                equipoHistorialSeleccionado.numeroMina,
            ).length === 0 ? (
              <p className="empty-state">
                Este equipo todavía no tiene averías registradas.
              </p>
            ) : (
              <div className="open-faults">
                {averias
                  .filter(
                    (averia) =>
                      averia.equipo.numeroMina ===
                      equipoHistorialSeleccionado.numeroMina,
                  )
                  .map((averia) => (
                    <button
                      type="button"
                      className="fault-card fault-card-button"
                      key={averia.id}
                      onClick={() =>
                        abrirDetalleAveriaHistorial(averia.id)
                      }
                    >
                      <div className="fault-card-header">
                        <div>
                          <h3>Avería #{averia.id}</h3>
                          <p>{formatearFechaHoraChile(averia.fechaAviso)}</p>
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

                      {averia.estadoAveria === "Cerrada" &&
                        averia.fechaCierre && (
                          <div
                            className="maintenance-duration"
                            style={{ marginTop: "12px" }}
                          >
                            <small>TIEMPO FUERA DE SERVICIO</small>
                            <strong>
                              {formatearTiempoFueraServicio(
                                averia.fechaAviso,
                                averia.fechaCierre,
                              )}
                            </strong>
                          </div>
                        )}

                      <div className="fault-footer">
                        <span>
                          {averia.estadoAveria === "Cerrada"
                            ? `Operativo: ${formatearFechaHoraChile(
                                averia.fechaCierre,
                              )}`
                            : "Avería en curso"}
                        </span>
                        <span>Ver detalle →</span>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </section>
        )}

      {vista === "detalle-averia-historial" &&
        averiaSeleccionada && (
          <DetalleAveria
            averia={averiaSeleccionada}
            intervenciones={intervenciones.filter(
              (intervencion) =>
                intervencion.averiaId === averiaSeleccionada.id,
            )}
            puedeModificar={false}
            modoHistorial
            onVolver={volverDesdeDetalleHistorial}
            onTomar={tomarAveria}
            onRegistrarAvance={registrarAvanceAveria}
            onTomarContinuidad={tomarContinuidadAveria}
            onCerrar={cerrarAveria}
            onValidarPin={validarPinModificarAveria}
            onModificarAveria={modificarAveriaConPin}
          />
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
            intervenciones={intervenciones.filter(
              (intervencion) => intervencion.averiaId === averiaSeleccionada.id,
            )}
            puedeModificar={puedeModificar}
            onVolver={() => setVista("averias")}
            onTomar={tomarAveria}
            onRegistrarAvance={registrarAvanceAveria}
            onTomarContinuidad={tomarContinuidadAveria}
            onCerrar={cerrarAveria}
            onValidarPin={validarPinModificarAveria}
            onModificarAveria={modificarAveriaConPin}
          />
        )}

      {vista !== "seleccionar-equipo" &&
        vista !== "registrar-averia" &&
        vista !== "detalle-averia" &&
        vista !== "historial-equipo" &&
        vista !== "detalle-averia-historial" &&
        vista !== "informe-turno" &&
        vista !== "seleccionar-backup" &&
        vista !== "seleccionar-equipo-mantenimiento" &&
        vista !== "registrar-mantenimiento" &&
        vista !== "detalle-mantenimiento" &&
        vista !== "registrar-emergencia" &&
        vista !== "detalle-emergencia" && (
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

            <button
              type="button"
              className={
                vista === "historial"
                  ? "navigation-button navigation-button-active"
                  : "navigation-button"
              }
              onClick={abrirHistorial}
            >
              <span>◷</span>
              Historial
            </button>
          </nav>
        )}
    </main>
  );
}

export default App;
