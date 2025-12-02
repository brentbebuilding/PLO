# PLO Odds Calculator

A Pot Limit Omaha (PLO) poker odds calculator that runs entirely in your browser.

**[Live Demo](https://brentbebuilding.github.io/PLO/)**

## Features

- **Equity Calculation**: Calculate win percentages for each player at preflop, flop, turn, and river
- **Manual Card Selection**: Select cards using an interactive card picker
- **Real-time Updates**: See equity changes as community cards are added
- **2-6 Players**: Support for multi-way pots
- **No Server Required**: All calculations run locally in your browser using Monte Carlo simulation

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Equity Calculation**: Monte Carlo simulation (10,000 iterations)
- **Hosting**: GitHub Pages

## Local Development

### Prerequisites

- Node.js 18+

### Setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

### Build for Production

```bash
npm run build
```

## Deployment

This project is automatically deployed to GitHub Pages when changes are pushed to the `main` branch.

To enable GitHub Pages:
1. Go to your repository Settings
2. Navigate to Pages
3. Set Source to "GitHub Actions"

## Usage

1. Open the application in your browser
2. Click on card slots to select cards for each player
3. Each player needs 4 hole cards (PLO)
4. Add community cards (flop/turn/river) as needed
5. Equity updates automatically as you add cards

## PLO Rules

In Pot Limit Omaha:
- Each player receives 4 hole cards
- Players must use exactly 2 hole cards and exactly 3 community cards to make their best 5-card hand
- This makes equity calculation more complex than Texas Hold'em

## How It Works

The calculator uses Monte Carlo simulation to estimate equity:
1. Deal out the remaining community cards randomly
2. Evaluate each player's best hand using exactly 2 hole cards + 3 board cards
3. Determine the winner(s)
4. Repeat 10,000 times
5. Calculate win/tie percentages

## License

MIT

