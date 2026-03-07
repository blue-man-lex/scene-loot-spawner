import { SceneLootApp } from "./lootApp.js";
import { IngredientHandApp } from "./hand/ingredientHandApp.js";
import { IngredientCollector } from "./hand/ingredientCollector.js";
import { LootEyeApp } from "./eye/lootEyeApp.js";

// Конфигурация стандартных шаблонов
const DEFAULT_BLUEPRINTS = {
    "Chests": { name: "Деревянный Сундук", img: "modules/scene-loot-spawner/assets/containers/chest.png" },
    "Crates": { name: "Старый Ящик", img: "modules/scene-loot-spawner/assets/containers/crate.png" },
    "Furniture": { name: "Шкаф", img: "modules/scene-loot-spawner/assets/containers/wardrobe.png" },
    "Remains": { name: "Останки", img: "modules/scene-loot-spawner/assets/containers/remains.png" },
    "Barrels": { name: "Бочка", img: "modules/scene-loot-spawner/assets/containers/barrel.png" },
    "Cages": { name: "Клетка", img: "modules/scene-loot-spawner/assets/containers/cage.png" },
    "Treasures": { name: "Сокровищница", img: "modules/scene-loot-spawner/assets/containers/treasure.png" },
    "Misc": { name: "Разное", img: "modules/scene-loot-spawner/assets/containers/basket.png" }
};

// --- ОПРЕДЕЛЕНИЕ СЛОЯ ---
class LootSpawnerLayer extends InteractionLayer {
    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, {
            name: "lootSpawner",
            zIndex: 0
        });
    }

    static prepareSceneControls() {
        const isGM = game.user.isGM;

        return {
            name: "lootSpawner",
            title: "Инструменты Лута",
            icon: "fas fa-boxes",
            visible: true,
            // ВАЖНО: Активный инструмент теперь 'select', а не кнопка вызова окна
            activeTool: "select", 
            tools: {
                // 0. Нейтральный инструмент (чтобы ничего не открывалось само)
                select: {
                    name: "select",
                    title: "Выбор",
                    icon: "fas fa-expand",
                    visible: true
                },
                // 1. Генератор (Только ГМ)
                openSpawnerWindow: {
                    name: "openSpawnerWindow",
                    title: "Генератор Лута",
                    icon: "fas fa-dice-d20",
                    button: true,
                    visible: isGM,
                    onClick: () => new SceneLootApp().render(true)
                },
                // 2. Рука Лута (Все)
                lootHand: {
                    name: "lootHand",
                    title: "Рука Лута",
                    icon: "fas fa-hand",
                    button: true,
                    visible: true,
                    onClick: () => new IngredientHandApp().render(true)
                },
                // 3. Глаз Лута (Только ГМ)
                lootEye: {
                    name: "lootEye",
                    title: "Глаз Лута",
                    icon: "fas fa-eye",
                    button: true,
                    visible: isGM,
                    onClick: () => new LootEyeApp().render(true)
                }
            }
        };
    }

    async _draw(options) { return this; }
    async _tearDown(options) { return this; }
}

// --- INIT: Регистрация ---
Hooks.once("init", () => {
    console.log("SLS | Init");

    // Регистрируем слой
    CONFIG.Canvas.layers.lootSpawner = {
        layerClass: LootSpawnerLayer,
        group: "interface"
    };

    // Настройки модуля
    game.settings.register("scene-loot-spawner", "containerFolder", {
        name: "Папка Контейнеров (Актеры)",
        scope: "world",
        config: true,
        type: String,
        default: "Loot Containers"
    });

    game.settings.register("scene-loot-spawner", "useWorldItems", {
        name: "Использовать предметы из Мира?",
        hint: "Создавать папки в Items и брать предметы оттуда.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("scene-loot-spawner", "lootSources", {
        name: "Компендиумы ингредиентов (Общие)",
        hint: "ID через запятую (dnd5e.items, etc).",
        scope: "world",
        config: true,
        type: String,
        default: "dnd5e.items"
    });

    game.settings.register("scene-loot-spawner", "alchemySources", {
        name: "Компендиумы Алхимии",
        hint: "ID через запятую. Предметы отсюда станут 'Алхимией'.",
        scope: "world",
        config: true,
        type: String,
        default: ""
    });

    game.settings.register("scene-loot-spawner", "bg3Sources", {
        name: "Компендиумы BG3",
        hint: "ID через запятую. Предметы отсюда станут 'BG3'.",
        scope: "world",
        config: true,
        type: String,
        default: "scene-loot-spawner.BG3"
    });

    game.settings.register("scene-loot-spawner", "includeWeaponArmorInHand", {
        name: "Включать оружие/броню в Руку Лута?",
        hint: "Если включено, они попадут в 'Прочее'.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
    });
});

// --- READY: Инициализация логики ---
Hooks.once("ready", async () => {
    const moduleData = game.modules.get("scene-loot-spawner");
    moduleData.api = moduleData.api || {};
    moduleData.api.collector = new IngredientCollector();
    console.log("SLS HAND | Личный коллектор создан");

    if (game.socketlib) {
        game.socketlib.registerModule("scene-loot-spawner", "forceStopHand", (targetUserId) => {
            if (game.user.id === targetUserId) {
                const collector = game.modules.get("scene-loot-spawner").api.collector;
                if (collector) {
                    collector.stop();
                    ui.notifications.warn("ГМ остановил ваш сбор.");
                }
            }
        });
    }

    if (game.user.isGM) {
        await _createDefaultActorFolders();
        if (game.settings.get("scene-loot-spawner", "useWorldItems")) {
            await _createDefaultItemFolders();
        }
    }
});

/** Создание папок АКТЕРОВ */
async function _createDefaultActorFolders() {
    const rootName = game.settings.get("scene-loot-spawner", "containerFolder");
    let rootFolder = game.folders.find(f => f.name === rootName && f.type === "Actor");
    
    if (!rootFolder) {
        rootFolder = await Folder.create({ name: rootName, type: "Actor", folder: null });
        ui.notifications.info(`SLS: База контейнеров создана.`);
    }

    for (const [subName, blueprint] of Object.entries(DEFAULT_BLUEPRINTS)) {
        let subFolder = game.folders.find(f => f.name === subName && f.type === "Actor" && f.folder?.id === rootFolder.id);
        
        if (!subFolder) {
            subFolder = await Folder.create({ name: subName, type: "Actor", folder: rootFolder.id });
        }

        if (subFolder.contents.length === 0) {
            await Actor.create({
                name: blueprint.name,
                type: "npc",
                img: blueprint.img,
                folder: subFolder.id,
                prototypeToken: { 
                    actorLink: false, 
                    disposition: 0, 
                    name: blueprint.name,
                    texture: {
                        src: blueprint.img
                    }
                }
            });
        }
    }
}

/** Создание папок ПРЕДМЕТОВ */
async function _createDefaultItemFolders() {
    const rootName = "Loot Source (SLS)";
    let rootFolder = game.folders.find(f => f.name === rootName && f.type === "Item");
    
    if (!rootFolder) {
        rootFolder = await Folder.create({ name: rootName, type: "Item" });
    }

    const tiers = ["Tier 0 (0-1)", "Tier 1 (1-4)", "Tier 2 (5-10)", "Tier 3 (11-16)", "Tier 4 (17-19)", "Tier 5 (20 - Эпик)"];
    const categories = ["Weapons", "Armor", "Consumables", "Loot"];

    for (const tierName of tiers) {
        let tierFolder = game.folders.find(f => f.name === tierName && f.type === "Item" && f.folder?.id === rootFolder.id);
        if (!tierFolder) {
            tierFolder = await Folder.create({ name: tierName, type: "Item", folder: rootFolder.id });
        }

        for (const catName of categories) {
            let catFolder = game.folders.find(f => f.name === catName && f.type === "Item" && f.folder?.id === tierFolder.id);
            if (!catFolder) {
                await Folder.create({ name: catName, type: "Item", folder: tierFolder.id });
            }
        }
    }
}