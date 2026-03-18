export const LOOT_CONFIG = {
    // Уровни сложности (CR)
    tiers: {
        "0-1": { 
            label: "Tier 0 (CR 0-1)", 
            rarityCap: "common", 
            goldMult: 0.1,
            rarityWeights: {
                "common": 10,
                "uncommon": 0,
                "rare": 0,
                "veryRare": 0,
                "legendary": 0
            }
        },
        "1-4": { 
            label: "Tier 1 (CR 1-4)", 
            rarityCap: "uncommon", 
            goldMult: 0.5,
            rarityWeights: {
                "common": 7,
                "uncommon": 3,
                "rare": 0,
                "veryRare": 0,
                "legendary": 0
            }
        },
        "5-10": { 
            label: "Tier 2 (CR 5-10)", 
            rarityCap: "rare", 
            goldMult: 1.0,
            rarityWeights: {
                "common": 5,
                "uncommon": 4,
                "rare": 1,
                "veryRare": 0,
                "legendary": 0
            }
        },
        "11-16": { 
            label: "Tier 3 (CR 11-16)", 
            rarityCap: "veryRare", 
            goldMult: 2.0,
            rarityWeights: {
                "common": 4,
                "uncommon": 3,
                "rare": 2,
                "veryRare": 1,
                "legendary": 0
            }
        },
        "17-19": { 
            label: "Tier 4 (CR 17-19)", 
            rarityCap: "legendary", 
            goldMult: 5.0,
            rarityWeights: {
                "common": 3,
                "uncommon": 3,
                "rare": 2,
                "veryRare": 1,
                "legendary": 1
            }
        },
        "20": { 
            label: "Tier 5 (CR 20 - Эпик)", 
            rarityCap: "legendary", 
            goldMult: 10.0,
            rarityWeights: {
                "common": 2,
                "uncommon": 2,
                "rare": 2,
                "veryRare": 2,
                "legendary": 2
            }
        }
    },

    // Биомы - модификаторы шансов для типов предметов
    biomes: {
        "none": { label: "Без биома", modifiers: {} },
        "forest": { 
            label: "Лес", 
            modifiers: { 
                "consumable-food": +0.3, 
                "loot-ingredient": +0.4, 
                "loot-tool": +0.2 
            } 
        },
        "desert": { 
            label: "Пустыня", 
            modifiers: { 
                "consumable-food": +0.2, 
                "equipment-clothing": +0.4, 
                "loot-tool": +0.3 
            } 
        },
        "mountain": { 
            label: "Горы", 
            modifiers: { 
                "weapon": +0.2, 
                "equipment-armor": +0.2, 
                "loot-gem": +0.3 
            } 
        },
        "swamp": { 
            label: "Болото", 
            modifiers: { 
                "loot-ingredient": +0.5, 
                "consumable-potion": +0.3, 
                "weapon": +0.1 
            } 
        },
        "coast": { 
            label: "Море", 
            modifiers: { 
                "consumable-food": +0.4, 
                "loot-tool": +0.3, 
                "equipment-clothing": +0.2 
            } 
        },
        "dungeon": { 
            label: "Подземелье", 
            modifiers: { 
                "weapon": +0.1, 
                "equipment-armor": +0.1, 
                "consumable-potion": +0.4, 
                "loot-gem": +0.2 
            } 
        },
        "urban": { 
            label: "Город", 
            modifiers: { 
                "loot-trinket": +0.5, 
                "equipment-clothing": +0.4, 
                "consumable-food": +0.2 
            } 
        },
        "cave": { 
            label: "Пещера", 
            modifiers: { 
                "loot-gem": +0.4, 
                "loot-ingredient": +0.3, 
                "weapon": +0.1 
            } 
        }
    },

    // Пресеты профилей (Темы)
    profiles: {
        "kitchen": {
            label: "Кухня / Припасы",
            filters: [
                { type: "consumable", subtype: "food", chance: 0.8 },
                { type: "loot", subtype: "tool", chance: 0.3 }
            ]
        },
        "armory": {
            label: "Оружейная",
            filters: [
                { type: "weapon", chance: 0.7 },
                { type: "equipment", subtype: "armor", chance: 0.5 },
                { type: "consumable", subtype: "ammo", chance: 0.6 }
            ]
        },
        "library": {
            label: "Библиотека / Кабинет",
            filters: [
                { type: "consumable", subtype: "scroll", chance: 0.8 } // Свитки обычно consumable в dnd5e
            ]
        },
        "treasure": {
            label: "Сокровища (Сундук босса)",
            filters: [
                { type: "loot", subtype: "gem", chance: 1.0 },
                { type: "weapon", magic: true, chance: 0.5 } // magic - условный флаг, будем искать
            ]
        },
        "dungeon": {
            label: "Подземелье",
            filters: [
                { type: "weapon", chance: 0.6 },
                { type: "equipment", subtype: "armor", chance: 0.5 },
                { type: "consumable", subtype: "potion", chance: 0.7 },
                { type: "loot", subtype: "gem", chance: 0.3 }
            ]
        },
        "wilderness": {
            label: "Дикая местность",
            filters: [
                { type: "consumable", subtype: "food", chance: 0.6 },
                { type: "loot", subtype: "ingredient", chance: 0.7 },
                { type: "equipment", subtype: "clothing", chance: 0.4 },
                { type: "loot", subtype: "tool", chance: 0.3 }
            ]
        },
        "urban": {
            label: "Город / Замки",
            filters: [
                { type: "loot", subtype: "trinket", chance: 0.6 },
                { type: "equipment", subtype: "clothing", chance: 0.5 },
                { type: "consumable", subtype: "food", chance: 0.4 },
                { type: "loot", subtype: "tool", chance: 0.4 }
            ]
        },
        "lair": {
            label: "Логово / Крафт",
            filters: [
                { type: "loot", subtype: "crafting", chance: 0.8 },
                { type: "loot", subtype: "ingredient", chance: 0.7 },
                { type: "weapon", magic: true, chance: 0.4 },
                { type: "equipment", subtype: "armor", magic: true, chance: 0.3 }
            ]
        }
    }
};