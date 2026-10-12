// Configuración del juego.
export const CONFIG = {
  // SHA-256 del código secreto de Inés (en MAYÚSCULAS). Para cambiarlo, abre la consola del
  // navegador en la web del juego y ejecuta:
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('PQRSTU'))
  //     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
  // y pega aquí el resultado. Recuerda: 6 letras sin I, L ni O.
  adminCodeHash: '84b2ae896f51981833aded5eeab136cbdce54b5d5415a75fb87cbe0ff0642f11',

  // Identificador de la partida (ruta en la base de datos).
  gameId: 'tarta-ines',

  // Para jugar desde varios móviles hace falta una base de datos compartida.
  // Crea un proyecto gratuito en Firebase con "Realtime Database" y pega aquí su configuración
  // web. Si se deja en null, el juego funciona en "modo demo" guardando todo en este navegador.
  // firebase: null,
  // firebase: {
  //  apiKey: 'BFyybqLM3xbLK240U-4HzILbTKr1WbrEiq675GT_thDNP-x9R395ULM02qcEkThuw-uZvNxnWz37BKAAfev5Jm0',
  //  authDomain: 'webaps-firebase.firebaseapp.com',
  //  databaseURL: 'https://webaps-firebase-default-rtdb.europe-west1.firebasedatabase.app',
  //  projectId: 'webaps-firebase',
  // },
  firebase: {
  apiKey: "AIzaSyCOFdjmlw4ks1Jb2RYL8tkqyqTr6-q4cL8",
  authDomain: "webaps-firebase.firebaseapp.com",
  databaseURL: "https://webaps-firebase-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "webaps-firebase",
  storageBucket: "webaps-firebase.firebasestorage.app",
  messagingSenderId: "930953875867",
  appId: "1:930953875867:web:685bbbc218e1aef7cd913e",
  measurementId: "G-EZKY675457"
};

  // URL pública del juego (GitHub Pages). Si es null se usa la URL actual del navegador.
  publicUrl: null,
};
