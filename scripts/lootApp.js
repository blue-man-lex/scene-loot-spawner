import { LOOT_CONFIG } from "./config.js";
import { LootSpawner } from "./spawner.js";

export class SceneLootApp extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "scene-loot-app",
            title: "Менеджер Лута Сцены",
            template: "modules/scene-loot-spawner/templates/loot-window.hbs",
            width: 800,
            height: 700,
            resizable: true,
            classes: ["sls-window"],
            closeOnSubmit: false // Важно: не закрывать окно при нажатии Enter
        });
    }

    /**
     * Активация слушателей (Живая память)
     */
    activateListeners(html) {
        super.activateListeners(html);
        
        // 1. Кнопка сброса
        html.find('button[data-action="reset"]').click(async () => {
            if (confirm("Сбросить все настройки регионов на этой сцене?")) {
                const scene = game.scenes.current;
                if (scene) {
                    for (const region of scene.regions) {
                        await region.unsetFlag("scene-loot-spawner", "config");
                    }
                    this.render(true);
                }
            }
        });

        // 1.5. Кнопка переключения всех регионов
        html.find('#toggleAllRegions').click(async () => {
            const scene = game.scenes.current;
            if (!scene) return;
            
            // Проверяем текущее состояние - если большинство выбраны, снимаем все
            const regions = scene.regions.contents;
            const checkedCount = regions.filter(r => {
                const config = r.getFlag("scene-loot-spawner", "config") || {};
                return config.enabled === true;
            }).length;
            
            const shouldCheckAll = checkedCount < regions.length / 2; // Если меньше половины выбрано, выбираем все
            
            for (const region of regions) {
                const currentConfig = region.getFlag("scene-loot-spawner", "config") || {};
                currentConfig.enabled = shouldCheckAll;
                await region.setFlag("scene-loot-spawner", "config", currentConfig);
            }
            
            // Обновляем иконку кнопки
            const button = html.find('#toggleAllRegions i');
            if (shouldCheckAll) {
                button.removeClass('fa-square').addClass('fa-check-square');
                button.attr('title', 'Снять все');
            } else {
                button.removeClass('fa-check-square').addClass('fa-square');
                button.attr('title', 'Выбрать все');
            }
            
            // Перерисовываем для обновления чекбоксов
            this.render(true);
        });

        // 2. МГНОВЕННОЕ СОХРАНЕНИЕ при любом изменении
        html.find('select, input[type="checkbox"], input[type="number"]').change(async (event) => {
            const input = event.currentTarget;
            const name = input.name; // например "profile-REGION_ID"
            const value = input.type === "checkbox" ? input.checked : input.value;

            // Если это глобальный Tier
            if (name === "tier") {
                await game.user.setFlag("scene-loot-spawner", "lastTier", value);
                return;
            }

            // Если это максимальное количество предметов
            if (name === "maxItems") {
                await game.user.setFlag("scene-loot-spawner", "lastMaxItems", parseInt(value) || 4);
                return;
            }

            // Парсим ID региона из имени поля (например "container-xyz123")
            const parts = name.split("-");
            const fieldType = parts[0]; // profile, container, count, doSpawn
            const regionId = parts.slice(1).join("-"); // остальное это ID

            const scene = game.scenes.current;
            const region = scene?.regions.get(regionId);

            if (region) {
                // Читаем текущий конфиг, обновляем одно поле и сохраняем обратно
                const currentConfig = region.getFlag("scene-loot-spawner", "config") || {};
                
                // Маппинг полей формы в поля конфига
                if (fieldType === "profile") currentConfig.profile = value;
                if (fieldType === "biome") currentConfig.biome = value;
                if (fieldType === "container") currentConfig.containerId = value;
                if (fieldType === "count") currentConfig.count = parseInt(value) || 1;
                if (fieldType === "doSpawn") currentConfig.enabled = value;

                await region.setFlag("scene-loot-spawner", "config", currentConfig);
                console.log(`SLS | Saved ${fieldType} for ${region.name}:`, value);
            }
        });
    }

    _getContainerOptions(selectedId) {
        const rootFolderName = game.settings.get("scene-loot-spawner", "containerFolder");
        const rootFolder = game.folders.find(f => f.name === rootFolderName && f.type === "Actor");
        
        const options = [];
        if (!rootFolder) return []; 

        // Хелпер для создания опции с проверкой selected
        const makeOpt = (id, name, isFolder = false) => ({
            id, name, isFolder,
            isSelected: id === selectedId // Помечаем, если это сохраненное значение
        });

        options.push(makeOpt(`folder-${rootFolder.id}`, `🎲 Случайный из всех (${rootFolderName})`, true));

        const allActorFolders = game.folders.filter(f => f.type === "Actor");
        const subFolders = allActorFolders.filter(f => f.folder?.id === rootFolder.id);

        for (const sub of subFolders) {
            options.push(makeOpt(`folder-${sub.id}`, `📁 Случайный: ${sub.name}`, true));
            for (const actor of sub.contents) {
                options.push(makeOpt(actor.id, `\u00A0\u00A0\u00A0\u00A0 ${actor.name}`));
            }
        }
        
        for (const actor of rootFolder.contents) {
            options.push(makeOpt(actor.id, actor.name));
        }

        return options;
    }

    _getSourceStatus() {
        const sourcesString = game.settings.get("scene-loot-spawner", "lootSources") || "";
        const sourceIds = sourcesString.split(",").map(s => s.trim()).filter(s => s.length > 0);
        return sourceIds.map(id => {
            const pack = game.packs.get(id);
            return { id: id, valid: !!pack };
        });
    }

    getData() {
        const scene = game.scenes.current;
        if (!scene) return { noScene: true };

        const regions = scene.regions ? scene.regions.contents : [];
        const sourcesStatus = this._getSourceStatus();
        const useWorldItems = game.settings.get("scene-loot-spawner", "useWorldItems");
        const savedTier = game.user.getFlag("scene-loot-spawner", "lastTier") || "1-4";

        // Подготовка списка профилей (чтобы пометить selected)
        const prepareProfiles = (selectedKey) => {
            return Object.entries(LOOT_CONFIG.profiles).map(([key, data]) => ({
                key: key,
                label: data.label,
                isSelected: key === selectedKey
            }));
        };

        // Подготовка списка биомов (чтобы пометить selected)
        const prepareBiomes = (selectedKey) => {
            return Object.entries(LOOT_CONFIG.biomes).map(([key, data]) => ({
                key: key,
                label: data.label,
                isSelected: key === selectedKey
            }));
        };

        const rows = regions.map(r => {
            const savedConfig = r.getFlag("scene-loot-spawner", "config") || {};
            
            // Получаем опции контейнеров с уже проставленным selected
            const containerOpts = this._getContainerOptions(savedConfig.containerId || "");

            return {
                id: r.id,
                name: r.name,
                elevationInfo: r.elevation?.bottom != null ? `(${r.elevation.bottom} ft)` : "(0 ft)",
                color: r.color?.css || "#ffffff",
                
                // Готовые списки для шаблона
                containers: containerOpts,
                profiles: prepareProfiles(savedConfig.profile || "none"),
                biomes: prepareBiomes(savedConfig.biome || "none"),
                
                // Значения
                savedCount: savedConfig.count || 1,
                savedCheck: savedConfig.enabled === true
            };
        });

        // Считаем количество выбранных регионов для иконки кнопки
        const checkedCount = rows.filter(r => r.savedCheck).length;
        const shouldShowChecked = checkedCount >= rows.length / 2;

        // Тиры для шапки - явная сортировка для гарантии порядка
        const tierOrder = ["0-1", "1-4", "5-10", "11-16", "17-19", "20"];
        const tiersList = tierOrder.map(key => ({
            key, 
            label: LOOT_CONFIG.tiers[key]?.label || key, 
            isSelected: key === savedTier
        }));

        return {
            noScene: false,
            sceneName: scene.name,
            tiersList: tiersList,
            rows: rows,
            hasRegions: rows.length > 0,
            sources: sourcesStatus,
            useWorldItems: useWorldItems,
            toggleButtonIcon: shouldShowChecked ? "fa-check-square" : "fa-square",
            toggleButtonTitle: shouldShowChecked ? "Снять все" : "Выбрать все"
        };
    }

    async _updateObject(event, formData) {
        // Здесь мы только ЗАПУСКАЕМ генерацию, так как сохранение уже произошло в change()
        const tier = formData.tier;
        const maxItems = parseInt(formData.maxItems) || 4; // Получаем максимальное количество предметов
        const tasks = [];
        const scene = game.scenes.current;
        if (!scene) return;

        for (const region of scene.regions) {
            const regionId = region.id;
            const isChecked = formData[`doSpawn-${regionId}`]; // checkbox возвращает true/false в formData в новых версиях?
            
            // Если галочка стоит - добавляем в задачи
            if (isChecked) {
                const containerSelection = formData[`container-${regionId}`];
                
                if (!containerSelection) {
                     ui.notifications.warn(`Регион "${region.name}": не выбран контейнер.`);
                     continue;
                }

                let containerId = null;
                let folderId = null;

                if (containerSelection.startsWith("folder-")) {
                    folderId = containerSelection.replace("folder-", "");
                } else {
                    containerId = containerSelection;
                }

                tasks.push({
                    regionId: regionId,
                    profile: formData[`profile-${regionId}`],
                    containerId: containerId,
                    folderId: folderId,
                    count: formData[`count-${regionId}`],
                    tier: tier,
                    maxItems: maxItems // Передаем максимальное количество предметов
                });
            }
        }

        if (tasks.length === 0) {
            ui.notifications.warn("Отметьте галочками регионы для генерации!");
            return;
        }

        ui.notifications.info(`Запуск генерации...`);
        
        for (const task of tasks) {
            const region = scene.regions.get(task.regionId);
            if (region) {
                await LootSpawner.spawnInRegion(region, task);
            }
        }
    }
}