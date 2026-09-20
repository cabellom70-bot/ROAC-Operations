self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let datos = {};

      try {
        datos = event.data ? event.data.json() : {};
      } catch {
        datos = {
          title: "ROAC Operations",
          body: event.data
            ? event.data.text()
            : "Nuevo evento operacional",
        };
      }

      // Una ventana visible no confirma la recepción de Realtime.
      // Mostrar el push evita perder el aviso cuando el canal está desconectado.
      const titulo =
        datos.title || "ROAC Operations";

      const opciones = {
        body:
          datos.body ||
          "Nuevo evento operacional",
        icon:
          datos.icon || "/roac-logo.png",
        badge:
          datos.badge || "/roac-logo.png",
        tag:
          datos.tag ||
          ["roac", datos.tipo || "evento", datos.averiaId || datos.emergenciaId || "general"].join("-"),
        renotify: true,
        requireInteraction: Boolean(
          datos.requireInteraction,
        ),
        data: {
          url: datos.url || "/",
          averiaId:
            datos.averiaId || null,
          tipo: datos.tipo || null,
        },
      };

      await self.registration.showNotification(
        titulo,
        opciones,
      );
    })(),
  );
});

self.addEventListener(
  "notificationclick",
  (event) => {
    event.notification.close();

    const destino =
      event.notification.data?.url || "/";

    event.waitUntil(
      clients
        .matchAll({
          type: "window",
          includeUncontrolled: true,
        })
        .then((ventanas) => {
          for (const ventana of ventanas) {
            if ("focus" in ventana) {
              ventana.navigate(destino);
              return ventana.focus();
            }
          }

          if (clients.openWindow) {
            return clients.openWindow(destino);
          }

          return undefined;
        }),
    );
  },
);
