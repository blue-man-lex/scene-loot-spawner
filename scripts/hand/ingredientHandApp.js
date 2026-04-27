import { IngredientGenerator } from "./ingredientGenerator.js";

/**
 * Окно "Рука Лута" - таймер сбора ингредиентов
 */
export class IngredientHandApp extends FormApplication {
    constructor(options = {}) {
        super(options);
        this.myCollector = game.modules.get("scene-loot-spawner").api.collector;
        this.generator = this.myCollector.generator;
        this.watchedUserId = game.user.id;
        this.uiTimer = null;
        this._html = null;
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
            classes: ["scene-loot-spawner", "ingredient-hand"],
            scrollSelectors: [".v3-grid-scroll-area"] // Скролл категорий теперь не нуждается в защите, так как не перерисовывается
        });
    }

    get activeData() {
        if (this.watchedUserId === game.user.id) {
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
            const user = game.users.get(this.watchedUserId);
            const state = user?.getFlag("scene-loot-spawner", "handState") || {};
            return {
                isSelf: false,
                isActive: state.isActive || false,
                progress: {
                    percentage: state.progress || 0,
                    collectedCount: state.collectedCount || 0,
                    targetCount: state.targetCount || 10,
                    rate: 0
                },
                collected: state.collected || [],
                settings: {
                    biome: state.biome || "forest",
                    types: state.types || [],
                    rarities: state.rarities || []
                }
            };
        }
    }

    getData() {
        const data = this.activeData;
        const settings = data.settings;
        const users = game.user.isGM ? game.users.map(u => ({
            id: u.id,
            name: u.name,
            color: u.color,
            isSelected: u.id === this.watchedUserId,
            isActive: u.getFlag("scene-loot-spawner", "handState")?.isActive
        })) : null;

        const checks = {};
        const types = Array.isArray(settings.types) ? settings.types : [];
        const rarities = Array.isArray(settings.rarities) ? settings.rarities : [];
        types.forEach(t => checks[t] = true);
        rarities.forEach(r => checks[`${r}Rarity`] = true);

        return {
            isGM: game.user.isGM,
            users: users,
            isSelf: data.isSelf,
            biomes: this.getBiomeList(),
            currentBiome: settings.biome,
            targetAmount: settings.target,
            collectionSpeed: settings.speed?.toString() || "1",
            checks: checks,
            isCollecting: data.isActive,
            progress: data.progress,
            collected: data.collected,
            availableIngredients: this.generator.getAvailableIngredients(settings.biome, types, rarities)
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._html = html;

        // Смена игрока (ЕДИНСТВЕННЫЙ случай полного рендера)
        html.find('#user-select').change((e) => {
            this.watchedUserId = e.target.value;
            this.render(true);
        });

        if (this.watchedUserId === game.user.id) {
            html.find('#start-collection').click(() => this.startCollection());
            html.find('#stop-collection').click(() => this.stopCollection());
            html.find('#reset-progress').click(() => this.resetProgress());
            
            // Настройки биома (РЕАКТИВНО)
            html.find('#biome-select').change((e) => {
                const biome = e.target.value;
                this.myCollector.updateSettings({ biome });
                // Меняем только картинку сферы и сетку доступных
                html.find('.v3-biome-img').attr('src', `modules/scene-loot-spawner/assets/biomes/${biome}.png`);
                html.find('.v3-orb-glow').attr('class', `v3-orb-glow glow-${biome}`);
                this.updateAvailableGrid();
            });
            
            // План и скорость (РЕАКТИВНО)
            html.find('#target-amount, #collection-speed').change((e) => {
                const isTarget = e.target.id === 'target-amount';
                const val = isTarget ? parseInt(e.target.value) : parseFloat(e.target.value);
                this.myCollector.updateSettings({ [isTarget ? 'target' : 'speed']: val });
                this.updateDynamicElements();
            });
            
            // Чекбоксы категорий и редкости (РЕАКТИВНО - БЕЗ RENDER!)
            html.find('input[name="ingredientType"], input[name="rarityType"]').change((e) => {
                const isType = e.target.name === "ingredientType";
                const list = isType ? [...this.myCollector.lastTypes] : [...this.myCollector.lastRarities];
                const val = e.target.value;
                
                if (e.target.checked) { if (!list.includes(val)) list.push(val); }
                else { const idx = list.indexOf(val); if (idx > -1) list.splice(idx, 1); }
                
                this.myCollector.updateSettings({ [isType ? 'types' : 'rarities']: list });
                
                // Просто обновляем сетку "Доступно", не трогая меню и скролл
                this.updateAvailableGrid();
            });
        }

        if (this.myCollector.isActive && !this.uiTimer) this._startUiUpdate();

        // Hook для фоновых обновлений
        Hooks.on("updateUser", (user, data) => {
            if (user.id === this.watchedUserId && data.flags?.["scene-loot-spawner"]?.handState) {
                this.updateDynamicElements();
            }
        });
    }

    /**
     * РЕАКТИВНОЕ ОБНОВЛЕНИЕ ДОСТУПНЫХ ПРЕДМЕТОВ
     */
    updateAvailableGrid() {
        if (!this.rendered || !this._html) return;
        const settings = this.myCollector;
        const available = this.generator.getAvailableIngredients(settings.lastBiome, settings.lastTypes, settings.lastRarities);
        
        const availableGrid = this._html.find('.v3-available .v3-items-grid');
        let itemsHtml = "";
        available.forEach(item => {
            itemsHtml += `
                <div class="v3-grid-item rarity-${item.rarity} rarity-glow-${item.rarity}" title="${item.name}">
                    <img src="${item.img}">
                    <span class="v3-item-badge chance">${item.chance}%</span>
                </div>`;
        });
        availableGrid.html(itemsHtml || '<div class="v3-empty">Выберите категории...</div>');
    }

    /**
     * РЕАКТИВНОЕ ОБНОВЛЕНИЕ (Прогресс и Лут)
     */
    updateDynamicElements() {
        if (!this.rendered || !this._html) return;
        const data = this.activeData;
        const progress = data.progress;
        
        // 1. Полоска и цифры
        this._html.find('.v3-progress-bar .fill').css('width', `${progress.percentage}%`);
        this._html.find('.v3-perc').text(`${progress.percentage}%`);
        this._html.find('.v3-counts').text(`${progress.collectedCount}/${progress.targetCount}`);
        
        // 2. Статус
        const status = this._html.find('#collection-status');
        const isCurrentlyActive = status.hasClass('active');
        if (data.isActive && !isCurrentlyActive) {
            status.addClass('active').html('<i class="fas fa-sync fa-spin"></i> Сбор активен');
            this.render(); // Один раз при старте
        } else if (!data.isActive && isCurrentlyActive) {
            status.removeClass('active').html('<i class="fas fa-pause-circle"></i> Ожидание');
            this.render(); // Один раз при финише
        }
        
        // 3. Сетка добытого лута (ТОЧЕЧНО)
        const inventoryGrid = this._html.find('.v3-inventory .v3-items-grid');
        const currentUIIcons = inventoryGrid.find('.v3-grid-item').length;
        
        if (data.collected.length !== currentUIIcons) {
            let itemsHtml = "";
            data.collected.forEach(item => {
                itemsHtml += `
                    <div class="v3-grid-item rarity-glow-${item.rarity}" title="${item.name}">
                        <img src="${item.img}">
                        <span class="v3-item-badge qty">x${item.quantity}</span>
                    </div>`;
            });
            inventoryGrid.html(itemsHtml || '<div class="v3-empty">Пока пусто...</div>');
        }
    }

    _startUiUpdate() {
        if (this.uiTimer) clearInterval(this.uiTimer);
        this.uiTimer = setInterval(() => {
            if (this.rendered && this.myCollector.isActive) {
                this.updateDynamicElements();
            } else {
                clearInterval(this.uiTimer);
                this.uiTimer = null;
            }
        }, 100);
    }

    getBiomeList() {
        return [
            { key: "forest", label: "Лес" }, { key: "mountain", label: "Горы" }, { key: "swamp", label: "Болото" },
            { key: "desert", label: "Пустыня" }, { key: "tundra", label: "Тундра" }, { key: "ocean", label: "Океан" }
        ];
    }

    startCollection() {
        this.myCollector.start({
            biome: this.myCollector.lastBiome, types: this.myCollector.lastTypes,
            rarities: this.myCollector.lastRarities, target: this.myCollector.targetCount,
            speed: this.myCollector.collectionRate
        });
        this._startUiUpdate();
        this.render(true);
    }

    stopCollection() {
        this.myCollector.stop();
        if (this.uiTimer) { clearInterval(this.uiTimer); this.uiTimer = null; }
        this.render(true);
    }

    resetProgress() {
        this.myCollector.reset();
        this.render(true);
    }

    close() {
        if (this.uiTimer) { clearInterval(this.uiTimer); this.uiTimer = null; }
        return super.close();
    }
}