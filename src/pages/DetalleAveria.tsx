import { useState } from "react";

import type {
  Averia,
} from "../types/Averia";

type DetalleAveriaProps = {
  averia: Averia;
  onVolver: () => void;
  onTomar: (responsable: string) => void;
  onCerrar: (trabajoRealizado: string) => void;
};

function DetalleAveria({
  averia,
  onVolver,
  onTomar,
  onCerrar,
}: DetalleAveriaProps) {
  const [responsable, setResponsable] =
  useState("");

  const [trabajoRealizado, setTrabajoRealizado] =
    useState("");

  function tomarAveria() {
    if (responsable.trim() === "") {
      alert("Indica quién atenderá la avería.");
      return;
    }

    onTomar(responsable.trim());
  }

  function cerrarAveria() {
    if (trabajoRealizado.trim() === "") {
      alert("Escribe el trabajo realizado.");
      return;
    }

    onCerrar(trabajoRealizado.trim());
  }

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
          <strong>
            {averia.ubicacion || "No informada"}
          </strong>
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

      {averia.estadoAveria === "Publicada" && (
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
              <span>Atendida por</span>
              <strong>{averia.tomadaPor}</strong>
            </p>

            <p>
              <span>Inicio atención</span>
              <strong>{averia.horaAtencion}</strong>
            </p>
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

      {averia.estadoAveria === "Cerrada" && (
        <>
          <div className="detail-information attention-information">
            <p>
              <span>Atendida por</span>
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