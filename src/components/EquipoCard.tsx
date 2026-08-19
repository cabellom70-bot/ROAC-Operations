import type { EstadoEquipo } from "../types/Equipo";

type EquipoCardProps = {
  numeroMina: string;
  numeroInterno: string;
  modelo: string;
  estado: EstadoEquipo;
  seleccionado?: boolean;
  mostrarEstado?: boolean;
  onClick?: () => void;
};

function obtenerClaseEstado(estado: EstadoEquipo) {
  switch (estado) {
    case "Operativo":
      return "equipment-operational";

    case "En atención":
      return "equipment-in-service";

    case "Fuera de servicio":
      return "equipment-out-of-service";

    case "Mantenimiento programado":
      return "equipment-programmed-maintenance";
  }
}

function obtenerImagenEquipo(modelo: string) {
  if (modelo === "980E-4" || modelo === "980E-5") {
    return "/equipos/komatsu-980e.png";
  }

  if (modelo === "HD785-7") {
    return "/equipos/komatsu-hd785-aljibe.png";
  }

  if (modelo === "D475A-5E0") {
    return "/equipos/komatsu-d475.png";
  }

  if (modelo === "PC-7000" || modelo === "PC7000") {
    return "/equipos/komatsu-pc7000.png";
  }

  if (modelo === "18M") {
    return "/equipos/cat-18m.png";
  }

  return "";
}

function EquipoCard({
  numeroMina,
  numeroInterno,
  modelo,
  estado,
  seleccionado = false,
  mostrarEstado = false,
  onClick,
}: EquipoCardProps) {
  const clases = [
    "equipment-card",
    obtenerClaseEstado(estado),
    seleccionado ? "equipment-card-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const imagenEquipo = obtenerImagenEquipo(modelo);

  if (onClick) {
    return (
      <button
        className={clases}
        type="button"
        onClick={onClick}
      >
        <strong>{numeroMina}</strong>
        <span>{numeroInterno}</span>
        <small>{modelo}</small>

        {mostrarEstado && imagenEquipo && (
          <div className="equipment-image-frame">
            <img
              src={imagenEquipo}
              alt={`${modelo} ${numeroMina}`}
              className="equipment-machine-image"
            />
          </div>
        )}

        {mostrarEstado && (
          <small className="home-equipment-status">
            {estado}
          </small>
        )}

        <style>{`
          .equipment-image-frame {
            width: 100%;
            height: 58px;
            margin: 5px 0 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border-radius: 8px;
            background: transparent;
          }

          .equipment-machine-image {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
            object-position: center;
          }

          @media (min-width: 700px) {
            .equipment-image-frame {
              height: 72px;
              margin-top: 7px;
            }
          }
        `}</style>
      </button>
    );
  }

  return (
    <article
      className={`${clases} home-equipment-card`}
    >
      <strong>{numeroMina}</strong>
      <span>{numeroInterno}</span>
      <small>{modelo}</small>

      {mostrarEstado && imagenEquipo && (
        <div className="equipment-image-frame">
          <img
            src={imagenEquipo}
            alt={`${modelo} ${numeroMina}`}
            className="equipment-machine-image"
          />
        </div>
      )}

      {mostrarEstado && (
        <small className="home-equipment-status">
          {estado}
        </small>
      )}

      <style>{`
        .equipment-image-frame {
          width: 100%;
          height: 58px;
          margin: 5px 0 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 8px;
          background: transparent;
        }

        .equipment-machine-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
        }

        @media (min-width: 700px) {
          .equipment-image-frame {
            height: 72px;
            margin-top: 7px;
          }
        }
      `}</style>
    </article>
  );
}

export default EquipoCard;