export type EstadoEquipo =
  | "Operativo"
  | "Fuera de servicio"
  | "En atención"
  | "Mantenimiento programado";

export type Equipo = {
  numeroMina: string;
  numeroInterno: string;
  tipo: string;
  marca: string;
  modelo: string;
  estado: EstadoEquipo;
};