import type { Equipo, EstadoEquipo } from "./Equipo";

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

export type EstadoAveria =
  | "Publicada"
  | "En atención"
  | "Cerrada";

export type Averia = {
  id: number;
  equipo: Equipo;
  sistema: SistemaAveria;
  estadoEquipo: EstadoEquipo;
  estadoAveria: EstadoAveria;
  ubicacion: string;
  detalleInicial: string;
  informadoPor: string;
  horaAviso: string;
  tomadaPor: string;
  horaAtencion: string;
  trabajoRealizado: string;
  horaCierre: string;
  fechaAviso: string;
  fechaAtencion: string;
  fechaCierre: string;
};