import { IngredientGenerator } from "./ingredientGenerator.js";

export class IngredientCollector {
    constructor() {
        this.generator = new IngredientGenerator();
        
        // Состояние
        this.isActive = false;
        this.timer = null;
        
        // Механика ПОПЫТКИ
        this.attemptProgress = 0; // Текущий прогресс попытки (0-100)
        this.attemptMax = 100;    // Максимум для одной попытки
        
        // Цели
        this.collectedCount = 0;
        this.targetCount = 10;
        this.collected = [];
        
        // Настройки (Память)
        this.lastBiome = "forest";
        // По дефолту галочки сняты
        this.lastTypes = []; 
        this.lastRarities = ["common", "uncommon", "rare", "veryRare", "legendary"];
        this.collectionRate = 1.0;
        
        this.initialize();
    }

    async initialize() {
        await this.generator.initialize();
        
        // === ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ (после F5 или смены сцены) ===
        const savedState = game.user.getFlag("scene-loot-spawner", "handState");
        
        if (savedState) {
            // Восстанавливаем переменные
            this.isActive = savedState.isActive || false;
            this.attemptProgress = savedState.progress || 0;
            this.collectedCount = savedState.collectedCount || 0;
            this.targetCount = savedState.targetCount || 10;
            this.collected = savedState.collected || [];
            this.lastBiome = savedState.biome || "forest";
            this.lastTypes = savedState.types || [];
            this.lastRarities = savedState.rarities || ["common", "uncommon", "rare", "veryRare", "legendary"];
            
            // Если сбор был активен - перезапускаем таймер
            if (this.isActive) {
                this.timer = setInterval(() => this._tick(), 100);
                console.log(`SLS HAND | Сбор восстановлен (Прогресс: ${this.collectedCount}/${this.targetCount})`);
            }
        } else {
            this._sync(); 
        }
    }

    // Сохранение настроек
    updateSettings(settings) {
        if (settings.biome) this.lastBiome = settings.biome;
        if (settings.types) this.lastTypes = settings.types;
        if (settings.rarities) this.lastRarities = settings.rarities;
        if (settings.target) this.targetCount = settings.target;
        if (settings.speed) this.collectionRate = settings.speed;
        this._sync();
    }

    start(settings) {
        if (this.isActive) return;
        this.updateSettings(settings);
        
        this.isActive = true;
        console.log(`SLS HAND | Старт (User: ${game.user.name})`);
        
        // Тик раз в 100мс для плавности
        this.timer = setInterval(() => this._tick(), 100); 
        this._sync();
    }

    stop() {
        this.isActive = false;
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this._sync();
    }

    _tick() {
        if (!this.isActive) return;
        
        const increment = 1 * this.collectionRate; 
        this.attemptProgress += increment;

        if (this.attemptProgress >= this.attemptMax) {
            this.attemptProgress = 0;
            this._attemptToFind();
        }
        
        // Синхронизация реже, чтобы не спамить базу (каждые 10% прогресса)
        if (Math.floor(this.attemptProgress) % 10 === 0) {
             this._sync();
        }
    }

    async _attemptToFind() {
        const ingredient = this.generator.generateIngredient(this.lastBiome, this.lastTypes, this.lastRarities);
        
        if (ingredient) {
            // Определяем количество в зависимости от категории
            const stackCategories = ["herbs", "wood", "ore", "crystals", "reagents"];
            let qty = 1;
            
            // Если категория подразумевает стаки - кидаем d10
            if (stackCategories.includes(ingredient.category)) {
                qty = Math.floor(Math.random() * 10) + 1; // от 1 до 10
            }
            
            // 1. Выдаем предмет персонажу (сразу нужное количество)
            await this._giveItemToCharacter(ingredient, qty);

            // 2. Добавляем в визуальный лог
            this.addToCollected(ingredient, qty);
            
            // 3. Увеличиваем счетчик цели
            // Важно: +1 событие находки, а не +qty предметов
            this.collectedCount++;
            
            if (this.collectedCount >= this.targetCount) {
                this.stop();
                ui.notifications.info(`Рука Лута: Цель достигнута! Выполнено ${this.targetCount} поисков.`);
            }
            this._sync();
        }
    }

    async _giveItemToCharacter(ingredient, qty = 1) {
        const actor = game.user.character;
        
        if (!actor) {
            console.warn(`SLS HAND | У игрока ${game.user.name} не выбран персонаж. Лут пропущен.`);
            return;
        }

        try {
            const originalItem = await fromUuid(ingredient.uuid);
            if (originalItem) {
                const itemData = originalItem.toObject();
                
                // Проверяем, есть ли уже такой предмет у персонажа (по имени)
                const existingItem = actor.items.find(i => i.name === itemData.name);

                if (existingItem) {
                    // Если предмет есть, стакаем его
                    const currentQty = existingItem.system.quantity || 1;
                    await existingItem.update({ "system.quantity": currentQty + qty });
                } else {
                    // Если предмета нет, создаем новый с нужным кол-вом
                    itemData.system.quantity = qty;
                    await actor.createEmbeddedDocuments("Item", [itemData]);
                }
            }
        } catch (err) {
            console.error(`SLS HAND | Ошибка выдачи UUID ${ingredient.uuid}:`, err);
        }
    }

    addToCollected(ingredient, qty = 1) {
        const existing = this.collected.find(item => item.id === ingredient.id);
        if (existing) {
            existing.quantity += qty;
        } else {
            this.collected.push({
                ...ingredient, 
                quantity: qty, // Записываем сколько реально нашли
                uuid: ingredient.uuid,
                type: ingredient.type,
                rarity: ingredient.rarity || "common"
            });
        }
    }

    // Запись состояния во флаг пользователя (Persistence)
    async _sync() {
        const state = {
            isActive: this.isActive,
            progress: Math.floor(this.attemptProgress),
            collectedCount: this.collectedCount,
            targetCount: this.targetCount,
            collected: this.collected,
            biome: this.lastBiome,
            types: this.lastTypes,
            rarities: this.lastRarities
        };
        await game.user.setFlag("scene-loot-spawner", "handState", state);
    }

    getProgress() {
        return {
            current: Math.floor(this.attemptProgress),
            max: this.attemptMax,
            percentage: Math.min(100, Math.floor(this.attemptProgress)),
            collectedCount: this.collectedCount,
            targetCount: this.targetCount,
            rate: this.collectionRate,
            isActive: this.isActive
        };
    }

    getCollected() { return this.collected.sort((a, b) => b.quantity - a.quantity); }
    
    reset() {
        this.stop();
        this.attemptProgress = 0;
        this.collectedCount = 0;
        this.collected = [];
        this._sync();
    }
}