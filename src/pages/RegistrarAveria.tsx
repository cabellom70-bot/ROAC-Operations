import { useState } from "react";
import type { Equipo, EstadoEquipo } from "../types/Equipo";

export type SistemaAveria =
  | "Motor"
  | "Eléctrico"
  | "Mecánico"
  | "Hidráulico"
  | "Dirección"
  | "Frenos"
  | "Suspensión"
  | "Neumáticos"
  | "Lubricación"
  | "Cabina"
  | "Estructural"
  | "Operacional"
  | "Otro";

export type DatosNuevaAveria = {
  sistema: SistemaAveria;
  estadoEquipo: EstadoEquipo;
  ubicacion: string;
  detalleInicial: string;
  informadoPor: string;
};

type RegistrarAveriaProps = {
  equipo: Equipo;
  onVolver: () => void;
  onCancelar: () => void;
  onPublicar: (datos: DatosNuevaAveria) => void;
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
  "Otro",
];

const estadosDisponibles: EstadoEquipo[] = [
  "Fuera de servicio",
  "En atención",
  "Operativo",
];

function obtenerHoraActual() {
  return new Date().toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function RegistrarAveria({
  equipo,
  onVolver,
  onCancelar,
  onPublicar,
}: RegistrarAveriaProps) {
  const [sistema, setSistema] =
    useState<SistemaAveria>("Motor");

  const [estadoEquipo, setEstadoEquipo] =
    useState<EstadoEquipo>("Fuera de servicio");

  const [ubicacion, setUbicacion] = useState("");
  const [detalleInicial, setDetalleInicial] = useState("");
  const [informadoPor, setInformadoPor] = useState("John");

  function publicar() {
    if (informadoPor.trim() === "") {
      alert("Indica quién informó la avería.");
      return;
    }

    onPublicar({
      sistema,
      estadoEquipo,
      ubicacion: ubicacion.trim(),
      detalleInicial: detalleInicial.trim(),
      informadoPor: informadoPor.trim(),
    });
  }

  return (
    <section className="fault-form">
      <div className="form-header">
        <div>
          <p className="eyebrow eyebrow-dark">
            Publicar avería
          </p>

          <h2>
            {equipo.numeroMina} ({equipo.numeroInterno})
          </h2>

          <p className="equipment-model">
            {equipo.tipo} · {equipo.modelo}
          </p>
        </div>

        <button
          type="button"
          className="close-button"
          onClick={onCancelar}
          aria-label="Cancelar registro"
        >
          ×
        </button>
      </div>

      <button
        type="button"
        className="back-button"
        onClick={onVolver}
      >
        ← Cambiar equipo
      </button>

      <div className="form-group">
        <label>Estado inicial del equipo</label>

        <div className="fault-type-grid">
          {estadosDisponibles.map((estado) => (
            <button
              type="button"
              className={
                estadoEquipo === estado
                  ? "fault-type-button fault-type-button-selected"
                  : "fault-type-button"
              }
              key={estado}
              onClick={() => setEstadoEquipo(estado)}
            >
              {estado}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Sistema afectado</label>

        <div className="fault-type-grid">
          {sistemas.map((opcion) => (
            <button
              type="button"
              className={
                sistema === opcion
                  ? "fault-type-button fault-type-button-selected"
                  : "fault-type-button"
              }
              key={opcion}
              onClick={() => setSistema(opcion)}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="ubicacion">
          Ubicación
          <span className="optional-label"> Opcional</span>
        </label>

        <input
          id="ubicacion"
          className="form-input"
          value={ubicacion}
          onChange={(evento) =>
            setUbicacion(evento.target.value)
          }
          placeholder="Ejemplo: Parqueo San Lorenzo"
        />
      </div>

      <div className="form-group">
        <label htmlFor="detalleInicial">
          Detalle inicial
          <span className="optional-label"> Opcional</span>
        </label>

        <textarea
          id="detalleInicial"
          value={detalleInicial}
          onChange={(evento) =>
            setDetalleInicial(evento.target.value)
          }
          placeholder="Ejemplo: código motor activo o pérdida de potencia"
          rows={4}
        />
      </div>

      <div className="form-group">
        <label htmlFor="informadoPor">
          Informado por
        </label>

        <input
          id="informadoPor"
          className="form-input"
          value={informadoPor}
          onChange={(evento) =>
            setInformadoPor(evento.target.value)
          }
          placeholder="Ejemplo: John"
        />
      </div>

      <div className="automatic-data">
        <p>
          <span>Hora del aviso</span>
          <strong>{obtenerHoraActual()}</strong>
        </p>

        <p>
          <span>Equipo</span>
          <strong>
            {equipo.numeroMina} ({equipo.numeroInterno})
          </strong>
        </p>

        <p>
          <span>Modelo</span>
          <strong>{equipo.modelo}</strong>
        </p>
      </div>

      <button
        type="button"
        className="save-fault-button"
        onClick={publicar}
      >
        Publicar avería
      </button>
    </section>
  );
}

export default RegistrarAveria;