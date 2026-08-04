import "./App.css";

type Evento = {
  id: number;
  equipoMina: string;
  numeroInterno: string;
  categoria: string;
  descripcion: string;
  horaIngreso: string;
  estado: "Fuera de servicio" | "En atención";
};

const eventosIniciales: Evento[] = [
  {
    id: 1,
    equipoMina: "072",
    numeroInterno: "20197",
    categoria: "Avería mecánica",
    descripcion: "Problema cierre puerta operador",
    horaIngreso: "01:20",
    estado: "Fuera de servicio",
  },
  {
    id: 2,
    equipoMina: "053",
    numeroInterno: "20116",
    categoria: "Código motor",
    descripcion: "Chequeo de código activo",
    horaIngreso: "02:15",
    estado: "En atención",
  },
];

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Turno actual</p>
          <h1>TurnoMinero</h1>
          <p>Noche · 20:00 a 08:00</p>
          <p>Responsable: Michael</p>
        </div>

        <span className="turno-badge">Activo</span>
      </header>

      <button className="primary-button">+ Crear evento</button>

      <section className="section">
        <div className="section-title">
          <h2>Eventos abiertos</h2>
          <span>{eventosIniciales.length}</span>
        </div>

        <div className="event-list">
          {eventosIniciales.map((evento) => (
            <article className="event-card" key={evento.id}>
              <div className="event-card__top">
                <div>
                  <h3>
                    {evento.equipoMina} ({evento.numeroInterno})
                  </h3>
                  <p>{evento.categoria}</p>
                </div>

                <span
                  className={
                    evento.estado === "Fuera de servicio"
                      ? "status status-red"
                      : "status status-yellow"
                  }
                >
                  {evento.estado}
                </span>
              </div>

              <p className="event-description">{evento.descripcion}</p>
              <p className="event-time">Desde las {evento.horaIngreso}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Actividad reciente</h2>

        <div className="activity-list">
          <p>02:15 · Evento creado en 053</p>
          <p>01:48 · 099 quedó operativo</p>
          <p>01:20 · Evento creado en 072</p>
        </div>
      </section>

      <button className="secondary-button">Generar status</button>
    </main>
  );
}

export default App;