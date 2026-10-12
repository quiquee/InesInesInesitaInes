# InesInesInesitaInes
Un juego para el 14 cumpleaños de Inés  Brasa

## 🎂 ¿Quién se ha comido la tarta de Inés?

Juego web de una sola página (HTML + JavaScript, sin compilación) pensado para publicarse en
**GitHub Pages**: `https://quiquee.github.io/InesInesInesitaInes/`.

### Cómo se juega

1. **Inés** entra con su código secreto (configúralo antes de publicar: ver *Cambiar el código de Inés*).
2. En *Gestionar* escribe el nombre de una amiga. Se genera:
   - un **personaje** (Elsa, Moana, Mirabel, Dory, Jessie, Tigresa…). Las demás solo verán el personaje;
     el nombre real solo lo ve Inés.
   - un **código** de 6 letras tipo localizador de vuelo (sin `I`, `L` ni `O`; da igual mayúsculas o minúsculas).
3. Inés puede ver siempre la lista y pulsar **QR** para enseñar a cada amiga un QR (con el emblema del
   personaje en el centro) que abre el juego con su código ya puesto.
4. Al entrar, cada jugadora ve la historia: una nevera cerrada y luego abierta con el hueco de la tarta,
   con el texto apareciendo como en una máquina de escribir.
5. Cuando Inés ha repartido todos los códigos pulsa **Empezar el juego** eligiendo cuántas **cómplices**
   (0 a 3) y cuántos **trozos de tarta** (mínimo 12). Se sortea en secreto una **ladrona** (nunca Inés),
   las cómplices y el resto son **detectives**. Desde ese momento los roles ya no se pueden cambiar.

### Reglas implementadas

- La ladrona empieza con toda la tarta. Puede pasar trozos a su banda (cómplices) y cualquiera puede
  comerse un trozo que tenga. En el tablero se ve cuántos trozos se ha comido cada una.
- **Preguntar** (detectives, una vez a cada jugadora): «¿Eres tú la ladrona?». La preguntada puede:
  - responder «No, yo no he sido» (puede mentir), o
  - **ofrecer un soborno** de N trozos que tenga.
- Ante un soborno la detective puede:
  - **Aceptar**: se come los trozos y pasa a ser cómplice (ya no puede preguntar ni acusar). Nunca sabe si
    quien la sobornó era la ladrona o una cómplice.
  - **Rechazar**: si quien ofrecía era la **ladrona**, la detective queda **eliminada**; si era una
    cómplice, no pasa nada y ella recupera sus trozos.
- **Acusar** (detectives, en cualquier momento): si acierta, **ganan las detectives**. Si falla queda
  **eliminada** y sus trozos disponibles se reparten entre la ladrona y las cómplices (el sobrante, para
  la ladrona).
- **Gana la ladrona** cuando no queda ninguna detective activa (todas sobornadas o eliminadas).
- Inés puede **terminar la partida** si se atasca: si nadie ha descubierto a la ladrona, gana la ladrona.

### ¿La partida siempre termina? (análisis de las reglas)

Con las reglas tal y como estaban escritas **no estaba garantizado** que la partida acabase:

1. Una detective podía preguntar indefinidamente a la misma persona; si le contestaban «no» o rechazaba
   el soborno de una cómplice, no cambiaba nada → bucle infinito.
2. Si a la banda se le acaba la tarta ya no puede sobornar ni hacer desaparecer a nadie, y si las
   detectives no se atreven a acusar, nada obliga a terminar.
3. No estaba definido qué pasa al rechazar el soborno de una cómplice (la frase original quedó cortada);
   aquí se ha decidido que **no pasa nada**.

Para garantizar un final se han añadido dos reglas:

- **Cada detective solo puede preguntar una vez a cada jugadora.** Así el número total de preguntas
  posibles está acotado por `detectives × (jugadoras − 1)` y cada pregunta lo reduce.
- **Inés puede terminar la partida** (la ladrona escapa) si las detectives ya no quieren acusar.

Con esto, cada jugada (preguntar, aceptar/rechazar, acusar) o bien termina la partida, o bien reduce el
número de detectives activas, o bien gasta una pregunta: el juego llega siempre a un final en un número
finito de jugadas. La banda de la ladrona nunca pierde miembros (solo las detectives pueden ser
eliminadas) y el total de trozos (en mano + reservados + comidos) se conserva siempre. Esto se comprueba
en `tests/game.test.mjs` con 300 partidas aleatorias.

### Jugar desde varios móviles (Firebase)

GitHub Pages solo sirve ficheros estáticos, así que para compartir la partida entre móviles hace falta
una base de datos. Sin configurar nada, el juego funciona en **modo demo** (todo se guarda en el
navegador; sirve para probar con varias pestañas).

1. Crea un proyecto gratuito en <https://console.firebase.google.com> y añade **Realtime Database**.
2. Reglas sugeridas (*Realtime Database → Reglas*):
   ```json
   { "rules": { "games": { "$game": { ".read": true, ".write": true } } } }
   ```
3. Registra una *app web* y copia su configuración en `js/config.js` (campo `firebase`).

> ⚠️ Es un juego de cumpleaños: no hay servidor propio, así que alguien con conocimientos técnicos podría
> leer la base de datos y ver los roles. No guardes datos sensibles (usa solo el nombre de pila).

### Cambiar el código de Inés

En `js/config.js` se guarda solo el **hash SHA-256** del código (en mayúsculas, 6 letras sin I/L/O).
El propio fichero explica cómo calcular uno nuevo desde la consola del navegador.

### Publicar en GitHub Pages

*Settings → Pages → Deploy from a branch* → rama principal, carpeta `/ (root)`.

### Desarrollo

```bash
npm test          # pruebas de las reglas (node --test)
npm start         # servidor local en http://localhost:8080
```

### Imágenes y personajes

Las ilustraciones de la nevera (`img/fridge-closed.svg`, `img/fridge-open.svg`) son dibujos SVG de estilo
cartoon. Si generas otras con IA, basta con sustituir esos ficheros (o cambiar las rutas en `js/app.js`).
Los personajes solo usan su **nombre** y un emoji/color como emblema (en el QR), para no incluir imágenes
con derechos de autor. El QR se genera con [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT, en `vendor/`).
