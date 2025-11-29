# Clear Protocol TVL Simulator

An interactive heatmap tool for modeling Clear Protocol's reserve capacity based on Total Value Locked (TVL), rebalancing frequency, and daily volume.

## Features

- **Interactive Heatmap**: Visualize TVL vs Volume capacity with color-coded utilization levels
- **Adjustable Parameters**: Control USDC weight, rebalancing cycles, efficiency, and depeg time
- **Swap Size Coverage**: See which swap tiers can be handled at different TVL levels
- **Quick Calculators**: Find required TVL for target volumes or capacity for given TVL
- **Real-time Updates**: All calculations update instantly as you adjust parameters

## Core Formula

```
Daily Capacity = USDC Buffer × Rebalance Cycles × Efficiency
Max Single Swap = TVL × USDC Weight
```

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view it in your browser.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Deployment

This project is configured for easy deployment to Vercel:

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Import the repository in Vercel
3. Vercel will automatically detect the Vite configuration and deploy

Or use the Vercel CLI:

```bash
npm i -g vercel
vercel
```

## Technology Stack

- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Styling
- **PostCSS**: CSS processing

## Project Structure

```
clear-simulator/
├── src/
│   ├── App.jsx         # Main application component
│   ├── main.jsx        # React entry point
│   └── index.css       # Global styles with Tailwind
├── public/
│   └── favicon.svg     # Site favicon
├── index.html          # HTML template
├── vite.config.js      # Vite configuration
├── tailwind.config.js  # Tailwind configuration
├── postcss.config.js   # PostCSS configuration
└── package.json        # Dependencies and scripts
```

## License

MIT
