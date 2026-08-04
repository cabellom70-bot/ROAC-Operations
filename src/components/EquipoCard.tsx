type EstadoEquipo =
  | "Operativo"
  | "Fuera de servicio"
  | "En atención";

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
  }
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

  if (onClick) {
    return (
      <button className={clases} type="button" onClick={onClick}>
        <strong>{numeroMina}</strong>
        <span>{numeroInterno}</span>
        <small>{modelo}</small>

        {mostrarEstado && (
          <small className="home-equipment-status">
            {estado}
          </small>
        )}
      </button>
    );
  }

  return (
    <article className={`${clases} home-equipment-card`}>
      <strong>{numeroMina}</strong>
      <span>{numeroInterno}</span>
      <small>{modelo}</small>

      {mostrarEstado && (
        <small className="home-equipment-status">
          {estado}
        </small>
      )}
    </article>
  );
}

export default EquipoCard;