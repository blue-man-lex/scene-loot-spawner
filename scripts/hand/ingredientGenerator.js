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
                const s = game.settings.get("scene-loot-spawner", key);
                if (Array.isArray(s)) return s;
                if (typeof s === "string") return s.split(",").map(v => v.trim()).filter(v => v.length > 0);
                return [];
            };

            // Берем ВСЕ компендиумы из всех полей настроек и сливаем в один котел
            const lootIds = getIds("lootSources");

            const allSourceIds = [...new Set([...lootIds])];

            const packsToLoad = {};
            for (const id of allSourceIds) {
                if (id.includes(":")) {
                    const [packId, folderId] = id.split(":");
                    if (!packsToLoad[packId]) packsToLoad[packId] = { all: false, folders: [] };
                    packsToLoad[packId].folders.push(folderId);
                } else {
                    packsToLoad[id] = { all: true, folders: [] };
                }
            }

            for (const [packId, config] of Object.entries(packsToLoad)) {
                const pack = game.packs.get(packId);
                if (!pack) {
                    console.warn(`SLS HAND | Компендиум ${packId} не найден`);
                    continue;
                }

                // В новых версиях DnD5e тип может лежать в system.type.value или system.type.subtype (добавлено поле folder)
                const index = await pack.getIndex({ fields: ["type", "system.type.value", "system.type.subtype", "system.rarity", "folder"] });
                
                const filteredIndex = config.all ? index : index.filter(i => config.folders.includes(i.folder));
                
                const docs = filteredIndex.map(i => ({
                    id: i._id,
                    name: i.name,
                    img: i.img,
                    uuid: i.uuid,
                    pack: packId, 
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

    categorizeIngredient(ingredient) {
        const name = String(ingredient.name).toLowerCase();
        const type = String(ingredient.type).toLowerCase();
        const systemType = String(ingredient.system?.type?.value || ingredient.system?.type?.subtype || "").toLowerCase();
        const folderName = ingredient.folderName ? String(ingredient.folderName).toLowerCase() : "";
        const folderId = ingredient.folder || "";
        const packPath = ingredient.packPath ? String(ingredient.packPath).toLowerCase() : "";
        
        const includeWeaponArmor = game.settings.get("scene-loot-spawner", "includeWeaponArmorInHand") || false;

        // Вспомогательная функция для проверки префиксов/вхождений
        const hasWord = (words) => words.some(w => name.includes(w));

        // 1. АЛХИМИЯ (Зелья, яды, бомбы)
        const isAlchemyType = type === "consumable" && ["potion", "poison", "elixir", "oil", "ammo"].includes(systemType);
        const alchemyWords = ['зелье', 'яд', 'токсин', 'эликсир', 'настой', 'масло', 'граната', 'бомба', 'взрывчатка', 'флакон', 'банка', 'potion', 'poison', 'elixir', 'oil', 'flask', 'bomb'];
        
        // Разрешаем алхимию только если это расходник (consumable) или лут (loot). 
        // Это защитит от попадания доспехов/оружия со словом "яд" в названии.
        if (["consumable", "loot"].includes(type) && (isAlchemyType || hasWord(alchemyWords))) {
            return "alchemy";
        }

        // 2. КРИСТАЛЛЫ
        // Подтип gem ИЛИ подтип trinket со словом "ограненный"
        if (systemType === "gem" || (systemType === "trinket" && hasWord(["ограненный", "огранённый"]))) {
            return "crystals";
        }

        // 3. РУДА
        // Подтип material + слова "руда", "слиток", "металл", "железо", "медь", "серебро", "золото"
        const oreWords = ['руда', 'руд', 'слиток', 'металл', 'желез', 'мед', 'серебр', 'золот', 'ore', 'ingot', 'metal'];
        if (systemType === "material" && hasWord(oreWords)) {
            return "ore";
        }

        // 4. РЕАГЕНТЫ
        const reagentTrinketWords = ['шкура', 'панцирь', 'воск', 'ткань', 'чешуя', 'кожа'];
        const reagentFoodWords = ['зола', 'купорос', 'соль', 'сублимат', 'суспензия', 'эссенция'];
        
        if (
            systemType === "material" || 
            systemType === "resource" || 
            (systemType === "trinket" && hasWord(reagentTrinketWords)) || 
            (systemType === "food" && hasWord(reagentFoodWords)) ||
            folderName.includes("ingredient") ||
            packPath.includes("ingredient") ||
            name.includes("ингредиент")
        ) {
            return "reagents";
        }

        // 5. ТРАВЫ/ЕДА
        // Так как алхимическая еда ушла в Реагенты, тут остается чистая Еда
        if (systemType === "food") {
            return "herbs";
        }

        // 6. И ПРОЧЕЕ
        // Безделушки (которые не ушли в кристаллы или реагенты), предметы роскоши, лут без подтипа
        if (systemType === "trinket" || type === "loot" || type === "backpack" || type === "tool") {
            return "other";
        }

        // Оружие, броня, амуниция (если стоит галочка)
        const isEquipment = ["weapon", "equipment", "shield"].includes(type) || (type === "consumable" && systemType === "ammo");
        if (isEquipment && includeWeaponArmor) {
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