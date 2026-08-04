# AGENTS.md

## Proyecto

TurnoMinero

## Objetivo

Construir una aplicación móvil para registrar, gestionar y cerrar eventos operacionales de equipos mineros durante un turno.

La aplicación debe reemplazar el flujo actual basado en WhatsApp + Excel.

---

# Filosofía del proyecto

La aplicación debe adaptarse a la operación.

Nunca la operación deberá adaptarse a la aplicación.

---

# Principios

## 1.

El equipo es la entidad principal.

Los eventos pertenecen a un equipo.

Nunca al revés.

---

## 2.

El usuario nunca debe escribir información que el sistema ya conoce.

Ejemplo:

Al seleccionar el equipo deben completarse automáticamente:

- Tipo
- Modelo
- Marca
- Número interno
- Estado
- Historial del turno

---

## 3.

La aplicación debe ser Mobile First.

Todo debe pensarse para utilizarse desde un teléfono.

Preferentemente con una sola mano.

---

## 4.

Cada pantalla debe minimizar la cantidad de toques necesarios.

---

## 5.

Todo evento debe tener trazabilidad completa.

Debe conocerse:

- quién lo creó
- quién lo tomó
- quién lo cerró
- cuándo ocurrió cada acción

---

## 6.

Los informes nunca deben escribirse manualmente.

Siempre deben generarse desde la información registrada.

---

## 7.

No agregar funciones por moda.

Cada función debe resolver un problema real de la operación.

---

# Arquitectura

Usar:

- React
- TypeScript
- Vite
- PWA

Mantener una arquitectura modular.

Separar claramente:

- UI
- lógica
- servicios
- almacenamiento
- dominio

---

# Regla principal

Siempre priorizar simplicidad.

Es mejor una aplicación pequeña que funcione perfectamente,

que una aplicación enorme llena de funciones poco utilizadas.