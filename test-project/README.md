# Frame Master Template: Cloudflare Pages + React + Tailwind CSS

A modern, high-performance starter template for building React applications deployed to Cloudflare Pages, styled with Tailwind CSS, and orchestrated by Frame Master.

![Frame Master Template](https://img.shields.io/badge/Frame%20Master-Template-blueviolet)
![React](https://img.shields.io/badge/React-19-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-38bdf8)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-orange)
![Bun](https://img.shields.io/badge/Bun-1.3-black)

## 🚀 Features

- **React 18/19**: The latest version of React for building interactive UIs.
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development.
- **Cloudflare Pages**: Deploys instantly to the edge with global low latency.
- **Frame Master**: Integrated workflow for seamless development and plugin management.
- **Bun**: Lightning-fast JavaScript runtime and package manager.
- **Client-Side HMR**: Instant feedback during development.
- **TypeScript**: Type-safe development for better code quality.

## 🛠️ Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.3 or later)

### Installation

1. **Clone the repository (or use the template):**

   ```bash
   git clone <your-repo-url>
   cd <your-project-directory>
   ```

2. **Install dependencies:**

   ```bash
   bun install
   ```

3. **Initialize Frame Master:**

   ```bash
   bun frame-master init
   ```

### Development

Start the development server with Hot Module Replacement (HMR):

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/pages/index.tsx`. The page auto-updates as you edit the file.

## 📦 Building for Production

To create a production build:

```bash
bun run build
```

The build artifacts will be stored in the `.frame-master/build` directory (or your configured output directory).

## ☁️ Deployment

### Cloudflare Pages

1. Push your code to a GitHub repository.
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Pages**.
3. Click **Create a project** > **Connect to Git**.
4. Select your repository.
5. Configure the build settings:
   - **Framework preset**: None / Custom
   - **Build command**: `bun run build`
   - **Build output directory**: `.frame-master/build`
6. Click **Save and Deploy**.

## 📂 Project Structure

```
.
├── src/
│   ├── pages/          # Application pages
│   │   ├── index.tsx   # Home page
│   │   └── layout.tsx  # Main layout component
│   ├── shell.tsx       # App shell configuration
│   └── client-wrapper.tsx
├── static/             # Static assets (images, global CSS)
├── frame-master.config.ts # Frame Master configuration
├── tailwind.config.js  # Tailwind CSS configuration
├── tsconfig.json       # TypeScript configuration
└── package.json
```

## 📄 License

This project is licensed under the MIT License.
