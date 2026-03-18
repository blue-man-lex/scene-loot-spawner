export class IngredientGenerator {
    constructor() {
        this.ingredients = [];
        
        // Новые, чистые биомы под новые 7 категорий:
        // herbs, wood, ore, crystals, reagents, alchemy, other
        this.biomeModifiers = {
            forest: { 
                "herbs": 2.5, "wood": 2.5, "reagents": 1.5, "alchemy": 0.8, 
                "ore": 0.5, "crystals": 0.5, "other": 1.0
            },
            mountain: { 
                "ore": 3.0, "crystals": 2.5, "reagents": 1.5, "wood": 0.5,
                "herbs": 0.5, "alchemy": 0.8, "other": 1.0
            },
            swamp: { 
                "herbs": 2.0, "reagents": 2.5, "alchemy": 1.5, "wood": 1.0,
                "ore": 0.5, "crystals": 0.5, "other": 1.0
            },
            desert: { 
                "crystals": 2.0, "reagents": 1.8, "ore": 1.5, "herbs": 0.5,
                "wood": 0.2, "alchemy": 0.7, "other": 1.0
            },
            tundra: { 
                "reagents": 2.0, "wood": 1.5, "ore": 1.5, "crystals": 1.2,
                "herbs": 0.8, "alchemy": 0.6, "other": 1.0
            },
            ocean: { 
                "reagents": 2.5, "herbs": 2.0, "crystals": 1.5, "alchemy": 1.0,
                "wood": 0.8, "ore": 0.5, "other": 1.0
            }
        };
    }

    async initialize() {
        try {
            console.log("SLS HAND | Инициализация генератора лута (Новая логика)...");
            this.ingredients = [];

            const getIds = (key) => {
                const s = game.settings.get("scene-loot-spawner", key) || "";
                return s.split(",").map(v => v.trim()).filter(v => v.length > 0);
            };

            // Берем ВСЕ компендиумы из всех полей настроек и сливаем в один котел
            const lootIds = getIds("lootSources");

            const allSourceIds = [...new Set([...lootIds])];

            for (const id of allSourceIds) {
                const pack = game.packs.get(id);
                if (!pack) {
                    console.warn(`SLS HAND | Компендиум ${id} не найден`);
                    continue;
                }

                // В новых версиях DnD5e тип может лежать в system.type.value или system.type.subtype
                const index = await pack.getIndex({ fields: ["type", "system.type.value", "system.type.subtype", "system.rarity"] });
                
                const docs = index.map(i => ({
                    id: i._id,
                    name: i.name,
                    img: i.img,
                    uuid: i.uuid,
                    pack: id, 
                    type: i.type,
                    system: {
                        type: { 
                            value: i.system?.type?.value,
                            subtype: i.system?.type?.subtype 
                        },
                        rarity: i.system?.rarity
                    }
                }));
                this.ingredients = this.ingredients.concat(docs);
            }
            
            console.log(`SLS HAND | Загружено ${this.ingredients.length} предметов для фильтрации`);
            return true;
        } catch (error) {
            console.error("SLS HAND | Ошибка инициализации:", error);
            return false;
        }
    }

    getAvailableIngredients(biome, selectedTypes = null, rarityFilters = ["common", "uncommon", "rare", "veryRare", "legendary"]) {
        if (this.ingredients.length === 0) return [];
        
        // Если нет ни одной галочки - ничего не показываем в превью!
        if (!selectedTypes || selectedTypes.length === 0) return [];
        if (!rarityFilters || rarityFilters.length === 0) return [];
        
        const modifiers = this.biomeModifiers[biome] || {};
        
        return this.ingredients.map(ingredient => {
            // Категоризация по НОВЫМ правилам
            const category = this.categorizeIngredient(ingredient);
            if (!category) return null; // Предмет отсеян (например, это заклинание или отключенное оружие)

            if (selectedTypes && selectedTypes.length > 0 && !selectedTypes.includes(category)) {
                return null; // Предмет не прошел фильтр игрока (галочки в UI)
            }

            const modifier = modifiers[category] || 1.0;
            
            const rawRarity = ingredient.system?.rarity || "common";
            const rarity = this._normalizeRarity(rawRarity);

            if (rarityFilters && rarityFilters.length > 0 && !rarityFilters.includes(rarity)) {
                return null;
            }
            
            let baseChance = (category === "other") ? 5 : 10;

            const rarityMultipliers = {
                "common": 1.0,
                "uncommon": 0.7,
                "rare": 0.4,
                "veryRare": 0.2,
                "legendary": 0.1
            };
            
            let rarityMultiplier = rarityMultipliers[rarity] || 1.0;
            let chance = Math.min(100, Math.round(baseChance * modifier * rarityMultiplier));
            
            if (chance <= 0) return null;

            return {
                id: ingredient.id,
                name: ingredient.name,
                img: ingredient.img,
                uuid: ingredient.uuid,
                category: category,
                type: ingredient.type,
                chance: chance, 
                rarity: rarity
            };
        }).filter(item => item !== null).sort((a, b) => b.chance - a.chance);
    }

    _normalizeRarity(rarity) {
        if (!rarity) return "common";
        const r = String(rarity).toLowerCase().replace(/[-_ ]/g, "");
        if (r === "uncommon") return "uncommon";
        if (r === "rare") return "rare";
        if (r === "veryrare") return "veryRare";
        if (r === "legendary" || r === "artifact" || r === "mythic") return "legendary";
        return "common";
    }

    /**
     * НОВАЯ УМНАЯ СИСТЕМА КАТЕГОРИЗАЦИИ
     */
    categorizeIngredient(ingredient) {
        const name = String(ingredient.name).toLowerCase();
        const type = String(ingredient.type).toLowerCase();
        const systemType = String(ingredient.system?.type?.value || ingredient.system?.type?.subtype || "").toLowerCase();
        
        const includeWeaponArmor = game.settings.get("scene-loot-spawner", "includeWeaponArmorInHand") || false;

        // 1. ПРОЧЕЕ (Оружие, броня, щиты, боеприпасы)
        const isEquipment = ["weapon", "equipment", "shield"].includes(type) || (type === "consumable" && systemType === "ammo");
        if (isEquipment) {
            if (!includeWeaponArmor) return null; // Если галочка в настройках снята - выкидываем
            return "other";
        }

        // 2. АЛХИМИЯ (Зелья, яды, бомбы)
        const isAlchemyType = type === "consumable" && ["potion", "poison", "elixir", "oil"].includes(systemType);
        const alchemyWords = ['зелье', 'яд', 'токсин', 'эликсир', 'настой', 'масло', 'граната', 'бомба', 'взрывчатка', 'флакон', 'банка', 'potion', 'poison', 'elixir', 'oil', 'flask', 'bomb'];
        if (isAlchemyType || alchemyWords.some(w => name.includes(w))) {
            return "alchemy";
        }

        // 3. ТРАВЫ (Флора, грибы, еда)
        // ЖЕСТКОЕ ОГРАНИЧЕНИЕ: Только тип 'consumable'. 
        // Это отсекает "Самоцвет заклинаний" (Loot/Trinket), "Предание о Льюру" (Loot) и прочий мусор.
        if (type === "consumable") {
            // Исключаем свитки на всякий случай, хотя они часто Consumable
            if (systemType === "scroll") return null;

            const isFoodType = systemType === "food";
            
            const herbWords = [
                'трав', 'цветок', 'соцветие', 'лепест', 'лист', 'корен', 'гриб', 'мох', 
                'белладонна', 'костегриб', 'скальпник', 'ягод', 'яблок', 'фрукт', 'овощ', 
                'еда', 'рацион', 'припас', 'мясо', 'хлеб', 'сыр', 
                'herb', 'flower', 'leaf', 'root', 'mushroom', 'moss', 'berry', 
                'apple', 'fruit', 'food', 'ration', 'meat', 'bread', 'cheese'
            ];
            
            if (isFoodType || herbWords.some(w => name.includes(w))) {
                return "herbs";
            }
        }

        // 4. РЕАГЕНТЫ (Животного происхождения, монстры)
        const reagentWords = ['слиз', 'кров', 'глаз', 'сердц', 'клык', 'когот', 'рог', 'чешу', 'кост', 'желез', 'патагий', 'хитин', 'пер', 'паутин', 'slime', 'blood', 'eye', 'heart', 'fang', 'claw', 'horn', 'scale', 'bone', 'gland', 'feather', 'web'];
        if (reagentWords.some(w => name.includes(w))) {
            return "reagents";
        }

        // 5. РУДА
        const oreWords = ['руд', 'слиток', 'металл', 'желез', 'мед', 'серебр', 'золот', 'ore', 'ingot', 'metal', 'iron', 'copper', 'silver', 'gold'];
        if (oreWords.some(w => name.includes(w))) {
            return "ore";
        }

        // 6. КРИСТАЛЛЫ
        const crystalWords = ['кристал', 'пыль', 'самоцвет', 'алмаз', 'рубин', 'сапфир', 'изумруд', 'жемчуг', 'crystal', 'dust', 'gem', 'diamond', 'ruby', 'sapphire', 'emerald', 'pearl'];
        if (crystalWords.some(w => name.includes(w))) {
            return "crystals";
        }

        // 7. ДЕРЕВО
        const woodWords = ['дерев', 'ветк', 'кора', 'полен', 'доск', 'wood', 'branch', 'bark', 'log', 'plank'];
        if (woodWords.some(w => name.includes(w))) {
            return "wood";
        }

        // 8. ЕСЛИ НИЧЕГО НЕ ПОДОШЛО, но это лут или расходник - кидаем в "Прочее"
        if (["loot", "consumable", "backpack", "tool"].includes(type)) {
            return "other";
        }

        // Отсеиваем системный мусор (заклинания, черты, классы)
        return null; 
    }

    generateIngredient(biome, selectedTypes, rarityFilters) {
        const available = this.getAvailableIngredients(biome, selectedTypes, rarityFilters);
        if (available.length === 0) return null;
        
        const roll = Math.random() * 100;
        const potentialDrops = available.filter(item => roll <= item.chance);
        
        if (potentialDrops.length === 0) return null;

        return potentialDrops[Math.floor(Math.random() * potentialDrops.length)];
    }
}