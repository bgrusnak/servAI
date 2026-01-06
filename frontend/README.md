# ServAI Frontend

AI-powered Property Management Platform - Frontend Application

## Tech Stack

- **Vue 3** - Progressive JavaScript Framework
- **Quasar** - Vue.js Framework for building responsive apps
- **Pinia** - State Management
- **Vue Router** - Official Router
- **Vue I18n** - Internationalization (RU, EN, BG)
- **Axios** - HTTP Client
- **Chart.js** - Data Visualization
- **QRCode** - QR Code Generation

## Features

### Core Modules
- ✅ **Management Companies** - Full CRUD operations
- ✅ **Complexes** - Property complex management
- ✅ **Units** - Individual property units
- ✅ **Residents** - Resident management
- ✅ **Workers** - Staff management
- ✅ **Tickets** - Support tickets with Kanban board
- ✅ **Meter Readings** - Utility meter readings
- ✅ **Billing** - Invoice generation and payments
- ✅ **Polls** - Resident surveys and voting
- ✅ **Access Control** - QR-based access management
- ✅ **Reports** - Analytics and reporting
- ✅ **Settings** - System configuration
- ✅ **Profile** - User profile management

### Components
- FileUploader - Multi-file upload with preview
- NotificationBell - Real-time notifications
- QRCodeGenerator - QR code generation and download

### Utilities
- Formatters (date, currency, file size)
- Validators (email, phone, etc)
- Helpers (debounce, throttle, deepClone)

## Installation

```bash
cd frontend
npm install
```

## Development

```bash
npm run dev
```

Open http://localhost:5173

## Build for Production

```bash
npm run build
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_NAME=ServAI
VITE_APP_VERSION=1.0.0
```

## Project Structure

```
frontend/
├── src/
│   ├── api/              # API services
│   ├── assets/           # Static assets
│   ├── components/       # Reusable components
│   ├── composables/      # Vue composables
│   ├── i18n/             # Translations
│   ├── layouts/          # Layout components
│   ├── pages/            # Page components
│   ├── router/           # Vue Router config
│   ├── stores/           # Pinia stores
│   ├── styles/           # Global styles
│   ├── utils/            # Utility functions
│   ├── App.vue           # Root component
│   └── main.js           # Application entry
├── index.html
├── package.json
└── vite.config.js
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

MIT
