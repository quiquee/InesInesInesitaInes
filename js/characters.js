// Personajes femeninos de películas de animación infantiles (Disney, Pixar, DreamWorks...).
// Solo usamos el nombre y un emoji/color propio como emblema (no imágenes con copyright).
export const CHARACTERS = [
  { name: 'Elsa', movie: 'Frozen', emoji: '❄️', color: '#7fc8f8' },
  { name: 'Anna', movie: 'Frozen', emoji: '🌷', color: '#e07a5f' },
  { name: 'Moana', movie: 'Vaiana', emoji: '🌊', color: '#2a9d8f' },
  { name: 'Mérida', movie: 'Brave', emoji: '🏹', color: '#d62828' },
  { name: 'Rapunzel', movie: 'Enredados', emoji: '🌻', color: '#b388eb' },
  { name: 'Ariel', movie: 'La Sirenita', emoji: '🐚', color: '#06d6a0' },
  { name: 'Bella', movie: 'La Bella y la Bestia', emoji: '🌹', color: '#f4a261' },
  { name: 'Mulán', movie: 'Mulán', emoji: '🌸', color: '#e63946' },
  { name: 'Tiana', movie: 'Tiana y el Sapo', emoji: '🐸', color: '#80b918' },
  { name: 'Jasmine', movie: 'Aladdín', emoji: '🐯', color: '#00b4d8' },
  { name: 'Pocahontas', movie: 'Pocahontas', emoji: '🍃', color: '#a7c957' },
  { name: 'Cenicienta', movie: 'La Cenicienta', emoji: '👠', color: '#90e0ef' },
  { name: 'Blancanieves', movie: 'Blancanieves', emoji: '🍎', color: '#ffbe0b' },
  { name: 'Aurora', movie: 'La Bella Durmiente', emoji: '👑', color: '#ff8fab' },
  { name: 'Mirabel', movie: 'Encanto', emoji: '🦋', color: '#43aa8b' },
  { name: 'Luisa', movie: 'Encanto', emoji: '💪', color: '#577590' },
  { name: 'Isabela', movie: 'Encanto', emoji: '🌺', color: '#f15bb5' },
  { name: 'Raya', movie: 'Raya y el último dragón', emoji: '🐉', color: '#3a86ff' },
  { name: 'Asha', movie: 'Wish', emoji: '🌟', color: '#7209b7' },
  { name: 'Vanellope', movie: 'Rompe Ralph', emoji: '🍭', color: '#ff70a6' },
  { name: 'Alegría', movie: 'Del Revés', emoji: '⭐', color: '#ffd60a' },
  { name: 'Tristeza', movie: 'Del Revés', emoji: '💧', color: '#4361ee' },
  { name: 'Riley', movie: 'Del Revés', emoji: '🏒', color: '#4cc9f0' },
  { name: 'Dory', movie: 'Buscando a Nemo', emoji: '🐟', color: '#4895ef' },
  { name: 'Jessie', movie: 'Toy Story', emoji: '🤠', color: '#c1121f' },
  { name: 'Bo Peep', movie: 'Toy Story', emoji: '🐑', color: '#cdb4db' },
  { name: 'Edna Moda', movie: 'Los Increíbles', emoji: '🕶️', color: '#495057' },
  { name: 'Violeta', movie: 'Los Increíbles', emoji: '💜', color: '#9d4edd' },
  { name: 'Mei', movie: 'Red', emoji: '🐼', color: '#d00000' },
  { name: 'Ellie', movie: 'Up', emoji: '🎈', color: '#ff006e' },
  { name: 'Nala', movie: 'El Rey León', emoji: '🦁', color: '#e9c46a' },
  { name: 'Judy Hopps', movie: 'Zootrópolis', emoji: '🐰', color: '#8d99ae' },
  { name: 'Fiona', movie: 'Shrek', emoji: '🧅', color: '#6a994e' },
  { name: 'Tigresa', movie: 'Kung Fu Panda', emoji: '🐅', color: '#f77f00' },
  { name: 'Gloria', movie: 'Madagascar', emoji: '🦛', color: '#b5838d' },
  { name: 'Agnes', movie: 'Gru, mi villano favorito', emoji: '🦄', color: '#ffafcc' },
];

export const HOST_CHARACTER = { name: 'Inés', movie: 'la cumpleañera', emoji: '🎂', color: '#ff4d6d' };

export function pickCharacter(usedNames, rng) {
  const free = CHARACTERS.filter((c) => !usedNames.has(c.name));
  if (free.length === 0) return null;
  return free[Math.floor(rng() * free.length)];
}
