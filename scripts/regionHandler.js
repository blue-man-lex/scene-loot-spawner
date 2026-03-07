export class RegionHandler {
    /**
     * Главный метод: Дай мне случайную точку в этом регионе
     * @param {RegionDocument} regionDoc 
     * @returns {Object|null} {x, y, elevation}
     */
    static getRandomPoint(regionDoc) {
        const regionObject = regionDoc.object;
        const shapes = regionDoc.shapes;
        
        // Если шейпов нет, ловить нечего
        if (!shapes || shapes.length === 0) {
            console.error(`SLS HANDLER | Регион "${regionDoc.name}" пуст (нет формы).`);
            return null;
        }

        if (!regionObject) {
            console.error("SLS HANDLER | Ошибка: У региона нет объекта на сцене (Canvas).");
            return null;
        }

        const bounds = regionObject.bounds || regionObject.getBounds?.(); 
        if (!bounds) return null;

        const maxAttempts = 200; // Увеличим попытки для сложных форм
        // ВАЖНО: Сохраняем правильную высоту для многоуровневых карт
        let elevation = regionDoc.elevation?.bottom;
        if (elevation === -Infinity || elevation == null || !isFinite(elevation)) {
            elevation = 0; // Fallback только если высота некорректная
        }

        for (let i = 0; i < maxAttempts; i++) {
            // Генерируем точку внутри общего прямоугольника
            const x = bounds.left + Math.random() * bounds.width;
            const y = bounds.top + Math.random() * bounds.height;

            // Точка относительно начала региона - ИСПРАВЛЕНО!
            // В V13 координаты региона хранятся в regionObject.position
            const regionPos = regionObject.position || {x: 0, y: 0};
            const localX = x - regionPos.x;
            const localY = y - regionPos.y;

            let inside = false;

            // Проверяем попадание в ЛЮБОЙ из шейпов региона через нашу математику
            for (const shape of shapes) {
                if (this._isPointInShape(localX, localY, shape)) {
                    inside = true;
                    break; 
                }
            }

            if (inside) {
                return { x, y, elevation };
            }
        }

        this._logDebugInfo(regionDoc, regionObject, bounds);
        return null;
    }

    /**
     * Математическая проверка: Внутри ли точка (localX, localY) фигуры shape?
     */
    static _isPointInShape(x, y, shape) {
        // --- 1. ПРЯМОУГОЛЬНИК (все возможные варианты V13) ---
        if (shape.type === "rectangle" || 
            shape.constructor?.name === "RectangleShapeData" ||
            shape.constructor?.name === "PreciseRectangleShapeData") {
            
            // Стандартный прямоугольник
            console.log("SLS | Проверяю прямоугольник:", {
                type: shape.type,
                constructor: shape.constructor?.name,
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height,
                point: {x, y}
            });
            
            const result = x >= shape.x && x <= shape.x + shape.width &&
                           y >= shape.y && y <= shape.y + shape.height;
            
            console.log("SLS | Результат проверки прямоугольника:", result);
            return result;
        }

        // --- 2. ЭЛЛИПС (КРУГ) ---
        if (shape.type === "ellipse" || shape.constructor?.name === "EllipseShapeData") {
            // EllipseShapeData имеет те же свойства: x, y, radiusX, radiusY
            console.log("SLS | Проверяю эллипс:", {
                type: shape.type,
                constructor: shape.constructor?.name,
                x: shape.x,
                y: shape.y,
                radiusX: shape.radiusX,
                radiusY: shape.radiusY,
                point: {x, y}
            });
            
            const dx = x - shape.x;
            const dy = y - shape.y;
            const result = ((dx * dx) / (shape.radiusX * shape.radiusX) + 
                           (dy * dy) / (shape.radiusY * shape.radiusY)) <= 1;
            
            console.log("SLS | Результат проверки эллипса:", result);
            return result;
        }

        // --- 3. ПОЛИГОН (все типы) ---
        if (shape.type === "polygon" || shape.constructor?.name === "PolygonShapeData") {
            if (!shape.points || shape.points.length < 6) {
                console.log("SLS | Полигон без точек или недостаточно точек");
                return false;
            }
            
            console.log("SLS | Проверяю полигон:", {
                type: shape.type,
                constructor: shape.constructor?.name,
                pointsCount: shape.points.length / 2,
                point: {x, y}
            });
            
            // Алгоритм "Ray Casting" (Трассировка луча)
            const points = shape.points;
            let inside = false;
            
            for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
                const xi = points[i], yi = points[i+1];
                const xj = points[j], yj = points[j+1];

                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                
                if (intersect) inside = !inside;
            }
            
            console.log("SLS | Результат проверки полигона:", inside);
            return inside;
        }

        return false;
    }

    static _logDebugInfo(regionDoc, regionObject, bounds) {
        console.group("SLS HANDLER | DEBUG REPORT");
        console.warn(`Не удалось найти точку в регионе: ${regionDoc.name}`);
        console.log("Elevation (Bottom):", regionDoc.elevation?.bottom);
        console.log("Bounds:", bounds);
        console.log("Shapes:", regionDoc.shapes);
        console.groupEnd();
    }
}
