import { IngredientGenerator } from "./ingredientGenerator.js";

/**
 * Окно "Рука Лута" - таймер сбора ингредиентов
 */
export class IngredientHandApp extends FormApplication {
    constructor(options = {}) {
        super(options);
        
        // Свой коллектор
        this.myCollector = game.modules.get("scene-loot-spawner").api.collector;
        this.generator = this.myCollector.generator;
        
        // Кого мы смотрим? (По умолчанию - себя)
        this.watchedUserId = game.user.id;
        
        this.uiTimer = null;
    }

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "scene-loot-hand",
            title: "Рука Лута",
            template: "modules/scene-loot-spawner/templates/hand/ingredient-hand.hbs",
            width: 900,
            height: 750,
            resizable: true,
            classes: ["scene-loot-spawner", "ingredient-hand"]
        });
    }

    // Получаем коллектор или данные флага (если смотрим другого)
    get activeData() {
        if (this.watchedUserId === game.user.id) {
            // Смотрим себя - берем живые данные
            return {
                isSelf: true,
                isActive: this.myCollector.isActive,
                progress: this.myCollector.getProgress(),
                collected: this.myCollector.getCollected(),
                settings: {
                    biome: this.myCollector.lastBiome,
                    target: this.myCollector.targetCount,
                    speed: this.myCollector.collectionRate,
                    types: this.myCollector.lastTypes,
                    rarities: this.myCollector.lastRarities
                }
            };
        } else {
            // Смотрим другого - читаем флаг
            const user = game.users.get(this.watchedUserId);
            const state = user?.getFlag("scene-loot-spawner", "handState") || {};
            
            return {
                isSelf: false,
                isActive: state.isActive || false,
                progress: {
                    percentage: state.progress || 0,
                    collectedCount: state.collectedCount || 0,
                    targetCount: state.targetCount || 10,
                    rate: 0 // Скорость чужого не важна для отображения
                },
                collected: state.collected || [],
                settings: {
                    biome: state.biome || "forest",
                    // Остальные настройки можно не читать, если мы только смотрим
                }
            };
        }
    }

    getData() {
        const data = this.activeData;
        const settings = data.settings;

        // Список пользователей для ГМа
        const users = game.user.isGM ? game.users.map(u => ({
            id: u.id,
            name: u.name,
            color: u.color,
            isSelected: u.id === this.watchedUserId,
            isActive: u.getFlag("scene-loot-spawner", "handState")?.isActive
        })) : null;

        const checks = {};
        // Гарантируем, что settings.types и settings.rarities - массивы
        const types = Array.isArray(settings.types) ? settings.types : [];
        const rarities = Array.isArray(settings.rarities) ? settings.rarities : [];
        
        types.forEach(t => checks[t] = true);
        rarities.forEach(r => checks[`${r}Rarity`] = true);

        return {
            isGM: game.user.isGM,
            users: users,
            isSelf: data.isSelf, // Режим просмотра
            
            biomes: this.getBiomeList(),
            currentBiome: settings.biome,
            targetAmount: settings.target,
            collectionSpeed: settings.speed?.toString() || "1",
            checks: checks,
            rarityFilter: rarities,
            
            isCollecting: data.isActive,
            progress: data.progress,
            collected: data.collected,
            
            // Превью доступно только для себя
            availableIngredients: this.generator.getAvailableIngredients(settings.biome, types, rarities)
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Переключение пользователя (только ГМ)
        html.find('#user-select').change((e) => {
            this.watchedUserId = e.target.value;
            this.render();
        });

        // Кнопки работают только если смотрим себя
        if (this.watchedUserId === game.user.id) {
            html.find('#start-collection').click(() => this.startCollection());
            html.find('#stop-collection').click(() => this.stopCollection());
            html.find('#reset-progress').click(() => this.resetProgress());
            
            // Обработчики настроек
            html.find('#biome-select').change((e) => {
                this.myCollector.updateSettings({ biome: e.target.value });
                this.render();
            });
            
            html.find('#target-amount').change((e) => {
                this.myCollector.updateSettings({ target: parseInt(e.target.value) || 10 });
                this.render();
            });
            
            html.find('#collection-speed').change((e) => {
                this.myCollector.updateSettings({ speed: parseFloat(e.target.value) || 1.0 });
                this.render();
            });
            
            html.find('input[name="ingredientType"]').change((e) => {
                const types = this.myCollector.lastTypes || [];
                const type = e.target.value;
                if (e.target.checked) {
                    if (!types.includes(type)) types.push(type);
                } else {
                    types.splice(types.indexOf(type), 1);
                }
                this.myCollector.updateSettings({ types });
                this.render();
            });
            
            html.find('input[name="rarityType"]').change((e) => {
                const rarities = this.myCollector.lastRarities || [];
                const rarity = e.target.value;
                if (e.target.checked) {
                    if (!rarities.includes(rarity)) rarities.push(rarity);
                } else {
                    rarities.splice(rarities.indexOf(rarity), 1);
                }
                this.myCollector.updateSettings({ rarities });
                this.render();
            });
        } 
        else if (game.user.isGM) {
            // ГМ может принудительно остановить чужой сбор
            html.find('#force-stop').click(async () => {
                if (game.socketlib) {
                    await game.socketlib.executeAsUser("forceStopHand", this.watchedUserId, this.watchedUserId);
                    ui.notifications.info("Команда остановки отправлена.");
                }
            });
        }

        // Запускаем обновление интерфейса, если сбор идет
        if (this.myCollector.isActive && !this.uiTimer) {
            this._startUiUpdate();
        }
    }

    _startUiUpdate() {
        if (this.uiTimer) clearInterval(this.uiTimer);
        // Обновляем картинку раз в секунду (чтобы видеть прогресс)
        this.uiTimer = setInterval(() => {
            if (this.rendered) {
                // Вызываем super.render, чтобы не зациклиться
                this.render(); 
            } else {
                clearInterval(this.uiTimer);
                this.uiTimer = null;
            }
        }, 1000);
    }

    /**
     * Загружает CSS стили для окна
     */
    async _loadStyles() {
        const cssId = "scene-loot-spawner-hand-styles";
        
        // Проверяем, уже ли загружены стили
        if (document.getElementById(cssId)) {
            return;
        }

        try {
            // Загружаем CSS файл
            const response = await fetch('modules/scene-loot-spawner/styles/hand.css');
            const css = await response.text();
            
            // Создаем элемент style
            const style = document.createElement('style');
            style.id = cssId;
            style.textContent = css;
            
            // Добавляем в head
            document.head.appendChild(style);
            
            console.log("SLS HAND | CSS стили загружены");
        } catch (error) {
            console.error("SLS HAND | Ошибка загрузки CSS:", error);
        }
    }

    /** @override */
    async _render(force = false, options = {}) {
        await this._loadStyles();
        return super._render(force, options);
    }

    /**
     * Получение списка биомов
     */
    getBiomeList() {
        return [
            { key: "forest", label: "Лес" },
            { key: "mountain", label: "Горы" },
            { key: "swamp", label: "Болото" },
            { key: "desert", label: "Пустыня" },
            { key: "tundra", label: "Тундра" },
            { key: "ocean", label: "Океан" }
        ];
    }

    /**
     * Начать сбор ингредиентов
     */
    startCollection() {
        this.myCollector.start({
            biome: this.myCollector.lastBiome,
            types: this.myCollector.lastTypes,
            rarities: this.myCollector.lastRarities,
            target: this.myCollector.targetCount,
            speed: this.myCollector.collectionRate
        });
        
        this._startUiUpdate();
        this.render();
    }

    /**
     * Остановить сбор ингредиентов
     */
    stopCollection() {
        this.myCollector.stop();
        if (this.uiTimer) {
            clearInterval(this.uiTimer);
            this.uiTimer = null;
        }
        this.render();
    }

    /**
     * Сбросить прогресс
     */
    resetProgress() {
        this.myCollector.reset();
        if (this.rendered) {
            this.render();
        }
    }

    /** @override */
    close() {
        if (this.uiTimer) {
            clearInterval(this.uiTimer);
            this.uiTimer = null;
        }
        return super.close();
    }
}