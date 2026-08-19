import type { Equipo } from "./Equipo";

export type EstadoMantenimiento =
  | "En curso"
  | "Finalizado";

export type Mantenimiento = {
  id: number;
  equipo: Equipo;

  motivo: string;
  responsable: string;
  trabajoRealizado: string;

  estado: EstadoMantenimiento;

  fechaInicio: string;
  fechaFin: string;

  horaInicio: string;
  horaFin: string;
};