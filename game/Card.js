// Card definitions for the Race card game
// Based on Mille Bornes / Race by Shafir Games

const CARD_TYPES = {
  DISTANCE: 'distance',
  HAZARD: 'hazard',
  REMEDY: 'remedy',
  SAFETY: 'safety'
};

const HAZARD_TYPES = {
  RED_LIGHT: 'red_light',
  FLAT_TIRE: 'flat_tire',
  ACCIDENT: 'accident',
  OUT_OF_GAS: 'out_of_gas',
  SPEED_LIMIT: 'speed_limit'
};

// Maps each hazard to its remedy
const HAZARD_REMEDY_MAP = {
  red_light: 'green_light',
  flat_tire: 'spare_tire',
  accident: 'repairs',
  out_of_gas: 'gasoline',
  speed_limit: 'end_of_limit'
};

// Maps each hazard to its safety card
const HAZARD_SAFETY_MAP = {
  red_light: 'right_of_way',
  flat_tire: 'puncture_proof',
  accident: 'driving_ace',
  out_of_gas: 'extra_tank',
  speed_limit: 'right_of_way'
};

// All card definitions
const CARD_DEFS = [
  // Distance cards (46 total)
  { id: 'dist_25',  type: CARD_TYPES.DISTANCE, value: 25,  nameKey: 'card_25km',  emoji: '🛣️', count: 10 },
  { id: 'dist_50',  type: CARD_TYPES.DISTANCE, value: 50,  nameKey: 'card_50km',  emoji: '🛣️', count: 10 },
  { id: 'dist_75',  type: CARD_TYPES.DISTANCE, value: 75,  nameKey: 'card_75km',  emoji: '🛣️', count: 10 },
  { id: 'dist_100', type: CARD_TYPES.DISTANCE, value: 100, nameKey: 'card_100km', emoji: '🏎️', count: 12 },
  { id: 'dist_200', type: CARD_TYPES.DISTANCE, value: 200, nameKey: 'card_200km', emoji: '🏁', count: 4 },

  // Hazard cards (18 total)
  { id: 'red_light',   type: CARD_TYPES.HAZARD, hazardType: HAZARD_TYPES.RED_LIGHT,   nameKey: 'card_red_light',   emoji: '🔴', count: 5 },
  { id: 'flat_tire',   type: CARD_TYPES.HAZARD, hazardType: HAZARD_TYPES.FLAT_TIRE,   nameKey: 'card_flat_tire',   emoji: '💥', count: 3 },
  { id: 'accident',    type: CARD_TYPES.HAZARD, hazardType: HAZARD_TYPES.ACCIDENT,    nameKey: 'card_accident',    emoji: '💥', count: 3 },
  { id: 'out_of_gas',  type: CARD_TYPES.HAZARD, hazardType: HAZARD_TYPES.OUT_OF_GAS,  nameKey: 'card_out_of_gas',  emoji: '⛽', count: 3 },
  { id: 'speed_limit', type: CARD_TYPES.HAZARD, hazardType: HAZARD_TYPES.SPEED_LIMIT, nameKey: 'card_speed_limit', emoji: '🚫', count: 4 },

  // Remedy cards (38 total)
  { id: 'green_light',  type: CARD_TYPES.REMEDY, remedyFor: HAZARD_TYPES.RED_LIGHT,   nameKey: 'card_green_light',  emoji: '🟢', count: 14 },
  { id: 'spare_tire',   type: CARD_TYPES.REMEDY, remedyFor: HAZARD_TYPES.FLAT_TIRE,   nameKey: 'card_spare_tire',   emoji: '🛞', count: 6 },
  { id: 'repairs',      type: CARD_TYPES.REMEDY, remedyFor: HAZARD_TYPES.ACCIDENT,    nameKey: 'card_repairs',      emoji: '🔧', count: 6 },
  { id: 'gasoline',     type: CARD_TYPES.REMEDY, remedyFor: HAZARD_TYPES.OUT_OF_GAS,  nameKey: 'card_gasoline',     emoji: '⛽', count: 6 },
  { id: 'end_of_limit', type: CARD_TYPES.REMEDY, remedyFor: HAZARD_TYPES.SPEED_LIMIT, nameKey: 'card_end_of_limit', emoji: '🏷️', count: 6 },

  // Safety cards (4 total)
  { id: 'right_of_way',  type: CARD_TYPES.SAFETY, protectsAgainst: [HAZARD_TYPES.RED_LIGHT, HAZARD_TYPES.SPEED_LIMIT], nameKey: 'card_right_of_way',  emoji: '👑', count: 1 },
  { id: 'puncture_proof', type: CARD_TYPES.SAFETY, protectsAgainst: [HAZARD_TYPES.FLAT_TIRE],                           nameKey: 'card_puncture_proof', emoji: '🛡️', count: 1 },
  { id: 'driving_ace',   type: CARD_TYPES.SAFETY, protectsAgainst: [HAZARD_TYPES.ACCIDENT],                             nameKey: 'card_driving_ace',   emoji: '⭐', count: 1 },
  { id: 'extra_tank',    type: CARD_TYPES.SAFETY, protectsAgainst: [HAZARD_TYPES.OUT_OF_GAS],                            nameKey: 'card_extra_tank',    emoji: '🛢️', count: 1 },
];

function buildDeck() {
  const deck = [];
  let uid = 0;
  for (const def of CARD_DEFS) {
    for (let i = 0; i < def.count; i++) {
      deck.push({
        uid: uid++,
        id: def.id,
        type: def.type,
        value: def.value || null,
        hazardType: def.hazardType || null,
        remedyFor: def.remedyFor || null,
        protectsAgainst: def.protectsAgainst || null,
        nameKey: def.nameKey,
        emoji: def.emoji
      });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

module.exports = {
  CARD_TYPES,
  HAZARD_TYPES,
  HAZARD_REMEDY_MAP,
  HAZARD_SAFETY_MAP,
  CARD_DEFS,
  buildDeck,
  shuffleDeck
};
