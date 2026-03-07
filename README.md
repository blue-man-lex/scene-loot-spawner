# 📋 Scene Loot Spawner - Полное техническое описание

## 🎯 Обзор модуля

**Scene Loot Spawner (SLS)** - модуль для Foundry VTT, предоставляющий три инструмента для работы с лутом:
1. **Генератор лута** - создание контейнеров с предметами
2. **Рука лута** - автоматический сбор ингредиентов по биомам  
3. **Глаз лута** - осмотр и управление лутом на сцене

## 🏗️ Архитектура модуля

### 📁 Структура файлов
```
scene-loot-spawner/
├── scripts/
│   ├── main.js                    # Точка входа, регистрация UI и API
│   ├── config.js                  # Конфигурация модуля
│   ├── lootGenerator.js           # Генератор лута для контейнеров
│   ├── regionHandler.js           # Обработка регионов/биомов
│   ├── spawner.js                 # Создание контейнеров
│   ├── lootApp.js                 # UI генератора лута
│   ├── hand/                      # 🤚 "Рука лута"
│   │   ├── ingredientCollector.js # Сборщик ингредиентов (логика)
│   │   ├── ingredientGenerator.js # Генератор ингредиентов (данные)
│   │   └── ingredientHandApp.js   # UI руки лута (интерфейс)
│   └── eye/
│       └── lootEyeApp.js          # UI глаза лута
├── styles/
│   ├── spawner.css                # Стили генератора
│   ├── hand.css                   # Стили руки лута
│   └── eye.css                    # Стили глаза лута
├── templates/
│   ├── loot-window.hbs            # Шаблон генератора
│   ├── hand/ingredient-hand.hbs  # Шаблон руки лута
│   └── eye/loot-eye.hbs          # Шаблон глаза лута
├── assets/
│   ├── biomes/                    # Картинки биомов
│   └── containers/                # Картинки контейнеров
└── packs/
    └── BG3/                       # Компендиум BG3 предметов
```

---

# 🤚 "Рука Лута" - Детальный разбор

## 🎯 Функциональность

"Рука лута" - система автоматического сбора ингредиентов, которая позволяет игрокам пассивно собирать ресурсы в зависимости от выбранного биома.

### 🔄 Процесс работы

#### 1. Инициализация модуля (main.js)
```javascript
// При загрузке модуля создается API для доступа к коллектору
Hooks.once("ready", async () => {
    const moduleData = game.modules.get("scene-loot-spawner");
    moduleData.api = moduleData.api || {};
    moduleData.api.collector = new IngredientCollector();
    console.log("SLS HAND | Личный коллектор создан");
});
```

#### 2. Регистрация UI кнопки (main.js)
```javascript
{
    name: "lootHand",
    title: "Рука Лута", 
    icon: "fas fa-hand",
    onClick: () => new IngredientHandApp().render(true),
    button: true,
    visible: true // Доступно всем игрокам
}
```

## 🧬 Основные компоненты "Руки Лута"

### 🏭 IngredientGenerator (ingredientGenerator.js)

**Назначение:** Загрузка и обработка ингредиентов из компендиумов

#### Ключевые методы:
```javascript
// Инициализация и загрузка данных
async initialize() {
    const lootIds = getIds("lootSources");     // Общие компендиумы
    const alchemyIds = getIds("alchemySources"); // Алхимические
    const bg3Ids = getIds("bg3Sources");        // BG3 предметы
    
    // Загрузка из всех источников
    for (const id of allSourceIds) {
        const pack = game.packs.get(id);
        const index = await pack.getIndex({ fields: ["type", "system.type.subtype", "system.rarity"] });
        // Обработка данных...
    }
}

// Категоризация ингредиентов
categorizeIngredient(ingredient) {
    const name = ingredient.name.toLowerCase();
    
    if (name.includes("трав") || name.includes("herb")) return "herbs";
    if (name.includes("руд") || name.includes("ore")) return "ore";
    if (name.includes("кристал") || name.includes("crystal")) return "crystals";
    // ... и так далее для всех категорий
}

// Генерация случайного ингредиента
generateIngredient(biome, selectedTypes, rarityFilters) {
    const available = this.getAvailableIngredients(biome, selectedTypes, rarityFilters);
    const roll = Math.random() * 100;
    const potentialDrops = available.filter(item => roll <= item.chance);
    return potentialDrops[Math.floor(Math.random() * potentialDrops.length)];
}
```

#### 📊 Категории ингредиентов:
- `herbs` - травы и растения
- `wood` - древесина и кора  
- `ore` - руда и металлы
- `crystals` - кристаллы и самоцветы
- `reagents` - магические реагенты
- `mushrooms` - грибы и мхи
- `berries` - ягоды и фрукты
- `alchemy` - алхимические предметы
- `bg3` - предметы из BG3
- `other` - прочее

#### 🌍 Модификаторы биомов:
```javascript
biomeModifiers: {
    forest: { 
        "herbs": 2.0, "wood": 1.5, "mushrooms": 2.5, "berries": 2.0,
        "flowers": 1.8, "sap": 1.3, "resin": 1.2, "alchemy": 0.8
    },
    mountain: { 
        "ore": 2.5, "stone": 2.0, "crystals": 2.0, "herbs": 0.5,
        "minerals": 2.2, "gems": 1.8, "metals": 2.3
    },
    swamp: { 
        "herbs": 1.8, "mushrooms": 2.2, "reagents": 1.8, "wood": 0.3,
        "slime": 2.5, "toxins": 2.0, "moss": 1.5, "alchemy": 1.5
    }
    // ... и другие биомы
}
```

### 📦 IngredientCollector (ingredientCollector.js)

**Назначение:** Управление состоянием и процессом сбора ингредиентов

#### Ключевые свойства:
```javascript
class IngredientCollector {
    constructor() {
        // Состояние сбора
        this.isActive = false;        // Активен ли сбор
        this.timer = null;           // Таймер для тиков
        
        // Механика попыток
        this.attemptProgress = 0;    // Текущий прогресс (0-100)
        this.attemptMax = 100;       // Максимум для попытки
        
        // Цели и результаты
        this.collectedCount = 0;     // Сколько собрано
        this.targetCount = 10;        // Цель сбора
        this.collected = [];          // Массив собранных
        
        // Настройки (память)
        this.lastBiome = "forest";
        this.lastTypes = [];
        this.lastRarities = ["common", "uncommon", "rare", "veryRare", "legendary"];
        this.collectionRate = 1.0;   // Скорость сбора
    }
}
```

#### Основные методы:
```javascript
// Начать сбор
start(settings) {
    if (this.isActive) return;
    this.updateSettings(settings);
    this.isActive = true;
    
    // Таймер срабатывает каждые 100мс
    this.timer = setInterval(() => this._tick(), 100);
    this._sync(); // Синхронизация с флагами
}

// Основной тик сбора
_tick() {
    if (!this.isActive) return;
    
    const increment = 1 * this.collectionRate; 
    this.attemptProgress += increment;

    // При достижении 100 - попытка найти ингредиент
    if (this.attemptProgress >= this.attemptMax) {
        this.attemptProgress = 0;
        this._attemptToFind();
    }
    
    // Синхронизация каждые 10 единиц прогресса
    if (Math.floor(this.attemptProgress) % 10 === 0) {
        this._sync();
    }
}

// Попытка найти ингредиент
_attemptToFind() {
    const ingredient = this.generator.generateIngredient(
        this.lastBiome, 
        this.lastTypes, 
        this.lastRarities
    );
    
    if (ingredient) {
        this.addToCollected(ingredient);
        this.collectedCount++;
        
        // Проверка достижения цели
        if (this.collectedCount >= this.targetCount) {
            this.stop();
            ui.notifications.info(`Рука Лута: Цель достигнута!`);
        }
        this._sync();
    }
}

// Добавление в коллекцию
addToCollected(ingredient) {
    const existing = this.collected.find(item => item.id === ingredient.id);
    if (existing) {
        existing.quantity++; // Увеличиваем количество если уже есть
    } else {
        // Добавляем новый предмет с UUID для полной синхронизации
        this.collected.push({
            ...ingredient, 
            quantity: 1,
            uuid: ingredient.uuid,
            type: ingredient.type,
            rarity: ingredient.rarity || "common"
        });
    }
}

// Синхронизация состояния с флагами пользователя
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
```

### 🖥️ IngredientHandApp (ingredientHandApp.js)

**Назначение:** UI интерфейс для управления сбором ингредиентов

#### Основные функции:
```javascript
class IngredientHandApp extends FormApplication {
    constructor(options = {}) {
        super(options);
        
        // Получение личного коллектора
        this.myCollector = game.modules.get("scene-loot-spawner").api.collector;
        this.generator = this.myCollector.generator;
        
        // Кого смотрим (себя или другого игрока)
        this.watchedUserId = game.user.id;
        this.uiTimer = null; // Таймер обновления UI
    }
}
```

#### 🎮 Управление интерфейсом:
```javascript
// Получение данных для отображения
get activeData() {
    if (this.watchedUserId === game.user.id) {
        // Смотрим себя - живые данные
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
        // Смотрим другого - данные из флагов
        const user = game.users.get(this.watchedUserId);
        const state = user?.getFlag("scene-loot-spawner", "handState") || {};
        return { /* данные из флагов */ };
    }
}

// Управление сбором
startCollection() {
    this.myCollector.start({
        biome: this.myCollector.lastBiome,
        types: this.myCollector.lastTypes,
        rarities: this.myCollector.lastRarities,
        target: this.myCollector.targetCount,
        speed: this.myCollector.collectionRate
    });
    this._startUiUpdate();
}

// Сбор результатов
async collectResults() {
    const collected = this.myCollector.collectResults();
    
    // Синхронизация предметов через UUID
    const itemsData = [];
    for (const itemData of collected) {
        try {
            const originalItem = await fromUuid(itemData.uuid);
            if (originalItem) {
                const itemObject = originalItem.toObject();
                itemObject.system.quantity = itemData.quantity;
                itemsData.push(itemObject);
            }
        } catch (err) {
            console.error(`Ошибка загрузки UUID ${itemData.uuid}:`, err);
        }
    }
    
    // Выдача предметов персонажу
    const actor = game.user.character;
    if (actor && itemsData.length > 0) {
        await actor.createEmbeddedDocuments("Item", itemsData);
        ui.notifications.info(`Получено ${itemsData.length} предметов.`);
    }
}
```

## 🎨 Интерфейс "Руки Лута"

### 📋 Структура шаблона (ingredient-hand.hbs)

#### 1. **Хедер** - статус и управление
```handlebars
<header class="hand-header">
    <h2><i class="fas fa-hand-holding-magic"></i> Рука Лута</h2>
    
    <!-- Выбор пользователя (только для ГМ) -->
    {{#if isGM}}
    <select id="user-select">
        {{#each users}}
        <option value="{{this.id}}" {{#if this.isSelected}}selected{{/if}}>
            {{this.name}} {{#if this.isActive}}(Активен){{/if}}
        </option>
        {{/each}}
    </select>
    {{/if}}
    
    <!-- Статус сбора -->
    <div class="hand-status">
        {{#if isCollecting}}
            <span class="status-active"><i class="fas fa-cog fa-spin"></i> Сбор идет...</span>
        {{else}}
            <span class="status-inactive"><i class="fas fa-pause"></i> Ожидание</span>
        {{/if}}
    </div>
</header>
```

#### 2. **Панель настроек** - биом, цель, скорость, фильтры
```handlebars
<section class="settings-panel">
    <!-- Основные параметры -->
    <div class="settings-row compact-row">
        <div class="control-group">
            <label for="biome-select">Биом:</label>
            <select id="biome-select">
                {{#each biomes}}
                    <option value="{{this.key}}" {{#if (eq this.key ../currentBiome)}}selected{{/if}}>
                        {{this.label}}
                    </option>
                {{/each}}
            </select>
        </div>
        
        <div class="control-group">
            <label for="target-amount">Цель:</label>
            <input type="number" id="target-amount" value="{{targetAmount}}" min="1" max="500">
        </div>

        <div class="control-group">
            <label for="collection-speed">Скорость:</label>
            <select id="collection-speed">
                <option value="0.1">x0.1 (AFK)</option>
                <option value="1.0">x1.0 (Норма)</option>
                <option value="5.0">x5.0 (Турбо)</option>
            </select>
        </div>
    </div>
    
    <!-- Фильтры редкости и типов -->
    <div class="settings-row filters-row">
        <div class="filter-column">
            <div class="filter-group">
                <div class="filter-label">Редкость:</div>
                <div class="checkbox-group rarity-group">
                    <label><input type="checkbox" name="rarityType" value="common"> Обычные</label>
                    <label><input type="checkbox" name="rarityType" value="uncommon"> Необычные</label>
                    <!-- ... и так далее -->
                </div>
            </div>
            
            <div class="filter-group">
                <div class="filter-label">Типы:</div>
                <div class="checkbox-group types-group">
                    <label><input type="checkbox" name="ingredientType" value="herbs"> Травы</label>
                    <label><input type="checkbox" name="ingredientType" value="wood"> Дерево</label>
                    <!-- ... и так далее -->
                </div>
            </div>
        </div>
        
        <!-- Превью доступных ингредиентов -->
        <div class="filter-column">
            <div class="filter-group">
                <div class="filter-label">Шанс найти в биоме:</div>
                <div class="available-grid">
                    {{#each availableIngredients}}
                        <div class="ingredient-card rarity-{{this.rarity}}">
                            <img src="{{this.img}}">
                            <span class="ing-name">{{this.name}}</span>
                            <span class="ing-chance">{{this.chance}}%</span>
                        </div>
                    {{/each}}
                </div>
            </div>
        </div>
    </div>
</section>
```

#### 3. **Панель прогресса** - визуализация сбора
```handlebars
<section class="progress-panel">
    <!-- Картинка биома -->
    <div class="biome-image-container">
        <img src="modules/scene-loot-spawner/assets/biomes/{{currentBiome}}.png" 
             class="biome-image">
    </div>
    
    <!-- Прогресс-бар -->
    <div class="progress-container">
        <div class="progress-fill" style="width: {{progress.percentage}}%"></div>
        <div class="progress-text">{{progress.current}} / {{progress.max}} ({{progress.percentage}}%)</div>
    </div>

    <!-- Статистика -->
    <div class="stats-row">
        <span>Скорость: <b>{{progress.rate}}/тик</b></span>
        <span>Собрано типов: <b>{{collected.length}}</b></span>
    </div>
</section>
```

#### 4. **Панель результатов** - собранные ингредиенты
```handlebars
<section class="results-panel">
    <div class="collected-list">
        {{#if collected.length}}
            {{#each collected}}
                <div class="collected-item rarity-{{this.rarity}}">
                    <img src="{{this.img}}">
                    <div class="ing-name">{{this.name}}</div>
                    <span class="collected-qty">x{{this.quantity}}</span>
                </div>
            {{/each}}
        {{else}}
            <div class="empty-state">
                <i class="fas fa-basket-shopping"></i>
                <span>Пусто...</span>
            </div>
        {{/if}}
    </div>
</section>
```

#### 5. **Футер** - кнопки управления
```handlebars
<footer class="hand-footer">
    {{#if isSelf}}
        <!-- Управление для своего профиля -->
        {{#if isCollecting}}
            <button id="stop-collection" class="btn btn-stop">
                <i class="fas fa-stop"></i> Стоп
            </button>
        {{else}}
            <button id="start-collection" class="btn btn-start">
                <i class="fas fa-play"></i> Старт
            </button>
        {{/if}}

        <button id="collect-results" class="btn btn-collect" {{#unless collected.length}}disabled{{/unless}}>
            <i class="fas fa-download"></i> Забрать всё
        </button>

        <button id="reset-progress" class="btn btn-reset">
            <i class="fas fa-redo"></i> Сброс
        </button>
    {{else}}
        <!-- Просмотр чужого профиля -->
        {{#if isGM}}
            {{#if isCollecting}}
                <button id="force-stop" class="btn btn-stop">
                    <i class="fas fa-ban"></i> Принудительный СТОП
                </button>
            {{else}}
                <div>Игрок не собирает</div>
            {{/if}}
        {{else}}
            <div>Просмотр режима</div>
        {{/if}}
    {{/if}}
</footer>
```

## 🔄 Обращение между файлами

### 📡 Цепочка вызовов и взаимодействия

```
🎮 UI Клик (ingredientHandApp.js)
    ↓
⚙️ Методы коллектора (ingredientCollector.js)  
    ↓
📊 Генерация данных (ingredientGenerator.js)
    ↓
🔄 Синхронизация состояния (флаги пользователя)
    ↓
🖥️ Обновление интерфейса (ingredientHandApp.js)
```

### 🔗 Ключевые точки взаимодействия

#### 1. **Инициализация API (main.js → ingredientCollector.js)**
```javascript
// main.js
const moduleData = game.modules.get("scene-loot-spawner");
moduleData.api.collector = new IngredientCollector();

// ingredientCollector.js  
constructor() {
    this.generator = new IngredientGenerator(); // Создает генератор
}
```

#### 2. **UI → Логика (ingredientHandApp.js → ingredientCollector.js)**
```javascript
// ingredientHandApp.js - кнопка старт
startCollection() {
    this.myCollector.start({
        biome: this.myCollector.lastBiome,
        types: this.myCollector.lastTypes,
        // ...
    });
}

// ingredientCollector.js - обработка старта
start(settings) {
    this.updateSettings(settings);
    this.isActive = true;
    this.timer = setInterval(() => this._tick(), 100);
}
```

#### 3. **Логика → Данные (ingredientCollector.js → ingredientGenerator.js)**
```javascript
// ingredientCollector.js - попытка найти ингредиент
_attemptToFind() {
    const ingredient = this.generator.generateIngredient(
        this.lastBiome, 
        this.lastTypes, 
        this.lastRarities
    );
    // ...
}

// ingredientGenerator.js - генерация
generateIngredient(biome, selectedTypes, rarityFilters) {
    const available = this.getAvailableIngredients(biome, selectedTypes, rarityFilters);
    // Логика выбора случайного ингредиента
}
```

#### 4. **Синхронизация состояния (ingredientCollector.js → Foundry флаги)**
```javascript
// ingredientCollector.js
async _sync() {
    const state = {
        isActive: this.isActive,
        progress: Math.floor(this.attemptProgress),
        collectedCount: this.collectedCount,
        collected: this.collected,
        biome: this.lastBiome,
        types: this.lastTypes,
        rarities: this.lastRarities
    };
    await game.user.setFlag("scene-loot-spawner", "handState", state);
}
```

#### 5. **Мультиплеер через сокеты (main.js)**
```javascript
// Регистрация сокета для ГМ контроля
game.socketlib.registerModule("scene-loot-spawner", "forceStopHand", (targetUserId) => {
    if (game.user.id === targetUserId) {
        const collector = game.modules.get("scene-loot-spawner").api.collector;
        if (collector) {
            collector.stop();
            ui.notifications.warn("ГМ остановил ваш сбор.");
        }
    }
});

// Вызов из UI (ingredientHandApp.js)
html.find('#force-stop').click(async () => {
    if (game.socketlib) {
        await game.socketlib.executeAsUser("forceStopHand", this.watchedUserId, this.watchedUserId);
        ui.notifications.info("Команда остановки отправлена.");
    }
});
```

## 🎯 Ключевые особенности системы

### ✨ Преимущества архитектуры

1. **Модульность** - каждый компонент отвечает за свою функцию
2. **Состояние** - сохраняется в флагах пользователя
3. **Реальное время** - обновление каждую секунду
4. **Мультиплеер** - ГМ может контролировать игроков
5. **UUID синхронизация** - полные данные предметов при выдаче
6. **Гибкость** - множество настроек биомов, типов, редкостей

### ⚙️ Технические детали

#### **Timer-based система:**
- Обновление каждые 100мс для плавности
- Синхронизация UI каждую секунду
- Прогресс 0-100 для каждой "попытки" сбора

#### **Хранение данных:**
```javascript
// Структура флага пользователя
{
    isActive: boolean,        // Активен ли сбор
    progress: number,         // Текущий прогресс 0-100
    collectedCount: number,   // Сколько всего собрано
    targetCount: number,      // Цель сбора
    collected: Array,         // Массив собранных предметов
    biome: string,           // Текущий биом
    types: Array,            // Выбранные типы ингредиентов
    rarities: Array          // Выбранные редкости
}
```

#### **UUID синхронизация:**
```javascript
// При сборе сохраняем UUID для полной синхронизации
this.collected.push({
    ...ingredient, 
    quantity: 1,
    uuid: ingredient.uuid,  // Важно для восстановления полных данных
    type: ingredient.type,
    rarity: ingredient.rarity || "common"
});

// При выдаче восстанавливаем полные данные
const originalItem = await fromUuid(itemData.uuid);
const itemObject = originalItem.toObject();
itemObject.system.quantity = itemData.quantity;
```

## 🔧 Что и где править

### 📝 Основные файлы для модификации:

#### **1. ingredientGenerator.js** - Данные и логика генерации
- **Добавление новых биомов:** расширить `biomeModifiers`
- **Новые категории ингредиентов:** изменить `categorizeIngredient()`
- **Источники данных:** изменить настройки компендиумов
- **Модификаторы шансов:** изменить `getAvailableIngredients()`

#### **2. ingredientCollector.js** - Механика сбора
- **Скорость сбора:** изменить `collectionRate` и `_tick()`
- **Механика прогресса:** изменить `attemptProgress` логику
- **Обработка результатов:** изменить `addToCollected()`
- **Синхронизация:** изменить `_sync()` структуру данных

#### **3. ingredientHandApp.js** - UI интерфейс
- **Новые элементы управления:** изменить `activateListeners()`
- **Обработка данных:** изменить `getData()` и `activeData`
- **Визуализация:** изменить методы обновления UI
- **Мультиплеер функции:** изменить логику просмотра других игроков

#### **4. hand.css** - Стили интерфейса
- **Визуальное оформление:** изменить цвета, размеры, анимации
- **Адаптивность:** изменить медиа-запросы
- **Редкость предметов:** изменить стили для разных уровней
- **Прогресс-бары:** изменить визуализацию прогресса

#### **5. ingredient-hand.hbs** - Шаблон UI
- **Структура интерфейса:** изменить расположение элементов
- **Новые поля:** добавить новые настройки или отображения
- **Локализация:** изменить тексты и Labels

### 🎯 Частые задачи модификации:

#### **Добавление нового биома:**
```javascript
// ingredientGenerator.js
biomeModifiers: {
    // ... существующие биомы
    "volcano": { 
        "ore": 3.0, "crystals": 2.5, "reagents": 2.0,
        "fire_resistance": 2.0, "magma": 3.0, "ash": 2.8
    }
}

// ingredientHandApp.js
getBiomeList() {
    return [
        // ... существующие
        { key: "volcano", label: "Вулкан" }
    ];
}
```

#### **Добавление новой категории ингредиентов:**
```javascript
// ingredientGenerator.js
categorizeIngredient(ingredient) {
    const name = ingredient.name.toLowerCase();
    
    // ... существующие проверки
    
    if (name.includes("магма") || name.includes("lava")) return "volcanic";
    if (name.includes("пепел") || name.includes("ash")) return "volcanic";
    
    return "other";
}
```

#### **Изменение скорости сбора:**
```javascript
// ingredientCollector.js
_tick() {
    if (!this.isActive) return;
    
    // Увеличиваем базовый прирост с 1 до 2
    const increment = 2 * this.collectionRate; 
    this.attemptProgress += increment;
    
    // Уменьшаем максимум с 100 до 50 для ускорения
    if (this.attemptProgress >= 50) {
        this.attemptProgress = 0;
        this._attemptToFind();
    }
}
```

---

## 🏆 Заключение

"Рука лута" - это сложная, но хорошо структурированная система, которая обеспечивает:

1. **Пассивный геймплей** - игроки могут собирать ресурсы без активных действий
2. **Кастомизацию** - множество настроек под разные нужды
3. **Визуальную привлекательность** - красивый интерфейс с анимациями
4. **Мультиплеер** - полноценная работа в сетевой игре
5. **Интеграцию** - совместимость с любыми компендиумами Foundry

Система построена по принципу разделения ответственности, где каждый компонент выполняет свою функцию и обменивается данными через четкие API. Это делает код поддерживаемым и расширяемым.
