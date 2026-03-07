# 📋 ОТЧЕТ: ФОРМИРОВАНИЕ ИНСТРУМЕНТОВ В FOUNDRY VTT

## 🎯 **ОБЩАЯ АРХИТЕКТУРА**

### 🏗️ **Основные компоненты системы:**

1. **`SceneControls`** (`resources/app/client/applications/ui/scene-controls.mjs`)
   - Главный класс UI для управления инструментами
   - Отвечает за рендеринг, переключение и обработку событий

2. **`CONFIG.Canvas.layers`** (`resources/app/client/config.mjs`)
   - Конфигурация всех слоев Canvas
   - Каждый слой имеет свои инструменты

3. **`InteractionLayer`** (`resources/app/client/canvas/layers/base/interaction-layer.mjs`)
   - Базовый класс для интерактивных слоев
   - Предоставляет методы `activate()`/`deactivate()`

4. **`prepareSceneControls()`** - Статический метод каждого слоя
   - Определяет инструменты для конкретного слоя

---

## 🔧 **ПОШАГОВЫЙ ПРОЦЕСС ФОРМИРОВАНИЯ**

### **ШАГ 1: Определение слоев в CONFIG**
```javascript
// В resources/app/client/config.mjs (строки 632-680)
CONFIG.Canvas.layers = {
  tokens: {
    layerClass: canvas.layers.TokenLayer,
    group: "interface"
  },
  walls: {
    layerClass: canvas.layers.WallsLayer,
    group: "interface"
  },
  lighting: {
    layerClass: canvas.layers.LightingLayer,
    group: "interface"
  },
  regions: {
    layerClass: canvas.layers.RegionLayer,
    group: "interface"
  },
  // ... другие слои
};
```

### **ШАГ 2: Создание инструментов в каждом слое**
Каждый слой наследуется от `InteractionLayer` и имеет статический метод:

```javascript
// Пример из TokenLayer (строки 560-637)
static prepareSceneControls() {
  const sc = SceneControls;
  return {
    name: "tokens",           // Уникальное имя слоя
    order: 1,                // Порядок отображения
    title: "CONTROLS.GroupToken", // Заголовок (локализация)
    icon: "fa-solid fa-user-large", // Иконка слоя
    onChange: (event, active) => {  // Callback при смене слоя
      if (active) canvas.tokens.activate();
    },
    onToolChange: () => canvas.tokens.setAllRenderFlags({refreshState: true}),
    tools: {
      select: {
        name: "select",
        order: 1,
        title: "CONTROLS.BasicSelect",
        icon: "fa-solid fa-expand",
        toolclip: { // Видеоподсказка
          src: "toolclips/tools/token-select.webm",
          heading: "CONTROLS.BasicSelect",
          items: sc.buildToolclipItems([
            {paragraph: "CONTROLS.BasicSelectP"},
            "selectAlt", "selectMultiple", "move", "rotate", "hud", "sheet",
            game.user.isGM ? "editAlt" : null,
            game.user.isGM ? "delete" : null,
            {heading: "CONTROLS.RulerPlaceWaypoint", reference: "CONTROLS.CtrlClick"},
            {heading: "CONTROLS.RulerRemoveWaypoint", reference: "CONTROLS.RightClick"}
          ])
        }
      },
      target: {
        name: "target",
        order: 2,
        title: "CONTROLS.TargetSelect",
        icon: "fa-solid fa-bullseye"
      },
      ruler: {
        name: "ruler",
        order: 3,
        title: "CONTROLS.BasicMeasure",
        icon: "fa-solid fa-ruler"
      },
      unconstrainedMovement: {
        name: "unconstrainedMovement",
        order: 4,
        title: "CONTROLS.UnconstrainedMovement",
        icon: "fa-solid fa-ghost",
        toggle: true,  // Это переключатель
        active: game.settings.get("core", "unconstrainedMovement"),
        visible: game.user.isGM,
        onChange: (event, toggled) => {
          game.settings.set("core", "unconstrainedMovement", toggled);
        }
      }
    },
    activeTool: "select"     // Активный инструмент по умолчанию
  };
}
```

### **ШАГ 3: Сбор всех контролов в SceneControls**
В методе `SceneControls.#prepareControls()` (строки 323-354):

```javascript
#prepareControls() {
  // 1. Получаем контролы из всех слоев
  const controls = {};
  for (const {layerClass} of Object.values(CONFIG.Canvas.layers)) {
    if (!foundry.utils.isSubclass(layerClass, InteractionLayer)) continue;
    const control = layerClass.prepareSceneControls();
    if (!control) continue; // Слой недоступен текущему пользователю
    controls[control.name] = control;
  }

  // 2. Позволяем модулям добавлять свои контролы
  Hooks.callAll("getSceneControlButtons", controls);

  // 3. Очищаем и фильтруем
  for (const [controlId, control] of Object.entries(controls)) {
    if (control.visible === false) { // Слой недоступен
      delete controls[controlId];
      continue;
    }
    this.#tools[control.name] ||= control.activeTool;
    for (const [toolId, tool] of Object.entries(control.tools)) {
      if (tool.visible === false) delete control.tools[toolId];
      if (tool.toggle && tool.button) {
        console.warn(`SceneControlTool "${controlId}.${toolId}" may not be both a toggle and a button.`);
        tool.button = false;
      }
    }
    if (foundry.utils.isEmpty(control.tools)) delete controls[controlId];
  }
  return controls;
}
```

### **ШАГ 4: Рендеринг в UI**
Шаблон `resources/app/templates/ui/scene-controls-tools.hbs`:

```handlebars
<menu class="flexcol" data-tooltip-direction="RIGHT">
    {{#each tools as |tool|}}
    <li>
        <button type="button" class="control ui-control tool icon {{tool.cssClass}} {{tool.icon}}" 
                data-action="tool" data-tool="{{tool.name}}" 
                aria-label="{{localize tool.title}}" aria-pressed="{{tool.active}}"
                {{#if tool.showToolclip}}data-toolclip{{else}}data-tooltip{{/if}}>
        </button>
    </li>
    {{/each}}
</menu>
```

---

## 🎨 **СТРУКТУРА ИНСТРУМЕНТА**

### **Полный набор свойств:**
```javascript
{
  // Основные свойства
  name: "select",                    // Уникальное имя инструмента
  order: 1,                         // Порядок в меню
  title: "CONTROLS.BasicSelect",     // Локализованный заголовок
  icon: "fa-solid fa-expand",       // Font Awesome иконка
  
  // Поведение
  visible: true,                    // Видимость для текущего пользователя
  toggle: false,                    // Это переключатель?
  button: false,                    // Это кнопка (срабатывает сразу)?
  active: false,                    // Активен ли сейчас?
  
  // Callbacks
  onChange: (event, active) => {},  // Callback при смене состояния
  onClick: (event, active) => {},   // Устаревший, использовать onChange
  
  // Видеоподсказка
  toolclip: {
    src: "toolclips/tools/token-select.webm",
    heading: "CONTROLS.BasicSelect",
    items: [
      {paragraph: "CONTROLS.BasicSelectP"},
      "selectAlt", "selectMultiple", "move", "rotate"
    ]
  }
}
```

---

## 🔄 **СИСТЕМА СОБЫТИЙ**

### **Обработка кликов на инструменты:**
```javascript
// В SceneControls (строки 525-545)
static #onChangeTool(event) {
  if (!canvas.ready) return;
  const tool = this.control.tools[event.target.dataset.tool];
  if (tool === this.tool) return;
  const options = {event};

  // Кнопки (button: true)
  if (tool.button) {
    this.#onChange(tool, event, true);
    return;
  }

  // Переключатели (toggle: true)
  if (tool.toggle) {
    options.toggles = {[tool.name]: !tool.active};
  }
  // Обычные инструменты
  else options.tool = tool.name;
  
  this.activate(options);
}
```

### **Активация слоя:**
```javascript
// В InteractionLayer (строки 45-76)
activate({tool} = {}) {
  // Деактивируем другие слои
  for (const name of Object.keys(canvas.constructor.layers)) {
    const layer = canvas[name];
    if ((layer !== this) && (layer instanceof InteractionLayer)) {
      layer.deactivate();
    }
  }

  // Активируем SceneControls если нужно
  const control = this.constructor.layerOptions.name;
  if ((control !== ui.controls.control.name) || (tool && (tool !== ui.controls.tool.name))) {
    ui.controls.activate({control, tool});
  }

  // Делаем слой интерактивным
  this.eventMode = "static";
  this.interactiveChildren = true;
  
  // Вызываем хуки
  Hooks.callAll(`activate${this.hookName}`, this);
  Hooks.callAll("activateCanvasLayer", this);
}
```

---

## 🎯 **ХУКИ ДЛЯ МОДУЛЕЙ**

### **1. Добавление контролов (старый метод):**
```javascript
// V11 и ранее - УСТАРЕВШИЙ
Hooks.on("renderSceneControls", (controls, html) => {
  const buttonData = {
    name: "myTool",
    title: "My Tool",
    icon: "fa-solid fa-star",
    button: true,
    visible: game.user.isGM
  };
  
  if (Array.isArray(controls)) controls.push(buttonData);
  else controls.myTool = buttonData;
});
```

### **2. Добавление контролов (новый метод):**
```javascript
// V12+ - РЕКОМЕНДУЕМЫЙ
Hooks.on("getSceneControlButtons", (controls) => {
  controls.myLayer = {
    name: "myLayer",
    order: 10,
    title: "MyModule.Title",
    icon: "fa-solid fa-star",
    visible: game.user.isGM,
    tools: {
      myTool: {
        name: "myTool",
        title: "MyModule.Tool",
        icon: "fa-solid fa-wrench",
        button: true,
        onClick: () => console.log("Tool clicked!")
      }
    },
    activeTool: "myTool"
  };
});
```

### **3. Создание полного слоя (самый правильный):**
```javascript
// Создаем класс слоя
export default class MyLayer extends InteractionLayer {
  static layerOptions = {
    name: "myLayer",
    zIndex: 300
  };

  static prepareSceneControls() {
    return {
      name: "myLayer",
      order: 10,
      title: "MyModule.Title",
      icon: "fa-solid fa-star",
      visible: game.user.isGM,
      tools: {
        tool1: {
          name: "tool1",
          order: 1,
          title: "MyModule.Tool1",
          icon: "fa-solid fa-wrench",
          button: true,
          onClick: () => new MyApp1().render(true)
        },
        tool2: {
          name: "tool2",
          order: 2,
          title: "MyModule.Tool2", 
          icon: "fa-solid fa-hand",
          button: true,
          onClick: () => new MyApp2().render(true)
        }
      },
      activeTool: "tool1"
    };
  }
}

// Регистрируем слой
Hooks.on("canvasInit", () => {
  CONFIG.Canvas.layers.myLayer = {
    layerClass: MyLayer,
    group: "interface"
  };
});
```

---

## ⚠️ **ПРОБЛЕМЫ СТАРОГО ПОДХОДА**

### **Почему ваш модуль вызывает ошибки:**

1. **Конфликт с новой системой**: Старый метод `renderSceneControls` конфликтует с новой архитектурой V12
2. **Залипание кнопок**: Отсутствие правильной обработки `active` состояния
3. **Ошибки переключения**: Неправильная интеграция с `SceneControls.activate()`
4. **Отсутствие слоя**: Инструменты не привязаны к конкретному слою

### **Симптомы проблем:**
- Кнопки "залипают" в нажатом состоянии
- Ошибки в консоли при переключении
- Неправильная обработка видимости
- Конфликты с нативными инструментами

---

## 🛠️ **РЕШЕНИЕ**

Нужно перейти на новую систему:
1. Создать свой слой или использовать хук `getSceneControlButtons`
2. Правильно определить инструменты с `button: true`
3. Использовать `onClick` или `onChange` корректно
4. Обеспечить правильную интеграцию с `SceneControls`

---

## 📊 **СРАВНЕНИЕ ПОДХОДОВ**

| Аспект | Старый подход (V11) | Новый подход (V12+) |
|--------|-------------------|-------------------|
| **Регистрация** | `renderSceneControls` | `getSceneControlButtons` |
| **Структура** | Массив кнопок | Объект контролов с инструментами |
| **Интеграция** | Прямое добавление в DOM | Через SceneControls |
| **Обработка** | jQuery события | Нативные обработчики |
| **Слои** | Отсутствуют | Привязка к слоям |
| **Стабильность** | Проблемы в V12+ | Полная совместимость |

---

## 🎯 **ВЫВОД**

Система инструментов в Foundry VTT V12+ полностью переработана. Использование старых методов вызывает ошибки и залипание кнопок. Рекомендуется полностью перейти на новую архитектуру с использованием слоев и хука `getSceneControlButtons`.
