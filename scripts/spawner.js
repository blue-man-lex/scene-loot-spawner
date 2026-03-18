import { LootGenerator } from "./lootGenerator.js";
import { RegionHandler } from "./regionHandler.js";

export class LootSpawner {
    
    // Вспомогательный метод для рекурсивного сбора актеров
    static _getAllActorsInFolder(folderId) {
        return game.actors.filter(actor => {
            let currentFolder = actor.folder;
            while (currentFolder) {
                if (currentFolder.id === folderId) return true;
                currentFolder = currentFolder.folder;
            }
            return false;
        });
    }

    /**
     * Создает контейнеры в регионе
     * @param {RegionDocument} regionDoc - Документ Региона
     * @param {Object} config - Настройки из окна
     */
    static async spawnInRegion(regionDoc, config) {
        console.log(`SLS | Генерация ${config.count} объектов в "${regionDoc.name}"`);
        
        const tokensToCreateData = [];
        const tier = config.tier || "tier1";

        // Получаем пул актеров (если выбран рандом)
        let availableActors = [];
        if (config.folderId) {
            availableActors = this._getAllActorsInFolder(config.folderId);
            if (availableActors.length === 0) {
                ui.notifications.warn(`В папке (ID: ${config.folderId}) нет актеров!`);
                return;
            }
        }

        // --- ЦИКЛ СОЗДАНИЯ (Каждый предмет уникален) ---
        for (let i = 0; i < config.count; i++) {
            
            // 1. ОПРЕДЕЛЯЕМ АКТЕРА ДЛЯ ЭТОЙ КОНКРЕТНОЙ ИТЕРАЦИИ
            let actorToSpawn = null;

            if (config.containerId) {
                // Если выбран конкретный (не рандом)
                actorToSpawn = game.actors.get(config.containerId);
            } else if (config.folderId) {
                // Если рандом - выбираем случайного из пула КАЖДЫЙ РАЗ заново
                actorToSpawn = availableActors[Math.floor(Math.random() * availableActors.length)];
            }

            if (!actorToSpawn) {
                console.warn("SLS | Не удалось определить актера для спавна.");
                continue;
            }

            // 2. Ищем точку
            const point = RegionHandler.getRandomPoint(regionDoc);
            
            if (point) {
                const tokenProto = await actorToSpawn.getTokenDocument();
                const randomRotation = Math.floor(Math.random() * 360);

                tokensToCreateData.push({
                    ...tokenProto.toObject(),
                    x: point.x,
                    y: point.y,
                    elevation: point.elevation,
                    rotation: randomRotation,
                    name: `Loot: ${actorToSpawn.name}` // Имя будет разным (Сундук/Ящик...)
                });
            } else {
                 // Точка не найдена - пропускаем
            }
        }

        if (tokensToCreateData.length > 0) {
            // 2. Создаем токены
            const createdTokens = await canvas.scene.createEmbeddedDocuments("Token", tokensToCreateData);
            
            // 3. Превращаем их в контейнеры и наполняем УНИКАЛЬНЫМ лутом
            for (const tokenDoc of createdTokens) {
                const token = tokenDoc.object; // Объект на сцене
                
                // Получаем выбранный модуль из настроек
                const selectedModule = game.settings.get("scene-loot-spawner", "containerModule");
                console.log(`SLS DEBUG | Выбранный модуль контейнеров: ${selectedModule}`);
                
                if (selectedModule === "thm") {
                    // Работаем с Treasure Hoard Manager
                    const thmModule = game.modules.get("treasure-hoard-manager");
                    console.log(`SLS DEBUG | Проверка THM модуля:`, thmModule);
                    console.log(`SLS DEBUG | THM модуль активен:`, thmModule?.active);
                    
                    if (thmModule?.active) {
                        console.log(`SLS DEBUG | THM модуль активен, проверяем API...`);
                        
                        // Получаем доступ к API THM - ПРАВИЛЬНЫЙ СПОСОБ
                        console.log(`SLS DEBUG | THM Manager:`, game.THM?.manager);
                        console.log(`SLS DEBUG | THM HoardManager:`, game.THM?.manager?.hoardManager);
                        
                        if (game.THM?.manager?.hoardManager) {
                            console.log(`SLS DEBUG | THM HoardManager найден, создаем КОНТЕЙНЕР...`);
                            
                            // Создаем КОНТЕЙНЕР напрямую с правильными флагами
                            const containerSettings = {
                                enabled: true,
                                interactionDistance: 5,
                                showItemCards: true,
                                deleteWhenEmpty: false,
                                autoLoot: true,
                                visibilitySettings: {
                                    gmOnly: false,
                                    requiresProximity: true,
                                    revealOnSearch: true
                                },
                                itemFilters: {
                                    allowedTypes: ["weapon", "equipment", "consumable", "loot", "tool"],
                                    maxRarity: "legendary",
                                    excludeIdentified: false
                                }
                            };
                            
                            // Устанавливаем флаги напрямую на токен и актера
                            const tokenFlags = {
                                [`flags.treasure-hoard-manager.type`]: "container",
                                [`flags.treasure-hoard-manager.enabled`]: true,
                                [`flags.treasure-hoard-manager.version`]: "1.0.0"
                            };
                            
                            const actorFlags = {
                                [`flags.treasure-hoard-manager.type`]: "container",
                                [`flags.treasure-hoard-manager.enabled`]: true,
                                [`flags.treasure-hoard-manager.version`]: "1.0.0",
                                [`flags.treasure-hoard-manager.data`]: {
                                    containerName: token.actor.name,
                                    isVisibleToPlayers: containerSettings.visibilitySettings.gmOnly,
                                    autoLoot: containerSettings.autoLoot,
                                    enabled: true
                                },
                                [`flags.treasure-hoard-manager.settings`]: {
                                    general: {
                                        interactionDistance: containerSettings.interactionDistance,
                                        showItemCards: containerSettings.showItemCards,
                                        deleteWhenEmpty: containerSettings.deleteWhenEmpty,
                                        stackItems: true
                                    },
                                    specific: {
                                        autoCollect: containerSettings.autoLoot,
                                        visibilitySettings: containerSettings.visibilitySettings,
                                        itemFilters: containerSettings.itemFilters
                                    }
                                }
                            };
                            
                            // Применяем флаги
                            await token.document.update(tokenFlags);
                            await token.actor.update(actorFlags);
                            
                            console.log(`SLS DEBUG | КОНТЕЙНЕР THM создан для: ${token.name}`);
                            
                            // Проверяем примененные флаги
                            const flags = token.actor.flags;
                            console.log(`SLS DEBUG | Флаги актера после создания контейнера:`, flags);
                            const thmFlags = flags['treasure-hoard-manager'];
                            console.log(`SLS DEBUG | THM флаги:`, thmFlags);
                        } else {
                            console.warn(`SLS | THM API недоступен`);
                        }
                    } else {
                        console.warn(`SLS | Treasure Hoard Manager не найден или не активен`);
                    }
                } else if (selectedModule === "itempiles") {
                    // Работаем с Item Piles (пока не реализовано)
                    console.log(`SLS DEBUG | Item Piles выбран, но пока не поддерживается`);
                    // TODO: Добавить логику для Item Piles
                } else {
                    console.log(`SLS DEBUG | Модуль контейнеров не выбран, создаем обычные токены`);
                }
                
                // Генерируем лут для этого токена (общий для всех модулей)
                const uniqueLoot = await LootGenerator.generateLoot(config.profile, config.tier, config.maxItems, config.biome || "none");
                console.log(`SLS DEBUG | Сгенерировано ${uniqueLoot.length} предметов для контейнера`);
                console.log(`SLS DEBUG | Полный список сгенерированных предметов:`, uniqueLoot.map(i => ({name: i.name, type: i.type, quantity: i.system?.quantity})));
                
                // Добавляем предметы напрямую в инвентарь актера
                if (uniqueLoot.length > 0) {
                    console.log(`SLS DEBUG | Добавляем ${uniqueLoot.length} предметов в контейнер:`, token.name);
                    console.log(`SLS DEBUG | Структура первого предмета:`, JSON.stringify(uniqueLoot[0], null, 2));
                    
                    try {
                        await token.actor.createEmbeddedDocuments('Item', uniqueLoot);
                        console.log(`SLS DEBUG | Предметы добавлены в контейнер:`, token.name);
                        
                        // Проверяем что предметы действительно в контейнере
                        setTimeout(() => {
                            const items = token.actor.items.contents;
                            console.log(`SLS DEBUG | Текущие предметы в контейнере ${token.name}:`, items.map(i => ({name: i.name, id: i.id, quantity: i.system?.quantity})));
                        }, 500);
                    } catch (error) {
                        console.error(`SLS ERROR | Ошибка при добавлении предметов:`, error);
                        ui.notifications.error(`Ошибка добавления предметов в ${token.name}: ${error.message}`);
                    }
                } else {
                    console.warn(`SLS WARNING | Нет предметов для добавления в контейнер ${token.name}!`);
                    console.log(`SLS DEBUG | Проверяем настройки генерации:`, {
                        profile: config.profile,
                        tier: config.tier,
                        maxItems: config.maxItems,
                        biome: config.biome || "none"
                    });
                }

                // Добавляем валюту через прямое обновление system.currency
                const currency = LootGenerator.generateCurrency(tier);
                console.log(`SLS DEBUG | Сгенерирована валюта:`, currency);
                
                if (currency && (currency.cp || currency.sp || currency.gp)) {
                    console.log(`SLS DEBUG | Добавляем валюту через прямое обновление system.currency...`);
                    const currentCurrency = token.actor.system.currency || {};
                    const newCurrency = {
                        cp: (parseInt(currentCurrency.cp) || 0) + parseInt(currency.cp || 0),
                        sp: (parseInt(currentCurrency.sp) || 0) + parseInt(currency.sp || 0),
                        gp: (parseInt(currentCurrency.gp) || 0) + parseInt(currency.gp || 0),
                        ep: (parseInt(currentCurrency.ep) || 0),
                        pp: (parseInt(currentCurrency.pp) || 0)
                    };
                    
                    await token.actor.update({
                        'system.currency': newCurrency
                    });
                    console.log(`SLS DEBUG | Валюта добавлена в контейнер:`, newCurrency);
                } else {
                    console.log(`SLS DEBUG | Валюта не сгенерирована или пустая`);
                }
            }
            
            ui.notifications.info(`Создано: ${createdTokens.length} объектов (Смешанные контейнеры)`);
        }
    }
}