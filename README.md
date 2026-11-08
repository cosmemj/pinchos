# 🏆 Pincho de Oro

App web para el concurso de pinchos de la cuadrilla: **crea una sala, pasa el enlace por WhatsApp, haced la foto de cada cocinero con su pincho, votad desde el móvil y lanzad una gala con el Top 5 revelado del último al primero**.

- 📱 Pensada para móvil (también funciona en ordenador), modo oscuro neón.
- 🔗 Salas con código + enlace + QR. Quien abre el enlace entra directo.
- 📸 Cámara integrada (temporizador, linterna, cámara frontal) o galería. Las fotos se guardan en la sala y se pueden descargar.
- 🗳️ Votación **Top 3**, **Top 5** u **ordenar todos**, eligiendo los pinchos en orden y ajustando arrastrando.
- 📏 Puntuación clara: **Lineal**, **Eurovisión** (12-10-8…) o **Fórmula 1** (25-18-15…), con desempate automático.
- 🙈 Opcional: votación a ciegas (fotos y autores ocultos hasta la gala) y prohibir votar tu propio pincho.
- 👑 El anfitrión (y los co-anfitriones que nombre) abre y cierra la votación y lanza la gala, que se ve **a la vez en todos los móviles**, con redoble, fanfarria y confeti.
- 💸 Todo gratis: GitHub Pages + Firebase plan Spark (sin tarjeta).

---

## 1. Probarlo ya (modo demo, sin configurar nada)

Mientras `js/config.js` esté vacío, la app funciona en **modo demo**: todo se guarda solo en tu navegador y cada pestaña es un "amigo" distinto.

```powershell
npx serve .
```

Abre la URL que te indique (p. ej. `http://localhost:3000`). Crea una sala en una pestaña y abre el enlace de invitación en otra para simular a otra persona.

> Los módulos JavaScript no funcionan abriendo el `index.html` con doble clic: hace falta un servidor local como el de arriba (o la extensión *Live Server* de VS Code).

---

## 2. Configurar Firebase (gratis, ~5 minutos)

Firebase hace de "servidor": guarda salas, pinchos, fotos y votos y los sincroniza en tiempo real entre móviles.

1. Entra en <https://console.firebase.google.com> → **Crear un proyecto** (p. ej. `pincho-de-oro`). Google Analytics no hace falta. Se queda en el **plan Spark (gratuito)**: no pide tarjeta.
2. **Authentication** → *Comenzar* → pestaña **Método de acceso** → **Anónimo** → *Habilitar* → *Guardar*.
3. **Firestore Database** → *Crear base de datos* → edición **Standard** → ubicación **`europe-southwest1` (Madrid)** → modo **producción** → *Crear*.
4. En Firestore, pestaña **Reglas**: borra lo que haya, pega el contenido de [`firestore.rules`](firestore.rules) y pulsa **Publicar**.
5. ⚙️ **Configuración del proyecto** → *General* → *Tus apps* → icono web **`</>`** → apodo `web` (sin Hosting) → *Registrar app*. Copia el objeto `firebaseConfig` que aparece y pégalo en [`js/config.js`](js/config.js):

   ```js
   export const firebaseConfig = {
     apiKey: 'AIza...',
     authDomain: 'pincho-de-oro.firebaseapp.com',
     projectId: 'pincho-de-oro',
     storageBucket: 'pincho-de-oro.firebasestorage.app',
     messagingSenderId: '123456789',
     appId: '1:123456789:web:abc123',
   };
   ```

6. **Authentication** → **Configuración** → **Dominios autorizados** → *Añadir dominio* → `TU_USUARIO.github.io`.

> La `apiKey` de Firebase no es secreta (va en todas las webs que usan Firebase). Lo que protege los datos son las **reglas** de `firestore.rules` + el acceso anónimo: nadie puede ver votos ajenos, votar por otro, tocar pinchos ajenos ni cambiar la fase si no es anfitrión.

---

## 3. Publicar en GitHub Pages (gratis)

1. Crea un repositorio **público** en GitHub (p. ej. `pinchos`). En cuentas gratuitas, Pages solo funciona con repos públicos.
2. Desde esta carpeta (PowerShell):

   ```powershell
   git init; git add .; git commit -m "Pincho de Oro: app de concurso de pinchos"; git branch -M main; git remote add origin https://github.com/TU_USUARIO/pinchos.git; git push -u origin main
   ```

3. En GitHub: **Settings → Pages → Build and deployment → Source: _Deploy from a branch_ → `main` / `(root)` → Save**.
4. En un par de minutos estará en `https://TU_USUARIO.github.io/pinchos/`. Esa es la web que compartes; cada sala genera su propio enlace (`…/pinchos/?sala=ABCDE`).

Opcional: para que la vista previa de WhatsApp muestre la imagen, cambia en `index.html` la línea `og:image` por la URL absoluta, p. ej. `https://TU_USUARIO.github.io/pinchos/img/og.jpg`.

---

## 4. Cómo se juega

1. **El anfitrión crea la sala**: nombre, su nombre y las reglas (qué se vota y cuántos puntos da cada puesto). Le sale el código, el QR y el botón de WhatsApp.
2. **Cada uno entra con el enlace**, pone su nombre y un avatar.
3. **Fase de pinchos**: cada uno añade su pincho con la foto (o el anfitrión los va añadiendo todos e indica quién lo ha cocinado).
4. **El anfitrión abre la votación**. Cada uno toca los pinchos **en orden de preferencia**, revisa el orden (se puede arrastrar) y envía. Se puede cambiar el voto hasta el cierre. En la pestaña *Sala* se ve quién ha votado ya.
5. **El anfitrión cierra y lanza la gala**: en todos los móviles aparece el Top 5 del último al primero, con suspense antes del Pincho de Oro. Después queda la clasificación completa, el podio y las fotos para descargar.

Si al anfitrión se le acaba la batería: desde *Sala → ⋯* puede nombrar **co-anfitriones** con los mismos poderes.

### Puntuación

| Sistema | Top 3 | Top 5 | Ordenar todos (N pinchos) |
|---|---|---|---|
| Lineal | 3 · 2 · 1 | 5 · 4 · 3 · 2 · 1 | N · N-1 · … · 1 |
| Eurovisión | 12 · 10 · 8 | 12 · 10 · 8 · 7 · 6 | 12 · 10 · 8 · 7 · 6 · 5 · 4 · 3 · 2 · 1 · 0… |
| Fórmula 1 | 25 · 18 · 15 | 25 · 18 · 15 · 12 · 10 | 25 · 18 · 15 · 12 · 10 · 8 · 6 · 4 · 2 · 1 · 0… |

**Desempate**: más puntos → más 1º puestos → más 2º puestos → … → más votos recibidos. Si sigue igual, comparten puesto (¡doble Pincho de Oro!).

---

## 5. Límites del plan gratuito

Firestore (plan Spark): 1 GiB de datos, 50.000 lecturas y 20.000 escrituras **al día**. Un concurso de 15 personas y 15 pinchos usa del orden de unos pocos miles de lecturas, así que sobra muchísimo. Las fotos se comprimen en el móvil (≈150-400 KB) y se guardan dentro de Firestore, porque Cloud Storage ya exige el plan de pago en proyectos nuevos.

---

## 6. Preguntas frecuentes

- **¿Hace falta registrarse?** No. Cada móvil entra de forma anónima; el nombre se pone al entrar en la sala.
- **He cambiado de navegador o de móvil y no soy el anfitrión.** La identidad va ligada al navegador. Usad siempre el mismo (o que el anfitrión nombre co-anfitriones). Al instalarla con "Añadir a pantalla de inicio" en iPhone cuenta como otro navegador.
- **No se oye la gala en el iPhone.** Quita el modo silencio y toca la pantalla una vez al empezar la gala.
- **¿Puedo cambiar mi voto?** Sí, hasta que el anfitrión cierre la votación. Si hace falta, el anfitrión puede reabrirla o borrar todos los votos.
- **¿Cómo borro un concurso?** *Sala → Panel del anfitrión → Zona peligrosa → Eliminar el concurso* (borra pinchos, fotos y votos).

---

## 7. Estructura

```
index.html            · página única (sin compilación, solo archivos estáticos)
css/app.css           · todo el diseño (neón, animaciones, móvil primero)
js/config.js          · ← tu configuración de Firebase
js/main.js            · arranque y rutas
js/scoring.js         · puntuaciones y desempates (lógica pura)
js/backend/           · firebase.js (real) y local.js (modo demo)
js/components/        · pantallas: inicio, crear, sala, pinchos, votar, gala, resultados…
vendor/               · Preact + htm + generador de QR (copias locales)
firestore.rules       · reglas de seguridad para pegar en Firebase
sw.js, manifest       · se puede "Añadir a pantalla de inicio" como una app
```

### Desarrollo con emuladores (opcional)

Con [Firebase CLI](https://firebase.google.com/docs/cli) y Java 21+: `firebase emulators:start --only auth,firestore --project demo-pinchos` y pon `useEmulator = true` en `js/config.js` (con cualquier `apiKey` y `projectId: 'demo-pinchos'`).
