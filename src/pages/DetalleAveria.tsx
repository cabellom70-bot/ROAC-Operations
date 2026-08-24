import { useState } from "react";

import type { Averia } from "../types/Averia";
import type { IntervencionAveria } from "../types/IntervencionAveria";

type DetalleAveriaProps = {
  averia: Averia;
  intervenciones: IntervencionAveria[];
  puedeModificar: boolean;
  onVolver: () => void;
  onTomar: (responsable: string) => void | Promise<void>;
  onRegistrarAvance: (
    tecnico: string,
    detalle: string,
  ) => void | Promise<void>;
  onTomarContinuidad: (
    tecnico: string,
  ) => void | Promise<void>;
  onCerrar: (trabajoRealizado: string) => void | Promise<void>;
};

function formatearFechaHora(fechaIso: string) {
  if (!fechaIso) {
    return "";
  }

  const fecha = new Date(fechaIso);

  if (Number.isNaN(fecha.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
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

function etiquetaTipo(tipo: IntervencionAveria["tipo"]) {
  if (tipo === "TOMA") {
    return "Toma de avería";
  }

  if (tipo === "CONTINUIDAD") {
    return "Continuidad de turno";
  }

  return "Avance";
}

function DetalleAveria({
  averia,
  intervenciones,
  puedeModificar,
  onVolver,
  onTomar,
  onRegistrarAvance,
  onTomarContinuidad,
  onCerrar,
}: DetalleAveriaProps) {
  const [responsable, setResponsable] = useState("");
  const [trabajoRealizado, setTrabajoRealizado] = useState("");
  const [avance, setAvance] = useState("");
  const [nuevoTecnico, setNuevoTecnico] = useState("");
  const [guardandoAvance, setGuardandoAvance] = useState(false);
  const [tomandoContinuidad, setTomandoContinuidad] = useState(false);

  function tomarAveria() {
    if (responsable.trim() === "") {
      alert("Indica quién atenderá la avería.");
      return;
    }

    void onTomar(responsable.trim());
  }

  function cerrarAveria() {
    if (trabajoRealizado.trim() === "") {
      alert("Escribe el trabajo realizado.");
      return;
    }

    void onCerrar(trabajoRealizado.trim());
  }

  async function registrarAvance() {
    const texto = avance.trim();

    if (!texto) {
      alert("Escribe el avance realizado.");
      return;
    }

    if (!averia.tomadaPor) {
      alert("No hay un técnico activo asignado.");
      return;
    }

    try {
      setGuardandoAvance(true);
      await onRegistrarAvance(averia.tomadaPor, texto);
      setAvance("");
    } finally {
      setGuardandoAvance(false);
    }
  }

  async function tomarContinuidad() {
    const tecnico = nuevoTecnico.trim();

    if (!tecnico) {
      alert("Indica el técnico que continuará la atención.");
      return;
    }

    try {
      setTomandoContinuidad(true);
      await onTomarContinuidad(tecnico);
      setNuevoTecnico("");
    } finally {
      setTomandoContinuidad(false);
    }
  }

  const mostrarHistorial =
    intervenciones.length > 0 &&
    (averia.estadoAveria === "En atención" ||
      averia.estadoAveria === "Cerrada");

  return (
    <section className="fault-detail">
      <button
        type="button"
        className="back-button"
        onClick={onVolver}
      >
        ← Volver a averías
      </button>

      <div className="detail-header">
        <div>
          <p className="eyebrow eyebrow-dark">
            Detalle de avería
          </p>

          <h2>
            {averia.equipo.numeroMina} (
            {averia.equipo.numeroInterno})
          </h2>
          <p>{averia.equipo.modelo}</p>
        </div>

        <span
          className={`fault-state fault-state-${averia.estadoAveria
            .toLowerCase()
            .replaceAll(" ", "-")}`}
        >
          {averia.estadoAveria}
        </span>
      </div>

      <div className="detail-information">
        <p>
          <span>Estado del equipo</span>
          <strong>{averia.estadoEquipo}</strong>
        </p>
        <p>
          <span>Sistema</span>
          <strong>{averia.sistema}</strong>
        </p>

        <p>
          <span>Ubicación</span>
          <strong>{averia.ubicacion || "No informada"}</strong>
        </p>

        <p>
          <span>Informó</span>
          <strong>{averia.informadoPor}</strong>
        </p>

        <p>
          <span>Hora del aviso</span>
          <strong>{averia.horaAviso}</strong>
        </p>
      </div>

      {averia.detalleInicial && (
        <div className="detail-block">
          <h3>Detalle inicial</h3>
          <p>{averia.detalleInicial}</p>
        </div>
      )}

      {averia.estadoAveria === "Publicada" && puedeModificar && (
        <div className="attention-panel">
          <h3>Tomar avería</h3>

          <label htmlFor="responsableAtencion">
            Técnico que toma la avería *
          </label>
          <input
            id="responsableAtencion"
            className="form-input"
            value={responsable}
            onChange={(evento) =>
              setResponsable(evento.target.value)
            }
            placeholder="Nombre y apellido"
            required
          />

          <button
            type="button"
            className="take-fault-button"
            onClick={tomarAveria}
          >
            Tomar avería
          </button>
        </div>
      )}

      {averia.estadoAveria === "En atención" && (
        <>
          <div className="detail-information attention-information">
            <p>
              <span>Técnico actual</span>
              <strong>{averia.tomadaPor}</strong>
            </p>

            <p>
              <span>Inicio atención</span>
              <strong>{averia.horaAtencion}</strong>
            </p>
          </div>

          {mostrarHistorial && (
            <div
              className="detail-block"
              style={{
                borderLeft: "4px solid #2563eb",
                background: "#f7faff",
              }}
            >
              <h3>Historial de atención</h3>

              <div style={{ display: "grid", gap: "10px" }}>
                {intervenciones.map((intervencion) => (
                  <div
                    key={intervencion.id}
                    style={{
                      padding: "11px 12px",
                      borderRadius: "12px",
                      border: "1px solid #d7e3f4",
                      background: "#ffffff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "flex-start",
                      }}
                    >
                      <strong>{intervencion.tecnico}</strong>
                      <small>
                        {formatearFechaHora(intervencion.fecha)}
                      </small>
                    </div>

                    <small
                      style={{
                        display: "block",
                        marginTop: "4px",
                        fontWeight: 800,
                        color: "#365d91",
                        textTransform: "uppercase",
                      }}
                    >
                      {etiquetaTipo(intervencion.tipo)}
                    </small>

                    {intervencion.detalle && (
                      <p style={{ margin: "7px 0 0" }}>
                        {intervencion.detalle}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {puedeModificar && (
            <>
              <div className="attention-panel">
                <h3>Registrar avance</h3>
                <p style={{ marginTop: 0 }}>
                  Deja registrado lo realizado aunque la avería
                  continúe pendiente.
                </p>

                <textarea
                  value={avance}
                  onChange={(evento) =>
                    setAvance(evento.target.value)
                  }
                  placeholder="Ejemplo: se cambió sensor de presión de aceite de motor, pero la falla continúa."
                  rows={4}
                />

                <button
                  type="button"
                  className="take-fault-button"
                  disabled={guardandoAvance}
                  onClick={() => void registrarAvance()}
                >
                  {guardandoAvance
                    ? "Guardando..."
                    : "Guardar avance"}
                </button>
              </div>

              <div className="attention-panel">
                <h3>Continuidad de atención</h3>
                <p style={{ marginTop: 0 }}>
                  Si cambia el turno o el técnico, registra quién
                  continuará con la misma avería.
                </p>

                <label htmlFor="nuevoTecnicoContinuidad">
                  Nuevo técnico en atención *
                </label>
                <input
                  id="nuevoTecnicoContinuidad"
                  className="form-input"
                  value={nuevoTecnico}
                  onChange={(evento) =>
                    setNuevoTecnico(evento.target.value)
                  }
                  placeholder="Nombre y apellido"
                />

                <button
                  type="button"
                  className="take-fault-button"
                  disabled={tomandoContinuidad}
                  onClick={() => void tomarContinuidad()}
                >
                  {tomandoContinuidad
                    ? "Registrando..."
                    : "Tomar continuidad"}
                </button>
              </div>

              <div className="attention-panel">
                <h3>Cerrar avería</h3>
                <label htmlFor="trabajoRealizado">
                  Trabajo realizado
                </label>

                <textarea
                  id="trabajoRealizado"
                  value={trabajoRealizado}
                  onChange={(evento) =>
                    setTrabajoRealizado(evento.target.value)
                  }
                  placeholder="Ejemplo: se reemplazó sensor y se realizaron pruebas"
                  rows={5}
                />
                <button
                  type="button"
                  className="close-fault-button"
                  onClick={cerrarAveria}
                >
                  Cerrar avería y dejar operativo
                </button>
              </div>
            </>
          )}
        </>
      )}

      {averia.estadoAveria === "Cerrada" && (
        <>
          <div className="detail-information attention-information">
            <p>
              <span>Último técnico</span>
              <strong>{averia.tomadaPor}</strong>
            </p>
            <p>
              <span>Inicio atención</span>
              <strong>{averia.horaAtencion}</strong>
            </p>

            <p>
              <span>Hora de cierre</span>
              <strong>{averia.horaCierre}</strong>
            </p>
          </div>

          {mostrarHistorial && (
            <div
              className="detail-block"
              style={{
                borderLeft: "4px solid #2563eb",
                background: "#f7faff",
              }}
            >
              <h3>Historial de atención</h3>

              <div style={{ display: "grid", gap: "10px" }}>
                {intervenciones.map((intervencion) => (
                  <div
                    key={intervencion.id}
                    style={{
                      padding: "11px 12px",
                      borderRadius: "12px",
                      border: "1px solid #d7e3f4",
                      background: "#ffffff",
                    }}
                  >
                    <strong>{intervencion.tecnico}</strong>
                    <small style={{ display: "block", marginTop: "3px" }}>
                      {etiquetaTipo(intervencion.tipo)} ·{" "}
                      {formatearFechaHora(intervencion.fecha)}
                    </small>
                    {intervencion.detalle && (
                      <p style={{ margin: "7px 0 0" }}>
                        {intervencion.detalle}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="detail-block completed-work">
            <h3>Trabajo realizado</h3>
            <p>{averia.trabajoRealizado}</p>
          </div>
        </>
      )}
    </section>
  );
}

export default DetalleAveria;
