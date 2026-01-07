# Security Guidelines - ServAI Frontend

## 🔒 Обзор безопасности

Данное приложение реализует многоуровневую защиту от распространенных уязвимостей.

## 🛡️ Реализованные защиты

### 1. XSS (Cross-Site Scripting) Protection

**Защита:**
- Использование DOMPurify для санитайзации HTML
- Content Security Policy (CSP) headers
- Strict input validation
- Запрет `v-html` без санитайзации

**Правильное использование:**
```javascript
import { sanitizeHtml } from '@/utils/sanitize';

// Правильно ✓
const safeHtml = sanitizeHtml(userInput);

// НЕПРАВИЛЬНО ✗
// <div v-html="userInput"></div>
```

### 2. CSRF (Cross-Site Request Forgery) Protection

**Защита:**
- CSRF токены в httpOnly cookies
- SameSite cookie attribute
- Проверка Origin/Referer headers

**Важно:**
- CSRF токены НИКОГДА не хранятся в localStorage
- Токены автоматически отправляются с каждым запросом

### 3. Authentication Security

**Защита:**
- JWT tokens в httpOnly cookies (НЕ в localStorage!)
- Automatic token refresh
- Secure session management
- Password strength validation

**Правильный флоу:**
1. Пользователь вводит логин/пароль
2. Backend возвращает tokens в httpOnly cookies
3. Frontend автоматически отправляет cookies с запросами
4. При 401 - автоматический refresh

### 4. Input Validation

**Все вводимые данные ДОЛЖНЫ валидироваться:**

```javascript
import { sanitizeEmail, sanitizeText, sanitizeUrl } from '@/utils/sanitize';

// Email
const email = sanitizeEmail(userInput); // бросит Error если невалидный

// Text
const text = sanitizeText(userInput, 1000); // max 1000 символов

// URL
const url = sanitizeUrl(userInput); // пустая строка если невалидный
```

### 5. File Upload Security

**Защита:**
- File type validation (whitelist)
- File size limits
- Filename sanitization
- Malicious extension detection
- MIME type verification

**Пример:**
```javascript
import { useFileUpload } from '@/composables/useFileUpload';

const { uploadFile, validateFile } = useFileUpload();

const handleUpload = async (file) => {
  const validation = validateFile(file);
  if (!validation.valid) {
    console.error(validation.error);
    return;
  }
  
  await uploadFile(file, 'documents');
};
```

### 6. Security Headers

**Настроено в nginx.conf:**

```nginx
# Content Security Policy
Content-Security-Policy: default-src 'self'; script-src 'self';

# Prevent Clickjacking
X-Frame-Options: DENY

# MIME Type Sniffing Protection
X-Content-Type-Options: nosniff

# XSS Protection
X-XSS-Protection: 1; mode=block

# HTTPS Enforcement (production)
Strict-Transport-Security: max-age=31536000; includeSubDomains

# Permissions Policy
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## 🚫 Что НЕЛЬЗЯ делать

### 1. НИКОГДА не храните sensitive data в localStorage

```javascript
// ОПАСНО! ✗
localStorage.setItem('authToken', token);
localStorage.setItem('apiKey', key);
localStorage.setItem('password', password);

// Правильно ✓
// Используйте httpOnly cookies
```

### 2. Не используйте v-html без санитайзации

```vue
<!-- ОПАСНО! ✗ -->
<div v-html="userContent"></div>

<!-- Правильно ✓ -->
<div v-html="sanitizeHtml(userContent)"></div>
```

### 3. Не доверяйте клиентской валидации

```javascript
// Клиентская валидация - только для UX!
// Backend ДОЛЖЕН проверять все заново!
```

### 4. Не используйте eval() и new Function()

```javascript
// ОПАСНО! ✗
eval(userCode);
new Function(userCode)();

// ESLint заблокирует это
```

### 5. Не захардкодите secrets

```javascript
// ОПАСНО! ✗
const API_KEY = 'sk-1234567890abcdef';

// Правильно ✓
const API_KEY = import.meta.env.VITE_API_KEY;
```

## ✅ Best Practices

### 1. Используйте константы вместо строк

```javascript
import { USER_ROLES } from '@/utils/roles';

// Правильно ✓
if (hasRole(user.roles, USER_ROLES.SUPER_ADMIN)) { ... }

// Плохо ✗ - typo приведет к ошибке
if (hasRole(user.roles, 'superadmn')) { ... }
```

### 2. Валидируйте environment variables

```javascript
import { config } from '@/config/env';

// Автоматически проверяет наличие и корректность
const apiUrl = config.api.baseUrl;
```

### 3. Ограничивайте размер ввода

```javascript
// Защита от DoS
const text = sanitizeText(userInput, 10000); // max 10k chars
```

### 4. Используйте HTTPS в production

```javascript
// Конфиг автоматически проверяет это
if (config.isProduction && !config.api.baseUrl.startsWith('https')) {
  console.warn('Production should use HTTPS!');
}
```

## 🛠️ Development Guidelines

### Перед commit:

1. **Run linter:**
   ```bash
   npm run lint
   ```

2. **Check security:**
   ```bash
   npm run security:audit
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

### Перед production deploy:

1. **Audit dependencies:**
   ```bash
   npm audit
   npm audit fix
   ```

2. **Update dependencies:**
   ```bash
   npm update
   ```

3. **Check environment:**
   - Все secrets в .env?
   - HTTPS enabled?
   - CSP configured?
   - CORS настроен?

## 🚨 Что делать при обнаружении уязвимости

1. **Не публикуйте** детали публично
2. **Сообщите** security team: security@servai.com
3. **Создайте** private security issue в GitHub
4. **Дождитесь** фикса и security advisory
5. **Обновите** зависимости

## 📚 Дополнительные ресурсы

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Vue.js Security Best Practices](https://vuejs.org/guide/best-practices/security.html)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Content Security Policy Reference](https://content-security-policy.com/)

## 🔄 Regular Security Tasks

### Еженедельно:
- [ ] Проверка npm audit
- [ ] Review security warnings

### Ежемесячно:
- [ ] Обновление зависимостей
- [ ] Проверка ESLint rules
- [ ] Review security logs

### Ежеквартально:
- [ ] Penetration testing
- [ ] Security audit
- [ ] Update security policies
- [ ] Team security training

---

**Помните:** Безопасность - это не одноразовая задача, а постоянный процесс!
