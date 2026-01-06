# ServAI Frontend

> Modern admin panel for ServAI platform built with Vue 3 + Quasar Framework

## Features

- 🚀 Vue 3 with Composition API
- 🎨 Quasar Framework for beautiful UI
- 🌍 Multi-language support (Russian, English, Bulgarian)
- 🔐 JWT Authentication
- 📱 Fully responsive design
- 🎯 Role-based access control
- 📊 Rich dashboards and analytics
- 🔔 Real-time notifications

## Install Dependencies

```bash
npm install
# or
yarn install
```

## Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

## Development

```bash
npm run dev
# or
yarn dev
```

Open http://localhost:9000

## Build for Production

```bash
npm run build
# or
yarn build
```

## Project Structure

```
frontend/
├── src/
│   ├── assets/          # Static assets (images, fonts)
│   ├── boot/            # Quasar boot files
│   ├── components/      # Reusable Vue components
│   ├── composables/     # Vue composables (reusable logic)
│   ├── layouts/         # Layout components
│   ├── pages/           # Page components
│   ├── router/          # Vue Router configuration
│   ├── stores/          # Pinia stores (state management)
│   ├── i18n/            # Internationalization files
│   ├── api/             # API service layer
│   ├── utils/           # Utility functions
│   ├── App.vue          # Root component
│   └── main.js          # Application entry point
├── public/              # Public static files
└── quasar.config.js     # Quasar configuration
```

## Available Roles

- **Super Admin**: Platform-wide access
- **Super Accountant**: Platform billing management
- **UK Director**: Management company director
- **UK Accountant**: Management company accountant
- **Complex Admin**: Residential complex administrator
- **Worker**: Service workers (plumbers, electricians, etc.)

## Technology Stack

- **Vue 3** - Progressive JavaScript framework
- **Quasar** - Vue.js framework for building apps
- **Pinia** - State management
- **Vue Router** - Official router for Vue.js
- **Vue I18n** - Internationalization plugin
- **Axios** - HTTP client
- **Vite** - Build tool

## Code Style

- ESLint + Prettier for code formatting
- Run `npm run lint` to check code style
- Run `npm run format` to auto-format code

## License

Proprietary
