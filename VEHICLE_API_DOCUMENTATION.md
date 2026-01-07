# 🚗 Vehicle API Documentation

**Дата:** 7 января 2026  
**Версия API:** v1

---

## 🎯 Обзор

Vehicle API предоставляет функционал для контроля въезда автомобилей на территорию ЖК.

### Функционал:

1. **Постоянные номера**
   - Лимит на квартиру настраивается в настройках ЖК
   - По умолчанию: 2 машины
   - Диапазон: 1-10 машин

2. **Разовые пропуска**
   - Длительность настраивается в настройках ЖК
   - По умолчанию: 24 часа
   - Диапазон: 1-168 часов (макс 1 неделя)

3. **Проверка доступа** - для охранников
4. **История въездов** - логирование всех проверок

---

## 🔧 Настройки ЖК

### Entity: Condo

```typescript
@Entity('condos')
export class Condo {
  // ...
  
  @Column({ name: 'max_vehicles_per_unit', type: 'int', default: 2 })
  maxVehiclesPerUnit: number; // 1-10

  @Column({ name: 'temporary_pass_duration_hours', type: 'int', default: 24 })
  temporaryPassDurationHours: number; // 1-168 (max 1 week)
}
```

### Миграция БД:

```sql
ALTER TABLE condos
ADD COLUMN IF NOT EXISTS max_vehicles_per_unit INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS temporary_pass_duration_hours INTEGER DEFAULT 24;

ALTER TABLE condos
ADD CONSTRAINT check_max_vehicles_per_unit 
  CHECK (max_vehicles_per_unit >= 1 AND max_vehicles_per_unit <= 10);

ALTER TABLE condos
ADD CONSTRAINT check_temporary_pass_duration 
  CHECK (temporary_pass_duration_hours >= 1 AND temporary_pass_duration_hours <= 168);
```

---

## 📡 API Endpoints

### 1. Постоянные номера

#### Создать постоянный номер

```http
POST /api/v1/vehicles/permanent
```

**Request:**
```json
{
  "unitId": "uuid",
  "licensePlate": "A123BC",
  "make": "Toyota",
  "model": "Camry",
  "color": "Silver",
  "parkingSpot": "A-15"
}
```

**Response:**
```json
{
  "success": true,
  "vehicle": {
    "id": "uuid",
    "unitId": "uuid",
    "licensePlate": "A123BC",
    "make": "Toyota",
    "model": "Camry",
    "color": "Silver",
    "parkingSpot": "A-15",
    "isActive": true,
    "createdAt": "2026-01-07T10:55:00Z"
  }
}
```

**Ошибки:**
- `400` - Номер уже зарегистрирован
- `400` - Достигнут лимит (maxVehiclesPerUnit)

---

#### Удалить постоянный номер

```http
DELETE /api/v1/vehicles/permanent/:id
```

**Request:**
```json
{
  "unitId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Vehicle deleted"
}
```

---

### 2. Разовые пропуска

#### Создать разовый пропуск

```http
POST /api/v1/vehicles/temporary
```

**Request:**
```json
{
  "unitId": "uuid",
  "licensePlate": "B456CD"
}
```

**Response:**
```json
{
  "success": true,
  "pass": {
    "licensePlate": "B456CD",
    "expiresAt": "2026-01-08T10:55:00Z" // +temporaryPassDurationHours
  }
}
```

**Примечание:** Длительность берется из `condo.temporaryPassDurationHours`

---

#### Удалить разовый пропуск

```http
DELETE /api/v1/vehicles/temporary/:plate
```

**Request:**
```json
{
  "unitId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Temporary pass deleted"
}
```

---

### 3. Проверка доступа

#### Проверить номер (для охранника)

```http
GET /api/v1/vehicles/check/:plate
```

**Response (разрешено):**
```json
{
  "success": true,
  "allowed": true,
  "type": "permanent", // or "temporary"
  "unitId": "uuid",
  "unitNumber": "101",
  "buildingNumber": "1",
  "entranceNumber": "2",
  "expiresAt": "2026-01-08T10:55:00Z" // only for temporary
}
```

**Response (запрещено):**
```json
{
  "success": true,
  "allowed": false,
  "type": "unknown"
}
```

**Примечание:** Каждая проверка логируется в историю

---

### 4. Список автомобилей

#### Получить все авто квартиры

```http
GET /api/v1/vehicles/unit/:unitId
```

**Response:**
```json
{
  "success": true,
  "permanent": [
    {
      "id": "uuid",
      "licensePlate": "A123BC",
      "make": "Toyota",
      "model": "Camry",
      "parkingSpot": "A-15"
    }
  ],
  "temporary": [
    {
      "licensePlate": "B456CD",
      "expiresAt": "2026-01-08T10:55:00Z"
    }
  ]
}
```

---

### 5. История въездов

#### Получить историю

```http
GET /api/v1/vehicles/history?unitId=uuid&licensePlate=A123BC&from=2026-01-01&to=2026-01-07
```

**Query params (опционально):**
- `unitId` - фильтр по квартире
- `licensePlate` - фильтр по номеру
- `from` - дата начала (ISO 8601)
- `to` - дата конца (ISO 8601)

**Response:**
```json
{
  "success": true,
  "history": [
    {
      "id": "log-1704623100000",
      "vehicleId": "uuid",
      "licensePlate": "A123BC",
      "unitId": "uuid",
      "unitNumber": "101",
      "accessType": "permanent",
      "timestamp": "2026-01-07T10:55:00Z"
    }
  ]
}
```

**Примечание:** Возвращает последние 100 записей (в памяти 1000)

---

### 6. Настройки ЖК

#### Получить настройки

```http
GET /api/v1/vehicles/settings/:condoId
```

**Response:**
```json
{
  "success": true,
  "settings": {
    "maxVehiclesPerUnit": 2,
    "temporaryPassDurationHours": 24
  }
}
```

---

#### Обновить настройки

```http
PUT /api/v1/vehicles/settings/:condoId
```

**Request:**
```json
{
  "maxVehiclesPerUnit": 3,
  "temporaryPassDurationHours": 48
}
```

**Response:**
```json
{
  "success": true,
  "message": "Settings updated"
}
```

**Валидация:**
- `maxVehiclesPerUnit`: 1-10
- `temporaryPassDurationHours`: 1-168 (макс 1 неделя)

---

## 🔒 Аутентификация

Все endpoints требуют JWT токен:

```http
Authorization: Bearer <token>
```

### Роли и права доступа:

| Endpoint | Роли |
|----------|------|
| POST /permanent | resident, complex_admin, uk_director |
| POST /temporary | resident, complex_admin, uk_director |
| GET /check/:plate | security_guard, complex_admin, uk_director |
| GET /unit/:unitId | resident (own unit), complex_admin, uk_director |
| GET /history | security_guard, complex_admin, uk_director |
| GET /settings/:condoId | complex_admin, uk_director |
| PUT /settings/:condoId | complex_admin, uk_director |
| DELETE /permanent/:id | resident (own unit), complex_admin, uk_director |
| DELETE /temporary/:plate | resident (own unit), complex_admin, uk_director |

---

## 💡 Особенности реализации

### 1. Нормализация номеров

Все номера автоматически:
- Приводятся к uppercase
- Удаляются пробелы

```javascript
"a 123 bc" → "A123BC"
"A-123-BC" → "A-123-BC"
```

### 2. Лимит постоянных авто

Лимит берется из `condo.maxVehiclesPerUnit`:

```typescript
const unit = await unitRepository.findOne({
  where: { id: unitId },
  relations: ['condo'],
});

const maxVehicles = unit.condo?.maxVehiclesPerUnit || 2; // default 2
```

### 3. Длительность разовых пропусков

Длительность берется из `condo.temporaryPassDurationHours`:

```typescript
const durationHours = unit.condo?.temporaryPassDurationHours || 24; // default 24

const expiresAt = new Date();
expiresAt.setHours(expiresAt.getHours() + durationHours);
```

### 4. Хранение разовых пропусков

**Текущая реализация:** In-memory (Map)

**Для production:**
- Создать таблицу `temporary_passes`
- Или использовать Redis с TTL

### 5. История въездов

**Текущая реализация:** In-memory (Array)
- Хранится 1000 последних записей
- Возвращается 100 последних

**Для production:**
- Создать таблицу `vehicle_access_logs`
- Индексы на `timestamp`, `unit_id`, `license_plate`

### 6. Автоочистка просроченных пропусков

Добавить в `worker.ts`:

```typescript
import { vehicleService } from './services/vehicle.service';

// Every hour
schedule.scheduleJob('0 * * * *', async () => {
  await vehicleService.cleanupExpiredPasses();
});
```

---

## 🛠️ Пример использования

### Сценарий 1: Житель регистрирует машину

```bash
# 1. Житель входит в систему
POST /api/v1/auth/login
{ "email": "resident@example.com", "password": "***" }

# 2. Регистрирует свою машину
POST /api/v1/vehicles/permanent
Authorization: Bearer <token>
{
  "unitId": "unit-uuid",
  "licensePlate": "A123BC",
  "make": "Toyota",
  "model": "Camry",
  "parkingSpot": "A-15"
}

# 3. Проверяет свой список
GET /api/v1/vehicles/unit/unit-uuid
Authorization: Bearer <token>
```

### Сценарий 2: Гость приезжает

```bash
# 1. Житель создает разовый пропуск
POST /api/v1/vehicles/temporary
Authorization: Bearer <token>
{
  "unitId": "unit-uuid",
  "licensePlate": "B456CD"
}
# Ответ: expiresAt = "+24 hours" (or custom from condo settings)

# 2. Охранник проверяет номер
GET /api/v1/vehicles/check/B456CD
Authorization: Bearer <guard-token>
# Ответ: allowed=true, type="temporary", expiresAt="..."
```

### Сценарий 3: Админ настраивает ЖК

```bash
# 1. Получает текущие настройки
GET /api/v1/vehicles/settings/condo-uuid
Authorization: Bearer <admin-token>
# Ответ: maxVehiclesPerUnit=2, temporaryPassDurationHours=24

# 2. Увеличивает лимит до 3 и 48 часов
PUT /api/v1/vehicles/settings/condo-uuid
Authorization: Bearer <admin-token>
{
  "maxVehiclesPerUnit": 3,
  "temporaryPassDurationHours": 48
}
```

---

## ✅ TODO для production

### Критично:

1. ☐ **Мигрировать разовые пропуска в БД**
   - Создать таблицу `temporary_passes`
   - Или использовать Redis

2. ☐ **Мигрировать историю в БД**
   - Создать таблицу `vehicle_access_logs`

3. ☐ **Добавить проверку прав доступа**
   - Middleware для проверки `user.hasAccessToUnit(unitId)`
   - Роль `security_guard`

### Важно:

4. ☐ **Добавить worker для очистки**
   - Каждый час: `cleanupExpiredPasses()`

5. ☐ **OCR для номеров**
   - Интеграция с Perplexity для распознавания фото номеров

6. ☐ **Уведомления**
   - Telegram: "Ваш гость B456CD проехал на территорию"
   - Telegram: "Разовый пропуск B456CD истекает через 1 час"

### Опционально:

7. ☐ **Статистика**
   - Дашборд для админа: сколько въездов за период

8. ☐ **QR-коды для разовых пропусков**
   - Генерация QR с `licensePlate`
   - Сканирование охранником

---

**Документация создана:** 7 января 2026, 10:55 EET  
**Версия API:** v1  
**Статус:** ✅ Готово к использованию
