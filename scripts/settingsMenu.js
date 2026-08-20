export class LootSourcesMenu extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "loot-sources-menu",
            title: "Библиотеки (Компендиумы)",
            template: "modules/scene-loot-spawner/templates/sources-menu.hbs",
            width: 450,
            height: "auto",
            classes: ["scene-loot-spawner", "sources-menu", "sls-window"]
        });
    }

    getData() {
        const currentSources = game.settings.get("scene-loot-spawner", "lootSources") || [];
        // Support backward compatibility (if string)
        let currentIds = [];
        if (Array.isArray(currentSources)) {
            currentIds = currentSources;
        } else if (typeof currentSources === "string") {
            currentIds = currentSources.split(",").map(s => s.trim()).filter(s => s.length > 0);
        }

        const packList = [];
        const itemPacks = game.packs.filter(p => p.metadata.type === "Item").sort((a, b) => a.metadata.label.localeCompare(b.metadata.label));

        for (const pack of itemPacks) {
            const packId = pack.metadata.id;
            
            const packData = {
                id: packId,
                label: pack.metadata.label,
                checked: currentIds.includes(packId),
                folders: []
            };

            // Папки внутри пака
            if (pack.folders && pack.folders.size > 0) {
                const folders = Array.from(pack.folders.values()).sort((a, b) => a.name.localeCompare(b.name));
                for (const folder of folders) {
                    const combinedId = `${packId}:${folder.id}`;
                    packData.folders.push({
                        id: combinedId,
                        label: folder.name,
                        checked: currentIds.includes(combinedId)
                    });
                }
            }
            packList.push(packData);
        }

        return { packs: packList };
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        // Предотвращаем сворачивание/разворачивание при клике на сам чекбокс
        html.find("summary input[type='checkbox']").on("click", (e) => {
            e.stopPropagation();
        });
        
        // Умный поиск с учетом иерархии
        html.find("#pack-search").on("keyup", (e) => {
            const term = e.currentTarget.value.toLowerCase();
            
            if (term === "") {
                // Если поиск очищен, возвращаем всё к исходному (свернутому) состоянию
                html.find(".pack-container").show().prop("open", false);
                html.find(".folder-item").show();
                return;
            }
            
            html.find(".pack-container").each((i, packEl) => {
                const $pack = $(packEl);
                const packName = $pack.data("name").toLowerCase();
                let packMatches = packName.includes(term);
                let folderMatches = false;
                
                $pack.find(".folder-item").each((j, folderEl) => {
                    const $folder = $(folderEl);
                    const folderName = $folder.data("name").toLowerCase();
                    if (folderName.includes(term)) {
                        $folder.show();
                        folderMatches = true;
                    } else {
                        $folder.hide();
                    }
                });
                
                if (packMatches) {
                    $pack.show();
                    // Если сам пак совпадает, показываем все его папки и открываем
                    $pack.prop("open", true);
                    $pack.find(".folder-item").show(); 
                } else if (folderMatches) {
                    $pack.show();
                    $pack.prop("open", true); // Раскрываем список, если нашлась папка
                } else {
                    $pack.hide();
                }
            });
        });
    }

    async _updateObject(event, formData) {
        // Collect all checked pack IDs
        const selected = Object.keys(formData).filter(k => formData[k]);
        
        // Очищаем лишние папки: если выбран весь компендиум, нет смысла сохранять его отдельные папки
        const rootPacks = new Set(selected.filter(k => !k.includes(":")));
        const finalSelected = selected.filter(k => {
            if (k.includes(":")) {
                const packId = k.split(":")[0];
                return !rootPacks.has(packId);
            }
            return true;
        });

        await game.settings.set("scene-loot-spawner", "lootSources", finalSelected);
        ui.notifications.info("Библиотеки успешно обновлены.");
    }
}
