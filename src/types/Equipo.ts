export type EstadoEquipo =
  | "Operativo"
  | "Fuera de servicio"
  | "En atención";

export type Equipo = {
  numeroMina: string;
  numeroInterno: string;
  tipo: string;
  marca: string;
  modelo: string;
  estado: EstadoEquipo;
};