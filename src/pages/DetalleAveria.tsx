import { useState } from "react";

import type { Averia, SistemaAveria } from "../types/Averia";
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
  onValidarPin: (pin: string) => Promise<boolean>;
  onModificarAveria: (datos: {
    pin: string;
    sistema: SistemaAveria;
    ubicacion: string;
    detalleInicial: string;
    informadoPor: string;
    fechaAviso: string;
    horaAviso: string;
  }) => Promise<void>;
};

const sistemas: SistemaAveria[] = [
  "Motor",
  "Eléctrico",
  "Mecánico",
  "Hidráulico",
  "Dirección",
  "Frenos",
  "Suspensión",
  "Neumáticos",
  "Lubricación",
  "Cabina",
  "Estructural",
  "Operacional",
  "Aire acondicionado",
  "Elementos de desgaste",
  "Cambio de componente mayor",
  "Espera de repuesto",
  "Otro",
];

function obtenerFechaHoraChileParaFormulario(fechaIso: string) {
  const fecha = new Date(fechaIso);

  if (Number.isNaN(fecha.getTime())) {
    return { fecha: "", hora: "" };
  }

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);

  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return {
    fecha: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: `${valor("hour")}:${valor("minute")}`,
  };
}

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
  onValidarPin,
  onModificarAveria,
}: DetalleAveriaProps) {
  const [responsable, setResponsable] = useState("");
  const [trabajoRealizado, setTrabajoRealizado] = useState("");
  const [avance, setAvance] = useState("");
  const [nuevoTecnico, setNuevoTecnico] = useState("");
  const [guardandoAvance, setGuardandoAvance] = useState(false);
  const [tomandoContinuidad, setTomandoContinuidad] = useState(false);
  const [mostrarPin, setMostrarPin] = useState(false);
  const [pin, setPin] = useState("");
  const [validandoPin, setValidandoPin] = useState(false);
  const [edicionAutorizada, setEdicionAutorizada] = useState(false);
  const [pinAutorizado, setPinAutorizado] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [sistemaEditado, setSistemaEditado] = useState<SistemaAveria>(averia.sistema);
  const [ubicacionEditada, setUbicacionEditada] = useState(averia.ubicacion);
  const [detalleEditado, setDetalleEditado] = useState(averia.detalleInicial);
  const [informadoPorEditado, setInformadoPorEditado] = useState(averia.informadoPor);
  const fechaHoraInicial = obtenerFechaHoraChileParaFormulario(averia.fechaAviso);
  const [fechaAvisoEditada, setFechaAvisoEditada] = useState(fechaHoraInicial.fecha);
  const [horaAvisoEditada, setHoraAvisoEditada] = useState(fechaHoraInicial.hora);

  function cancelarEdicion() {
    setMostrarPin(false);
    setPin("");
    setEdicionAutorizada(false);
    setPinAutorizado("");
  }

  async function validarPinEdicion() {
    if (!/^\d{4}$/.test(pin)) {
      alert("El PIN debe contener exactamente 4 dígitos.");
      return;
    }

    try {
      setValidandoPin(true);
      const valido = await onValidarPin(pin);

      if (!valido) {
        alert("PIN incorrecto.");
        setPin("");
        return;
      }

      const fechaHora = obtenerFechaHoraChileParaFormulario(averia.fechaAviso);
      setSistemaEditado(averia.sistema);
      setUbicacionEditada(averia.ubicacion);
      setDetalleEditado(averia.detalleInicial);
      setInformadoPorEditado(averia.informadoPor);
      setFechaAvisoEditada(fechaHora.fecha);
      setHoraAvisoEditada(fechaHora.hora);
      setPinAutorizado(pin);
      setPin("");
      setMostrarPin(false);
      setEdicionAutorizada(true);
    } catch (error) {
      console.error("Error al validar PIN:", error);
      alert("No se pudo validar el PIN. Intenta nuevamente.");
    } finally {
      setValidandoPin(false);
    }
  }

  async function guardarModificacion() {
    if (!pinAutorizado) {
      alert("La autorización de edición ya no está disponible. Ingresa nuevamente el PIN.");
      cancelarEdicion();
      return;
    }

    if (!informadoPorEditado.trim()) {
      alert("Debes indicar quién informó la avería.");
      return;
    }

    if (!fechaAvisoEditada || !horaAvisoEditada) {
      alert("Debes indicar la fecha y hora del aviso.");
      return;
    }

    const confirmar = window.confirm(
      `¿Confirmas la modificación de la avería #${averia.id}?

La corrección quedará registrada en la auditoría.`,
    );

    if (!confirmar) {
      return;
    }

    try {
      setGuardandoEdicion(true);
      await onModificarAveria({
        pin: pinAutorizado,
        sistema: sistemaEditado,
        ubicacion: ubicacionEditada.trim(),
        detalleInicial: detalleEditado.trim(),
        informadoPor: informadoPorEditado.trim(),
        fechaAviso: fechaAvisoEditada,
        horaAviso: horaAvisoEditada,
      });
      alert(`Avería #${averia.id} modificada correctamente.`);
      cancelarEdicion();
    } catch (error) {
      console.error("Error al modificar avería:", error);
      alert("No se pudo guardar la modificación. Los datos originales se mantienen.");
    } finally {
      setGuardandoEdicion(false);
    }
  }

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

      {puedeModificar && !edicionAutorizada && (
        <div
          className="detail-block"
          style={{
            borderLeft: "4px solid #d97706",
            background: "#fffaf0",
          }}
        >
          <h3>Modificar datos de avería 🔒</h3>
          <p style={{ marginTop: 0 }}>
            Permite corregir los datos iniciales sin alterar el flujo de atención ni cierre.
          </p>

          {!mostrarPin ? (
            <button
              type="button"
              className="take-fault-button"
              onClick={() => setMostrarPin(true)}
            >
              Modificar avería
            </button>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              <label htmlFor="pinModificarAveria">PIN de 4 dígitos</label>
              <input
                id="pinModificarAveria"
                className="form-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(evento) =>
                  setPin(evento.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="••••"
              />

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="take-fault-button"
                  disabled={validandoPin}
                  onClick={() => void validarPinEdicion()}
                >
                  {validandoPin ? "Validando..." : "Validar PIN"}
                </button>
                <button
                  type="button"
                  className="back-button"
                  disabled={validandoPin}
                  onClick={() => {
                    setMostrarPin(false);
                    setPin("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {puedeModificar && edicionAutorizada && (
        <div
          className="detail-block"
          style={{
            borderLeft: "4px solid #d97706",
            background: "#fffaf0",
          }}
        >
          <h3>Editar datos iniciales</h3>
          <p style={{ marginTop: 0 }}>
            PIN validado. Corrige únicamente los datos necesarios. La modificación quedará registrada en auditoría.
          </p>

          <div className="form-group">
            <label htmlFor="sistemaEditado">Sistema afectado</label>
            <select
              id="sistemaEditado"
              className="form-input"
              value={sistemaEditado}
              onChange={(evento) =>
                setSistemaEditado(evento.target.value as SistemaAveria)
              }
            >
              {sistemas.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="ubicacionEditada">Ubicación</label>
            <input
              id="ubicacionEditada"
              className="form-input"
              value={ubicacionEditada}
              onChange={(evento) => setUbicacionEditada(evento.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="detalleEditado">Descripción inicial</label>
            <textarea
              id="detalleEditado"
              value={detalleEditado}
              onChange={(evento) => setDetalleEditado(evento.target.value)}
              rows={4}
            />
          </div>

          <div className="form-group">
            <label htmlFor="informadoPorEditado">Quién informa</label>
            <input
              id="informadoPorEditado"
              className="form-input"
              value={informadoPorEditado}
              onChange={(evento) => setInformadoPorEditado(evento.target.value)}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "10px",
            }}
          >
            <div className="form-group">
              <label htmlFor="fechaAvisoEditada">Fecha del aviso</label>
              <input
                id="fechaAvisoEditada"
                className="form-input"
                type="date"
                value={fechaAvisoEditada}
                onChange={(evento) => setFechaAvisoEditada(evento.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="horaAvisoEditada">Hora del aviso</label>
              <input
                id="horaAvisoEditada"
                className="form-input"
                type="time"
                value={horaAvisoEditada}
                onChange={(evento) => setHoraAvisoEditada(evento.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="save-fault-button"
            disabled={guardandoEdicion}
            onClick={() => void guardarModificacion()}
          >
            {guardandoEdicion ? "Guardando..." : "Guardar modificación"}
          </button>

          <button
            type="button"
            className="back-button"
            onClick={cancelarEdicion}
          >
            Cancelar modificación
          </button>
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
