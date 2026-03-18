import { LOOT_CONFIG } from "./config.js";

export class LootGenerator {
    static async generateLoot(profileKey, tierKey, maxItems = 6, biomeKey = "none") {
        // tierKey приходит как "0-1", "1-4", "5-10", "11-16", "17-19", "20"
        // Сопоставляем с именами папок
        const tierFolderMap = {
            "0-1": "Tier 0 (0-1)",
            "1-4": "Tier 1 (1-4)",
            "5-10": "Tier 2 (5-10)",
            "11-16": "Tier 3 (11-16)",
            "17-19": "Tier 4 (17-19)",
            "20": "Tier 5 (20 - Эпик)"
        };

        const profile = LOOT_CONFIG.profiles[profileKey];
        const tier = LOOT_CONFIG.tiers[tierKey];
        const biome = LOOT_CONFIG.biomes[biomeKey];
        
        if (!profile) return [];

        console.log(`SLS DEBUG | Генерация лута: Профиль=${profileKey}, Уровень=${tierKey}, Биом=${biomeKey}`);
        console.log(`SLS DEBUG | Профиль:`, profile);
        console.log(`SLS DEBUG | Уровень:`, tier);
        console.log(`SLS DEBUG | Биом:`, biome);

        let candidates = [];

        // 1. Ищем в ПАПКАХ МИРА (если включено)
        if (game.settings.get("scene-loot-spawner", "useWorldItems")) {
            console.log(`SLS DEBUG | Поиск в папках мира ВКЛЮЧЕН`);
            const rootName = "Loot Source (SLS)";
            const tierFolderName = tierFolderMap[tierKey] || tierFolderMap["1-4"];
            console.log(`SLS DEBUG | Ищем в папке: ${rootName} -> ${tierFolderName}`);
            
            // Получаем все предметы мира
            const worldItems = game.items.contents;
            console.log(`SLS DEBUG | Всего предметов в мире: ${worldItems.length}`);
            
            // Фильтруем те, что лежат в нужной ветке
            for (const item of worldItems) {
                const folder = item.folder;
                if (!folder) continue;
                
                // Проверяем иерархию: Root -> Tier -> Category
                if (folder.folder?.name === tierFolderName && folder.folder?.folder?.name === rootName) {
                    // Это наш клиент! Проверяем фильтры профиля + биома
                    if (this._matchesProfileWithBiome(item, profile, biome)) {
                        candidates.push(item);
                        console.log(`SLS DEBUG | Найден предмет в папках мира: ${item.name}`);
                    }
                }
            }
            console.log(`SLS DEBUG | Найдено кандидатов в папках мира: ${candidates.length}`);
        } else {
            console.log(`SLS DEBUG | Поиск в папках мира ВЫКЛЮЧЕН`);
        }

        // 2. Ищем в КОМПЕНДИУМАХ (дополняем или используем если папки пусты)
        const sourcesString = game.settings.get("scene-loot-spawner", "lootSources");
        const sourceIds = sourcesString.split(",").map(s => s.trim());
        console.log(`SLS DEBUG | Ищем в компендиумах: ${sourcesString}`);

        for (const id of sourceIds) {
            const pack = game.packs.get(id);
            if (pack) {
                // Запрашиваем поля для фильтрации (без проблемных полей)
                const index = await pack.getIndex({ fields: ["system.rarity", "system.price.value", "type"] });
                console.log(`SLS DEBUG | Компендиум ${id}: ${index.length} предметов загружено`);
                
                if (profile.filters) {
                    // Комбинируем фильтры профиля и биома
                    const combinedFilters = this._combineProfileAndBiomeFilters(profile, biome);
                    console.log(`SLS DEBUG | Комбинированные фильтры:`, combinedFilters);
                    
                    for (const filter of combinedFilters) {
                        if (Math.random() > filter.chance) continue;

                        const matches = index.filter(i => {
                            // 1. Тип (отсеиваем классы, расы и т.д.)
                            if (i.type !== filter.type) return false;
　　　　　　　　　　　　
                            // 2. Подтип если указан (более гибкая проверка)
                            if (filter.subtype) {
                                const itemSubtype = i.system?.type?.subtype || i.system?.type || "";
                                if (itemSubtype && typeof itemSubtype === 'string' && !itemSubtype.includes(filter.subtype)) {
                                    // Для отладки - покажем что не совпало
                                    if (i.type === filter.type) {
                                        console.log(`SLS DEBUG | Подтип не совпал: ${i.name} (${i.type}) ищем '${filter.subtype}' в '${itemSubtype}'`);
                                    }
                                    return false;
                                }
                            }
                            
                            // 3. Магические предметы если указан флаг magic
                            if (filter.magic) {
                                if (!i.system?.properties?.magical) return false;
                            }
                            
                            // 4. Редкость - строгий фильтр по уровню
                            const itemRarity = i.system?.rarity || "common";
                            
                            // Список разрешенных редкостей для этого уровня
                            const allowedRarities = {
                                "common": ["common"],
                                "uncommon": ["common", "uncommon"], 
                                "rare": ["common", "uncommon", "rare"],
                                "veryRare": ["common", "uncommon", "rare", "veryRare"],
                                "legendary": ["common", "uncommon", "rare", "veryRare", "legendary"]
                            };
                            
                            const allowed = allowedRarities[tier.rarityCap] || ["common"];
                            if (!allowed.includes(itemRarity)) {
                                console.log(`SLS DEBUG | Отфильтрован ${i.name} - редкость ${itemRarity} не разрешена для уровня ${tierKey}`);
                                return false;
                            }

                            // 5. Взвешивание по редкости - применяем весовой коэффициент
                            const rarityWeight = tier.rarityWeights?.[itemRarity] || 1;
                            if (rarityWeight === 0) {
                                console.log(`SLS DEBUG | Отфильтрован ${i.name} - вес редкости ${itemRarity} = 0 для уровня ${tierKey}`);
                                return false;
                            }
                            
                            // Добавляем весовой коэффициент в предмет для последующего выбора
                            i._rarityWeight = rarityWeight;

                            return true;
                        });
                        
                        // Добавляем найденное в общий котел, помечая, из какого пака оно
                        matches.forEach(m => m._pack = pack); 
                        candidates = candidates.concat(matches);
                        
                        console.log(`SLS DEBUG | Фильтр ${filter.type}-${filter.subtype || 'any'}: найдено ${matches.length} предметов`);
                    }
                }
            } else {
                console.warn(`SLS | Компендиум не найден: ${id}`);
            }
        }

        // 3. Генерация лута
        let itemsToSpawn = [];
        
        // Случайное количество предметов от 1 до maxItems
        const itemCount = Math.floor(Math.random() * maxItems) + 1;
        console.log(`SLS DEBUG | Генерируем ${itemCount} предметов для профиля ${profileKey}, уровень ${tierKey}, биом ${biomeKey}`);
        
        if (candidates.length > 0) {
            for (let i = 0; i < itemCount; i++) {
                // ВЗВЕШЕННЫЙ ВЫБОР с учетом rarityWeight
                const weightedCandidates = candidates.map(c => ({
                    candidate: c,
                    weight: c._rarityWeight || 1
                }));
                
                // Создаем массив с повторениями согласно весам
                const weightedPool = [];
                for (const wc of weightedCandidates) {
                    for (let w = 0; w < wc.weight; w++) {
                        weightedPool.push(wc.candidate);
                    }
                }
                
                // Случайный выбор из взвешенного пула
                const choice = weightedPool[Math.floor(Math.random() * weightedPool.length)];
                
                // Получаем документ (из мира или из пака)
                let itemDoc;
                if (choice._pack) {
                    // Из компендиума
                    itemDoc = await choice._pack.getDocument(choice._id);
                } else {
                    // Из мира
                    itemDoc = choice;
                }
                
                if (itemDoc) {
                    const itemData = itemDoc.toObject();
                    
                    // --- ЛОГИКА КОЛИЧЕСТВА ---
                    const type = itemData.type;
                    const rarity = itemData.system.rarity || "common";

                    // 1. Оружие и Экипировка (Броня) - всегда 1 шт.
                    // 2. Редкое и выше (rare, veryRare, legendary) - всегда 1 шт.
                    const isSingleType = ["weapon", "equipment"].includes(type);
                    const isHighRarity = ["rare", "veryRare", "legendary", "artifact"].includes(rarity);

                    if (isSingleType || isHighRarity) {
                        itemData.system.quantity = 1;
                    } else {
                        // Для всего остального (расходники, лут, обычное) - от 1 до 3
                        itemData.system.quantity = Math.floor(Math.random() * 3) + 1;
                    }

                    itemsToSpawn.push(itemData);
                    console.log(`SLS DEBUG | Добавлен предмет: ${itemData.name} (${type}, ${rarity}), кол-во: ${itemData.system.quantity}`);
                }
            }
        } else {
            console.warn(`SLS DEBUG | Нет кандидатов для генерации предметов!`);
        }

        console.log(`SLS DEBUG | Всего сгенерировано предметов: ${itemsToSpawn.length}`);
        return itemsToSpawn;
    }

    static generateCurrency(tierKey) {
        const moneyConfig = {
            "0-1": { cp: { min: 1, max: 10 }, sp: { min: 0, max: 5 }, gp: { min: 0, max: 2 } },
            "1-4": { cp: { min: 1, max: 50 }, sp: { min: 1, max: 20 }, gp: { min: 1, max: 10 } },
            "5-10": { cp: { min: 1, max: 100 }, sp: { min: 1, max: 50 }, gp: { min: 1, max: 30 } },
            "11-16": { cp: { min: 1, max: 200 }, sp: { min: 1, max: 100 }, gp: { min: 1, max: 50 }, ep: { min: 0, max: 10 } },
            "17-19": { cp: { min: 10, max: 500 }, sp: { min: 10, max: 200 }, gp: { min: 5, max: 100 }, ep: { min: 1, max: 20 }, pp: { min: 0, max: 5 } },
            "20": { cp: { min: 50, max: 1000 }, sp: { min: 50, max: 500 }, gp: { min: 25, max: 250 }, ep: { min: 10, max: 50 }, pp: { min: 5, max: 25 } }
        };

        const config = moneyConfig[tierKey] || moneyConfig["1-4"];
        const currency = {};

        // Генерируем случайные количества и конвертируем в строки
        const cpAmount = Math.floor(Math.random() * (config.cp.max - config.cp.min + 1)) + config.cp.min;
        const spAmount = Math.floor(Math.random() * (config.sp.max - config.sp.min + 1)) + config.sp.min;
        const gpAmount = Math.floor(Math.random() * (config.gp.max - config.gp.min + 1)) + config.gp.min;
        const epAmount = config.ep ? Math.floor(Math.random() * (config.ep.max - config.ep.min + 1)) + config.ep.min : 0;
        const ppAmount = config.pp ? Math.floor(Math.random() * (config.pp.max - config.pp.min + 1)) + config.pp.min : 0;

        // Item Piles ожидает строки!
        if (cpAmount > 0) currency.cp = cpAmount.toString();
        if (spAmount > 0) currency.sp = spAmount.toString();
        if (gpAmount > 0) currency.gp = gpAmount.toString();
        if (epAmount > 0) currency.ep = epAmount.toString();
        if (ppAmount > 0) currency.pp = ppAmount.toString();

        return currency;
    }

    /**
     * Комбинирует фильтры профиля и биома с умной математикой
     */
    static _combineProfileAndBiomeFilters(profile, biome) {
        const combinedFilters = [];
        
        // Копируем базовые фильтры профиля
        if (profile.filters) {
            for (const profileFilter of profile.filters) {
                const filterKey = profileFilter.subtype 
                    ? `${profileFilter.type}-${profileFilter.subtype}`
                    : profileFilter.type;
                
                // Находим модификатор от биома
                const biomeModifier = biome.modifiers[filterKey] || 0;
                
                // Комбинируем шансы
                let combinedChance = profileFilter.chance + biomeModifier;
                
                // Ограничиваем шанс от 0 до 1
                combinedChance = Math.max(0, Math.min(1, combinedChance));
                
                combinedFilters.push({
                    ...profileFilter,
                    chance: combinedChance,
                    originalChance: profileFilter.chance,
                    biomeModifier: biomeModifier
                });
                
                console.log(`SLS DEBUG | Фильтр ${filterKey}: база=${profileFilter.chance}, биом=${biomeModifier}, итог=${combinedChance}`);
            }
        }
        
        return combinedFilters;
    }

    /** Вспомогательная функция проверки соответствия профилю с биомом */
    static _matchesProfileWithBiome(item, profile, biome) {
        if (!profile.filters) return true;
        
        for (const filter of profile.filters) {
            if (item.type === filter.type) {
                // Проверяем подтип если указан
                if (filter.subtype) {
                    // Поддерживаем разные форматы подтипов в dnd5e
                    const itemSubtype = item.system?.type?.subtype || "";
                    if (itemSubtype.includes(filter.subtype)) {
                        return true;
                    }
                } else {
                    return true; 
                }
            }
        }
        return false;
    }
}
