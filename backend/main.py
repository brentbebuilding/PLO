"""
PLO Odds Calculator API

FastAPI backend for the PLO poker odds calculator.
Provides endpoints for:
- Equity calculation
- Card recognition from screenshots
"""
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import logging

from equity_calculator import PLOEquityCalculator, Card
from card_recognition import CardDetector

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="PLO Odds Calculator API",
    description="Calculate poker odds for Pot Limit Omaha hands",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
equity_calculator = PLOEquityCalculator(num_simulations=10000)
card_detector = CardDetector()


# ----- Request/Response Models -----

class PlayerHand(BaseModel):
    """A player's 4 hole cards."""
    cards: List[str] = Field(
        ...,
        min_length=4,
        max_length=4,
        description="List of 4 cards in format like ['As', 'Kh', 'Qd', 'Jc']"
    )


class EquityRequest(BaseModel):
    """Request model for equity calculation."""
    players: List[PlayerHand] = Field(
        ...,
        min_length=2,
        max_length=6,
        description="List of player hands (2-6 players)"
    )
    board: Optional[List[str]] = Field(
        default=None,
        max_length=5,
        description="Community cards (0-5 cards)"
    )
    simulations: Optional[int] = Field(
        default=10000,
        ge=1000,
        le=100000,
        description="Number of Monte Carlo simulations"
    )


class PlayerEquity(BaseModel):
    """Equity result for a single player."""
    player_index: int
    cards: List[str]
    win_percentage: float
    tie_percentage: float
    equity: float


class EquityResponse(BaseModel):
    """Response model for equity calculation."""
    stage: str
    board: List[str]
    simulations_run: int
    players: List[PlayerEquity]


class CardDetectionRequest(BaseModel):
    """Request model for card detection from base64 image."""
    image: str = Field(..., description="Base64 encoded image")
    num_players: int = Field(default=2, ge=2, le=6)
    include_board: bool = Field(default=True)


class DetectedCardInfo(BaseModel):
    """Information about a detected card."""
    rank: str
    suit: str
    card: str
    confidence: float


class CardDetectionResponse(BaseModel):
    """Response model for card detection."""
    success: bool
    players: List[Dict]
    board: List[Dict]
    unassigned: List[Dict]
    message: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str


# ----- API Endpoints -----

@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint - health check."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.post("/api/equity", response_model=EquityResponse)
async def calculate_equity(request: EquityRequest):
    """
    Calculate PLO equity for the given hands.

    This uses Monte Carlo simulation to calculate win/tie percentages
    for each player.
    """
    try:
        # Parse cards
        player_hands = []
        for player in request.players:
            try:
                cards = [Card.from_string(c) for c in player.cards]
                player_hands.append(cards)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid card: {e}")

        # Parse board
        board_cards = []
        if request.board:
            try:
                board_cards = [Card.from_string(c) for c in request.board]
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid board card: {e}")

        # Create calculator with specified simulations
        calculator = PLOEquityCalculator(
            num_simulations=request.simulations or 10000
        )

        # Calculate equity
        result = calculator.calculate_equity(player_hands, board_cards)

        # Build response
        return EquityResponse(
            stage=result.stage,
            board=result.board,
            simulations_run=result.simulations_run,
            players=[
                PlayerEquity(
                    player_index=p.player_index,
                    cards=p.hand_cards,
                    win_percentage=p.win_percentage,
                    tie_percentage=p.tie_percentage,
                    equity=p.equity
                )
                for p in result.players
            ]
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error calculating equity: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/detect-cards", response_model=CardDetectionResponse)
async def detect_cards_from_base64(request: CardDetectionRequest):
    """
    Detect cards from a base64-encoded poker screenshot.

    Returns detected cards grouped by player position and board.
    """
    try:
        result = card_detector.detect_from_base64(
            request.image,
            num_players=request.num_players,
            include_board=request.include_board
        )

        return CardDetectionResponse(
            success=True,
            players=result.get('players', []),
            board=result.get('board', []),
            unassigned=result.get('unassigned', []),
            message="Cards detected successfully"
        )

    except ValueError as e:
        return CardDetectionResponse(
            success=False,
            players=[],
            board=[],
            unassigned=[],
            message=str(e)
        )
    except Exception as e:
        logger.error(f"Error detecting cards: {e}")
        return CardDetectionResponse(
            success=False,
            players=[],
            board=[],
            unassigned=[],
            message="Failed to process image"
        )


@app.post("/api/detect-cards/upload")
async def detect_cards_from_upload(
    file: UploadFile = File(...),
    num_players: int = 2,
    include_board: bool = True
):
    """
    Detect cards from an uploaded poker screenshot.

    Accepts PNG, JPG, or JPEG images.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        # Read file content
        content = await file.read()

        # Detect cards
        result = card_detector.detect_from_image(
            content,
            num_players=num_players,
            include_board=include_board
        )

        return CardDetectionResponse(
            success=True,
            players=result.get('players', []),
            board=result.get('board', []),
            unassigned=result.get('unassigned', []),
            message="Cards detected successfully"
        )

    except ValueError as e:
        return CardDetectionResponse(
            success=False,
            players=[],
            board=[],
            unassigned=[],
            message=str(e)
        )
    except Exception as e:
        logger.error(f"Error detecting cards from upload: {e}")
        return CardDetectionResponse(
            success=False,
            players=[],
            board=[],
            unassigned=[],
            message="Failed to process image"
        )


@app.get("/api/cards")
async def list_valid_cards():
    """
    Get a list of all valid card codes.

    Returns all 52 cards in the format used by the API.
    """
    ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
    suits = ['c', 'd', 'h', 's']

    cards = []
    for rank in ranks:
        for suit in suits:
            cards.append({
                'code': f"{rank}{suit}",
                'rank': rank,
                'suit': suit,
                'rank_name': get_rank_name(rank),
                'suit_name': get_suit_name(suit)
            })

    return {
        'cards': cards,
        'ranks': ranks,
        'suits': suits
    }


def get_rank_name(rank: str) -> str:
    """Get the full name of a rank."""
    names = {
        '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five',
        '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine',
        'T': 'Ten', 'J': 'Jack', 'Q': 'Queen', 'K': 'King', 'A': 'Ace'
    }
    return names.get(rank, rank)


def get_suit_name(suit: str) -> str:
    """Get the full name of a suit."""
    names = {
        'c': 'Clubs', 'd': 'Diamonds', 'h': 'Hearts', 's': 'Spades'
    }
    return names.get(suit, suit)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
