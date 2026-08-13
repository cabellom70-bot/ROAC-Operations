import { useState } from "react";

import type { Equipo } from "../types/Equipo";
import type { SistemaAveria } from "../types/Averia";

export type DatosNuevaAveria = {
  sistema: SistemaAveria;
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

  const [ubicacion, setUbicacion] = useState("");
  const [detalleInicial, setDetalleInicial] = useState("");
  const [informadoPor, setInformadoPor] = useState("");

  function publicar() {
    if (informadoPor.trim() === "") {
      alert("Debes indicar quién informa la avería.");
      return;
    }

    onPublicar({
      sistema,
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

          <h2>{equipo.numeroMina}</h2>

          <p className="equipment-model">
            Interno {equipo.numeroInterno} · {equipo.modelo}
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

      <div className="automatic-data">
        <p>
          <span>Estado inicial</span>
          <strong>Fuera de servicio</strong>
        </p>

        <p>
          <span>Hora del aviso</span>
          <strong>{obtenerHoraActual()}</strong>
        </p>
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
          Descripción
          <span className="optional-label"> Opcional</span>
        </label>

        <textarea
          id="detalleInicial"
          value={detalleInicial}
          onChange={(evento) =>
            setDetalleInicial(evento.target.value)
          }
          placeholder="Ejemplo: no desarrolla potencia"
          rows={4}
        />
      </div>

      <div className="form-group">
        <label htmlFor="informadoPor">
          Quién informa la avería
          <span aria-hidden="true"> *</span>
        </label>

        <input
          id="informadoPor"
          className="form-input"
          value={informadoPor}
          onChange={(evento) =>
            setInformadoPor(evento.target.value)
          }
          placeholder="Nombre de quien informa la avería"
          required
          aria-required="true"
        />
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