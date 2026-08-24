export type TipoIntervencionAveria =
  | "TOMA"
  | "AVANCE"
  | "CONTINUIDAD";

export type IntervencionAveria = {
  id: number;
  averiaId: number;
  tecnico: string;
  tipo: TipoIntervencionAveria;
  detalle: string;
  fecha: string;
  claveTurno: string;
};
