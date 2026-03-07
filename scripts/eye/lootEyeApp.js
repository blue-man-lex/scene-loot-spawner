export class LootEyeApp extends FormApplication {
    constructor() {
        super();
        this.selectedTokenId = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "scene-loot-eye",
            title: "Глаз Лута - Инспектор",
            template: "modules/scene-loot-spawner/templates/eye/loot-eye.hbs",
            width: 800,
            height: 600,
            resizable: true,
            classes: ["sls-window", "loot-eye"],
            scrollY: [".token-list", ".eye-content"], 
            dragDrop: [{ dragSelector: null, dropSelector: ".eye-content" }] 
        });
    }

    // Вспомогательная функция: Проверка, лежит ли актер в папке Лута (или вложенных)
    _isInLootFolder(actor) {
        if (!actor.folder) return false;

        const rootName = game.settings.get("scene-loot-spawner", "containerFolder");
        // Ищем корневую папку по имени
        const rootFolder = game.folders.find(f => f.name === rootName && f.type === "Actor");
        if (!rootFolder) return false;

        // Проверяем текущую папку и всех родителей
        let current = actor.folder;
        while (current) {
            if (current.id === rootFolder.id) return true;
            current = current.folder;
        }
        return false;
    }

    getData() {
        const scene = game.scenes.current;
        if (!scene) return { noScene: true };

        const tokens = scene.tokens.contents.filter(t => {
            const actor = t.actor;
            if (!actor) return false;

            // 1. Проверка по папке (Жесткая привязка к Loot Containers)
            const inLootFolder = this._isInLootFolder(actor);

            // 2. Проверка по имени (от Спавнера)
            const isSpawnerCreated = t.name.startsWith("Loot:");

            // 3. Проверка по типу (системный тип loot)
            const isLootType = actor.type === "loot";

            // ВАЖНО: Мы убрали проверку "isItemPile" и "npc", чтобы не цеплять лишних монстров.
            // Теперь показываем только то, что реально относится к нашему модулю или явно является лутом.
            return inLootFolder || isSpawnerCreated || isLootType;
        });

        // 2. Выбор по умолчанию
        if (!this.selectedTokenId && tokens.length > 0) {
            this.selectedTokenId = tokens[0].id;
        }

        // 3. Сбор данных
        let selectedData = null;
        if (this.selectedTokenId) {
            const token = tokens.find(t => t.id === this.selectedTokenId);
            if (token && token.actor) {
                const currency = token.actor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
                selectedData = {
                    id: token.id,
                    name: token.name,
                    img: token.texture.src,
                    currency: currency,
                    items: token.actor.items.map(i => ({
                        id: i.id,
                        name: i.name,
                        img: i.img,
                        quantity: i.system.quantity || 1,
                        rarity: i.system.rarity || "common"
                    }))
                };
            }
        }

        return {
            tokens: tokens.map(t => ({
                id: t.id,
                name: t.name,
                img: t.texture.src,
                isSelected: t.id === this.selectedTokenId
            })),
            selected: selectedData,
            hasTokens: tokens.length > 0
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Клик по токену в списке
        html.find('.token-entry').click(async (e) => {
            const li = $(e.currentTarget);
            this.selectedTokenId = li.data('id');
            
            // Если клик именно по иконке прицела
            if ($(e.target).hasClass('fa-crosshairs')) {
                const token = game.scenes.current.tokens.get(this.selectedTokenId);
                if (token) await canvas.animatePan({ x: token.x, y: token.y, scale: 1.5 });
            }
            
            this.render();
        });

        // --- НОВОЕ: Открытие карточки предмета ---
        html.find('.inventory-item img, .inventory-item .item-name').click(async (e) => {
            e.stopPropagation(); // Чтобы не триггерить лишние события
            
            // Находим ID предмета из соседнего инпута или кнопки удаления
            const itemId = $(e.currentTarget).closest('.inventory-item').find('.item-qty').data('id');
            const token = game.scenes.current.tokens.get(this.selectedTokenId);
            
            if (token && token.actor) {
                const item = token.actor.items.get(itemId);
                if (item) {
                    item.sheet.render(true); // Стандартный метод Foundry для открытия окна
                }
            }
        });

        // Удаление предмета
        html.find('.item-delete').click(async (e) => {
            const itemId = $(e.currentTarget).data('id');
            const token = game.scenes.current.tokens.get(this.selectedTokenId);
            if (token && token.actor) {
                await token.actor.deleteEmbeddedDocuments("Item", [itemId]);
                this.render();
            }
        });

        // Изменение количества
        html.find('.item-qty').change(async (e) => {
            const itemId = $(e.currentTarget).data('id');
            const qty = parseInt(e.target.value) || 1;
            const token = game.scenes.current.tokens.get(this.selectedTokenId);
            if (token && token.actor) {
                const item = token.actor.items.get(itemId);
                if (item) await item.update({ "system.quantity": qty });
            }
        });

        // Изменение валюты
        html.find('.currency-input').change(async (e) => {
            const type = $(e.currentTarget).data('type');
            const value = parseInt(e.target.value) || 0;
            const token = game.scenes.current.tokens.get(this.selectedTokenId);
            if (token && token.actor) {
                await token.actor.update({ [`system.currency.${type}`]: value });
            }
        });
        
        // Удаление токена
        html.find('#delete-token-btn').click(async () => {
            if (confirm("Удалить этот сундук со сцены?")) {
                const token = game.scenes.current.tokens.get(this.selectedTokenId);
                if (token) {
                    await token.delete();
                    this.selectedTokenId = null;
                    this.render();
                }
            }
        });
    }

    async _onDrop(event) {
        if (!this.selectedTokenId) return;
        const data = TextEditor.getDragEventData(event);
        const token = game.scenes.current.tokens.get(this.selectedTokenId);
        
        if (!token || !token.actor) return;

        if (data.type === "Item") {
            const item = await Item.implementation.fromDropData(data);
            if (item) {
                await token.actor.createEmbeddedDocuments("Item", [item.toObject()]);
                ui.notifications.info(`Добавлено: ${item.name}`);
                this.render();
            }
        }
    }
}
