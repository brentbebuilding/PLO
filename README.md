# PLO Odds Calculator

A Pot Limit Omaha (PLO) poker odds calculator with screenshot-based card recognition.

## Features

- **Screenshot Card Recognition**: Upload a screenshot of the poker table and automatically detect player cards
- **Equity Calculation**: Calculate win percentages for each player at preflop, flop, and turn
- **Manual Card Selection**: Alternatively, manually select cards using an interactive interface
- **Real-time Updates**: See equity changes as community cards are added

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Python + FastAPI
- **Card Recognition**: OpenCV template matching
- **Equity Calculation**: Monte Carlo simulation

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## Usage

1. Open the application in your browser
2. Either:
   - Upload a screenshot of the poker table, or
   - Manually select cards for each player
3. Add community cards (flop/turn) as needed
4. View real-time equity percentages for each player

## PLO Rules

In Pot Limit Omaha:
- Each player receives 4 hole cards
- Players must use exactly 2 hole cards and exactly 3 community cards to make their best 5-card hand
- This makes equity calculation more complex than Texas Hold'em

## License

MIT
