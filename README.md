# Olmo Invoice

A modern, efficient web application designed to streamline the creation and management of invoices and payment orders. Olmo Invoice provides a professional tool for generating documents, searching materials, and managing customer data with a focus on speed and ease of use.

## 🚀 Features

- **Document Generation**: Create "Накладная" (Invoices) and "Счет на оплату" (Payment Orders) with ease.
- **Dynamic Search**: Real-time material search with detailed information and quick addition to orders.
- **Customer Management**: Integrated buyer list for quick selection and auto-filling of details.
- **Validation**: Built-in validation for IIN and bank accounts to ensure data accuracy.
- **Excel Export**: Generate and download professional Excel documents directly from the application.
- **Authentication**: Secure access with Google OAuth integration.
- **Responsive Design**: Polished, user-friendly interface that works across various devices.

## 🛠️ Tech Stack

### Core
- **React 19**: Modern frontend library for building interactive user interfaces.
- **Vite 7**: Ultra-fast build tool and development server.
- **Tailwind CSS 4**: Utility-first CSS framework for rapid UI development.

### UI Components
- **Radix UI**: Unstyled, accessible UI primitives (Dialog, Popover, Select, Label, Slot).
- **Lucide React**: Clean and consistent icon library.
- **shadcn/ui**: High-quality, customizable components (Card, Button, Input, etc.).
- **cmdk**: Fast and accessible command menu for item searching.

### Utilities
- **Google OAuth**: Secure user authentication.
- **use-debounce**: Performance optimization for search inputs.
- **number-to-words-ru**: Utility to convert numeric amounts into Russian text for official documents.
- **clsx & tailwind-merge**: Utilities for managing dynamic CSS classes.

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS version recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone [repository-url]
   ```
2. Navigate to the project directory:
   ```bash
   cd olmo
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the development server:
```bash
npm run dev
```
Open `http://localhost:5173` in your browser to see the app.

## 📜 Available Scripts

- `npm run dev`: Starts the Vite development server.
- `npm run build`: Builds the application for production.
- `npm run lint`: Runs ESLint to check for code quality issues.
- `npm run preview`: Previews the production build locally.
