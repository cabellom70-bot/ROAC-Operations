import { supabase } from "./lib/supabase";
import { useEffect, useState } from "react";

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

  async function cargarEquipos() {
    const { data, error } = await supabase
      .from("equipos")
      .select("*")
      .order("numero_mina");

    if (error) {
      console.error(error);
      return;
    }

    setEquipos(
      data.map((e) => ({
        numeroMina: e.numero_mina,
        numeroInterno: e.numero_interno,
        tipo: e.tipo,
        marca: e.marca,
        modelo: e.modelo,
        estado: e.estado,
      }))
    );
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
    void Promise.all([
      cargarEquipos(),
      cargarAverias(),
      cargarBackup(),
    ]);
  }, []);

  useEffect(() => {
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
  }, []);

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

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand-area">
          <div className="roac-logo-placeholder">ROAC</div>

          <div>
            <p className="eyebrow">Turno actual</p>
            <h1>ROAC Operations</h1>
            <p>Noche · 20:00 a 08:00</p>
            <p>Responsable: Michael</p>
          </div>
        </div>

        <span className="shift-badge">Activo</span>
      </header>

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

            <button
              type="button"
              className="backup-button"
              onClick={() => setVista("seleccionar-backup")}
            >
              {equipoBackup ? "Cambiar backup" : "Asignar backup"}
            </button>
          </section>

          <button
            type="button"
            className="primary-button"
            onClick={comenzarRegistro}
          >
            + Publicar avería
          </button>

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

      {vista === "seleccionar-backup" && (
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

          <button
            type="button"
            className="primary-button fault-register-button"
            onClick={comenzarRegistro}
          >
            + Publicar otra avería
          </button>
        </section>
      )}

      {vista === "status" && (
        <section className="status-screen">
          <p className="eyebrow eyebrow-dark">
            Resumen del turno
          </p>

          <h2>Status turno noche</h2>

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

      {vista === "seleccionar-equipo" && (
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