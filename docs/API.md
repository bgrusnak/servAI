# servAI API Documentation

## Base URL

```
Development: http://localhost:3000/api
Production: https://yourdomain.com/api
```

## Authentication

Most endpoints require authentication using Bearer token:

```http
Authorization: Bearer <access_token>
```

## Pagination

List endpoints support pagination:

```
?page=1&limit=20
```

- Default page: 1
- Default limit: 20
- Max limit: 100

Response format:
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

## Authentication Endpoints

### Register User

Create a new user account.

**POST** `/api/auth/register`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "telegram_username": "johndoe"
}
```

**Response:** `201 Created`
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "telegram_username": "johndoe",
    "created_at": "2026-01-06T12:00:00Z"
  },
  "accessToken": "eyJhbG...",
  "refreshToken": "a1b2c3d4..."
}
```

**Password Requirements:**
- Minimum 8 characters (configurable)
- At least one uppercase letter
- At least one lowercase letter
- At least one number

---

### Login

Authenticate user and get tokens.

**POST** `/api/auth/login`

**Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890",
    "telegram_username": "johndoe"
  },
  "accessToken": "eyJhbG...",
  "refreshToken": "a1b2c3d4..."
}
```

---

### Refresh Token

Get new access token using refresh token. Old refresh token is automatically rotated.

**POST** `/api/auth/refresh`

**Body:**
```json
{
  "refreshToken": "a1b2c3d4..."
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "e5f6g7h8..."  // New token
}
```

**Rate Limit:** 10 requests per minute per user

---

### Logout

Revoke current refresh token (logout from current device).

**POST** `/api/auth/logout`

**Headers:** `Authorization: Bearer <access_token>`

**Body:**
```json
{
  "refreshToken": "a1b2c3d4..."
}
```

**Response:** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

---

### Logout All Devices

Revoke all refresh tokens for current user.

**POST** `/api/auth/logout-all`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "message": "Logged out from all devices",
  "revokedTokens": 5
}
```

---

### Get Current User

Get current user profile with roles.

**GET** `/api/auth/me`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "telegram_id": 123456789,
  "telegram_username": "johndoe",
  "is_active": true,
  "last_login_at": "2026-01-06T12:00:00Z",
  "created_at": "2026-01-05T10:00:00Z",
  "roles": [
    {
      "id": "uuid",
      "role": "company_admin",
      "company_id": "uuid",
      "condo_id": null,
      "is_active": true,
      "granted_at": "2026-01-05T10:00:00Z"
    }
  ]
}
```

---

## Companies Endpoints

### List Companies

Get list of companies where user has roles.

**GET** `/api/companies`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 20, max: 100)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "ABC Management",
      "legal_name": "ABC Management LLC",
      "inn": "1234567890",
      "kpp": "123456789",
      "address": "123 Main St, City",
      "phone": "+1234567890",
      "email": "info@abc.com",
      "website": "https://abc.com",
      "is_active": true,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

### Get Company

Get company by ID.

**GET** `/api/companies/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "ABC Management",
  "legal_name": "ABC Management LLC",
  "inn": "1234567890",
  "kpp": "123456789",
  "address": "123 Main St, City",
  "phone": "+1234567890",
  "email": "info@abc.com",
  "website": "https://abc.com",
  "is_active": true,
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z"
}
```

---

### Create Company

Create new company. **Requires:** `system_admin` role

**POST** `/api/companies`

**Headers:** `Authorization: Bearer <access_token>`

**Body:**
```json
{
  "name": "ABC Management",
  "legal_name": "ABC Management LLC",
  "inn": "1234567890",
  "kpp": "123456789",
  "address": "123 Main St, City",
  "phone": "+1234567890",
  "email": "info@abc.com",
  "website": "https://abc.com"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "name": "ABC Management",
  ...
}
```

**Note:** Creator automatically gets `company_admin` role.

---

### Update Company

Update company. **Requires:** `company_admin` role for this company

**PATCH** `/api/companies/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Body:** (all fields optional)
```json
{
  "name": "ABC Management Updated",
  "address": "New address",
  "is_active": true
}
```

**Response:** `200 OK`

---

### Delete Company

Soft delete company. **Requires:** `system_admin` role

**DELETE** `/api/companies/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "message": "Company deleted successfully"
}
```

---

## Condos Endpoints

### List Condos

Get list of condos where user has access.

**GET** `/api/condos`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**
- `company_id` (optional) - Filter by company
- `page` (optional, default: 1)
- `limit` (optional, default: 20, max: 100)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "company_id": "uuid",
      "name": "Sunset Gardens",
      "address": "456 Park Ave",
      "description": "Luxury residential complex",
      "total_buildings": 5,
      "total_units": 200,
      "created_at": "2026-01-02T00:00:00Z",
      "updated_at": "2026-01-02T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

---

### Get Condo

**GET** `/api/condos/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

---

### Create Condo

**Requires:** `company_admin` role for the company

**POST** `/api/condos`

**Headers:** `Authorization: Bearer <access_token>`

**Body:**
```json
{
  "company_id": "uuid",
  "name": "Sunset Gardens",
  "address": "456 Park Ave",
  "description": "Luxury residential complex",
  "total_buildings": 5,
  "total_units": 200
}
```

**Response:** `201 Created`

---

### Update Condo

**Requires:** `company_admin` or `condo_admin` role

**PATCH** `/api/condos/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Body:** (all fields optional)
```json
{
  "name": "Sunset Gardens Updated",
  "total_units": 250
}
```

**Response:** `200 OK`

---

### Delete Condo

**Requires:** `company_admin` role

**DELETE** `/api/condos/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

---

## Units Endpoints

### List Units

Get list of units in a condo.

**GET** `/api/units?condo_id=<uuid>`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**
- `condo_id` (required) - Condo UUID
- `page` (optional, default: 1)
- `limit` (optional, default: 20, max: 100)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "condo_id": "uuid",
      "building_id": "uuid",
      "entrance_id": "uuid",
      "unit_type_id": "uuid",
      "unit_type_name": "Квартира",
      "number": "101",
      "floor": 1,
      "area_total": 85.5,
      "area_living": 65.0,
      "rooms": 3,
      "owner_name": "John Smith",
      "owner_phone": "+1234567890",
      "owner_email": "owner@example.com",
      "is_rented": false,
      "created_at": "2026-01-03T00:00:00Z",
      "updated_at": "2026-01-03T00:00:00Z"
    }
  ],
  "total": 200,
  "page": 1,
  "limit": 20
}
```

---

### Get Unit

**GET** `/api/units/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

---

### Create Unit

**Requires:** `company_admin` or `condo_admin` role

**POST** `/api/units`

**Headers:** `Authorization: Bearer <access_token>`

**Body:**
```json
{
  "condo_id": "uuid",
  "unit_type_id": "uuid",
  "number": "101",
  "floor": 1,
  "area_total": 85.5,
  "area_living": 65.0,
  "rooms": 3,
  "owner_name": "John Smith",
  "owner_phone": "+1234567890",
  "owner_email": "owner@example.com",
  "is_rented": false
}
```

**Response:** `201 Created`

---

### Update Unit

**Requires:** `company_admin` or `condo_admin` role

**PATCH** `/api/units/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Body:** (all fields optional)
```json
{
  "owner_name": "Jane Smith",
  "owner_phone": "+9876543210",
  "is_rented": true
}
```

**Response:** `200 OK`

---

### Delete Unit

**Requires:** `company_admin` or `condo_admin` role

**DELETE** `/api/units/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message",
  "statusCode": 400
}
```

### Common Status Codes

- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Authentication required or failed
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate resource (e.g., email, INN)
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

---

## Rate Limits

- **Auth endpoints:** 5 requests per 15 minutes per IP
- **Refresh token:** 10 requests per minute per user
- **API endpoints:** 100 requests per minute per IP

---

## Notes

- All timestamps are in ISO 8601 format with UTC timezone
- All IDs are UUIDs
- Soft delete is used throughout - deleted records have `deleted_at` timestamp
- Access control is role-based - users must have appropriate roles for their actions
- Pagination is supported on all list endpoints
