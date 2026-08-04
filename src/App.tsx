import { useState } from "react";
import "./App.css";

import EquipoCard from "./components/EquipoCard";
import { equiposIniciales } from "./data/equipos";

import RegistrarAveria, {
  type DatosNuevaAveria,
  type SistemaAveria,
} from "./pages/RegistrarAveria";

import type {
  Equipo,
  EstadoEquipo,
} from "./types/Equipo";

type Vista =
  | "inicio"
  | "averias"
  | "status"
  | "seleccionar-equipo"
  | "registrar-averia";

type Averia = {
  id: number;
  equipo: Equipo;
  sistema: SistemaAveria;
  estadoEquipo: EstadoEquipo;
  ubicacion: string;
  detalleInicial: string;
  informadoPor: string;
  horaAviso: string;
};

function obtenerHoraActual() {
  return new Date().toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function App() {
  const [vista, setVista] = useState<Vista>("inicio");

  const [equipos, setEquipos] =
    useState<Equipo[]>(equiposIniciales);

  const [averias, setAverias] =
    useState<Averia[]>([]);

  const [equipoSeleccionado, setEquipoSeleccionado] =
    useState<Equipo | null>(null);

  const equiposOperativos = equipos.filter(
    (equipo) => equipo.estado === "Operativo",
  ).length;

  const equiposEnAtencion = equipos.filter(
    (equipo) => equipo.estado === "En atención",
  ).length;

  const equiposFueraServicio = equipos.filter(
    (equipo) =>
      equipo.estado === "Fuera de servicio",
  ).length;

  function irAInicio() {
    setEquipoSeleccionado(null);
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
    if (!equipoSeleccionado) {
      return;
    }

    setVista("registrar-averia");
  }

  function publicarAveria(datos: DatosNuevaAveria) {
    if (!equipoSeleccionado) {
      return;
    }

    const equipoActualizado: Equipo = {
      ...equipoSeleccionado,
      estado: datos.estadoEquipo,
    };

    const nuevaAveria: Averia = {
      id: Date.now(),
      equipo: equipoActualizado,
      sistema: datos.sistema,
      estadoEquipo: datos.estadoEquipo,
      ubicacion: datos.ubicacion,
      detalleInicial: datos.detalleInicial,
      informadoPor: datos.informadoPor,
      horaAviso: obtenerHoraActual(),
    };

    setAverias((anteriores) => [
      nuevaAveria,
      ...anteriores,
    ]);

    setEquipos((anteriores) =>
      anteriores.map((equipo) =>
        equipo.numeroMina ===
        equipoSeleccionado.numeroMina
          ? equipoActualizado
          : equipo,
      ),
    );

    setEquipoSeleccionado(null);
    setVista("averias");
  }

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand-area">
          <div className="roac-logo-placeholder">
            ROAC
          </div>

          <div>
            <p className="eyebrow">Turno actual</p>

            <h1>ROAC Operations</h1>

            <p>Noche · 20:00 a 08:00</p>

            <p>Responsable: Michael</p>
          </div>
        </div>

        <span className="shift-badge">
          Activo
        </span>
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

            <div className="equipment-grid home-equipment-grid">
              {equipos.map((equipo) => (
                <EquipoCard
                  key={equipo.numeroMina}
                  numeroMina={equipo.numeroMina}
                  numeroInterno={equipo.numeroInterno}
                  modelo={equipo.modelo}
                  estado={equipo.estado}
                  mostrarEstado
                />
              ))}
            </div>
          </section>
        </>
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
              {averias.length}
            </span>
          </div>

          {averias.length === 0 ? (
            <p className="empty-state">
              No existen averías abiertas.
            </p>
          ) : (
            <div className="open-faults">
              {averias.map((averia) => (
                <article
                  className="fault-card"
                  key={averia.id}
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
                      {averia.estadoEquipo}
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
                    <span>
                      Aviso: {averia.horaAviso}
                    </span>

                    <span>
                      Informó: {averia.informadoPor}
                    </span>
                  </div>
                </article>
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
              <span>Equipos operativos</span>
              <strong>{equiposOperativos}</strong>
            </p>

            <p>
              <span>Equipos en atención</span>
              <strong>{equiposEnAtencion}</strong>
            </p>

            <p>
              <span>Equipos fuera de servicio</span>
              <strong>{equiposFueraServicio}</strong>
            </p>

            <p>
              <span>Averías abiertas</span>
              <strong>{averias.length}</strong>
            </p>
          </div>
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
            {equipos.map((equipo) => (
              <EquipoCard
                key={equipo.numeroMina}
                numeroMina={equipo.numeroMina}
                numeroInterno={equipo.numeroInterno}
                modelo={equipo.modelo}
                estado={equipo.estado}
                seleccionado={
                  equipoSeleccionado?.numeroMina ===
                  equipo.numeroMina
                }
                onClick={() =>
                  setEquipoSeleccionado(equipo)
                }
              />
            ))}
          </div>

          {equipoSeleccionado && (
            <div className="selected-equipment">
              <p className="eyebrow">
                Equipo seleccionado
              </p>

              <h3>
                {equipoSeleccionado.numeroMina}
              </h3>

              <p>
                Interno:{" "}
                <strong>
                  {equipoSeleccionado.numeroInterno}
                </strong>
              </p>

              <p>
                Modelo:{" "}
                <strong>
                  {equipoSeleccionado.modelo}
                </strong>
              </p>

              <p>
                Estado actual:{" "}
                <strong>
                  {equipoSeleccionado.estado}
                </strong>
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
            onVolver={() =>
              setVista("seleccionar-equipo")
            }
            onCancelar={cancelarRegistro}
            onPublicar={publicarAveria}
          />
        )}

      {vista !== "seleccionar-equipo" &&
        vista !== "registrar-averia" && (
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